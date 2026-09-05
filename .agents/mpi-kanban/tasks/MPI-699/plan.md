# MpiWindowedSampler: temporal windowing so the H3 2K refine reaches 124 frames

> **CURRENT STATE IS THE LAST DATED SECTION, NOT THIS ONE.** This plan is
> chronological; the section below is the ORIGINAL 2026-09-05 investigation and its
> "next action" is long dead. As of the last run: the node works and is committed at
> `e9e3633` (NOT pushed, NOT pinned); the video-frame widgets and `info` output are
> PROVEN in ComfyUI; 2K lands; **4K is out of reach on the 4060 Ti for a structural
> reason**; the linear token budget is FALSIFIED; and the one open gate is a barely
> visible seam on a 2K portrait clip that has NOT been attributed to the node rather
> than to the generation. Two live confounders sit outside this card: the H3 text
> encoder (MPI-698, reverted today for entity duplication — the bench graph's baked
> `clip_name` has never been checked) and the ref2va framing drift measured in
> MPI-477.

## Original investigation (2026-09-05)

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

### That 4K row is PORTRAIT 4K, and UHD LANDSCAPE 4K IS A DIFFERENT QUESTION (2026-09-05)

`2944x5120` is 15.07 MP. **`3840x2176` -- what a 1920x1088 stage 1 gives at 2.0x -- is
8.36 MP, 55% of it, and it FITS.** Planner run, not arithmetic:

| output | latent | tokens/T | max T | window | passes | max fade |
|---|---|---|---|---|---|---|
| 1920x1088 (stage 1) | 120x68 | 8,160 | 48 | unwindowed | 1 | n/a |
| 2560x1472 / 1472x2560 (2K) | 160x92 | 14,720 | 27 | 90f | 2 | 17 lat |
| **3840x2176 (UHD 4K)** | 240x136 | 32,640 | **12** | **39f** | **6** | **7 lat** |
| 2944x5120 (portrait 4K) | 184x320 | 58,880 | 6 | none legal | - | - |

**Settings for a UHD 4K attempt: `window_frames 39`, `overlap_frames 9`, `frame_grid 5`.**
T=12 is 98.6% of the measured budget. Plan is
`[(0,12),(5,17),(10,22),(15,27),(20,32),(25,37)]` -- six passes, uniform 7-latent fade.
`overlap_frames 0` is the only other distinct plan (four passes) and it is WORSE: fades of
2 and 7, and 2 is inside the "her face becomes two faces" band.

**THE FADE CANNOT GO ABOVE 7 LATENT FRAMES AT 4K, AND THAT IS STRUCTURAL.** `step_for`
floors the stride at `grid`, so the widest achievable fade is `window - grid` = 12-5 = 7.
On this card's own measured scale 7 is "a trace of distortion" and 17 was clean. **So the
smaller the window, the narrower the maximum possible fade: the seam problem gets WORSE
with resolution, not better, and at 4K the palliative runs out of room.** If the seam
turns out to be the node's, that is the argument for the per-step rewrite, because 4K
cannot be bought out of it with overlap.

**Superlinearity points the RIGHT way here for once.** The 4K window is T=12 against 2K's
T=27 at near-identical total tokens, so if attention is superlinear in T the linear budget
is PESSIMISTIC for 4K. Cost is roughly six windows of a bit under 2K's ~9:45 each.

**What the node does NOT help at 4K**, and both are already this plan's named walls: the
third-party `MinimaxH3LatentUpscaler3D`, and the un-windowed VAE decode of 124 frames at
3840x2176. Either can OOM with the sampler entirely innocent. Read WHICH node dies before
concluding anything about the window.

### RUN 2026-09-05: the widgets PASSED, 4K OOM'd, and the budget model is FALSIFIED

Ran on the bench at `window_frames 39 / overlap_frames 9 / frame_grid 5`, 3840x2176,
continuing from a saved stage-1 latent.

**The new surface is PROVEN.** The `info` line came back exactly as the planner predicted:
`6 windows of 39 video frames (12 latent), sharing 22 video frames (7 latent) ...
spans=[(0,12),(5,17),(10,22),(15,27),(20,32),(25,37)]`. Video-frame widgets and the third
output executed in ComfyUI. **That half of the push gate is CLOSED**, independent of the
OOM. The remaining gate is the seam, which is a quality question, not an execution one.

