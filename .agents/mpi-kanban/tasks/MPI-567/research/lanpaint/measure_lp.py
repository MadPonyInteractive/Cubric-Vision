"""Re-measure the LanPaint runs off disk. No GPU.

`ring` on the changed region's own bbox does NOT work for this route and must not be
quoted: the noise mask is a rectangle, so the changed region's bbox hugs the box and the
ring band lands on real content (the object, its shadow) rather than on untouched photo.
That is a different situation from session 3, where the changed region was a feathered blob
sitting well inside its bbox.

What discriminates the failure this route actually has -- a generous box re-grading
everything it contains -- is FAR movement: inside the box, but well away from the object.
A cast shadow is local to the object; a re-grade moves the whole box.
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
FAR = 200  # px beyond the object's own bbox before a change stops being "its shadow"


def far_stats(photo, result, box, obj_bb):
    d = L._diff_L(photo, result)
    W, H = d.size
    m = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(m)
    dr.rectangle(box, fill=255)
    x0, y0, x1, y1 = obj_bb
    dr.rectangle((x0 - FAR, y0 - FAR, x1 + FAR, y1 + FAR), fill=0)
    n = sum(m.histogram()[255:])
    if n == 0:
        return None, None, 0
    mean = L._mean(d, m)
    hist = d.point(lambda v: 255 if v > L.CHANGE_T else 0).histogram(m)
    frac = hist[255] / n
    return round(mean, 2), round(frac, 3), n


def main():
    rows = json.load(open(L.LP + "/results.json", encoding="utf-8"))
    print("%-9s %-9s %8s %8s %8s %8s   %s" %
          ("plate", "box", "outside", "far_mean", "far_frac", "fill", "verdict hint"))
    out = []
    for r in rows:
        tag, v = r["tag"], r["variant"]
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
        res = "%s/%s" % (O, r["file"])
        obj_bb, size = L.changed_bbox(photo, stamped)
        box = tuple(r["box"])

        # movement strictly OUTSIDE the user's box -- must be ~0, the stitch guarantees it
        d = L._diff_L(photo, res)
        outside = Image.new("L", size, 255)
        ImageDraw.Draw(outside).rectangle(box, fill=0)
        out_mean = round(L._mean(d, outside), 3)

        fm, ff, n = far_stats(photo, res, box, obj_bb)
        hint = ""
        if fm is not None:
            hint = "RE-GRADE" if ff > 0.30 else ("some" if ff > 0.10 else "clean")
        print("%-9s %-9s %8.3f %8s %8s %8.3f   %s" %
              (tag, v, out_mean, fm, ff, r["auto"]["fill"], hint))
        out.append(dict(r, outside_mean=out_mean, far_mean=fm, far_frac=ff, far_px=n))
    json.dump(out, open(L.LP + "/results2.json", "w", encoding="utf-8"), indent=1)


if __name__ == "__main__":
    main()
