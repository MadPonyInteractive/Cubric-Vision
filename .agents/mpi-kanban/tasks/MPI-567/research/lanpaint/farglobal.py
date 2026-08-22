"""How much of the user's photo moved, measured WITHOUT reference to the box. No GPU.

Both metrics used so far are gameable by growing the box, and g192 games both:

  edge_step    is sampled at the box edge. Widen the ramp and the step fades -- even though
               the change did not shrink, it just spread out.
  shadow_ratio counts changed pixels outside the OBJECT bbox. A re-grade of the field is
               outside the object bbox too, so a re-grade inflates it and reads as a better
               shadow. overcast g192 scores 2.05 (double baseline) on a green field.
  outside      is measured outside the BOX, so it shrinks toward zero as the box grows to
               fill the frame. At g192 it measures a thin strip and reports 0.02.

So measure the thing the user actually cares about and anchor it to the OBJECT, never the
box: change across the whole image, excluding the object and a SHADOW_ALLOW band around it
where change is legitimate. This number cannot be improved by making the box bigger.

Usage:  python farglobal.py base,g096,g192,s096
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
SHADOW_ALLOW = 150   # px around the object where a cast shadow may legitimately fall


def far_global(photo, stamped, res):
    d = L._diff_L(photo, res)
    W, H = d.size
    ob, _ = L.changed_bbox(photo, stamped)
    m = Image.new("L", (W, H), 255)
    ImageDraw.Draw(m).rectangle(
        (ob[0] - SHADOW_ALLOW, ob[1] - SHADOW_ALLOW,
         ob[2] + SHADOW_ALLOW, ob[3] + SHADOW_ALLOW), fill=0)
    n = m.histogram()[255]
    mean = L._mean(d, m)
    frac = d.point(lambda v: 255 if v > L.CHANGE_T else 0).histogram(m)[255] / max(1, n)
    return round(mean, 3), round(frac, 4), n


def main():
    names = sys.argv[1].split(",") if len(sys.argv) > 1 else ["base", "g096", "g192"]
    rows = json.load(open(L.LP + "/seamfix_results.json", encoding="utf-8"))
    idx = {(r["config"], r["tag"]): r for r in rows}
    print("far-from-object change over the WHOLE image (object bbox +%dpx excluded)"
          % SHADOW_ALLOW)
    print("%-9s %-10s %10s %10s %10s %10s" %
          ("plate", "config", "far_mean", "far_frac", "edge_worst", "box area %"))
    for tag in PLATES:
        for nm in names:
            r = idx.get((nm, tag))
            if not r:
                print("%-9s %-10s  missing" % (tag, nm))
                continue
            photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
            stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
            fm, ff, _ = far_global(photo, stamped, "%s/%s" % (O, r["file"]))
            b = r["box"]
            W, H = Image.open(photo).size
            barea = 100.0 * (b[2] - b[0]) * (b[3] - b[1]) / (W * H)
            print("%-9s %-10s %10.3f %10.4f %10.2f %9.1f%%"
                  % (tag, nm, fm, ff, r["worst_edge"], barea))
        print()


if __name__ == "__main__":
    main()