**Windows 1 and 2 completed** (09:59 at 199.91 s/it, 09:44 at 194.91 s/it — 2.5% apart, so
the model again stayed loaded across windows). Window 3 died at step 2/3, 27:20 in.

**IT IS NOT THE ATTENTION WALL. It is the second wall this plan predicted.** 2K died in
`prequantize_int8_attention` (959.88 MiB). This died in
`comfy_kitchen/backends/cuda/__init__.py:1983 int8_linear` on `torch.empty((m, n))` in the
MLP (`fc1` -> swiglu), requesting **5.45 GiB in one allocation**. Allocated 4.29 GiB, free
0 bytes, limit 16 GiB — the missing ~11.7 GB is staged weights outside the PyTorch
allocator (`19995MB Staged` DiT + `25140MB` TE). Peak reserved **18,112 MiB, past the 16GB
card**, i.e. it was already living on Windows shared memory (Task Manager: 24.3 GB shared,
system RAM 91%). The plan said to say this plainly rather than tune window size until
something passes. Saying it.

**THE LINEAR TOKEN BUDGET IS FALSIFIED — this is the second calibration point.**

| run | latent | T | tokens | outcome |
|---|---|---|---|---|
| 2K | 160x92 | 27 | 397,440 | passed |
| 4K | 240x136 | 12 | 391,680 | **OOM** |

Near-identical token counts, opposite outcomes. `max_T = budget / (latent_W*latent_H)` does
not hold: spatial extent costs something the token PRODUCT does not capture. Auto-window
cannot be built on this model. (It was expected to fail from superlinear attention; it
failed on a linear MLP buffer instead, so the mechanism is not the one predicted either.)

**4K IS NOT REACHABLE ON THE 4060 Ti, AND THE REASON IS STRUCTURAL, NOT A TUNING MISS.**
Every legal window at 240x136 against T=37:

