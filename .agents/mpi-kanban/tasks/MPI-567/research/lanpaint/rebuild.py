"""Rebuild results.json for all 15 runs off disk (run_lp.py overwrites it per invocation)."""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from run_lp import TAGS, VARIANTS

O = L.O
rows = []
for tag in TAGS:
    photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
    stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
    bb, size = L.changed_bbox(photo, stamped)
    for v, (o, d) in VARIANTS.items():
        box = L.grow_box(bb, size, o, d)
        fn = "mpi567_lp_%s_%s_00001_.png" % (tag, v)
        if not os.path.exists(O + "/" + fn):
            print("MISSING", fn); continue
        rows.append({"tag": tag, "variant": v, "box": list(box), "file": fn,
                     "auto": L.seam(photo, O + "/" + fn)})
json.dump(rows, open(L.LP + "/results.json", "w", encoding="utf-8"), indent=1)
print("rebuilt", len(rows), "rows")
