"""MPI-600 Leg D - measure PLATE PRESERVATION per arm, instead of asserting it by eye.

    python kv_preserve.py

There is no mask in this leg (whole-image edit), so `seam.py` does not apply. What can still be
measured is how much of the ORIGINAL PLATE survives. Two reads per output:

  whole   - mean |delta| against the plate over the full frame. Includes the people, so it can
            never reach 0; useful only for ranking arms against each other.
  border  - mean |delta| over a frame-edge band (outer 18% left/right, outer 15% top) where every
            output in this leg is background. THIS is the preservation number: the people are
            centre-frame in all 16, so the band is plate-vs-plate and a large delta means the
            model rebuilt the scene rather than edited it.

Reported alongside the two references' own delta so the scale is legible.

ponytail: a fixed band, not a segmentation model. It only has to be background in these 16
images, and it is - verified against the contact sheet.
"""

import os

import numpy as np
from PIL import Image

OUT = r"D:\WORK\Images\Outputs\klein_9b"
PLATE = os.path.join(OUT, "plates", "plate_empty_road_00001_.png")

ARMS = [("distilled", "kvleg-distilled"),
        ("distilled+node", "kvleg-distilled-node"),
        ("kv", "kvleg-kv"),
        ("kv+node", "kvleg-kv-node")]
CELLS = [("2ref", 101), ("2ref", 202), ("3ref", 101), ("3ref", 202)]


def load(p):
    with Image.open(p) as im:
        return np.asarray(im.convert("RGB")).astype(np.int16)


def border_mask(shape):
    h, w = shape[:2]
    m = np.zeros((h, w), bool)
    m[:, :int(w * 0.18)] = True
    m[:, int(w * 0.82):] = True
    m[:int(h * 0.15), :] = True
    return m


def find(slug, cell, seed):
    d = os.path.join(OUT, slug)
    if not os.path.isdir(d):
        return None
    hits = sorted(f for f in os.listdir(d) if f.startswith("%s_%d_" % (cell, seed)))
    return os.path.join(d, hits[-1]) if hits else None


plate = load(PLATE)
bm = border_mask(plate.shape)
print("plate: %s | border band = %.1f%% of frame" % (PLATE, bm.mean() * 100))
print("\n%-16s %-11s %8s %8s" % ("arm", "cell/seed", "whole", "border"))
summary = {}
for arm, slug in ARMS:
    for cell, seed in CELLS:
        p = find(slug, cell, seed)
        if not p:
            print("%-16s %-11s   MISSING" % (arm, "%s/%d" % (cell, seed)))
            continue
        a = load(p)
        if a.shape != plate.shape:
            print("%-16s %-11s   SHAPE %s != plate %s" % (arm, cell, a.shape, plate.shape))
            continue
        d = np.abs(a - plate)
        whole = d.mean()
        border = d[bm].mean()
        summary.setdefault(arm, []).append(border)
        print("%-16s %-11s %8.2f %8.2f" % (arm, "%s/%d" % (cell, seed), whole, border))

print("\n--- border delta, mean per arm (lower = more of the plate survived) ---")
for arm, _ in ARMS:
    v = summary.get(arm)
    if v:
        print("%-16s %6.2f / 255" % (arm, sum(v) / len(v)))
