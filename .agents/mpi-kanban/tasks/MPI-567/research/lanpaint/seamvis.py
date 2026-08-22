"""WHY do some box edges read as a seam and others do not? No GPU, off disk.

`edge_step` is mean |result-photo| in a band inside the edge. That number conflates two
things the eye treats completely differently:

  DIRECTIONAL OFFSET   the band moved one way -- brighter or darker. signed ~= abs.
                       The eye sees a tonal step along a straight line. THIS is a seam.
  TEXTURE CHURN        the model redrew grass/gravel/foliage differently at the same
                       average tone. signed ~= 0 while abs is large. No line to see.

So the discriminator is `dir` = signed / abs. Near 1.0 (or -1.0) means every pixel in the
band moved the same way: a seam. Near 0 means the changes cancel: redrawn detail, invisible
as an edge however big `abs` gets.

And a tonal step is only visible against the photo's own local variation, so `cnr` divides
the offset by the standard deviation of the photo in that same band. A 10-level step across
a smooth dry field is glaring; the same 10 levels inside grass is nothing.

Usage:  python seamvis.py base,g096,s096
"""
import json, math, os, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lp_lib as L
from PIL import Image, ImageChops, ImageDraw

O = L.O
PLATES = ["sun", "overcast", "anime"]
BAND = 12


def band_mask(size, box, edge, d0=0, d1=BAND):
    W, H = size
    x0, y0, x1, y1 = box
    m = Image.new("L", (W, H), 0)
    dr = ImageDraw.Draw(m)
    if edge == "top":
        dr.rectangle((x0, y0 + d0, x1, y0 + d1), fill=255)
    elif edge == "bottom":
        dr.rectangle((x0, y1 - d1, x1, y1 - d0), fill=255)
    elif edge == "left":
        dr.rectangle((x0 + d0, y0, x0 + d1, y1), fill=255)
    else:
        dr.rectangle((x1 - d1, y0, x1 - d0, y1), fill=255)
    return m


def std_in(img, mask):
    """Standard deviation of img where mask is white, via the masked histogram."""
    h = img.histogram(mask)
    n = sum(h)
    if not n:
        return 0.0
    mean = sum(i * c for i, c in enumerate(h)) / n
    var = sum(c * (i - mean) ** 2 for i, c in enumerate(h)) / n
    return math.sqrt(var)


def main():
    names = sys.argv[1].split(",") if len(sys.argv) > 1 else ["base"]
    rows = json.load(open(L.LP + "/seamfix_results.json", encoding="utf-8"))
    idx = {(r["config"], r["tag"]): r for r in rows}
    print("dir = signed/abs: near +-1 = a tonal STEP (a seam); near 0 = redrawn TEXTURE")
    print("cnr = |signed| / photo's own std in that band: what the eye actually weighs\n")
    print("%-9s %-8s %-7s %7s %7s %6s %7s %6s  %s"
          % ("plate", "config", "edge", "signed", "abs", "dir", "photostd", "cnr", "reads as"))
    for tag in PLATES:
        photo = "%s/mpi567_plate_%s_00001_.png" % (O, tag)
        pim = Image.open(photo).convert("L")
        for nm in names:
            r = idx.get((nm, tag))
            if not r:
                continue
            res = Image.open("%s/%s" % (O, r["file"])).convert("L")
            if res.size != pim.size:
                res = res.resize(pim.size, Image.LANCZOS)
            pos = ImageChops.subtract(res, pim)
            neg = ImageChops.subtract(pim, res)
            box = tuple(r["box"])
            for edge in ("top", "bottom", "left", "right"):
                if r["edge_step"].get(edge) is None:
                    continue
                m = band_mask(pim.size, box, edge)
                p, n_ = L._mean(pos, m), L._mean(neg, m)
                signed, absd = p - n_, p + n_
                d = (signed / absd) if absd > 0.01 else 0.0
                ps = std_in(pim, m)
                cnr = abs(signed) / ps if ps > 0.01 else 0.0
                verdict = "SEAM" if cnr > 0.20 else ("faint" if cnr > 0.08 else "texture only")
                print("%-9s %-8s %-7s %7.2f %7.2f %6.2f %7.2f %6.2f  %s"
                      % (tag, nm, edge, signed, absd, d, ps, cnr, verdict))
        print()


if __name__ == "__main__":
    main()
