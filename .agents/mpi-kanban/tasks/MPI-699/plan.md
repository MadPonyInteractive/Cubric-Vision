# MpiWindowedSampler: temporal windowing so the H3 2K refine reaches 124 frames

## Current State

Project mode: scalable-foundation.

Measured this session on the `G:\ComfyUi` bench, RTX 4060 Ti 16GB, H3 ref2va turbo:

- **The OOM is not the upscaler.** `MinimaxH3LatentUpscaler3D` completes, chunks
  (`temporal chunking: T=37 chunks=2 overlap=5`) and offloads. The failure is the
  node after it — `602 SamplerCustomAdvanced`, the 3-step stage-2 refine — at
  `comfy_kitchen/sage_attention.py prequantize_int8_attention` (959.88 MiB), and
  secondarily `comfy_aimdo` `vrambuf_grow` (308 MB).
- **Ceiling at 2K (output latent 92x160): T=27 passes, T=32 OOMs, T=37 OOMs.**
- Latent frames map to pixel frames as `T = (5*frames + 9)/17` — five latent
  frames per 17-frame H3 group. Verified: 73 frames -> T=22 (read from
  `mpi_stage1.latent`, shape `[1,24,22,56,32]`), 124 frames -> T=37 (from log).
- `h3.py TRAINED_MIN = 124` frames (~5.17s). **The model's minimum trained length
  is exactly what OOMs at 2K.** This is not a long-video feature.
- Ruled out this session: lowering the upscale factor (stage-2 peak is fixed by
  OUTPUT size; 1.5x only moves cost into stage 1, +79% stage-1 peak / +31% total),
  the turbo LoRA (non-turbo OOMs identically), model eviction (`MpiClearVram` on
  all three sinks brings RAM down and it still OOMs), and reclaiming desktop VRAM
  (Edge was holding 2.0 GB; freeing it moved the failure later, not away).
- Also ruled out: dropping fps and interpolating. Frame count IS duration for
  H3 — the generated audio sits on the 24fps timebase, so stretching video
  desyncs lip sync. Viable for silent output only.

Related cards, neither of which owns this: **MPI-477** is the pixel-space refiner
route (decode -> pixel upscale -> re-encode -> partial re-denoise). **MPI-688** is
adding H3 to the user-facing Upscale Video flow, which would sit on top of this node.

**Why the two-stage still earns its place**, even though native beat upscaled on
quality at 1K this session: native is roughly 1.4-2x slower (measured 260s vs 190s
at 768x1344), and at true 2K there is no native option at all — Fabio reports
native 2K OOMs even on a 5090. So the tiers split: native below ~2.1 MP for
quality, two-stage at 2K because nothing else reaches it.

**COORDINATION BLOCKER:** MPI-591 (Extend Video takes H3) holds a live write claim
on `c:/AI/Mpi/ComfyUi-MpiNodes/h3.py`. Do NOT edit that file. The audio-passthrough
decision means this card does not need it — `plan_audio_window` lives there but is
only relevant if we sliced audio, which we deliberately do not. `__init__.py` in
that repo is unclaimed but is the likely collision point, since MPI-591 may add its
own registration; claim it and check before writing.

## Implementation

- [ ] Build `MpiWindowedSampler` in `c:\AI\Mpi\ComfyUi-MpiNodes` as a drop-in for
  `SamplerCustomAdvanced` (same five inputs plus `window` and `overlap`), loop
  overlapping temporal windows calling the same `guider.sample(...)` per window,
  crossfade-accumulate, wire it into both H3 templates, then pin and validate.
  Also add a terminal no-output variant of `MpiClearVram` in the same repo's
  `vram.py` (see below) — same ship cycle, one pin bump serves both.
  **Verify:** 124 frames at 2K (1472x2560) turbo completes on the 4060 Ti without
  OOM, and the user confirms no visible seam at the crossfade region.

### Folded in: terminal MpiClearVram (requested 2026-09-05)

`MpiClearVram` today is a pass-through: `OUTPUT_NODE = True` with an optional
`passthrough` input echoed to an output. Fabio found that clearing VRAM properly
needs one instance per terminal branch — one off the latent, one off the decoded
image, one off the decoded audio — because the node only fires on branches that
actually execute. Threading a pass-through onto every branch tail is awkward.

