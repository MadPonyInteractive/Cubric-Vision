"""How much shadow did each box size actually buy?

`shadow_ratio` = changed pixels OUTSIDE the object's own bbox, as a fraction of that bbox's
area. The stamped object occupies the bbox; anything the model changed outside it is the
ground it grounded the object on. Tight boxes cannot produce much of it -- that is the point.
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
rows = json.load(open(L.LP + "/results.json", encoding="utf-8"))
print("%-9s %-9s %10s %10s" % ("plate", "box", "shadow_px", "ratio"))
for r in rows:
    tag = r["tag"]
    photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
    stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
    res = "%s/%s" % (O, r["file"])
    obj, size = L.changed_bbox(photo, stamped)
    d = L._diff_L(photo, res).point(lambda v: 255 if v > L.CHANGE_T else 0)
    outside_obj = Image.new("L", size, 255)
    ImageDraw.Draw(outside_obj).rectangle(obj, fill=0)
    h = d.histogram(outside_obj)
    px = h[255]
    area = (obj[2] - obj[0]) * (obj[3] - obj[1])
    print("%-9s %-9s %10d %10.3f" % (tag, r["variant"], px, px / area))
