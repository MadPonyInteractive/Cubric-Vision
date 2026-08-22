"""MPI-600 Leg D contact sheet - arms down, (cell x seed) across.

    python kv_sheet.py

Quality parity in this leg has to be SHOWN, not presumed: FluxKVCache drops reference tokens
from the sequence after step 0, and the `kv` weight carries no marker saying it was built for
that. A wall-clock table cannot tell a 2x speedup from a 2x speedup that mangled the second
person. Fabio's standing instruction on this card: look at every output as it lands.

ponytail: PIL only, no matplotlib. Labels are drawn with the default bitmap font scaled up.
"""

import io
import os

from PIL import Image, ImageDraw

OUT = r"D:\WORK\Images\Outputs\klein_9b"
SHEET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kv_contact_sheet.png")

ARMS = [("distilled", "kvleg-distilled"),
        ("distilled+node", "kvleg-distilled-node"),
        ("kv", "kvleg-kv"),
        ("kv+node", "kvleg-kv-node")]
COLS = [("2ref", 101), ("2ref", 202), ("3ref", 101), ("3ref", 202)]

CELL = 340
PAD = 8
LABEL = 26


def find(slug, cell, seed):
    d = os.path.join(OUT, slug)
    if not os.path.isdir(d):
        return None
    hits = sorted(f for f in os.listdir(d) if f.startswith("%s_%d_" % (cell, seed)))
    return os.path.join(d, hits[-1]) if hits else None


def main():
    w = PAD + len(COLS) * (CELL + PAD)
    h = LABEL + PAD + len(ARMS) * (CELL + LABEL + PAD)
    sheet = Image.new("RGB", (w, h), (24, 24, 28))
    d = ImageDraw.Draw(sheet)

    for ci, (cell, seed) in enumerate(COLS):
        d.text((PAD + ci * (CELL + PAD) + 4, 6), "%s seed %d" % (cell, seed), fill=(230, 230, 235))

    missing = 0
    for ri, (arm, slug) in enumerate(ARMS):
        top = LABEL + PAD + ri * (CELL + LABEL + PAD)
        d.text((PAD, top), arm, fill=(255, 190, 120))
        for ci, (cell, seed) in enumerate(COLS):
            x = PAD + ci * (CELL + PAD)
            y = top + LABEL
            p = find(slug, cell, seed)
            if not p:
                d.rectangle([x, y, x + CELL, y + CELL], outline=(90, 60, 60))
                d.text((x + 8, y + CELL // 2), "MISSING", fill=(220, 120, 120))
                missing += 1
                continue
            with Image.open(p) as im:
                sheet.paste(im.convert("RGB").resize((CELL, CELL), Image.LANCZOS), (x, y))

    sheet.save(SHEET)
    print("wrote", SHEET, sheet.size, "| missing cells:", missing)


if __name__ == "__main__":
    main()