Wanted: a sink variant that takes the `_any` input to pin its place in the
execution order but returns nothing, so it can be hung off any branch tail
without rewiring what follows. Lives in `vram.py` (unclaimed). Keep the existing
pass-through node untouched — shipped workflows reference it.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Build the node, ship it through the sibling-repo procedure, wire the workflows,
  verify a 124-frame 2K render.

## Session state (2026-09-05)

Both nodes built in `c:\AI\Mpi\ComfyUi-MpiNodes`: `sampler.py` (new, 300 lines,
`MpiWindowedSampler`) and `MpiClearVramEnd` in `vram.py`. Registered, README +
changelog done. **Committed locally, deliberately NOT pushed and NOT pinned.**

**It works.** 124 frames at 2K, turbo, `window=27 overlap=4` — completed in
**28:38, no OOM**, on the 16GB 4060 Ti that OOM'd every previous attempt.
`spans=[(0, 27), (10, 37)]`, exactly as the planner predicted. Stage 1 8/8 05:26
(40.78 s/it); window 1 3/3 09:40 (193.50 s/it); window 2 3/3 09:48 (196.16 s/it).
The two windows landing 1.4% apart proves the model stayed loaded between them —
the one constraint that would have turned this into a regression. The
`vrambuf_grow` 308MB second wall did NOT appear. Fabio on that clip: "the overlap
is fine, I didn't see any issues, the video looks good."

**ONE OPEN QUESTION, AND IT GATES THE PUSH: WINDOWS MUST LAND ON H3'S LATENT
GRID.** A `window=21 overlap=4` run showed a **black frame at the end of window
1** (and window 1 starts at latent frame 0, so cold decoder state cannot explain
it).

The blend maths is exonerated — swept 875 combinations (window 5-29, overlap 0-6,
T in 22/27/32/37/72), zero frames with zero accumulated weight, and at T=37 frame
36 carries weight exactly 1.0 at both 21 and 27.

The live hypothesis is **grid alignment**. H3 codes 17 pixel frames per 5 latent
frames, so a full clip's T is always `5k+2` — which is exactly why the valid
values are 22, 27, 32, 37. And:

    window 27 = 5*5 + 2  ON-grid   -> ran clean, "video looks good"
    window 21 = 4*5 + 1  OFF-grid  -> black frame

An off-grid window leaves a partial group at the tail, and the decoder trims each
chunk's prefix and drops the encoder's 3-token tail pad assuming the length is
aligned. This repo already treats that as load-bearing elsewhere:
`MpiH3MaskedPrefix` snaps `context_frames` DOWN to 39/90/141 for the same reason,
and its docstring notes an off-grid value "does not raise, it drifts".

`plan_windows` currently has no notion of the grid — 21 was chosen purely by
minimising redundant frames, which optimised the wrong thing.

**NEXT ACTION: open the saved MP4 from the 21/4 run and look at the window
boundary and the end.** Black there confirms the grid hypothesis and the snap is
mandatory before this ships. Clean there means it is a preview-only artefact
(`MpiVideoSamplingPreview` decodes each window independently) and the node ships
with a grid snap added anyway, since 27 vs 21 is otherwise unexplained.

**Recommended next config: `window=22, overlap=5`** — on-grid (`4*5+2`), 2 passes,
44 frames sampled against 27's 54, so it keeps most of the speed win. Bypass node
538 `MpiVideoSamplingPreview` during the test to remove the ambiguity.

## The black frame was an OFF-GRID WINDOW (resolved 2026-09-05)

**Answered.** The artefacts are real, not a `MpiVideoSamplingPreview` lie. Fabio
watched the saved decode and the live preview of two separate runs at
`window=21`: flashing artefacts through window 2 and a black frame at the end of
BOTH windows. The preview branch of the hypothesis is dead.

**Cause.** H3 patchifies time as a 2-frame causal head plus blocks of 5, so a
legal latent length is `5k+2` and a legal cut point is a multiple of 5. `27` is
`5*5+2`, no remainder, and it was clean. `21` leaves `(21-2)/5 = 3.8` blocks: the
trailing part-block is padded, and the padding is what comes back black. The
run's own log also shows window 2 STARTING at 16, which is off-grid too. The
blend maths was exonerated first (identity-sampler reconstruction under `1e-5`
across 875 shape combinations), so length was the only thing left.

