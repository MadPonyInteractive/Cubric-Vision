# MPI-707 — De-RoPE temporal super-resolution as an optional final pass

Parked deliberately. Investigated on the bench 2026-09-07; not scheduled until the 1.5
release and the video-inpaint work are out.

## The idea, and why it is not another upscaler

MiniMax H3 compresses time as `1 + 4 + 4 + 4 + 4` — five latent frames per seventeen real
ones. Gentle motion survives it. Fast motion inside a four-frame group gets **averaged**,
and the result is the smearing / tearing / limbs-vanishing failure we have always had. It
is why the shipped frame counts move in those increments.

The fix does not add pixels. It adds **time**: detect the jerk-hot spans, insert hold
frames there (slow-motion), re-diffuse at partial strength so the model re-reads the motion
with more temporal room, then drop the inserted frames to return to 24 fps. Same
resolution in, same resolution out.

Source: [`matlowai/ComfyUI-MAINodes`](https://github.com/matlowai/ComfyUI-MAINodes), GPL-3.0,
active. Walkthrough: *ComfyUI: Fixing MiniMax H3 Motion Smearing with De-RoPE* (Machine
Delusions, 2026-09-06). The reference graph is public in the repo at
`examples/motion_pipeline.json` — only the annotated version is Patreon-gated.

Nodes used: `H3JerkOracle` → `H3TimeSmear` → `VAEEncode` → `H3V2VInit` → a partial-denoise
`SamplerCustomAdvanced` (`H3InjectSchedule`) → `H3ExactRecover`, with
`H3AudioSmear` / `H3AudioRecover` keeping the audio clock aligned.

## What the bench run proved

Bench workflow: `G:\ComfyUi\ComfyUI\user\default\workflows\h3_ref2va_rope_test.json`
(built from `comfy_workflows/raw/minimax_h3_r2va_template.json`, de-RoPE spliced between
stage 1 and the latent upscaler behind a lazy `MpiIfElse` toggle). Not in this repo — bench
only.

**The technique works.** On a clip at 768×1344, in the frames where the subject is actually
moving, the de-RoPE pass resolved a glass and the fingers around it that stage 1 rendered as
mush. Unambiguous on a frame-by-frame compare.

**Our topology then throws the fix away.** The stage-2 upscale refine reworked the same hand
and lost it, and its output is consistently darker and contrast-crushed versus the de-RoPE
frames it was built from. Both passes are re-diffusions; whichever runs last wins. Suspect
the stage-2 schedule: `ManualSigmas "0.9035, 0.6316, 0.3158, 0.0000"` — a first sigma of
0.90 is very nearly a full re-render, not a refine.

**The oracle mis-targets.** `H3JerkHeatmap` showed the jerk heat pooling in sky and horizon
— a rocking boat and a panning background produce plenty of jerk — while the hand that
needed fixing got comparatively little. A large share of a 16-minute pass went into
regenerating water. `H3V2VInit` already takes a `mask` (regenerate 1 / freeze 0, plus
`invert_mask`, `mask_feather`, `time_varying`), so the budget can be aimed at the subject.
This is the same lever as the video-inpaint mask work.

**Cost, measured.** 56 world frames → 124 dilated (2.21x frames, **3.8x time per step**,
tokens 17 → 37, 22 of 56 frames held). 12 steps at 768×1344 took **16m23s** for the de-RoPE
pass alone; 21m28s for the whole prompt. Not shippable at that price.

## The third clip settled it: aim is everything

Runner on a bridge, tracking camera, cityscape behind, 672×1216, economy oracle, turbo
8-step distill at `total_steps 10 / inject 0.5` (5 steps). Compared frame-for-frame against
stage 1:

| what | result |
|---|---|
| Background buildings | **Much better.** Hazy mush → sharp windows, structure, elevated rail. |
| Trailing foot | **Better.** A white blur in stage 1 resolves into a recognisable shoe. |
| Jeans | **Torn.** Rips appear at knee and thigh that stage 1 does not have, from frame 8 on. |
| Face | **Softer** than stage 1; the upscale re-sharpens it but drifts the identity. |
| Stride | **Re-choreographed.** At frame 8 the two versions are at different points in the gait — the "speed-up" seen on playback. |

One sentence covers it: **every improvement landed where the oracle aimed, and every
regression landed where nothing protected the subject.** Buildings and feet got attention
and improved. Jeans, face and stride were re-diffused for no reason and degraded.

That makes the drift a *governed* cost rather than a mystery. It appears on every clip
tested (two cups → one cup on the boat; torn jeans and a drifting face here), it is
proportional to `inject` × step budget, and it applies to whatever the mask does not
protect. An under-driven distill makes it worse: 5 steps against an 8-step distill lets the
model snap to its own motion prior instead of tracking the init, which is precisely what
re-choreography is. `total_steps 16 @ inject 0.5` = 8 steps is the matched setting and
should be the baseline for any future run.

Correction to an earlier assumption on this card: a running gait is **not** uniformly the
"drifter" class. Foot strike is a sharp deceleration and therefore a real jerk event, which
is why the feet genuinely improved. Steady periodic motion is the drifter case; impacts
inside it are not.

## Targeting is the real constraint — and it decides the product shape

Two clips, two backgrounds, the same failure: **the oracle aimed at the background both
times.** On a boat clip (rocking hull, panning horizon) the jerk heat pooled in sky and
water. On a tracking shot of a runner against a cityscape it pooled in the buildings.

The second case explains the first. `H3JerkOracle` measures jerk in **latent/frame
coordinates**. When the camera follows the subject, the subject is close to *stationary* in
those coordinates and the entire background sweeps — so the oracle sees the background as
the fast thing and the subject as the slow one. **A tracking shot inverts the targeting.**
A cityscape is the worst case for it: hard vertical edges, high-contrast windows, parallax
between near and far buildings, all maximal `|d3|`.

So the automatic path only aims correctly on a **locked-off camera**. Any pan, track or
handheld and the background wins the jerk contest. Most footage worth fixing has camera
movement.

**Therefore `H3V2VInit.mask` is the primary interface, not an optimisation.** Auto-oracle
is the narrow case. This is a design constraint, not an open question.

Related: what needs fixing is not what moves most. Measured by eye on the runner, the feet
read as ordinary motion blur (fast but periodic — high velocity, low jerk) while the
**hands and face** carry the actual smear, because they change direction. The pack has a
name for the first class: `H3JerkHeatmap.show_drift` paints it blue — *"the drifter class
that time warping mishandles and background freezing protects."* So masking to hands/face
is right on both counts: it is where the defect is, and it avoids the class the technique
handles badly.

### We already ship the mask source

No new dependency needed to generate a subject mask per frame. The stage-1 decode is
already an IMAGE batch, so any of these can run over it directly.

**Prefer SAM3** (`SAM3_Detect`, already in `comfy_workflows/img_auto_mask.json` alongside
`UltralyticsDetectorProvider` / `ImpactSimpleDetectorSEGS` / `GrowMaskWithBlur`). It is one
prompt-driven node that covers the whole range this card needs — isolate the person
(equivalent to a background removal), or go straight to "hands" / "face" when the budget
should land only where the smear actually is. That range is the point: the useful mask here
is usually tighter than "not the background".

`comfy_workflows/remove_background.json` (`LoadBackgroundRemovalModel` + `RemoveBackground`)
is the cruder fallback — subject-vs-background only, no way to ask for a sub-region.

**Trap when wiring it:** `H3V2VInit.time_varying` defaults to **false**, which unions the
mask over time and gives a static boundary. For a subject crossing frame that union is the
whole path she travels — which re-wastes the budget the mask was meant to save. A moving
subject needs `time_varying: true`, and the docs warn that a moving boundary **can pop**,
quantized as it is to the `(1,4,4,4,4)` token grid; intended transitions want to sit on
17-frame phase. `mask_feather` / `freeze_grow` are the softening knobs, and
`GrowMaskWithBlur` upstream does the same job.

## Traps paid for, worth not re-paying

- `H3InjectSchedule` and `H3JerkOracle` both have a `preset` widget that **silently
  overrides** the dials above it. Turning `inject` does nothing until preset is `custom`.
- `inject` truncates the schedule: `round(total_steps * inject)` steps actually run. 25 @
  0.70 = 18, 25 @ 0.50 = 12. `total_steps` sets sigma *spacing*; `inject` sets how much
  structure is rewritten. Raise `total_steps` for refinement without more drift.
- **EasyCache poisons this pass.** It skips on a low aggregate change rate, and a v2v
  injection on a mostly-duplicated init is *already* near its answer, so it skipped 7/18
  then 6/12 — starving exactly the minority of inserted tokens the pass exists to render.
  The lower the inject, the harder it skips. Bypass it for the de-RoPE pass only; keep
  `ModelAttentionBackend` or every pass slows ~1.6x.
- `expand_to_end` (default on) lifts hold rates toward the clip end, which reads as the
  subject speeding up after recovery. Off unless wanted.
- Audio is not separable — H3 denoises audio and video in one joint pass. Do not unwire
  `audio_latent`; use `audio_mode: pin the original outright (0.0)` to neutralise it.
- `MpiStageLatents` blocks `denoised` on a full run and `latent` on a preview run. Anything
  tapping stage 1 must take `latent` (out 0) or it is silently starved.

## The shape worth chasing next

The author's own `examples/archive/motion_pipeline_upscale_derope_1step.json` collapses the
upscale and the temporal fix into **one pass**: `H3TimeSmear` → a plain lanczos `ImageScale`
to the target resolution → `VAEEncode` → a **single** injected step (`total_steps 4`,
`inject 0.25`, 4-step turbo LoRA, `gradient_estimation`), 0.4 MP → 1.5 MP. No latent
upscaler, no separate refine. It fits via `PathchSageAttentionKJ`,
`MiniMaxH3MemoryEfficientSageAttentionPatch` and `MiniMaxChunkFeedForward` — all **KJNodes**,
which we already pin in `dev_configs/node_lock.json`, so no new dependency.

If that holds, this replaces `MinimaxH3LatentUpscaler3D` + the 3-step refine rather than
sitting beside them, and it becomes cheaper than what we ship today rather than dearer.

## Open questions before this can be planned

1. Does it clearly win when the budget actually lands on the defect? Neither clip tested
   that — the first was mostly static, the second was a tracking shot whose oracle aimed at
   the buildings. The decisive test is a masked run (SAM3 → hands/face) or a locked-off
   camera. If it cannot win there, stop.
2. Does the one-step upscale+de-RoPE shape reproduce on `ref2va` with our 8-step distill?
   (The reference is `fl2va` with a 4-step lightx2v LoRA; the pack calls injection under
   heavy distillation experimental.)
3. Masked to hands/face, does the cost come down far enough to ship? (The mask does not
   reduce token count — it rides the noise mask, so the model still evaluates the whole
   dilated latent. It buys correctness and control. Token savings need temporal scoping:
   `H3WindowPlan` or `H3SegmentCrop`.)
4. Integration shape: an optional stage on the H3 graph, or a Flow over a finished video?
   It has to run **last**, which rules out the "extra stage before the upscaler" placement
   originally assumed. Whatever the shape, it needs a mask input on the user-facing surface.
5. Portability. `model_profile` on the oracle already lists `ltx-2.5` and
   `wan-2.2 (unmeasured)`, and the pack ships `derope_any.py` + `DEROPE_ANY_MODEL.md` plus
   working LTX 2.5 examples, so this is a technique to port rather than reinvent.

## Licence note

MAINodes is GPL-3.0. Not a new category — ComfyUI core and Impact Pack are GPL and we
already pin them — but if we ever reimplement the oracle into `ComfyUi-MpiNodes` it must be
clean-room, not a copy.
