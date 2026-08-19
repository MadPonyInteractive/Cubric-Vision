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

## Closed by the user, 2026-08-19 (later) - the positive prompt

Sheet: `PROMPT_cheek_f12.png` (3x zoom on flat cheek; second sample
`PROMPT_cheek_f10.png`, whole face `PROMPT_face_f12.png`, full frame
`frames_f12.png`). Three arms identical except the prompt string.

Fabio: *"here on cheek F12, I can clearly see two moles, which probably were the
model's attempt at doing freckles."* **CONFIRMED.** The graph's default positive
prompt was ordering the artifact the radius sweep and the evidence gate were
both built to remove downstream. Neutral and empty cheeks are clean.

Scope of the finding, stated so it is not over-read: the prompt explains the
SKIN MARKS only. All three arms still render the same different woman, the same
changed pose and framing, and the zipper as a button placket - identity
replacement at sigma 0.85 is not the prompt's doing.

**No number supports this verdict and none should be quoted for it.** Three
high-pass measures were built and all three failed their own controls - the
detail is in `plan.md` § SEVENTH INSTRUMENT-HONESTY TRAP. Two moles at 3x zoom
is not something a mean-over-a-box statistic can see.

**Confirmed again at full length, same day.** `nb_s085_x2_00001.mp4` (81 frames,
neutral) against its contaminated twin `full_s085_x2_00001.mp4`, frames 40 and
65 (`REBASE_face_f40.png`, `REBASE_face_f65.png`): the old arm's cheeks carry a
speckle field plus a distinct mole, the new arm's are clean. Two independent
frames, one variable. **Awaiting Fabio's eyes** - this half is my read, not his.

## SHIP/NO-SHIP CLOSED BY THE USER, 2026-08-19 - PASS

`nb_s050_x2_00001.mp4` - 81 frames, sigma 0.50, `img_compression` 0, neutral
prompt, 294s, peak 15868 MB. Watched in motion, which is the only way the swim
is visible.

Fabio: *"050 holds up motion. It's the best result we had so far."* **PASS.**
That resolves the tension the card has been carrying since the VAE root-cause -
he had approved 0.50 from stills while separately saying the VAE alone "messed
up parts of the face", and the swim is present at 2.79-3.00 in this arm. Watched
at full length it does not read as a defect. The margin is real but it is a
margin, not an absence: flatter, longer or slower footage may still cross it.

He also restated the standing want: *"going to 085 has a much better
improvement, although a lot of changes happen. Can we have a knob that can be
used more or less like denoise on image upscalers?"* Answered in `plan.md`
§ THE KNOB QUESTION, THIRD TIME.

## CLOSED NEGATIVE by the user, 2026-08-19 - the detail transfer

`T50from85_035.mp4` and `T50from85_070.mp4` (0.50 base, 0.85 donor, watched in
motion). Fabio: *"35 has a bit of morphing in her mouth... 70 has even more
prominent morphing in her eyes. There are parts where her eyes are open and
closed at the same time, like a bad interpolation or two frames fighting over
each other. On 70, her face just looks weird. Almost like it was stamped on."*

**FAIL, and the mechanism is in his words.** The op assumed the donor re-renders
texture and leaves the performance alone; at sigma 0.85 it regenerates the
expression too, so donor frame `i` is a different moment than base frame `i` and
the transfer stamps one expression's edges onto another. The evidence gate dies
with it, and it explains the gate's earlier "expressions lost / bad
interpolation" verdict that this file had recorded as unexplained.

**A still could never have caught this** - the defect exists only as a
disagreement across frames. `KNOB_f65.png` looked like a clean detail ladder.

## Open - the source class was wrong

Fabio: *"We've been working with a very degraded video of the lady dancing. The
real application is most likely going to be AI-generated at a lower resolution
that needs a bump in resolution."* Every verdict on this card describes the hard
case. He is supplying the right footage; the sigma ladder re-runs on it and the
default is unsettled until then.

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