**Fix, in `c:/AI/Mpi/ComfyUi-MpiNodes/sampler.py`, uncommitted:**
- New `frame_grid` widget (default 5; `1` = no constraint, plain fixed windows).
- Window length snapped to `5k+2` AND stride snapped to a multiple of `grid`, so
  windows start on the grid as well as end on it. Stride rounding can only buy
  MORE overlap than requested, never less.
- `window` is now a CEILING, not a target. Pass count is the cost, not window
  size, so once the pass count is fixed the window shrinks to the smallest legal
  size that still covers. `T=37` ceiling 27 now plans `[(0,22),(15,37)]` — 44
  latent-frames of sampling instead of 54. Measured support: 21-frame windows ran
  6:54 / 6:45 against 9:40 / 9:48 at 27.
- Where grid and ceiling disagree the GRID wins: an over-ceiling window risks an
  OOM, an off-grid one guarantees a corrupt one. The log reports both numbers.
- Self-check: 747,257 assertions — every `T=5k+2` to 197 x window 2-59 x overlap
  0-11 asserting on-grid size, on-grid start, equal sizes, no gaps, full
  coverage; plus `grid=1` proven a no-op across 80 x 40 x 8.

**Gate before the push is now one clean run** at ceiling 27 / overlap 4 /
frame_grid 5. Node repo still NOT pushed, `dev_configs/node_lock.json` still NOT
bumped.

**Auto-window is AFTER the pin, decided 2026-09-05.** The pin ships a node that
works today; auto needs a second VRAM calibration point that does not exist yet,
and per this card's own constraint a wrong guess OOMs rather than degrading. Auto
lands later as an optional widget on the same node, so shipped workflows keep
their sockets and it costs one more pin bump. Note that auto can never infer
`frame_grid`: `T=37` is legal under both `grid=5` and `grid=1`, so the grid stays
authored per workflow whatever happens to `window`.

## The seam was the FADE WIDTH, and the units moved to video frames (2026-09-05)

Committed in the node repo at **e9e3633, NOT pushed and NOT pinned.**

**Black frames: gone, confirmed by Fabio.** The grid snap did it. That gate is
closed.

**The seam was a second, separate bug of mine.** `plan_windows` hands out more
overlap than requested once the stride is snapped, but `_blend_weights` was
still ramping over the REQUESTED number -- a plan sharing 7 frames crossfaded
across 4 and hard-cut the other 3. Now ramps over `_edge_overlaps`, the real
shared region per edge. Measured on one seam at T=37, low-res, everything else
identical:

| fade | what Fabio saw |
|---|---|
| T4  | her face visibly becomes two faces |
| T7  | a trace of distortion |
| T17 | clean |

**This is palliative and the card should say so.** The windows denoise the
shared frames independently, so two valid but different answers get averaged;
width hides it, nothing here removes it. The removal is per-step blending --
the node becomes a MODEL wrapper (`set_model_unet_function_wrapper`, the
AnimateDiff context-window shape), full latent to the sampler, windows split and
re-blend inside each `apply_model` so they cannot drift. NOT DONE, and Fabio has
not chosen it. Ship-with-generous-overlap is the alternative.

**Units moved to VIDEO frames** (`window_frames`, `overlap_frames`; `frame_grid`
stays latent and advanced), plus a third `info` STRING output. Rationale: an OOM
is discovered as "died at 124, survived at 90", so a latent-frame dial cannot be
calibrated by the person who hit the wall. No extra widget needed --
`ratio*T - (ratio-1)*ceil(T/grid)` with `latent_format.temporal_downscale_ratio`
reproduces ComfyUI's own count exactly.

**Resolution scaling, asked 2026-09-05.** `max_T = budget / (latent_W*latent_H)`,
budget = 397,440 tokens (`27*92*160`, the ONE measured point). Tokens go with
area, so doubling linear resolution quarters the window:

| output | latent | max T | window | passes | cost vs 2K |
|---|---|---|---|---|---|
| 1024x1792 | 112x64 | 55 | 124f | 1 | 0.33x |
| 1280x2240 | 140x80 | 35 | 90f | 2 | 0.76x |
| 1472x2560 (2K) | 160x92 | 27 | 90f | 2 | 1.00x |
| 1856x3232 | 202x116 | 16 | 39f | 6 | 2.12x |
| 2944x5120 (4K) | 320x184 | 6 | **OVER BUDGET** | - | - |

4K does not fit on the 4060 Ti at all: the smallest legal H3 window (T7) needs
412,160 tokens against a 397,440 budget. 3.7% over is exactly the margin one
calibration point cannot call -- only an attempt settles it. A linear token
budget is itself suspect, because attention is superlinear in T, which is the
second reason auto-window needs the 5090 point.

