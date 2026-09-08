"""MPI-600 Leg D - zoomed crop sheet for scoring REFERENCE adherence by eye.

    python kv_faces.py

The first contact sheet is 340 px per cell, which is enough to see the plate change and not
enough to judge a garment. This crops the centre column where the people stand and shows the two
references beside them, so "is that the referenced jacket / coat" is answerable.

Adherence in this leg is REFERENCE adherence, not text adherence: every arm honours the words
(people standing on a dirt road). What separates them is whether the people are the ones in the
reference images.

ponytail: a fixed centre crop. The people are centre-frame in all 16 outputs - checked against
kv_contact_sheet.png before hardcoding it.
"""

import os

from PIL import Image, ImageDraw

OUT = r"D:\WORK\Images\Outputs\klein_9b"
PLATES = os.path.join(OUT, "plates")
SHEET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kv_adherence_sheet.png")

ARMS = [("distilled", "kvleg-distilled"),
        ("distilled+node", "kvleg-distilled-node"),
        ("kv", "kvleg-kv"),
        ("kv+node", "kvleg-kv-node")]
COLS = [("2ref", 101), ("2ref", 202), ("3ref", 101), ("3ref", 202)]

CROP = (280, 60, 760, 1020)          # x0, y0, x1, y1 - the centre column where people stand
CW, CH = 220, 440
PAD, LABEL = 6, 22


def find(slug, cell, seed):
    d = os.path.join(OUT, slug)
    if not os.path.isdir(d):
        return None
    hits = sorted(f for f in os.listdir(d) if f.startswith("%s_%d_" % (cell, seed)))
    return os.path.join(d, hits[-1]) if hits else None


def crop(p):
    with Image.open(p) as im:
        return im.convert("RGB").crop(CROP).resize((CW, CH), Image.LANCZOS)


refcol = CW + PAD * 2
w = refcol + PAD + len(COLS) * (CW + PAD)
h = LABEL + PAD + len(ARMS) * (CH + LABEL + PAD)
sheet = Image.new("RGB", (w, h), (24, 24, 28))
d = ImageDraw.Draw(sheet)

# reference column - the thing every output is being judged against
d.text((PAD, 6), "REFERENCES", fill=(120, 220, 255))
for i, name in enumerate(("ref_man_00001_.png", "ref_woman_00001_.png")):
    p = os.path.join(PLATES, name)
    with Image.open(p) as im:
        t = im.convert("RGB").crop(CROP).resize((CW // 2, CH), Image.LANCZOS)
    sheet.paste(t, (PAD + i * (CW // 2), LABEL + PAD))

for ci, (cell, seed) in enumerate(COLS):
    d.text((refcol + PAD + ci * (CW + PAD) + 2, 6), "%s s%d" % (cell, seed), fill=(230, 230, 235))

for ri, (arm, slug) in enumerate(ARMS):
    top = LABEL + PAD + ri * (CH + LABEL + PAD)
    d.text((PAD, top + CH + 2 if ri == 0 else top), arm, fill=(255, 190, 120))
    for ci, (cell, seed) in enumerate(COLS):
        p = find(slug, cell, seed)
        x = refcol + PAD + ci * (CW + PAD)
        if p:
            sheet.paste(crop(p), (x, top + LABEL))
        else:
            d.text((x + 8, top + LABEL + CH // 2), "MISSING", fill=(220, 120, 120))

sheet.save(SHEET)
print("wrote", SHEET, sheet.size)
