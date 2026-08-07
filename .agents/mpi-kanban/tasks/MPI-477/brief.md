# MPI-477 — H3 refiner, the pixel-space route

Spun out of the 2026-08-07 bench session. **Do not start by trying a latent
upscale — that was tried all evening and disproven.** Full evidence lives in
[docs/models/h3/ref2va.md](../../../../docs/models/h3/ref2va.md); this card is
the residue.

## What was settled (don't re-run any of it)

| latent operation | result |
|---|---|
| none — native 2560×1472 | **clean** |
| ×1.5 up, `nearest-exact` | banding |
| ×1.5 up, `bicubic` | banding |
| ×1.9 up | banding |
| ×0.75 **down** | no banding (but half-res, degraded) |

Every **upscale** produced hard horizontal banding. The one **downscale** did
not. Eliminated along the way, each by test rather than argument: the
interpolation method, the scale ratio, and `output` vs `denoised_output`.

**Conclusion: H3's DiT does not accept an upscaled latent.** Not a wiring fault
and not a bug in `MpiLatentUpscale` — the model.

Also settled:

- **`MpiLatentUpscale` works and is committed** (ComfyUi-MpiNodes `8482649`).
  Core's node cannot touch an H3 latent at all — `common_upscale` reshapes and a
  NestedTensor has no `.reshape` — and core additionally converts pixels with a
  hardcoded `// 8`. Stride is **16** (the VAE's spatial compression): 32 was
  tried and reverted (`43a976f`) after a 2016×1152 request decoded at 1008×576,
  which proved the decode multiplies by 16.
- **The audio breaks on any split trajectory.** H3 emits video and audio from ONE
  joint latent; the audio half has no spatial dims and is bound to the video
  half's token layout. A *refiner* (complete pass, then a separate `denoise < 1`
  pass) leaves pass 1's audio intact — a *split-sigma* hi-res fix cannot.
- **ref2va composes for the stage-1 canvas**, structurally: it sets
  `minimax_refs` and never `minimax_keyframes`, so nothing anchors framing. Same
  prompt and seed framed a close shot at 672×384 and the whole scene at 1344×768.
  Any technique that samples the first pass small will change the shot, not just
  its resolution. Expect this to behave far better on **fl2va i2v**, where the
  first frame pins the framing.

## The route that remains

Decode → upscale in **pixel** space → **VAE-encode** back → partial re-denoise.

The reason it is worth trying rather than just being the next thing on the list:
a VAE encode produces a latent that is in-distribution **by construction** at the
target size, which is exactly the property a stretched latent lacks — and that is
the one property every failed attempt above was missing.

**The blocker is a node.** H3's sampler needs a video+audio *pair*, so the route
needs the inverse of `MpiLatentUpscale`: encode the video half, encode the audio
half, re-nest into a `NestedTensor`. `latent.py` already holds the unbind/re-nest
pattern (`_save_latent_file` / `_load_latent_file`), so it is a small node.

## Before building anything, settle whether it can pay

The saving was always "do fewer steps at high resolution". Two of the session's
own numbers undercut that on ref2va:

- 1152×640 (0.74MP), 2s, 10 steps → **518s**
- 2560×1472 (3.77MP), 1s, 10 steps → **544s**

~2.4x the pixel-frames for the same wall time. **Reference tokens ride every step
regardless of canvas**, so on ref2va they may be a large fixed cost that shrinking
the canvas does not touch — in which case a refiner saves far less than the
fl2va pixel curve predicts, and the whole idea is not worth a node.

**Cheapest decisive experiment, do this FIRST:** run the same canvas twice, once
with references and once bare. The delta is what references cost per step. Two
cheap runs; they decide whether this card is worth opening at all.

## And the honest alternative

Native 2560×1472 is already clean and now ships as the `2k` tier (`6dd921a3`).
If the reference-cost test says the saving is small, **close this card as
`rejected`** and keep the tier. That is a legitimate outcome, not a failure.