**THE ONE THING LEFT BEFORE THE PUSH.** The video-frame widgets and the info
output have NEVER executed in ComfyUI -- every clean run used the old
latent-frame widgets. One 2K run with `window_frames 90 / overlap_frames 26 /
frame_grid 5` (plans `[(0,27),(10,37)]`, the spans already proven clean at both
2K and low-res) verifies the new surface and 2K together. Then: push the node
repo, bump `dev_configs/node_lock.json`, wire node 602 into both H3 raw
templates and their compiled twins.

Fabio's tutorial will tell ComfyUI users to change `frame_grid` for a non-H3
model, so the widget is now public API -- do not rename it casually.

## Plan Drift

- **2026-09-05 — `window` is a ceiling, not a target.** `plan_windows` pads the
  last window back to full width, which maximises window size instead of
  minimising work. Measured at T=37: window 21 = 2 passes / 42 frames sampled,
  window 27 = 2 passes / 54, but 18/19/20 fall to 3 passes and 54/57/60 — worse
  than 27. Fix: fewest passes under the ceiling, then shrink all windows to the
  smallest equal size that still covers with the overlap. Worth ~22% of stage 2
  (19:28 -> ~15:08; total 28:38 -> ~24:18). Fabio found this, not me.
- **2026-09-05 — auto-window is TWO numbers, not one.**
  `window = token_budget / (latent_W * latent_H)`, and **overlap must scale with
  window** (~`window/5`): at window 7, overlap 4 costs 1.91x redundancy against
  1.27x at overlap 2. Measured budget on the 4060 Ti is **397,440 tokens**
  (27 x 92 x 160), which also reproduces the measured ceiling exactly. Only ONE
  calibration point exists — the RunPod 5090 run is what would make auto
  trustworthy. Do not ship an auto that guesses; it OOMs rather than degrading.
- **2026-09-05 — 4K would need window ~6-12** (window scales as 1/(W*H), so
  doubling resolution quarters it). Reachable in principle; the walls there are
  the third-party upscaler (temporal chunking only fires above T=32, so a 3s clip
  runs unchunked at 4x the activations) and the un-windowed VAE decode — neither
  is this node.

## Verification

**Verify mode:** user-ux

An agent can confirm "no OOM" from the bench log. It cannot confirm "no visible
seam" — that needs Fabio to watch the clip, specifically the crossfade region
(latent 14-23 of 37 under the planned window=27 / overlap=4 split).

Verification render: H3 ref2va, turbo, 124 frames, Input 1472x2560, upscale
factor 2.0. Success is the run completing plus a clean crossfade.

## Preservation Notes

- **Sibling-repo procedure is mandatory.** Node work goes through
  `/mpi-nodes-sync`; `c:\AI\Mpi\ComfyUi-MpiNodes\.claude\commands\` owns the
  procedures and they do NOT auto-load in a Vision session — read and follow
  them inline. A node ships only **committed -> pushed -> pinned** in
  `dev_configs/node_lock.json` before `minimax_h3_r2va.json` /
  `minimax_h3_fl2va.json` may reference it.
- **Model must stay loaded across windows.** Unloading between windows
  re-streams a 20 GB DiT over PCIe 4.0 x8 per window and turns the fix into a
  regression.
- **Audio is passed through, not refined.** Keep stage-1's audio latent and
  discard each window's refined audio (Fabio's call: audio is already good at
  these resolutions). This sidesteps the 3-frame audio-boundary constraint in
  `h3.py plan_audio_window` entirely.
- **Known risk, to be reported not hidden:** windowing shrinks activations and
  attention only. The `vrambuf_grow` 308 MB weight-cast failure is a fixed
  per-step cost and will NOT be helped. It is possible this clears the attention
  wall and lands on the cast wall behind it. If so, say so plainly rather than
  tuning window size until something passes.
- Reuse, do not reinvent: the crossfade maths (replicate pad, linear ramp,
  `out_full / weight_full`) is already proven in
  `MinimaxH3LatentUpscaler3D.forward`.
- Same node serves `ltx_video_upscale.json` — identical
  `LatentUpsampler -> SamplerCustomAdvanced` shape.
- Doc drift at close-out: this changes ComfyUI node wiring, so ask before
  touching `.claude/rules/`.
