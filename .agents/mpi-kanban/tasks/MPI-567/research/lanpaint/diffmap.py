"""What SHAPE is the change inside the box? Signed diff, amplified, box drawn on. No GPU.

edge_profile.py said the change is directional, but a number per edge cannot tell these
two apart, and they need opposite fixes:

  uniform tonal re-grade  -> the whole box shifts one way. Fix = stop the model regrading.
  a cast shadow clipped   -> one lobe of darkness runs into the box edge and stops dead.
                             Fix = MORE room that way, not less.

Red = result darker than photo, green = brighter, black = unchanged. Gain makes a 10-level
shift plainly visible; the point is the SHAPE, not the magnitude.

Usage:  python diffmap.py base,f032
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageChops, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
GAIN = 8
TH = 260  # thumbnail height per cell


def diffmap(photo, res, box, objbb):
    a = Image.open(photo).convert("L")
    b = Image.open(res).convert("L")
    if b.size != a.size:
        b = b.resize(a.size, Image.LANCZOS)
    darker = ImageChops.subtract(a, b).point(lambda v: min(255, v * GAIN))
    brighter = ImageChops.subtract(b, a).point(lambda v: min(255, v * GAIN))
    blank = Image.new("L", a.size, 0)
    im = Image.merge("RGB", (darker, brighter, blank))
    dr = ImageDraw.Draw(im)
    dr.rectangle(box, outline=(80, 140, 255), width=3)      # blue  = the denoise box
    dr.rectangle(objbb, outline=(255, 255, 0), width=2)     # yellow = the stamped object
    return im


def main():
    names = sys.argv[1].split(",") if len(sys.argv) > 1 else ["base"]
    rows = json.load(open(L.LP + "/seamfix_results.json", encoding="utf-8"))
    idx = {(r["config"], r["tag"]): r for r in rows}
    cells = []
    for tag in PLATES:
        for nm in names:
            r = idx.get((nm, tag))
            if not r:
                print("missing", nm, tag)
                continue
            photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
            stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
            objbb, _ = L.changed_bbox(photo, stamped)
            im = diffmap(photo, "%s/%s" % (O, r["file"]), tuple(r["box"]), objbb)
            im.thumbnail((TH * 4, TH))
            cells.append(("%s %s  worst %.1f  shadow %.2f"
                          % (tag, nm, r["worst_edge"], r["shadow_ratio"]), im))

    cols = len(names)
    rowsn = (len(cells) + cols - 1) // cols
    cw = max(c[1].width for c in cells) + 8
    ch = max(c[1].height for c in cells) + 26
    sheet = Image.new("RGB", (cols * cw, rowsn * ch), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(cells):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        d.text((cx + 4, cy + 6), name, fill=(255, 255, 255))
        sheet.paste(im, (cx + 4, cy + 22))
    out = L.LP + "/SHEET_diffmap_%s.png" % "_".join(names)
    sheet.save(out)
    print(out, sheet.size, "  red=darker green=brighter blue=box yellow=object")


if __name__ == "__main__":
    main()
