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

## Still open before this card can close

- **The hybrid temporal arm needs an eye check** - laplacian variance says the
  sharpness pulse is 1%, and that instrument demonstrably fails on this footage
  (it scores the visibly-softer temporal frame sharper than the real source).
- The swim measured in the approved spatial arm (2.79-3.00 vs a 0.43 floor) has
  not been shown to Fabio on a clip where it would be visible. He approved a
  still ladder and a short portrait clip; flat or slow footage is the untested
  case.
- Every timing on this card was measured on a GPU shared with the app engine.
