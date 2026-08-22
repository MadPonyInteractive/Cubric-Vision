"""MPI-600 Leg D - turn "the yellow raincoat is gone" into a number.

    python kv_garment.py

Person B's reference garment is a LONG belted yellow raincoat reaching below the knee. When an
arm drops it for a yellow shirt (or a short cardigan) the hue survives and the AREA collapses -
so the fraction of strongly-yellow pixels in the frame is a cheap, objective read on whether the
referenced garment was honoured. Measured on the 3-reference outputs only; the 2-ref cells carry
no yellow at all and act as the negative control.

Yellow test: R and G both high, B low, and R/G close together (that is yellow rather than orange
skin or golden dirt). Calibrated against the reference image itself, printed first.

ponytail: one hue window, not a segmentation model. It only has to separate "long coat" from
"shirt" against a dirt-road background, and the control rows prove it does.
"""

import os

import numpy as np
from PIL import Image

OUT = r"D:\WORK\Images\Outputs\klein_9b"
PLATES = os.path.join(OUT, "plates")

ARMS = [("distilled", "kvleg-distilled"),
        ("distilled+node", "kvleg-distilled-node"),
        ("kv", "kvleg-kv"),
        ("kv+node", "kvleg-kv-node")]


def yellow_pct(path):
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 150) & (g > 130) & (b < 110) & (np.abs(r - g) < 70) & ((r - b) > 80) & ((g - b) > 60)
    return m.mean() * 100


print("calibration:")
print("  reference woman (long yellow raincoat) : %5.2f%%" % yellow_pct(os.path.join(PLATES, "ref_woman_00001_.png")))
print("  reference man   (no yellow)            : %5.2f%%" % yellow_pct(os.path.join(PLATES, "ref_man_00001_.png")))
print("  empty plate     (no yellow)            : %5.2f%%" % yellow_pct(os.path.join(PLATES, "plate_empty_road_00001_.png")))

print("\n%-16s %8s %8s | %8s %8s" % ("arm", "3ref/101", "3ref/202", "2ref/101", "2ref/202"))
for arm, slug in ARMS:
    vals = []
    for cell, seed in (("3ref", 101), ("3ref", 202), ("2ref", 101), ("2ref", 202)):
        d = os.path.join(OUT, slug)
        hits = sorted(f for f in os.listdir(d) if f.startswith("%s_%d_" % (cell, seed)))
        vals.append(yellow_pct(os.path.join(d, hits[-1])) if hits else float("nan"))
    print("%-16s %7.2f%% %7.2f%% | %7.2f%% %7.2f%%" % (arm, vals[0], vals[1], vals[2], vals[3]))
