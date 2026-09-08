"""Is the BOX EDGE visible? Crop 1:1 corners straddling the box, and measure the step across it.

Outside the box the stitch returns the original, so a seam here is a step between re-graded
interior and untouched exterior. Measured as mean |result-photo| in a 12px band just INSIDE
the box edge -- but only along edges that are not the image border, and reported next to a
1:1 crop so the number is checked by eye rather than trusted.
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
VARIANTS = ["auto", "generous"]
Z = 340  # 1:1 crop size at the corner


def edge_step(photo, res, box, size):
    """mean |diff| in a 12px band inside each box edge that is NOT the image border."""
    d = L._diff_L(photo, res)
    W, H = size
    x0, y0, x1, y1 = box
    out = {}
    edges = {"top": (x0, y0, x1, y0 + 12), "bottom": (x0, y1 - 12, x1, y1),
             "left": (x0, y0, x0 + 12, y1), "right": (x1 - 12, y0, x1, y1)}
    border = {"top": y0 <= 0, "bottom": y1 >= H, "left": x0 <= 0, "right": x1 >= W}
    for name, rect in edges.items():
        if border[name]:
            out[name] = None
            continue
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).rectangle(rect, fill=255)
        out[name] = round(L._mean(d, m), 2)
    return out


rows = {(r["tag"], r["variant"]): r for r in
        json.load(open(L.LP + "/results.json", encoding="utf-8"))}

cells = []
print("%-9s %-9s %8s %8s %8s %8s" % ("plate", "box", "top", "bottom", "left", "right"))
for tag in PLATES:
    for v in VARIANTS:
        r = rows[(tag, v)]
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        res = "%s/%s" % (O, r["file"])
        box = tuple(r["box"])
        im = Image.open(res).convert("RGB")
        st = edge_step(photo, res, box, im.size)
        print("%-9s %-9s %8s %8s %8s %8s" % (tag, v, st["top"], st["bottom"],
                                             st["left"], st["right"]))
        # 1:1 crop straddling the TOP-LEFT corner of the box
        x0, y0 = box[0], box[1]
        cx0 = max(0, x0 - Z // 2); cy0 = max(0, y0 - Z // 2)
        crop = im.crop((cx0, cy0, min(im.width, cx0 + Z), min(im.height, cy0 + Z)))
        dr = ImageDraw.Draw(crop)
        dr.line([(x0 - cx0, 0), (x0 - cx0, crop.height)], fill=(255, 0, 255), width=1)
        dr.line([(0, y0 - cy0), (crop.width, y0 - cy0)], fill=(255, 0, 255), width=1)
        cells.append(("%s %s" % (tag, v), crop))

cols = 2
rowsn = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * Z, rowsn * (Z + 24)), (18, 18, 18))
d = ImageDraw.Draw(sheet)
for i, (name, im) in enumerate(cells):
    cx, cy = (i % cols) * Z, (i // cols) * (Z + 24)
    d.text((cx + 4, cy + 6), name + "  (magenta = box edge)", fill=(255, 255, 255))
    sheet.paste(im, (cx, cy + 24))
out = L.LP + "/SHEET_seam_corners.png"
sheet.save(out)
print("\n", out, sheet.size)
