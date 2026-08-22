"""The OBJECT and its shadow, actual pixels, side by side. No GPU.

`shadow_ratio` counts changed pixels outside the object bbox, so it cannot tell a cast
shadow from a re-graded field -- it credits both. Any config that reduces the re-grade
therefore reads as having lost shadow, whether or not it did. The only way to settle it is
to look at the ground under the object.

Usage:  python objsheet.py base,f096,s096
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
PAD = 190          # room around the object bbox for the shadow to show
TH = 300


def main():
    names = sys.argv[1].split(",") if len(sys.argv) > 1 else ["base", "f096", "s096"]
    rows = json.load(open(L.LP + "/seamfix_results.json", encoding="utf-8"))
    idx = {(r["config"], r["tag"]): r for r in rows}
    cells = []
    for tag in PLATES:
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        stamped = "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag)
        ob, size = L.changed_bbox(photo, stamped)
        rect = (max(0, ob[0] - PAD), max(0, ob[1] - PAD // 2),
                min(size[0], ob[2] + PAD), min(size[1], ob[3] + PAD))
        # The stamped input first: that is the "before", with no shadow of any kind.
        for nm in ["stamped"] + names:
            src = stamped if nm == "stamped" else None
            if src is None:
                r = idx.get((nm, tag))
                if not r:
                    print("missing", nm, tag)
                    continue
                src = "%s/%s" % (O, r["file"])
                label = "%s %s  shadow %.2f" % (tag, nm, r["shadow_ratio"])
            else:
                label = "%s stamped (no shadow)" % tag
            im = Image.open(src).convert("RGB").crop(rect)
            im.thumbnail((TH * 3, TH))
            cells.append((label, im))

    cols = len(names) + 1
    rowsn = (len(cells) + cols - 1) // cols
    cw = max(c[1].width for c in cells) + 8
    ch = max(c[1].height for c in cells) + 26
    sheet = Image.new("RGB", (cols * cw, rowsn * ch), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(cells):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        d.text((cx + 4, cy + 6), name, fill=(255, 255, 255))
        sheet.paste(im, (cx + 4, cy + 22))
    out = L.LP + "/SHEET_object_%s.png" % "_".join(names)
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
