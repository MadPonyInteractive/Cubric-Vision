"""stamped | 4B auto | 9B auto, per plate."""
import os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from PIL import Image, ImageDraw

O = "D:/WORK/Images/Outputs"
LP = O + "/mpi567/lp"
H = 620
TAGS = ["sun", "overcast", "night", "indoor", "anime"]

cols = [("stamped", O + "/mpi567_e2e_stamp_scribble_%s_00001_.png"),
        ("4B auto", O + "/mpi567_lp_%s_auto_00001_.png"),
        ("9B auto", O + "/mpi567_lp9b_%s_auto_00001_.png")]

rows = []
for tag in TAGS:
    cells = []
    for name, pat in cols:
        p = pat % tag
        im = Image.open(p).convert("RGB") if os.path.exists(p) else Image.new("RGB", (400, H))
        im = im.resize((int(im.width * H / im.height), H), Image.LANCZOS)
        cells.append((name, im))
    rows.append((tag, cells))

W = max(sum(c.width for _, c in cs) for _, cs in rows)
sheet = Image.new("RGB", (W, sum(H + 26 for _ in rows)), (18, 18, 18))
d = ImageDraw.Draw(sheet)
y = 0
for tag, cs in rows:
    x = 0
    for name, im in cs:
        d.text((x + 4, y + 6), "%s  %s" % (tag, name), fill=(255, 255, 255))
        sheet.paste(im, (x, y + 26)); x += im.width
    y += H + 26
out = LP + "/SHEET_4b_vs_9b.png"
sheet.save(out)
print(out, sheet.size)
