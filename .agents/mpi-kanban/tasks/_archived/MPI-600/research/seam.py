"""MPI-600 - score seam / lighting integrity by measuring it, not by eyeballing it.

    python seam.py BASE.png RESULT.png MASK.png

The localised-edit branch (wf_type 5) crops around the mask, green-fills it, regenerates and
stitches back. Two things can go wrong and both look like "a visible rectangle":

  1. the stitch writes outside the mask at all - pixels that should be untouched, changed;
  2. the regenerated patch carries a different exposure / colour cast, so the boundary steps.

This measures both. Outside-mask delta should be ~0 for a clean stitch. The ring numbers say
whether any drift is a hard edge at the boundary or a global cast.

ponytail: numpy only (bench python has it), prints numbers, no plots, no report format.
"""

import sys

import numpy as np
from PIL import Image


def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.int16)


def load_mask(p, shape):
    m = np.asarray(Image.open(p).convert("L"), dtype=np.uint8)
    if m.shape != shape:
        m = np.asarray(Image.open(p).convert("L").resize((shape[1], shape[0]), Image.NEAREST),
                       dtype=np.uint8)
    return m > 127


def dilate(mask, r):
    """Square dilation by r px. ponytail: a box dilation is enough to build distance rings."""
    out = mask.copy()
    for _ in range(r):
        out[1:, :] |= out[:-1, :]
        out[:-1, :] |= out[1:, :]
        out[:, 1:] |= out[:, :-1]
        out[:, :-1] |= out[:, 1:]
    return out


def main():
    base, result, maskp = sys.argv[1], sys.argv[2], sys.argv[3]
    a, b = load(base), load(result)
    if a.shape != b.shape:
        sys.exit("shape mismatch: %s vs %s" % (a.shape, b.shape))
    m = load_mask(maskp, a.shape[:2])

    delta = np.abs(a - b).max(axis=2)          # per-pixel max channel delta
    signed = (b - a).mean(axis=2)              # per-pixel mean signed delta (exposure direction)

    print("frame %dx%d | mask %.1f%% of frame" % (a.shape[1], a.shape[0], 100.0 * m.mean()))
    print()

    outside = ~m
    print("--- OUTSIDE the mask (a clean stitch leaves this at 0) ---")
    print("  pixels          : %d" % outside.sum())
    print("  mean |delta|    : %.3f / 255" % delta[outside].mean())
    print("  max  |delta|    : %d / 255" % delta[outside].max())
    print("  changed >2/255  : %.2f%% of outside pixels" % (100.0 * (delta[outside] > 2).mean()))
    print("  changed >8/255  : %.2f%% of outside pixels" % (100.0 * (delta[outside] > 8).mean()))
    print("  mean signed     : %+.3f / 255  (global exposure shift outside the edit)"
          % signed[outside].mean())
    print()

    print("--- distance rings outward from the mask edge ---")
    print("    a hard step at ring 0-8 with quiet far rings = a SEAM.")
    print("    all rings drifting together = a global CAST, a different failure.")
    prev = m
    edges = [8, 16, 32, 64, 128]
    for r in edges:
        grown = dilate(m, r)
        ring = grown & ~prev
        if ring.sum():
            print("  %3d-%3dpx : mean |d| %6.3f  max %3d  >2/255 %5.2f%%  signed %+.3f"
                  % (edges[edges.index(r) - 1] if r != 8 else 0, r,
                     delta[ring].mean(), delta[ring].max(),
                     100.0 * (delta[ring] > 2).mean(), signed[ring].mean()))
        prev = grown
    far = ~prev
    if far.sum():
        print("  %3d+  px : mean |d| %6.3f  max %3d  >2/255 %5.2f%%  signed %+.3f"
              % (edges[-1], delta[far].mean(), delta[far].max(),
                 100.0 * (delta[far] > 2).mean(), signed[far].mean()))
    print()

    print("--- INSIDE the mask (this is the edit; it SHOULD differ) ---")
    print("  mean |delta|    : %.3f / 255" % delta[m].mean())
    print("  max  |delta|    : %d / 255" % delta[m].max())


if __name__ == "__main__":
    main()
