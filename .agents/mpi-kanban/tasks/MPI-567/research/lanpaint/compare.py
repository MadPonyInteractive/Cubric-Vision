"""Side-by-side of the REAL output at 1:1 across the box edge. No GPU.

A number in a table is not what Fabio caught this defect with, so this crops 1:1 and lets
the eye judge. Two things it deliberately gets right, because the first version got both
wrong and the sheet was misleading:

  * SAME crop rectangle for every column, taken from the BASELINE box. If each config is
    cropped around its own box the content differs between columns and nothing is
    comparable.
  * The edge is marked with TICKS in the margin, never a line drawn across the seam --
    a magenta line painted over the defect hides the defect.

Usage:  python compare.py base,g096
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
Z = 300
TICK = 10


def live_edges(r):
    return {k: v for k, v in r["edge_step"].items() if v is not None}


def crop_rect(box, edge, size):
    """1:1 rect centred on the midpoint of `edge`, straddling it. Clamped to the image."""
    W, H = size
    x0, y0, x1, y1 = box
    if edge in ("top", "bottom"):
        cx, cy = (x0 + x1) // 2, (y0 if edge == "top" else y1)
    else:
        cx, cy = (x0 if edge == "left" else x1), (y0 + y1) // 2
    a = max(0, min(W - Z, cx - Z // 2))
    b = max(0, min(H - Z, cy - Z // 2))
    return (a, b, a + Z, b + Z)


def main():
    names = sys.argv[1].split(",") if len(sys.argv) > 1 else ["base", "g096"]
    rows = json.load(open(L.LP + "/seamfix_results.json", encoding="utf-8"))
    idx = {(r["config"], r["tag"]): r for r in rows}
    cells = []
    for tag in PLATES:
        runs = [idx.get((nm, tag)) for nm in names]
        if any(r is None for r in runs):
            print("missing a run for", tag)
            continue
        # An edge worth showing must be a real seam in EVERY config compared, else one
        # column is a canvas border and the row compares nothing.
        common = set(live_edges(runs[0]))
        for r in runs[1:]:
            common &= set(live_edges(r))
        if not common:
            print("no edge live in all configs for", tag)
            continue
        edge = max(common, key=lambda e: runs[0]["edge_step"][e])
        base_box = tuple(runs[0]["box"])
        size = Image.open("%s/%s" % (O, runs[0]["file"])).size
        rect = crop_rect(base_box, edge, size)

        for nm, r in zip(names, runs):
            im = Image.open("%s/%s" % (O, r["file"])).convert("RGB").crop(rect)
            dr = ImageDraw.Draw(im)
            bx = tuple(r["box"])
            # Where this config's own box edge sits inside the shared crop.
            if edge in ("top", "bottom"):
                p = (bx[1] if edge == "top" else bx[3]) - rect[1]
                if 0 <= p < Z:
                    dr.line([(0, p), (TICK, p)], fill=(255, 0, 255), width=2)
                    dr.line([(Z - TICK, p), (Z, p)], fill=(255, 0, 255), width=2)
            else:
                p = (bx[0] if edge == "left" else bx[2]) - rect[0]
                if 0 <= p < Z:
                    dr.line([(p, 0), (p, TICK)], fill=(255, 0, 255), width=2)
                    dr.line([(p, Z - TICK), (p, Z)], fill=(255, 0, 255), width=2)
            cells.append(("%s %s  %s=%s  shadow %.2f"
                          % (tag, nm, edge, r["edge_step"][edge], r["shadow_ratio"]), im))

    cols = len(names)
    rowsn = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (Z + 8), rowsn * (Z + 26)), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(cells):
        cx, cy = (i % cols) * (Z + 8), (i // cols) * (Z + 26)
        d.text((cx + 4, cy + 6), name, fill=(255, 255, 255))
        sheet.paste(im, (cx + 4, cy + 22))
    out = L.LP + "/SHEET_compare_%s.png" % "_".join(names)
    sheet.save(out)
    print(out, sheet.size, "  magenta ticks = box edge (same crop in every column), 1:1")


if __name__ == "__main__":
    main()
