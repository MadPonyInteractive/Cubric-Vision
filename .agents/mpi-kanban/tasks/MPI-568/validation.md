# MPI-568 Validation

`Verify mode: user-ux`. No metric closes this card - three were built and each
ranked something wrong when read alone. Fabio's eyes decide it.

## Closed by the user, 2026-08-19

**Q3 - does it keep an eye an eye.** Sheets: `SHEET_ladder_face_f12.png`,
`EYE_zoom_f12.png`, `OBJECT_necklace_f12.png` in `D:/WORK/Images/Outputs/mpi568/`.

Fabio: *"the iZoom at Sigma 0.50 is still an iris. It's not a square or anything
like that, so it was properly reconstructed."* **PASS** - this is the exact
failure that killed SeedVR2 in MPI-506, on the same crop.

*"It's no longer her at Sigma 85. It's still her at Sigma 50."* And on the object
crop, which is a **zipper**, not a necklace: it survives at 0.50 and its upper
half is gone at 0.85.

*"If we have a knob that controls the amount of change, then this is wonderful as
is. You may proceed."* The knob is `sigmas`. **Q2/Q4/Q5 close on this.**

## Verified by measurement this session

- The wavy distortion Fabio reported on `real_temporal_gt_00001.mp4` is real,
  reproducible, and now has an instrument that fires on it (`wave.py`,
  self-checked: it reads 0.27 residual / 0% displacement / 0.00 shift on an h264
  control and 7.58 / 10% / 2.79 on the flagged clip).
- Attribution measured with single-variable arms (`warp_arms.py`, seven runs,
  3-12s each): VAE round trip 4.06, +preprocess 4.93, +temporal upscaler 5.54,
  against a 0.31 codec floor.
- Two hypotheses falsified by their own controls: the frame count (flat at
  3.83/3.89/3.93 for 9/25/49 frames) and a geometric warp (a per-tile shift
  search recovers only 10-19%).
- Ground-truth interpolation redone with legal 8n+1 counts and matched sample
  sizes: temporal 7.50 vs duplication 10.22, vs a crossfade at 7.85.

- **The split radius does not control invented texture** (`band_split.py`,
  self-checked, its unsharp control passing on all three frames). Swept r=2..20
  on frames 12/40/65: the invention/reconstruction ratio is worst at r=2 (0.511)
  and best at r=8-10 (0.345), while every drift-matched strength twin at r=10
  sits at a constant 0.347. Radius is dominated by strength; the hypothesis in
  the previous handoff is dead. The luma-only arm is negative on the same
  frames - the veins survive with the red drained out.
- **The evidence gate suppresses invention on a region it was not tuned on.**
  `RADIUS_gateTORSO_f40.png`, drift-matched at 132%: the source is plain fabric
  with a faint seam, ungated detail-100 invents three red dots on the flat
  fabric, the gated arm loses them and keeps the seam's buttons.
  `FULL_gated132.mp4` rendered at 81 frames and verified against the in-memory
  arm (face drift 5.83 in the clip vs 5.47 computed; the 1.96 residual is the
  crf-14 encode, which `FULL_detail100.mp4` also carries, so the A/B is fair).

## Still open before this card can close

- **THE POSITIVE PROMPT IS AN UNCONTROLLED VARIABLE UNDER EVERY MEASUREMENT ON
  THIS CARD.** `build_v2v.py` conditions on `"a woman's face in close up, natural
  skin texture, freckles, sharp eyes"` by default and always has. It asks for the
  speckled skin the whole downstream filtering effort has been trying to remove.
  `cfg: 1` also makes the negative prompt inert. Every arm, sweep and ratio on
  this card was measured under that conditioning; none of them are wrong, but
  none of them are clean either. Re-baseline before drawing further conclusions.
- **Gate verdict from Fabio: partial pass.** Veins gone; fabric speckles only
  partly (my "three red dots" was an under-count from a single crop); expressions
  lost; and a new face artifact he describes as "bad interpolation". Leading
  hypothesis for the last one is that the gate is recomputed per frame and
  flickers, pulsing the detail layer - untested, zero GPU to test.
- **The gate has NO independent evidence yet.** `band_split.py` is built from
  the same source-high-pass statistic as the gate and would flatter it no matter
  what, so it may never be used to score it. Only Fabio's eyes on
  `FULL_gated132.mp4` and the ground-truth invented-texture test can close it.
- The gate's stated limit is untested: it suppresses invention where there is
  nothing to reconstruct from, so a hallucination that lands ON a real edge
  passes through it unchanged.

- **The hybrid temporal arm needs an eye check** - laplacian variance says the
  sharpness pulse is 1%, and that instrument demonstrably fails on this footage
  (it scores the visibly-softer temporal frame sharper than the real source).
- The swim measured in the approved spatial arm (2.79-3.00 vs a 0.43 floor) has
  not been shown to Fabio on a clip where it would be visible. He approved a
  still ladder and a short portrait clip; flat or slow footage is the untested
  case.
- Every timing on this card was measured on a GPU shared with the app engine.
