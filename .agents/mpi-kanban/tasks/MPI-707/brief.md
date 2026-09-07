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

1. Does it clearly win on a clip whose failure actually is fast subject motion? Everything
   so far was tested on mostly-static footage. If it cannot win there, stop.
2. Does the one-step upscale+de-RoPE shape reproduce on `ref2va` with our 8-step distill?
   (The reference is `fl2va` with a 4-step lightx2v LoRA; the pack calls injection under
   heavy distillation experimental.)
3. Masked to the subject, does the cost come down far enough to ship?
4. Integration shape: an optional stage on the H3 graph, or a Flow over a finished video?
   It has to run **last**, which rules out the "extra stage before the upscaler" placement
   originally assumed.
5. Portability. `model_profile` on the oracle already lists `ltx-2.5` and
   `wan-2.2 (unmeasured)`, and the pack ships `derope_any.py` + `DEROPE_ANY_MODEL.md` plus
   working LTX 2.5 examples, so this is a technique to port rather than reinvent.

## Licence note

MAINodes is GPL-3.0. Not a new category — ComfyUI core and Impact Pack are GPL and we
already pin them — but if we ever reimplement the oracle into `ComfyUi-MpiNodes` it must be
clean-room, not a copy.
