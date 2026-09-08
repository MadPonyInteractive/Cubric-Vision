"""Does the feather fix hold on a box with FOUR real edges? No object involved.

g192 clears the bar, but only on the top edge: the stamped object is 462px wide in an 896px
frame, so growing the box by 192 pushes left, right and bottom off the canvas on every plate
here. One measured edge out of four is not a general result.

So test the seam on its own terms: put a box in a background-only part of the plate, small
enough that even the grown box stays fully inside the image, and run the identical route.
There is no object and no shadow to trade away -- whatever step appears at those four edges
is the re-grade and nothing else. That makes this the cleanest available test of the fix,
and the one that generalises to a small subject in a big photo.

Usage:  python blankbox.py
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
import seamfix as S

O = L.O
PLATES = ["sun", "overcast", "anime"]
# The stamped object is at (233, 665, 696, 987) on every plate. CORE must be placed so that
# even CORE grown by 192 clears BOTH the canvas and the object: the first attempt used
# (288, 200, 608, 520), whose grown bottom lands at y=712 and swallows 47px of the object's
# head -- which read as "the feather made the bottom edge worse" and was nothing of the kind.
CORE = (300, 220, 600, 440)   # +192 -> (108, 28, 792, 632); 33px clear of the object
CONFIGS = {
    "blank_base": {"grow": 0},
    "blank_g096": {"grow": 96, "feather": 96, "passes": 1},
    "blank_g192": {"grow": 192, "feather": 96, "passes": 2},
}


def main():
    rows = []
    for nm, cfg in CONFIGS.items():
        grow = cfg["grow"]
        kw = {k: v for k, v in cfg.items() if k != "grow"}
        print("\n=== %s  %s ===" % (nm, json.dumps(cfg)))
        print("  %-9s %6s  %7s %7s %7s %7s   %7s  %s"
              % ("plate", "secs", "top", "bottom", "left", "right", "outside", "worst"))
        for tag in PLATES:
            photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
            size = L.Image.open(photo).size
            box = S.grow_px(CORE, size, grow) if grow else CORE
            assert box[0] > 0 and box[1] > 0 and box[2] < size[0] and box[3] < size[1], \
                "box %s touches the canvas of %s -- the whole point is four live edges" % (
                    box, size)
            stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
            ob, _ = L.changed_bbox(photo, stamped)
            assert not (box[0] < ob[2] and box[2] > ob[0]
                        and box[1] < ob[3] and box[3] > ob[1]), \
                "box %s overlaps the object %s -- then it is not a blank box and the edge " \
                "nearest the object reads as a seam that is really the object" % (box, ob)
            mp = "%s/blank_%s_%s.png" % (L.LP, tag, nm)
            L.write_mask(box, size, mp)
            prefix = "mpi567_bb_%s_%s" % (nm, tag)
            # The PHOTO is the base image here, not a stamped composite: nothing to blend in.
            g = S.build(photo, mp, prefix, **kw)
            r = L.queue(g)
            mine = [f for f in r["files"] if f.startswith(prefix)]
            if not mine:
                raise SystemExit("%s %s: nothing sampled (%s)" % (nm, tag, r["files"]))
            out = "%s/%s" % (O, mine[-1])
            st = S.edge_step(photo, out, box, size)
            om = S.outside_mean(photo, out, box, size)
            worst = max(v for v in st.values() if v is not None)
            print("  %-9s %6.1f  %7s %7s %7s %7s   %7.3f  %6.2f %s"
                  % (tag, r["secs"], st["top"], st["bottom"], st["left"], st["right"],
                     om, worst, "EDGE OK" if worst < 2 else ""))
            rows.append({"config": nm, "tag": tag, "box": list(box),
                         "file": os.path.basename(out), "edge_step": st,
                         "outside_mean": om, "worst_edge": worst})
        json.dump(rows, open(L.LP + "/blankbox_results.json", "w", encoding="utf-8"), indent=1)
    print("\nwrote", L.LP + "/blankbox_results.json")


if __name__ == "__main__":
    main()