| T | frames | tokens | passes | fade (lat) |
|---|---|---|---|---|
| 2 | 5 | 65,280 | 7 | 2 |
| 7 | 22 | 228,480 | 7 | 2 |
| 12 | 39 | 391,680 | 6 | 7 (OOM'd) |
| 17 | 56 | 554,880 | 5 | 12 |

The only step below the failure is T=7, and it is **worse in every dimension except peak
memory**: one MORE pass than T=12 (the stride floors at `grid`, so pass count stops
falling) and a 2-latent fade, measured as "her face visibly becomes two faces". T=2 plans
identically to T=7, so shrinking further buys nothing at all.

**THIS MAKES THE PER-STEP REWRITE THE 4K UNLOCK, NOT JUST THE SEAM FIX.** Per-step blending
re-blends inside every `apply_model`, so windows cannot drift apart and a narrow fade stops
mattering — which makes T=7 usable, and T=7 is exactly what 4K needs. The decision is
therefore NOT "generous overlap vs rewrite"; it is "ship 2K-only vs rewrite and get 4K".

**Next cheap attempt if one is wanted: drop the upscale to 1.5x** (2880x1632, latent
180x102 = 18,360/T). `window_frames 73 / overlap_frames 26` is T=22, 403,920 tokens, 4
passes, and a **17-latent fade — the width measured CLEAN at 2K**, which no 4K window can
offer. Fall back to `window_frames 56` (T=17, 312,120 tokens, 5 passes, fade 12). Ranked
guesses, not calculations: the budget that predicted T=12 would fit was wrong.

**A 1s 4K run then COMPLETED in 500s.** T=7 is under the ceiling, so `plan_windows`
short-circuits to `[(0,7)]` — one window, no crossfade, the node a pass-through. Fabio:
"it's okay, but it doesn't look 4K". **With the node removed from the equation entirely,
4K still underdelivered**, which exonerates the windowing for that complaint. (Superseded
as a verdict on the ROUTE by the step-count result below — the latent was undercooked.)

### TIME is linear in tokens; MEMORY is not (2026-09-05)

| run | latent | T | tokens | s/it |
|---|---|---|---|---|
| 2K | 160x92 | 27 | 397,440 | 193.50, 196.16 |
| 4K | 240x136 | 12 | 391,680 | 199.91, 194.91 |

T differs by more than 2x; per-step time is equal to within noise. **Per-step cost tracks
TOTAL TOKENS, not T** — splitting T buys no superlinear discount, and the doc's "2x pixels
-> 3.3x time" does not describe this regime. The SAME two runs falsify a token-based
MEMORY model (equal tokens, one passed and one OOM'd). Time is predictable, memory is not.
Do not reuse one model for the other.

**So the cost of windowing is exactly the redundancy ratio**, `sum(window sizes) / T`, and
it is knowable BEFORE sampling because `plan_windows` already returns the spans:

| setting | plan | sampled | tax |
|---|---|---|---|
| 2K overlap 26 | `[(0,27),(10,37)]` | 54 | **1.46x** |
| 2K overlap 0 | `[(0,22),(15,37)]` | 44 | 1.19x |
| 4K overlap 9 | 6 x T=12 | 72 | **1.95x** |

**Over half the 2K tax buys SEAM COVER, not coverage** (1.19x -> 1.46x is the fade width
alone). Third independent argument for the per-step rewrite: it would run overlap-0
geometry with no seam, at 1.19x.

### AUTO IS A MEASURED FLOOR PLUS A TOGGLE, NOT A FORMULA — Fabio's call, 2026-09-05

Modelled on tile decoding. **Do not compute a ceiling** — this session tried twice and was
wrong twice. Measure once, store it, toggle it:

- Windowing is a LOW-VRAM option, ON by default at the values measured on the 16GB 4060 Ti,
  OFF when the card has room for one pass. Floor the defaults at the lowest VRAM tier
  supported (12GB if that becomes the floor).
- **Three states, not a toggle.** OFF / ON at measured defaults / **ON FORCED at 4K on any
  card** — a 5090 cannot single-pass 4K either (37 x 32,640 tokens implies ~16.8GiB in one
  MLP allocation against ~20GB of headroom on 32GB once weights are staged).
- The retry ladder (catch OOM -> flush cache -> retry same window -> step down the legal
  ladder) is the FALLBACK for unmeasured cards, not the primary mechanism. Worth having
  regardless: windows 1 and 2 passed and window 3 OOM'd on the 4K run, which is
  fragmentation, not a ceiling, and a flush-and-retry might have saved that run.
- A RunPod 5090 is for FILLING THE SHIPPED TABLE, not for calibrating a formula. A probe
  only needs the first `apply_model` to survive, not a finished clip.
- Product framing, Fabio: users already expect higher resolution and longer video to need a
  stronger card, and novices hit the existing toast.

**BLOCKER FOR ALL OF IT, and it lands in the pending wiring:** the app matches nodes by
`_meta.title` and only writes to `Input_<Name>` (MPI-116, `docs/workflow-authoring/
injection.md`). **Node 602 in `minimax_h3_r2va_template.json` is UNTITLED.** Wire the
windowed sampler in without a title and the app can never set `window_frames` — silently,
because a title matching no node is skipped without error. **Title it `Input_Window` in the
same pass as the wiring.**

### THE REFINE WAS STARVED, NOT BROKEN — the step-count result (2026-09-05)

**This is the session's biggest product finding and it belongs to the H3 docs, not to this
card.** Fabio swept stage-1 steps at 1344x768: three native runs at 8 / 10 / 12 steps, plus
one two-stage upscaled run at matched output resolution.

**The upscaled run beat native 12-step, and beat native 8-step by a lot.** Root cause: the
latent reaching the upscaler did not carry enough detail. More stage-1 steps fixed it.
Reported clean on the hard cases — water, hands, and the "excessive AI-looking skin" that
the refine pass removes.

Consequences, none of them small:

- **The two-stage is no longer a cheap approximation of native. At matched output size it
  BEATS native.** This reverses the direction the session was heading ("maybe upscale only
  at 2K/4K, native below").
- **An 8-step distill is not capped at 8 steps.** Fabio: 4-step LoRAs commonly run at 6-8
  and 8-step at 10-12, and this project already added turbo steps to the slow path for
  detail. An earlier note in this session arguing against raising the step count was wrong.
- **MPI-477's "latent upscaling disproven" verdict does not reach this result.** That card
  tested INTERPOLATED upscale (`nearest-exact` / `bicubic` / x1.9 -> hard horizontal
  banding) on UNDERCOOKED latents. Both variables have changed: a LEARNED upscaler
  (`MinimaxH3LatentUpscaler3D`, its own weights) and a well-cooked latent.
- **And it argues against MPI-477's REMAINING route.** Fabio's reading is that the cleanup
  works BECAUSE it happens in latent space and would not survive a pixel-space round trip.
  MPI-477's whole proposal is decode -> pixel upscale -> VAE-encode -> partial re-denoise.
  Note this on that card before anyone builds the encode node it asks for.

### Low tier, planned (2026-09-05)

NVFP4 text encoder + a 4-step LoRA at 4-6 steps, everything else as the main path, and
**no 2K or 4K tier**. The MPI-698 dep work done this session already supports it: the
nvfp4 entry stays in `DEPS`, the R2 object is NOT deleted, and `assetDeps.js` records it as
the low-VRAM tier candidate.

**State the trade, do not inherit it.** NVFP4 was reverted for entity duplication, and
`docs/models/h3/README.md` records that H3's "clip" is the Qwen3-VL tower which **ingests
the keyframe as well as the prompt**. fl2va i2v depends on that keyframe path; ref2va has
none. So the degradation may cost MORE on fl2va than the ref2va evidence showed. A/B it on
fl2va before shipping the tier.

### Sequence to 1.5, per Fabio

fl2va tests (tomorrow) -> finish the low tier -> only then cut 1.5.

**THE ONE THING LEFT BEFORE THE PUSH.** The video-frame widgets and the info
output have NEVER executed in ComfyUI -- every clean run used the old
latent-frame widgets. One 2K run with `window_frames 90 / overlap_frames 26 /
frame_grid 5` (plans `[(0,27),(10,37)]`, the spans already proven clean at both
2K and low-res) verifies the new surface and 2K together. Then: push the node
repo, bump `dev_configs/node_lock.json`, wire node 602 into both H3 raw
templates and their compiled twins.

Fabio's tutorial will tell ComfyUI users to change `frame_grid` for a non-H3
model, so the widget is now public API -- do not rename it casually.

## The video-frame widgets RAN, and the gate is still open (2026-09-05)

Two 2K runs on the new `window_frames` / `overlap_frames` surface, node deleted and
re-added first:

- **Landscape: clean.** Fabio: "came out good".
- **Portrait: a seam.** First read was clean; on a second look there IS one, **barely
  noticeable**, and **it is NOT established whether it comes from the node or from the
  generation itself.**

So the widget surface is PROVEN to execute and the `info` output is live -- that half of
the gate is closed. What is NOT closed is "no visible seam", which is this card's
`user-ux` success criterion. **STILL NOT PUSHED, STILL NOT PINNED.**

**Attribute it before fixing it, and it costs no render.** The node can only produce an
artefact inside the crossfade span, and the `info` output prints that span. Read the
seam's frame number off the clip and compare the two numbers:

- Seam INSIDE the printed fade span -> the node owns it; fade width is the lever.
- Seam OUTSIDE it -> H3 generated it, windowing is exonerated, and no node change helps.

**If it IS the node, more fade is the wrong reflex.** At T=37 the next stop above the
current setting is `overlap_frames` 60+, which buys a 73f fade at the cost of a THIRD
pass -- and per this card's own finding, width only HIDES the disagreement. A seam that
survives a 56f fade is the argument FOR the per-step rewrite (MODEL wrapper,
`set_model_unet_function_wrapper`, AnimateDiff context-window shape), which removes the
disagreement instead of blending over it. Still open, still Fabio's call.

**Landscape clean + portrait seamed is a STRONG clue, and stronger than first written.**
An earlier draft of this section said aspect changes the per-window token load. It does
not: 2560x1472 and 1472x2560 are latent 160x92 and 92x160, and 160*92 == 92*160 ==
14,720. Both are T=37, both plan `[(0,27),(10,37)]`, both get a 17-latent fade, both sit
at exactly 100.0% of the measured budget. **The node did bit-for-bit the same arithmetic
on the two runs.** Nothing in the windowing can distinguish them, so a windowing bug
cannot be selective between them. The difference is the content. Still read the frame
number to confirm, but the prior is now heavily on the generation.

**AND THE ENCODER WAS SUSPECT ON THAT EXACT DAY.** MPI-698 put the nvfp4_awq text encoder
in and it was reverted hours later for producing repeated ENTITY DUPLICATION -- a third
leg, a cup from nowhere. Fabio independently reports the 2K refine carrying "deformed
objects". Same signature, same day. **Whatever clip_name the bench graph on `G:\ComfyUi`
has baked is the first thing to read** -- if it is still the nvfp4 build, then the
deformation, and possibly the "seam" too, belong to MPI-698 and not to this node at all.
The repo-side revert does not touch that bench graph.

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
