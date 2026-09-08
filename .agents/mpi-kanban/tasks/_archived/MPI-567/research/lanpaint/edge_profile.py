"""Is the box edge a RE-GRADE or a round-trip artifact? Free, off disk, no GPU.

The two candidate causes predict different profiles inside the box:

  VAE round trip + rescale  -> noise-like. |diff| small and roughly equal everywhere,
                               SIGNED mean ~= 0 because the drift has no direction.
  Tonal re-grade            -> DIRECTIONAL. SIGNED mean is large and holds its sign at
                               every depth inside the box, because the model relit the
                               whole crop.

So: walk bands inward from each non-border box edge and print signed + abs mean, plus one
band just OUTSIDE (the stitch guarantees the original there, so it is the zero reference).
"""
import json, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageChops, ImageDraw, ImageStat

O = L.O
PLATES = ["sun", "overcast", "anime"]
DEPTHS = [(-24, 0), (0, 12), (12, 24), (24, 48), (48, 96), (96, 192)]


def signed_L(photo, res):
    """result - photo on luminance, as a signed float via two one-sided abs diffs."""
    a = Image.open(photo).convert("L")
    b = Image.open(res).convert("L")
    if b.size != a.size:
        b = b.resize(a.size, Image.LANCZOS)
    pos = ImageChops.subtract(b, a)   # where result is brighter
    neg = ImageChops.subtract(a, b)   # where result is darker
    return pos, neg, a.size


def band(size, box, edge, d0, d1):
    """Mask for a band between depth d0 and d1 inside `edge`. Negative depth = outside."""
    W, H = size
    x0, y0, x1, y1 = box
    m = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(m)
    if edge == "top":
        dr.rectangle((x0, y0 + d0, x1, y0 + d1), fill=255)
    elif edge == "left":
        dr.rectangle((x0 + d0, y0, x0 + d1, y1), fill=255)
    elif edge == "right":
        dr.rectangle((x1 - d1, y0, x1 - d0, y1), fill=255)
    elif edge == "bottom":
        dr.rectangle((x0, y1 - d1, x1, y1 - d0), fill=255)
    return m


def stats(pos, neg, mask):
    p = L._mean(pos, mask)
    n = L._mean(neg, mask)
    return p - n, p + n   # signed mean, abs mean


def main():
    rows = {(r["tag"], r["variant"]): r for r in
            json.load(open(L.LP + "/results.json", encoding="utf-8"))}
    for tag in PLATES:
        r = rows[(tag, "auto")]
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        res = "%s/%s" % (O, r["file"])
        pos, neg, size = signed_L(photo, res)
        W, H = size
        box = tuple(r["box"])
        x0, y0, x1, y1 = box
        border = {"top": y0 <= 0, "bottom": y1 >= H, "left": x0 <= 0, "right": x1 >= W}
        print("\n== %s  box=%s  image=%dx%d ==" % (tag, box, W, H))
        hdr = "  %-7s" % "edge"
        for d0, d1 in DEPTHS:
            hdr += "%14s" % ("out" if d0 < 0 else "%d-%d" % (d0, d1))
        print(hdr + "   (signed / abs)")
        for edge in ("top", "left", "right", "bottom"):
            if border[edge]:
                print("  %-7s  (image border - nothing to step against)" % edge)
                continue
            line = "  %-7s" % edge
            for d0, d1 in DEPTHS:
                s, a = stats(pos, neg, band(size, box, edge, d0, d1))
                line += "%14s" % ("%+.1f/%.1f" % (s, a))
            print(line)

        # deep interior, excluding the object and 100px around it: pure re-grade territory
        ob, _ = L.changed_bbox(photo, "%s/mpi567_e2e_stamp_scribble_%s_00001_.png" % (O, tag))
        m = Image.new("L", (W, H), 0)
        dr = ImageDraw.Draw(m)
        dr.rectangle((x0 + 96, y0 + 96, x1 - 96, y1 - 96), fill=255)
        dr.rectangle((ob[0] - 100, ob[1] - 100, ob[2] + 100, ob[3] + 100), fill=0)
        n = m.histogram()[255]
        if n:
            s, a = stats(pos, neg, m)
            print("  deep interior (box-96, minus object+100): signed %+.2f  abs %.2f  "
                  "over %d px" % (s, a, n))
        else:
            print("  deep interior: empty for this box")


if __name__ == "__main__":
    main()
