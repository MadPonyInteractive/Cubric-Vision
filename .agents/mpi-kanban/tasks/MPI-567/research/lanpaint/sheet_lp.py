"""Contact sheet: photo | stamped | session-5 merged (relight+tail) | LanPaint variants."""
import os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from PIL import Image, ImageDraw

O = "D:/WORK/Images/Outputs"
LP = O + "/mpi567/lp"
CELL_H = 560


def load(p):
    return Image.open(p).convert("RGB") if os.path.exists(p) else None


def main():
    tags = sys.argv[1].split(",") if len(sys.argv) > 1 else ["sun"]
    cols = [
        ("photo", "%s/mpi567_plate_%%s_00001_.png" % O),
        ("stamped", "%s/mpi567_e2e_stamp_scribble_%%s_00001_.png" % O),
        ("s5 merged", "%s/mpi567_s5_merged_%%s_00001_.png" % O),
        ("LP tight", "%s/mpi567_lp_%%s_tight_00001_.png" % O),
        ("LP auto", "%s/mpi567_lp_%%s_auto_00001_.png" % O),
        ("LP generous", "%s/mpi567_lp_%%s_generous_00001_.png" % O),
    ]
    rows = []
    for tag in tags:
        cells = []
        for name, pat in cols:
            im = load(pat % tag)
            if im is None:
                im = Image.new("RGB", (400, CELL_H), (40, 40, 40))
            else:
                w = int(im.width * CELL_H / im.height)
                im = im.resize((w, CELL_H), Image.LANCZOS)
            cells.append((name, im))
        rows.append((tag, cells))

    W = max(sum(c.width for _, c in cells) for _, cells in rows)
    H = sum(CELL_H + 26 for _ in rows)
    sheet = Image.new("RGB", (W, H), (18, 18, 18))
    d = ImageDraw.Draw(sheet)
    y = 0
    for tag, cells in rows:
        x = 0
        for name, im in cells:
            d.text((x + 4, y + 6), "%s  %s" % (tag, name), fill=(255, 255, 255))
            sheet.paste(im, (x, y + 26))
            x += im.width
        y += CELL_H + 26
    out = "%s/SHEET_%s.png" % (LP, "_".join(tags))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
