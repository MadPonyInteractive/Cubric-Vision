# MPI-591 Validation

Phase 1 verified on the bench 2026-08-31, static arm included. Phase 2's node is written,
pushed and NOT yet pinned. Phases 3-6 not started.

## Verified

- **Engine capability, read off the LIVE bench** (`brief.md` first-check #2, not the changelog):
  `GET :8188/object_info` on core 0.34.2 returns `MiniMaxH3AddGuide`,
  `MiniMaxH3ReferenceToVideo`, `EmptyMiniMaxH3LatentAV`, `MiniMaxH3SigmaShift`.
  `MiniMaxH3VideoExtend` / `MiniMaxH3EncodeAV` are ABSENT — fork-only, as researched.
- **`h3.py` self-check green** — `python h3.py` passes, including the new masked-prefix
  arithmetic: the 39/90/141/192 context family, snap-DOWN, the period-5 `tail_span`, and the
  off-grid case that legitimately yields nothing.
- **`MpiH3MaskedPrefix` registers** — `GET :8188/object_info/MpiH3MaskedPrefix` after a bench
  restart returns the node with its three inputs and four outputs.
- **The prefix is genuinely preserved, measured not eyeballed** — the first 39 frames of both
  arm B and arm E come back at **PSNR ~38 dB** (37.94 / 37.96) against the source clip. That is
  VAE-round-trip + h264 level; a regenerated head would be nowhere near it.
- **Arm E renders a continuous extend** — `mpi591/E_prefix_plus_frame0_00001_.mp4`, 73 frames,
  subject / wardrobe / street all continuous across the seam at frame 39.
- **Every run actually executed** — `/history` `status.messages` checked for `execution_cached` on
  each; the sampler and decode nodes were never cache-served.
- **The C/D crash is stock's single-step keyframe limit, not our node** — identical failure with
  and without the mask, at `comfy/ldm/minimax/model.py:654`
  (`shape mismatch [2640, 96] -> [220, 96]`, i.e. 12 latent steps offered where 1 is reserved).

## Verified 2026-08-31 — the static arm, and what it caught

- **Arm G, a genuinely static source, chosen by measurement.** Edge-region frame-diff normalised
  for brightness isolates camera motion from subject motion: `MpiVideo_00001` scores **0.075**
  against 6.2 for the street clips and 8.9 for arm E's own source.
- **On a static shot our seam MATCHES the pack oracle: 1.40x vs 1.40x** (seam frame's luma diff
  over the synthetic side's mean). Head preserved at **PSNR 38.0 dB**, scene continuous across
  the boundary — confirmed by eye on frames 39/50/61/72.
- **On a moving shot ours is 3.85x against the oracle's 1.40x.** The camera drift is measurable,
  and it is a mechanism: a single frame-0 guide carries no camera velocity.
- **The sparkle artifact is `MpiH3MaskedPrefix`'s.** Arm I = arm G minus that one node, same seed
  and guide: clean tail, 1.17x. Not turbo, not resolution — Fabio has never seen it in turbo.
  **This is an open defect in the node, undiagnosed, deliberately not patched.**
- **`MpiH3EncodeAV` written, `python h3.py` self-check green, pushed (`952919f`).**
- **Both H3 nodes REGISTERED on a live restarted bench** — `GET /object_info/MpiH3EncodeAV`
  returns its four required inputs, `/object_info/MpiH3MaskedPrefix` its three.
- **`MpiH3EncodeAV` is bit-identical to the pack's `MiniMaxH3EncodeAVPatched`** — arm J vs arm G2,
  same seed and clip, `PSNR y:inf` over the whole 73 frames; head 38.035 dB either way. The
  shipped graph no longer needs the fork.
- **The bench restart changed nothing** — arm G2 is `PSNR y:inf` against arm G. So the `aimdo`
  VBAR `pin_count` warnings Fabio flagged are noise, and the earlier G-vs-I comparison was not
  confounded by the other session's job sitting between them.
- **The sparkle is the prefix CONTENT, not the mask** — arm K keeps the mask identical and zeroes
  the context latent through core's `LatentMultiply`; clean tail. A noise-scale error is also
  ruled out: it would show in the head, and the head is 38.0 dB.
- **And it is the VIDEO half of that content** — arm L keeps the video prefix and silences the
  audio one (`AudioAdjustVolume` at -100 dB, which preserves the waveform's length so the audio
  latent keeps its step count): sparkle stays, head still 38.03 dB. Audio exonerated.
- **Fabio confirmed both by eye, 2026-08-31**: G has the flashes, I does not. He also noted I
  diverges from the source — correct and expected, since I preserves no head at all; it is a
  control, never a candidate route.
- **`node_lock.json` pin bumped `5e07043` -> `53c0198`**, and the GitHub archive for that sha
  returns 200 (an unpushed sha would 404 for every user).
- **The node's canvas guard fires correctly** — a 704x1216 context against a 352x608 target was
  refused with the right message. `VHS_LoadVideo` does not resize; the source must be re-encoded
  at the target canvas first.

## NOT yet verified — the gate is Fabio's

- The plan's Phase 1 gate is **Fabio judging the seam**, on a static shot AND a moving one. Both
  are now run (E moving, G static) and neither has been looked at by him. Not a pass until he does.
- **Fabio looked at G and M, 2026-08-31: the flashing is STILL THERE in both.** The speck metric
  oversold arm M; a flash metric (regional luma jump) matches his eye and puts M at 3.73 against
  the I/H clean floor of ~0.4 — about 7x, not "nearly clean". The straddle is a contributor, not
  the cause. **The defect is open and the route is not proven.**
- **The pack oracle has NOT been floored for flashes and cannot be from disk** —
  `A_oracle_joined.mp4` is a concat with a literal splice at frame 39, `A_oracle_pack` is the new
  frames only with no seam. Whether the pack's route flashes is unanswered, and it is the question
  that decides whether the masked-prefix route is viable at all.
- **Nothing is fixed yet.** The alignment change was an experiment and was reverted;
  `ComfyUi-MpiNodes` is at `53c0198` with a clean `git status`. The node still ships the
  straddling write.
- **The 39 -> 51 minimum-context contract change is Fabio's call and has not been made.**

## Verified 2026-08-31 — the sparkle diagnosed

- **Candidates 1 and 2 are dead by reading `comfy/ldm/minimax/vae.py`.** `encode_temporal` (l.544)
  chunks into fixed 17-frame clips, freeze-pads a short final clip, and then drops the last
  `token_drop=3` tokens itself — so 39 frames encode to **12** tokens, matching the 12 latent steps
  the C/D crash independently measured. No pad reaches the node, and a 15-token latent would have
  made `plan_context` RAISE (reachable tail spans 42 and 38, never 39) rather than sparkle. The
  encoder is a 3D **causal** CNN chunking on absolute frame 0, so the context's tokens 0-11 are
  identical to a 73-frame encode's — the packing phase agrees token-for-token.
- **Candidate 3 (attention drift) is dead by measurement.** A temporal-impulse metric (pixel
  brighter than BOTH temporal neighbours by 16/255; static texture cancels, which is what makes the
  locked-off arm G the right shot) run over all seven arms, each normalised to its own chunk 1:
  every real-prefix arm (G 2.10x, L 2.02x, E 2.36x, B 2.58x) doubles in decode chunk 2 and spikes
  6-19x on its worst frame; every arm without one is flat (K 1.04x, I 0.98x). **`c3/c1` is
  0.89-0.93 for all four prefix arms** — the excess ends at frame 51. Drift would grow.
- **The cause: a whole-clip prefix can never end on a decode-chunk boundary.** Every valid `17k+5`
  length encodes to `5k+2` tokens, so a 12-token prefix in a 22-token target leaves decode chunk 2
  (frames 34-50) built from tokens 10,11 written by `vae.encode` plus tokens 12,13,14 from the
  sampler. Chunks 0-1 are pure encoder (the 38 dB head), chunk 3+ pure sampler (baseline at 51),
  and only chunk 2 mixes — which is exactly where the artifact is.
- **The guide is exonerated by a controlled pair, not by re-reading.** E and B share source, canvas
  and seed and differ only by the frame-0 guide: 2.36x with, **2.58x without**.
- **The missing static no-guide cell is NOT fillable from disk** — `B_masked_prefix` is 640x352,
  the moving source. Probed, not assumed; a first pass at the metric that hardcoded 352x608
  reshaped B's bytes as the wrong canvas and produced nonsense.
- **Arm M confirms the mechanism on the bench.** 80 s, `execution_cached: []`, graph byte-identical
  to `G_static.json` but for the output name; the only change was the node clamping its written
  video prefix to a whole 5-token chunk (12 -> 10 tokens) taken from the front. **c2/c1 fell 2.10x
  -> 1.16x and the worst frame 7.08x -> 3.00x**, while the preserved head held at **37.81 dB** over
  its 34 frames against G's 38.13 dB over the same 34 — so the tail did not get clean by losing the
  prefix. The experiment edit was reverted; `git status` on `ComfyUi-MpiNodes` is clean at
  `53c0198` and `python h3.py` passes. The bench was restarted afterwards so its loaded modules
  match disk again.
- **A separate latent bug found while building arm M, not triggered by any arm yet.** The node
  writes the context's TAIL at the target's FRONT, which only preserves the positional
  `FRAME_PER_TOKEN` phase when the tail starts on a token index divisible by 5. Arm G satisfied
  that by accident (`steps` equalled the whole token count, offset 0). `plan_context` enforces no
  such constraint, so a longer source can legally pick a tail starting at token 2 or 7 and shift
  every token into the wrong slot. Fix with the alignment work: require
  `(total_steps - steps) % 5 == 0`.
- **A first sparkle metric was built and DISCARDED.** Spatial isolated-speck counting scored arm
  G's own preserved head (real, known-clean footage) *above* its generated tail — it was measuring
  scene sharpness, not sparkle, and it ranked arms by how crisp their scene was. Recorded so it is
  not tried again. Scripts: session scratchpad `sparkle.py` (dead), `sparkle2.py`, `chunks2.py`.
- **The pin was bumped with that defect open**, deliberately: no shipped workflow calls either H3
  node until Phase 3, so the pin ships the code without exposing the bug to a user. If Phase 3
  lands before the defect closes, that stops being true.
- The only Cubric-Vision file touched is `dev_configs/node_lock.json`. It is a version-bump
  trigger — `/mpi-version-bump` at release time, not per node change.

## Artifacts

`D:\WORK\Images\Outputs\mpi591\` — `A_oracle_pack` / `A_oracle_joined` (the pack's take),
`B_masked_prefix` (mask alone, the instructive failure), `E_prefix_plus_frame0` (the moving arm),
`G_static_prefix_plus_frame0` (**the static arm — the one to judge**),
`G2_static_clean_bench` (G re-run after the restart, bit-identical),
`J_our_encode` (the same, on our `MpiH3EncodeAV` — bit-identical to G2),
`I_guide_only_no_prefix` (the same shot with the prefix removed: the sparkle's control),
`K_zero_prefix` (mask kept, content zeroed — the arm that exonerates the mask),
`L_silent_audio_prefix` (video prefix kept, audio silenced — the arm that exonerates audio),
`H_control_no_prefix_no_guide` (unanchored, kept only as the reason it is not a usable control),
plus `A_seam.png` / `B_seam.png` / `E_seam.png` / `E_tail.png` / `G_seam.png` / `G_tail.png` /
`H_tail.png` / `I_tail.png`.
Static source: `G:\ComfyUi\ComfyUI\input\mpi591_static39.mp4`, cut from `MpiVideo_00001`.
Graphs and scripts: session scratchpad `h3/` — `build_static.py`, `build_control.py`,
`build_isolate.py`, `seam_metric.py`, plus `submit.py` carried over.

## Phase 1 — GATE PASSED 2026-09-01 (arm F2)

**Fabio's verdict on `F2_joined.mp4`:** *"the soundtrack carried on. That was a bit of a jump, but
I think that's just because the model didn't have enough reference to go about, as it's a short
video... these would work really well in longer references."* Phase 1's gate is "judged by Fabio";
this is the pass, with the residual attributed to a 1.625 s reference rather than the mechanism.

**The route that passed is ARM F2, and it uses none of the masked-prefix machinery.** Stock
`MiniMaxH3ReferenceToVideo` generating the NEW frames only, `MiniMaxH3AddGuide` pinning the
source's last frame at generated frame 0, the source's audio wired to `ref_audio`, and the two
clips joined in PIXEL space — which is what the shipped `flow_ltx_extend.json` already does at its
nodes 43/44/45 (`ImageBatchExtendWithOverlap` / `TrimAudioDuration` / `AudioConcat`).

Measured on the FLASH metric (regional luma — the instrument that matches Fabio's eye; the speck
metric above is discarded) and the seam metric, against the pack oracle on the SAME canvas:

| arm | flash mean | flash worst | seam/tail | audio band cos |
|---|---|---|---|---|
| **F2** | **1.05** | **2.03** | **0.94x** | **0.973** |
| F (no ref_audio) | 1.05 | 1.82 | 0.95x | 0.801 |
| A pack oracle | 1.71 | 6.42 | 1.40x | 0.981 |
| E masked prefix | 5.37 | 18.51 | 3.85x | — |
| G masked prefix (static) | 4.21 | 15.61 | 1.39x | 0.427 |

`seam/tail 0.94x` means the cut frame moves LESS than the tail's own frame-to-frame noise.

**The audio metric is new and it caught what the video metrics could not.** `audio_match.py`: RMS
dBFS from raw PCM plus a 16-band log-spaced spectral profile, cosine against the source. Arm F
scored 1.05/1.82 on video and was still wrong, because nothing measured sound. Per
`~/.claude/memory` `tool_measure_generated_audio`, level comes from raw PCM or `volumedetect` —
`ebur128` reads the silence floor on clips this short.

**API note that cost a lookup:** stock ref2v's `ref_audios` / `ref_videos` / `ref_video_audios` are
`COMFY_AUTOGROW_V3`, and in an API prompt their keys are the **dotted flat path**
(`"ref_audios.ref_audio_0"`), not a nested dict — `_expand_schema_for_dynamic` builds
`expected_id = finalize_prefix(curr_prefix, name)` and looks that up in live inputs
(`comfy_api/latest/_io.py:1195`). The shipped graph does not need this: our own `MpiH3References`
already exposes `ref_image_1..9` / `ref_video_1..3` + `ref_video_audio_1..3` / `ref_audio_1..3` as
flat named slots and drops the empty ones.

Artifacts: `F_stock_pin_last_00001_` / `F_joined` / `F_seam.png` / `F_tail.png`,
`F2_ref_audio_00001_` / `F2_joined` / `F2_seam.png` / `F2_tail.png`. Scripts in this session's
scratchpad: `flash_F.py`, `audio_match.py`, `join_F.py`, `build_F2.py`, `h3/F2_ref_audio.json`,
and `h3/F3_ref_audio.json` — built, UNRUN, the stronger arm (source frames + soundtrack as a
reference video pair) held in reserve if a longer real source still steps at the join.

## Phase 3b — VERIFIED 2026-09-01, both proofs re-earned

`force_rate` on `MpiLoadVideo` (sibling repo), then `Input_Video.force_rate = 24` and a constant
`MpiSaveVideo.fps = 24` in `flow_h3_extend`. Pin bumped `53c0198` -> **`f1ed110`**, archive URL 200.

### Two corrections the plan did not anticipate, both caught before they shipped

**1. `optional`, NOT `required`.** The plan said `required`, after `block_if_empty`, reasoning that
every saved `widgets_values` stays valid. True for the LiteGraph twin, and irrelevant to the file the
app actually dispatches: `execution.py`'s `validate_inputs` (the `required_input_missing` branch)
makes a *required* input absent from an API-format prompt a hard rejection, and **eleven** shipped
workflows call this node without it. `optional` is skipped when absent and falls through to the
Python default; widget order is required-then-optional either way, so `force_rate` still lands at
widget index 2. The pack's own `.claude/commands/update-node.md` step 2 already said "prefer
`optional` for new inputs". Proved rather than argued: all eight other MpiLoadVideo API graphs
re-validate green against the engine that HAS the new node.

**2. `-vf fps=N`, NOT the output `-r N`.** The first commit (`a0754b1`) used `-r`, which is ffmpeg's
CFR conversion — it decides each output frame by rounding a timestamp, and it overshoots. Measured on
the 49-frame 30 fps clip (1.633 s): `-r 24` returns **41** frames, which declared as 24 fps play
1.708 s — 4.6% slow, the exact defect `force_rate` exists to remove, just small enough to pass a
glance. `-vf fps=24` returns **39** (1.625 s). Checked at 12 / 24 / 29.97 / 30 / 48 against both a
24 fps and a 30 fps source: every rate lands within one frame of the source duration. Fixed in
`f1ed110`.

### Proof 1 — the raw round trip

`raw/flow_h3_extend.json` -> `workflow-to-api.mjs` -> the API file, node by node and input by input:

| converted against | result |
|---|---|
| **8188** (has the new node) | **33 nodes, 0 differences** |
| 48188 (shipped, still on the old pin) | 1 difference: `#331 MpiLoadVideo.force_rate '<absent>' != 24` |

The 48188 line is the stale-pin signature and **nothing else**, which is itself the evidence that
`force_rate` is the only delta. The standing rule is "convert against 48188, never the bench", and
48188 is Fabio's LIVE app engine (PID 15684, parent `electron.exe`, `:3000` answering) — restarting
it is his call, not this session's. So the deviation was bounded instead of assumed: `engine_parity.py`
compares both engines' widget **names and order** for every class in this graph and finds exactly one
difference, `MpiLoadVideo.force_rate`. (Two more classes differ only in COMBO option lists —
`MpiLoraModelClip.lora_name`, `UNETLoader.unet_name` — i.e. which weights each install has on disk,
which the converter never reads.) A conversion against 8188 is therefore the conversion 48188 will
make once it is restarted onto the new pin.

**The API twin was edited surgically, not regenerated.** `workflow-to-api` emits nodes in ascending id
order and drops trailing `.0`s, while the committed file came out of the Phase 3 build script in graph
order with `1.0` on the LoRA strengths; regenerating churned 472 lines and threw that ordering away.
The round-trip proof has always compared node-by-node, never byte order.

### Proof 2 — the bench run, on a source that is deliberately NOT 24 fps

Every earlier arm ran on `mpi591_src39.mp4`, which is already 24 fps — `force_rate` is a no-op there
and would have proved nothing. So the run used `mpi591_src30fps.mp4`: same shot, same duration, 49
frames at 30 fps.

`P3b_flow_h3_extend_00001.mp4`, 70 s, `execution_cached: []` (nothing served from cache), same seed
591000591, `Input_Duration` 2 s:

| | 3b (30 fps source) | Phase 3 (24 fps source) | F2 | pack oracle |
|---|---|---|---|---|
| output | **94 frames, 24 fps, 3.9167 s** | 94 frames | — | — |
| seam / tail | **0.22x** | 0.65x | 0.94x | 1.40x |
| flash, generated region | **1.22 mean / 3.14 worst** | 1.23 / 5.05 | 1.05 / 2.03 | 1.71 / 6.42 |
| flash, source (resampled) region | **0.74 mean / 2.19 worst** | — | — | — |
| generated audio alone, band cos | **0.991** | 0.989 | 0.973 | 0.981 |
| generated audio level vs source | **-0.3 dB** | — | -0.4 dB | — |

94 frames out of a 49-frame source is itself the arithmetic: 39 resampled + 56 generated - 1 crossfade.

### Proof 3 — the speed, which is the whole point of 3b

`check_speed_3b.py`, and it asserts rather than prints:

- source 49 @ 30 fps = 1.6333 s; output's source half 39 @ 24 fps = 1.6250 s. **Drift 8.3 ms (0.51%),
  under half a frame.** Had `force_rate` been off, those 49 frames declared 24 fps would run 2.0417 s
  — **25% slow** beside a generated half that is not.
- Frame for frame against ffmpeg's own `fps=24` resample of the source: **PSNR mean 41.1 dB, min 37.0
  dB** (the minimum is f38, the `linear_blend` crossfade frame, as expected). The same frames shifted
  by one score **26.4 dB**, so the half is genuinely aligned and not an off-by-one, a reversal or a
  decimation.

### Everything else that was run

| check | result |
|---|---|
| `verify-workflow.mjs` vs 8188 | ✓ 33 nodes |
| `verify-workflow.mjs` vs 48188 | 1 risk — the stale-pin `force_rate` line, nothing else |
| the 8 other `MpiLoadVideo` API graphs vs 8188 | ✓ all green (this is what `optional` bought) |
| `validate-injection-rules.mjs` | ✓ |
| `inject-params-titles` + `workflow-input-staging-gate` + `flow-model-choice` + `flow-required-media` + `flow-output-filename` | ✓ 52/52 |
| `node-drift` + `comfy-port-lockstep` | ✓ 30/30 |
| `python -m py_compile video.py` | ✓ |

### Open, and it is Fabio's to close

**48188 has not been restarted onto the new pin.** It is spawned by the live app, so this session did
not touch it. Until Fabio restarts the app's engine, `verify-workflow.mjs` against 48188 reports that
one `force_rate` line, and the app cannot run an H3 extend. The re-run belongs in this file when it
happens.

**No self-check lives in `video.py`.** It cannot: the module imports `folder_paths` and
`from .help_funcs import ...`, so `python video.py` never runs, unlike `h3.py`'s. The pack has no test
harness to add one to (`.github/workflows/` holds only `publish_action.yml`). The durable record is the
measured comparison in `_decode_cmd`'s docstring and the commit body; the runnable checks are
`check_speed_3b.py` and the bench run itself.

Artifacts: `D:/WORK/Images/Outputs/mpi591/P3b_flow_h3_extend_00001.mp4`,
`G:/ComfyUi/ComfyUI/input/mpi591_src30fps.mp4` (the 30 fps source, built for this proof). Scripts in
this session's scratchpad: `engine_parity.py`, `verify_raw.py`, `check_3b.py`, `check_speed_3b.py`,
`build_run_3b.py`, `patch_raw_h3.py`, `patch_api_h3.py`.

## Phase 4 — VERIFIED 2026-09-01

The pick selects the GRAPH. Five files:

| file | edit |
|---|---|
| `js/data/modelConstants/universal_workflows.js` | `byModel: { 'minimax-h3-ref2va': 'flow_h3_extend.json' }` on `flowLtxExtend` |
| `js/data/modelRegistry.js` | `getUniversalWorkflow(key, modelIds = null)` — `byModel` hit wins, everything else falls through |
| `js/services/generationService.js` | `flowModelIds` named in the `runCommand` payload |
| `js/services/commandExecutor.js` | `getUniversalWorkflow(payload.operation, payload.flowModelIds)` |
| `js/data/flowsRegistry.js` | `requiredModels: [{ label: 'Model', models: ['ltx-23-balanced', 'minimax-h3-ref2va'] }]` |

**The candidate is ref2va, and finding that out was the substance of this phase.** The card said
`minimax-h3`; that id is the **fl2va** DiT. Phase 1 pivoted to ref2va on disk arithmetic and Phase 3
baked it, so the shipped graph loads `minimax_h3_ref2va_pruned_int8_convrot` plus lightx2v's
ref2v-trained turbo LoRA — neither supplied by `minimax-h3`. The two transformers are the same
architecture, the same quant and within bytes of the same size, so the wrong id gates a 19.53GB
download the graph never loads and then dies `value_not_in_list` at the loader with the picker
looking perfectly correct. `licences.js` maps both ids to the same `MINIMAX_H3` descriptor and
receipts are keyed by LICENCE id, so MPI-666's consent checks read the same either way.

**A fifth file the plan's table missed.** It said `commandExecutor.js` passes
`payload.generationSettings?.flowModelIds`. That property does not exist on the executor's payload:
`runCommand`'s argument is an explicit whitelist assembled in `generationService.js`, which is the
exact hop `loraModelId` was lost at in MPI-504. `flowModelIds` is threaded there, and the executor
reads `payload.flowModelIds`.

**The gate, and it is mutation-checked rather than merely green:**

| check | result |
|---|---|
| `tests/flow-model-choice.test.cjs` | ✓ **23/23**, including the new MPI-591 case |
| `npm test` | ✓ **853/853** |
| `eslint js/ --max-warnings=0` | ✓ clean |
| `node --check` on all five files | ✓ |

The new test asserts resolution (`['minimax-h3-ref2va']` → the H3 file, no ids / `[]` / `null` /
the LTX id → the LTX file, an op with no `byModel` ignores the ids), anchoring (every `byModel`
key is a real slot member; every arm's graph carries the flow's declared `Input_*` fields,
`Input_Positive`, `Input_Video` and an `Output_*`; **every weight an arm's graph loads is supplied
by that arm's model**), and the whitelist hop in both service files.

Both mutations were run and both went red, then were restored and re-confirmed green:

- executor reverted to `getUniversalWorkflow(payload.operation)` → 22 pass / 1 fail.
- the arm pointed back at `minimax-h3` → `flow_h3_extend.json: the minimax-h3 arm loads
  "minimax_h3_ref2va_pruned_int8_convrot.safetensors" (UNETLoader.unet_name), which no dependency
  of that model supplies`.

**Carried forward: the `negative` box still shows on the H3 arm and does nothing there.** H3 takes
no negative conditioning and `flow_h3_extend.json` carries no `Input_Negative`, so the injector
skips the title in silence — the MPI-475 shape. MPI-664 shipped `hiddenWhen`, but its rule is
`{ field, is }` and keys on another FIELD's value, not on the picked model, so it cannot express
this hide. Per the plan's own fallback the field stays visible with a comment naming the
dependency; extending `hiddenWhen` to a model rule is the one-line follow-up.

**Not verified here, and it cannot be:** no H3 extend has run in the APP. That is Phase 5, and it
is blocked on 48188 being restarted onto `f1ed110`.

## Phases 4b + 4c — VERIFIED 2026-09-01, three bench runs

Done in one pass because both edit the same two files. The graph goes **33 → 40 nodes**: nine added
(`#908` `Input_is_Turbo`, `#909` EasyCache, `#911` BasicScheduler simple/25, `#913` KSamplerSelect
res_multistep, `#910`/`#912`/`#914` `MpiIfElse`, `#915` the strength `MpiMath`, `#916`
`ImageResizeKJv2`), two deleted (`#900`/`#901`, the `MpiMath` snap pair).

### Static proofs

| check | result |
|---|---|
| raw → API round trip, node by node | **0 differences** |
| `verify-workflow.mjs` vs **8188** (bench) | ✓ 40 nodes |
| `verify-workflow.mjs` vs **48188** (shipped) | ✓ 40 nodes — **no longer the stale-pin line; Fabio restarted his app** |
| `validate-injection-rules.mjs` | ✓ |
| `npm test` | **872 / 872** |
| `eslint js/`, `node --check` on all four JS files | clean |

### Proof 1 — 4c, the 32-divisible stitch, on a real 720p source

The defect that produced `ValueError: Source and new images must have the same shape` is gone.
`P4c_C_720p_00001.mp4`, from `mpi591_src720p.mp4` (1280x720):

- **1280x704 out, 94 frames, 24 fps, 3.917 s.** The graph completes instead of raising.
- **The source half is a CROP, not a rescale, and that is measured, not assumed.** Against ffmpeg's
  own `crop=1280:704:0:8` of the source: **PSNR y 44.3 dB**. Against a `scale=1280:704:flags=lanczos`
  of the same source: **27.5 dB**. A 16.8 dB gap — the delivered pixels are the original ones,
  centre-cropped 8px top and bottom, exactly the LTX answer Fabio picked.
- seam/tail **0.104x**, generated audio band cosine **0.9982**.

### Proof 2 — 4b, both arms, same seed and same source

`mpi591_src30fps.mp4`, seed 591000591, `Input_Duration` 2. Both produce 94 frames at 24 fps.

| | turbo (`#908` true) | non-turbo (`#908` false) |
|---|---|---|
| wall clock | **69.5 s** (nothing cached) | **102.3 s** (loaders warm) |
| sampler path | SigmaShift 12/5, beta/6, euler, LoRA 1.0 | EasyCache 0.2/0.15/0.95, simple/**25**, res_multistep, LoRA **0.2** |
| seam / tail | **0.327x** | **0.333x** |
| flash, generated half | 6.35 mean / 8.33 worst | **13.62 mean / 25.61 worst** |
| flash, source half | 5.64 | 5.64 (identical — the resize is deterministic) |
| generated audio band cos | 0.9988 | 0.9989 |
| generated audio level | −0.51 dB | −0.70 dB |

**The turbo arm survives the LoRA/SigmaShift reorder** — 69.5 s against Phase 3b's 70 s, and a seam
ratio in the same band. That was the risk the reorder carried and it did not materialise.

**Non-turbo costs +47% and its generated half carries ~2x the frame-to-frame luma energy.** A luma
diff cannot tell more DETAIL from more FLICKER, so that number is not a verdict — it is the reason
Phase 5 should look at a non-turbo extend with eyes on, not just at a turbo one.

⚠️ **The metric scripts were REBUILT.** The Phase 1–3b originals were in a scratchpad `%TEMP%` has
evicted, so `metrics.py` re-derives seam/tail and the band cosine from the definitions recorded
above. Numbers in this section are comparable **to each other**; against Phase 3b's 0.22x / 0.991
they are a sanity band, not an identity — a re-derived metric is not provably the same instrument.

### The default is Turbo, and one shipped surface disagrees

`fields[Input_is_Turbo].default = true`, per Fabio's speed rule (non-turbo is 25 steps against 6).
**`PromptBoxControls.h3Turbo` defaults OFF** on the H3 *model* surface, documented as *"turbo quality
is below the 25-step path here, so speed is the opt-in and quality is what a user gets without
asking"*. Same model, same LoRA, opposite call — recorded so the two are reconciled deliberately
rather than discovered later.

This also closes the handoff's open question about Fabio's 2026-09-01 non-turbo run: it was the
**r2va model in the app**, not a flow. `minimax_h3_r2va.json` ships `Input_is_Turbo` false and
`h3Turbo` is the control that drives it.

### The guard that had to widen

`tests/inject-params-titles.test.cjs`'s FlowDef check resolved `flow.workflow` alone, so it called
`Input_is_Turbo` a silent no-op — true for the LTX arm, wrong for the flow. It now resolves the
`byModel` candidate set: a field is legitimate when it addresses a node in ANY arm, and the
`hiddenWhen` model rule keeps it off the others. Its baked-default check walks every candidate too.

Three mutants, all killed with real assertion failures (not load errors):

- `!picked.includes(rule.modelNot)` → `picked.includes(...)` — *"the LTX arm keeps its negative and
  loses the Turbo toggle"*.
- the `{ model }` clause made a no-op — *"the H3 arm keeps Turbo and loses the negative"*.
- `Input_is_Turbo` renamed `Input_Not_A_Node` in the FlowDef — *"names no node in
  flow_ltx_extend.json / flow_h3_extend.json"*, so the widened guard still bites.

## Phase 5 — in an isolated app (2026-09-02, part 1: everything that needs no GPU)

Instance: `npm run app:isolated`, port **57506**, profile `%TEMP%\cubric-agent-profile` (fresh —
first run). Fabio's app kept `:3000` throughout and was never driven. Driven with `playwright-cli`.

### The frame never applied `hiddenWhen` to a STEP field — found, fixed, pinned

**The check Phase 4b could not run turned out to fail.** With the H3 arm resolved, step 02
*Describe* still showed the **`Avoid` box**, prefilled with the LTX negative — the exact dead
control the model rule was added to remove, and the carried-forward item 4b recorded as closed.

`Input_is_Turbo` on step 03 was correctly VISIBLE on the same arm. That asymmetry is the whole
diagnosis: `Input_is_Turbo` is declared **flow-level**, `negative` is declared **on a step**.

- `_buildFlowFields` (flow-level) calls `_liveFields.set(f.id, node)` and then
  `_paintFieldConstraints()`.
- `_buildFieldsRow` (a gizmo step's fields) did **neither**.
- `_paintFieldConstraints` walks `_allDecls` — which deliberately includes step fields — but does
  `const wrap = _liveFields.get(f.id); if (!wrap) return;`. A node that was never registered is
  skipped **in silence**.

So every `hiddenWhen` on a step field has always been a no-op. Nothing caught it because every
other shipped clause is flow-level: the only two others are `Input_is_Turbo`
(`{ modelNot }`) and Music Maker's `Input_Style_Custom` (`{ field, isNot }`), both in a
flow-level `fields:` array. `negative` is the first step-level one ever shipped.

Both existing tests were green and both were right about their own half — `hiddenFieldIds` is a
pure function tested on a flat array, and the FlowDef test asserts the DECLARATION (it even
reaches through `flow.steps.flatMap(s => s.fields)` to find it). Neither renders anything. The
gap was the wiring between them.

**Fix** (`MpiBaseFlow.js`, `_buildFieldsRow`): register each node in `_liveFields` and call
`_paintFieldConstraints()` once the row is built — what `_buildFlowFields` already did. Two lines.

**Verified in the app**, not inferred: with the H3 arm resolved, step 02 now reads
`What happens next` → `hidden:false, offsetHeight:144` and `Avoid` → **`hidden:true,
offsetHeight:0`**. Step 03 still shows `Seconds to add` and `Turbo` (h=34), so the flow-level path
is untouched.

**`tests/desktop/flow-step-field-hidden.spec.js`** pins it. Two mutants, both killed on real
assertion failures:

- drop `_liveFields.set` → `expect(result.onPicked.ruled).toEqual({ hidden: true, h: 0 })` fails.
- drop `_paintFieldConstraints()` → the same assertion fails. **Both halves are load-bearing.**

A THIRD mutant survived first and changed the spec: the fixture originally used
`kind: 'fields'`, which is routed to `_buildFlowFields` — it passed with the fix fully reverted.
The fixture is now `kind: 'preview'` with a role, mirroring Extend Video. That distinction is
recorded in the spec's header so the next author does not re-weaken it.

Suites: `npm test` **878/878**, `tests/desktop/flow-*.spec.js` **13/13** (including
*"a blankOnly field is disabled with media and live without"* — the disable path shares the
painter and was the regression risk), `eslint js/` clean.

### MPI-666's five licence checks (message `71214c6e`)

| # | check | result |
|---|---|---|
| 1 | tile reads LICENCE REQUIRED not GET MODELS | **not reachable on this machine** — see below |
| 2 | drawer footer reads REVIEW LICENCE not VERIFY LICENCE | **not reachable** — same reason |
| 3 | drawer licence block carries the three links | **PASS** — "MiniMax H3 Community License Agreement", "Powered by MiniMax H3", *Read the licence* / *Request authorization* / *Report misuse on our Discord* |
| 4 | step 0 shows the attribution inside a project | **PASS** — the same block, same three links, on step 01 of the flow frame |
| 5 | re-opening does not re-fire the gate but keeps the attribution | **PASS** — no gate fired on any open (H3 is installed, so no install runs), attribution present every time |

**Why 1 and 2 cannot run here, and it is not a defect.** `_badgeHtml` returns the licence chip
only when the flow is UNAVAILABLE; an available flow reads "Ready" and the licence branch is never
evaluated. Extend Video is available because `flowModelIds` resolves its slot to
`minimax-h3-ref2va`, which is installed. Reaching "Licence required" needs the RESOLVED candidate
to be both gated and missing — i.e. H3 not installed. MPI-666's note says "clear the receipt or
use an isolated profile", but the receipt is not the binding constraint: the weights are, and they
live on the shared models root, not in the profile.

Verified the wording logic instead through `tests/flow-licence-surface.test.cjs` — **6/6**,
including *"a territory bar is an errand too — H3 must not read as ungated"*, which is exactly the
`verify || territory` widening checks 1 and 2 are about.

**One thing checks 1–2 DID surface:** picking LTX (uninstalled) in the drawer flips the flow to
unavailable, and the drawer follows immediately — Required models reads "LTX 2.3 · Install", the
footer becomes **"Install models"** (the correct third wording: ungated, so not "Review licence"),
and the H3 licence block disappears. The TILE's chip stays "Ready" until the library is reopened,
when it correctly reads "Get models". Cosmetic and low severity — the drawer is the surface under
the cursor — but recorded rather than dropped.

### The pick is session-only, and that reads as intended

- Pick LTX → close the library → reopen: the pick HELD (chip "Get models"). Session state works.
- Reload the app → reopen: the pick is GONE, back to H3 ("Ready"). `setFlowModel` writes a session
  Map and nothing persists it. Confirmed as designed, not as a bug.

### LTX 2.3 IS NO LONGER INSTALLED — the LTX arm cannot be run here

`G:/CubricModels/diffusion_models/` holds `minimax_h3_ref2va_pruned_int8_convrot.safetensors` and,
new today (2026-09-02 11:08), `minimax_h3_fl2va_pruned_int8_convrot.safetensors` — and **no LTX
transformer at all**. Only `loras/ltx-2.3/` survives. The plan's § Disk explicitly said not to
uninstall LTX; it is gone regardless, and getting it back is a ~20GB download.

Consequences, none of which block the H3 gate:

- Phase 5's "pick LTX and run: unchanged" is **not runnable** until LTX is reinstalled.
- The in-flow model dropdown does not render (it needs >1 INSTALLED candidate), so the arm can only
  be switched from the Library drawer.
- The slot resolves to H3 by default, which is why the drawer opened on "MiniMax H3 Reference".
- Field visibility on the LTX arm is still pinned by the desktop spec and the unit test, which stub
  the installed set and need no weights.

### Still open in Phase 5

- The two real extends, turbo and non-turbo — Fabio's gate, needs the GPU.
- Reuse Prompt on an H3 extend coming back on H3 — needs a completed generation first.
- The isolated instance carries `needsRestart: true` from its own boot repair, so it must be
  rebuilt before dispatching: `routes/comfy.js:405` delegates a restart by writing
  `.engine-restart-request.json` into the shared engine root, and the OWNER — Fabio's app —
  performs it. A fresh boot sees no drift now and will not re-arm the flag.

### The boot repair moved a node folder in the SHARED engine

First boot logged `node drift: ComfyUI-MpiNodes installed=30b8ed1f pinned=ccc25d12`, wiped the
folder and re-extracted the pin. Not destructive — `30b8ed1` is an ancestor of `ccc25d1` (the pin
`0448b730` landed today), so it moved FORWARD to what the repo already declares, and it is what
Fabio's own app does at its next boot. One small GitHub zip, no weights. Reported at the time;
Fabio restarted the engine, so disk and memory agree again.

**The lesson for the next agent:** `app:isolated` with no `CUBRIC_ENGINE_ROOT` resolves
`.engine-config.json` → the SAME engine the user's app is running, and the boot repair will act on
it. `~/.claude/memory/tool_sandbox_isolated_app_seed_uw_deps.md` warns against pointing at the real
engine root deliberately; it does not say that the DEFAULT is the real engine root.


## Phase 5 part 2 — the real extends ran, and the GATE FAILED (2026-09-03)

Isolated app rebuilt on **:64964**, fresh boot, no drift repair, `needsRestart` false throughout
and no `.engine-restart-request.json` written — the handoff's warning was heeded and the shared
engine was never asked to restart. Project `MPI-591 Phase 5`, source `mpi591_src720p.mp4`
(1280x720, 24 fps, 39 frames, 1.625 s). Both runs dispatched through `/connector/generate`.

**A trap found on the way in, worth one line:** `POST /comfy/needs-restart` is a **SETTER whose
body defaults to `true`** (`routes/comfy.js:652`, `req.body.value ?? true`). A bare `POST {}` sent
to "query" the flag ARMS it. Cleared with `{"value": false}` and confirmed against `/comfy/status`.
Read it from `/comfy/status`, never by POSTing the setter.

### Both arms ran and both delivered

| | turbo `flowExtendVideo_001` | non-turbo `flowExtendVideo_002` |
|---|---|---|
| dimensions | 1280x704 | 1280x704 |
| frames / fps / duration | 128 @ 24 fps, 5.334 s | identical |
| wall clock | **213.5 s** | **543.5 s** |
| source-half luma energy | 4.81 | 4.80 |
| join diff | 1.18 (**0.24x** the source-half mean) | 1.39 (**0.29x**) |
| generated-half mean / worst | 10.63 / 13.94 | 4.67 / 6.49 |

`flowModelIds: ['minimax-h3-ref2va']` is on both sidecars, so the MPI-620 hook Reuse Prompt needs
is present. `injectionParams` carried `Input_is_Turbo` correctly on each.

### TWO 4b CARRY-FORWARDS ARE NOW WRONG, and both were measurement artefacts

**1. "Non-turbo carries ~2x turbo's frame-to-frame luma energy" does not survive contact with a
real resolution — it INVERTS.** Here turbo measured 2.3x non-turbo. The frames say why and it is
not quality: turbo invented a hard camera move (swung to a side profile, subject filling frame),
non-turbo held the shot and kept walking toward the lens. The metric tracks **how much the
continuation moves**, nothing else. The flicker-vs-detail question 4b carried forward is retired:
neither arm's energy figure is a quality signal, in either direction.

**2. "Non-turbo costs +47%" does not generalise either.** It cost **+154%** here. At 4b's
640x352 the fixed overhead (load, encode, VAE) dominated and hid the sampler ratio; at 1280x704 the
25-vs-6 step count dominates, so the cost approaches the step ratio. Quote +47% only for the arm
and resolution it was measured on.

### FABIO'S VERDICT — the gate FAILS, and on something neither metric could see

No flicker and no artefacts on either arm; that half is clean. What fails is **continuity**:

> "the change between the previous clip and the new clip is pretty obvious. It almost looks like
> this was done with a start frame from the last frame of the previous one, which kind of raises
> the suspicion that the model is not seeing enough of the previous video." … "The non-turbo kinda
> repeated the track in the continuation … In the turbo one, it kept repeating it like crazy."

He also set the bar with the sibling: **"the LTX tests that I've done were seamless. I couldn't
even tell when one stopped and when the other started. This I can always tell."**

**The suspicion is exactly right, and it is the shipped architecture, not a tuning miss.** Read off
`comfy_workflows/flow_h3_extend.json`:

- `#330 MpiH3References` receives `prompt`, `ref_audio_1` and the size/length — and **no
  `ref_image_*` and no `ref_video_*` at all**.
- The only picture the model gets is `#903 MiniMaxH3AddGuide` pinning `#902 Last Frame`
  (`GetImageRangeFromBatch`, `start_index: -1`, `num_frames: 1`) at `frame_idx 0`.

So the H3 arm is **literally image-to-video off the last frame**. Nothing carries the camera's
motion, so the camera is re-invented on every run — which is why BOTH arms did it, and why the two
did it differently. And the audio has the same root cause: the source track goes into the
**standalone** `ref_audio_1` slot, whose own tooltip reads *"Standalone reference audio"* — i.e.
"make audio like this", not "continue after this" — and then `#907 AudioConcat` glues source and
generated end to end. That is the re-sung, looping music.

### What LTX actually does, measured — this is the spec for the fix

`flow_ltx_extend.json`, the arm Fabio calls seamless. Four mechanisms, and the H3 graph has none:

| node | behaviour |
|---|---|
| `#23 MpiMath` | `floor((a-1)/8)*8+1` on the source FRAME COUNT — snaps to LTX's 8n+1 latent grid |
| `#24 MpiClamp Ref_Frames` | **min 1, max 73** → 73 @ 24 fps = **3.042 s**. `min 1` is why a short clip is never padded |
| `#29 GetImageRangeFromBatch` | `start_index: -1` — the **last N frames**, taken off the CROPPED `#28`, not the raw loader |
| `#31 TrimAudioDuration` | start `duration − ref_seconds`, length `ref_seconds` — **the matching audio tail** |
| `#33 LTXVAudioVideoMask` | masks BOTH streams: `video_start_time`/`video_end_time` and `audio_start_time`/`audio_end_time`. The reference window is KNOWN, the extension is generated |
| `#44 TrimAudioDuration "New Audio"` | **discards the regenerated reference audio**, keeps only the new tail; `#45` concats it onto the ORIGINAL track — which is why the music does not restart |
| `#43 ImageBatchExtendWithOverlap` | `overlap = ref_frames`, `linear_blend`, `overlap_side: source` — **crossfades across the whole 3 s** back into the original. Never a hard cut |

So the answer to "how much does LTX look back" is **3.042 s, capped, with the audio tail pinned to
the same window** — and the reference is regenerated then thrown away, not merely conditioned on.

### Decisions taken (Fabio, 2026-09-03)

- **Match LTX: a 3-second cap, and take everything when the source is shorter.** No invented floor
  — "we can't invent another second or another four seconds to get to a five-second floor".
  `MpiH3References`' tooltip says "2-15 s", but that is a training guideline, not a gate, and our
  node enforces nothing (`collect_refs` only drops blank slots).
- **Pair the audio to the video** (`ref_video_audio_1`) rather than leaving it standalone.
- **The prompt must describe the CONTINUATION, not the source.** This session's prompt re-described
  it ("she keeps walking toward the camera"), which with her already at the lens leaves the model
  no move except to re-invent the camera. Fabio's framing: "she stops and says something to the
  camera". Recorded as a real authoring rule, not a one-off.
- **Multi-reference extends are DEFERRED** — introducing a new character mid-extend via
  `ref_image_1..9` is the obvious next capability, but only once the plain extend is proven.
- The MiniMax latent upscaler seen in a third-party workflow is noted and **out of scope here**.

### The node inventory says we already own the fix — TWO routes, cheapest first

Probed live off the bench `/object_info` (8188), so this is what is installed, not what is
documented:

- `MpiH3References` exposes `ref_video_1..3` **and** `ref_video_audio_1..3` as flat slots. The
  shipped graph simply never wired them. → **Route A**, a wiring change.
- `MpiH3EncodeAV` / `MpiH3DecodeAV` — OUR pair, and they have grown real masking since Phase 1:
  `mask`/`mask_start`/`mask_end`, `audio_start`/`audio_end`/`audio_ranges`, `mask_mode`
  (`per-frame` | `as sampled`), `audio_mode` (`replace` | `mix`), `audio_crossfade`, `audio_gain`.
  That is structurally LTX's mechanism — encode the source AV, mask what to regenerate, composite
  back. → **Route B**, the escalation. (Unreleased in MpiNodes; commits `58e9879`, `931b634`,
  `e64c516`, `ec82d9a`, currently bench-only for video inpainting.)
- `MpiAudioRange` / `MpiAudioSplice` — frame-indexed audio cut and write-back, negatives counting
  from the end. `MpiAudioRange` is an exact fit for "the audio tail matching the video tail".
- `MiniMaxH3VideoExtendPatched` — the kat3ri fork's own extend node, taking `context_latent` +
  `context_frames` ("trailing latent frames carried over as context"). **Not shippable** (the pack
  monkey-patches core at import, and was rejected as a dependency in
  `research/minimax-h3-extend-nodepack.md`) but it is a legitimate ORACLE for Route B's shape.

Route A is attempted first: it is the arm this card already held in reserve, it is a wiring change
rather than latent surgery, and it does not go near the sparkle defect that killed the
masked-prefix route in Phase 1.


## Phase 5b, first bench pair — ROUTE A DID NOT WORK (2026-09-03)

Two arms on the bench (8188), built from the SHIPPED graph so the result transfers directly.
Same seed (`591000591`), same `Input_Duration` 4, turbo on both, same prompt. The reference window
is the ONLY variable. Source `mpi591_src720p.mp4` (39 frames, 1.625 s).

- `F4a_control` — shipped wiring: one pinned frame + standalone `ref_audio_1`. **210.3 s**
- `F4b_refwindow` — `ref_video_1` + paired `ref_video_audio_1` off `MpiClamp(1,72)` →
  `GetImageRangeFromBatch(start -1)` on the CROPPED `#916`, `MpiAudioRange` for the audio tail,
  `ref_audio_1` dropped. **346.6 s (+65%)**

Both validated and ran first time; the wiring itself is correct.

### The prompt was a real and separable cause — and this half DID work

**Both** arms held the camera: she slows, stops, looks into the lens, camera steady. Neither
re-invented the move. The only change from the app runs is that the prompt describes the
CONTINUATION instead of re-describing the source. So the camera re-invention Fabio saw has two
causes, and this is one of them, fixable in words. Recorded as an authoring rule.

### The seam: Route A made it WORSE, on two independent instruments

| | control (one frame) | refwindow (3 s window) |
|---|---|---|
| within-file join diff (`tblend` YAVG) | **1.23** = 0.26x the source-half mean | **7.27** = **1.51x** |
| PSNR vs the source crop, frame after the join | 41.85 → 38.78 → 30.31 | 40.95 → **26.23** → 23.49 |

Both agree: the refwindow arm leaves the pinned frame **one frame earlier and far harder**. It did
not soften the join, it sharpened it.

**Two measurement notes, so these numbers are not over-read.** (1) PSNR beyond the source's 39
frames compares against the source's LAST frame held, because ffmpeg's framesync holds the shorter
input — so the tail of that curve measures how fast the continuation moves away from the final
frame, not seam quality. Only the frames either side of the join are seam evidence. (2) A PSNR
comparison BETWEEN the two arms is useless: they diverge at frame 10 at ~51 dB, which is h.264
rate allocation, not content. Both files must be compared to a third fixed reference instead.

### The audio: also not fixed, and slightly worse

`audio_repeat.py` — normalised peak cross-correlation of the GENERATED half against the source
track. The instrument is validated by the source half of every clip scoring **peak 0.998 /
band-cos 0.9998** against the original.

| clip | generated-half peak vs source | reading |
|---|---|---|
| `flowExtendVideo_001` (today's app turbo run) | **0.801** | Fabio's ear was right — it is replaying the source track |
| `F4a_control` | **0.384** | much less repetition |
| `F4b_refwindow` | **0.493** | pairing the audio to the video made it MORE repetitive, not less |

Note the app→bench drop (0.801 → 0.384) is NOT attributable to the wiring: prompt, seed and arm all
changed between them. It is a hint that the prompt drives this too, not a proven cause.

### Why Route A probably cannot work, structurally

Reference conditioning and latent masking are not the same instruction. `ref_video_1` says *"make
something like this clip"*; it never says *"these exact frames immediately precede yours"*. LTX is
seamless because it does the second thing — `LTXVAudioVideoMask` writes the source into the latent
as KNOWN and generates only the masked region, then discards its regenerated copy of the reference
and crossfades the original back over it. That is a different mechanism, not a stronger version of
the same one.

### THE ONE CONFOUND, and it must be cleared before Route A is buried

**The reference window fed here was 1.625 s — the whole source — and `MpiH3References`' own tooltip
says "Reference video frames at 24 fps (2-15 s)".** So this run tested Route A BELOW the model's
documented input range. Our node enforces no floor (`collect_refs` only drops blank slots), so it
ran anyway and produced a result that may simply be out of range.

Next test, cheap and decisive: re-run the pair on a source longer than 3 s so the window is a full
3 s and inside the stated range. `Projects/cowboys/Media/ref2v_ms_004.mp4` (5.167 s, 864x480, has
audio) is a fit and is H3-native content. Only if Route A still fails there is it dead.

**Route B remains the escalation** — `MpiH3EncodeAV` / `MpiH3DecodeAV` with a mask over the
extension region, which is LTX's actual mechanism and which we own. Note it is NOT the Phase 1
sparkle route: that defect is on `MpiH3MaskedPrefix`, a different node.


## Phase 5b, second and third bench pairs — "MORE OF THE PREVIOUS VIDEO" DOES NOT HELP (2026-09-03)

Four arms, one source (`Projects/cowboys/Media/ref2v_ms_004.mp4`, 124 frames / 5.167 s / 864x480,
32-divisible so no crop), one seed (`591000591`), one continuation-shaped prompt, turbo throughout,
and the SHIPPED downstream (decode, `#904` pixel stitch, `#907 AudioConcat`) on every arm. So the
only variable across all four is **how much of the source the model is given, and by what
mechanism**.

| arm | mechanism | context given | join diff | vs source-half mean | wall clock |
|---|---|---|---|---|---|
| **F5a control** | shipped: ONE pinned frame | 1 frame (0.04 s) | **2.02** | **0.36x** | **110.2 s** |
| F5b refwindow | `ref_video_1` + paired audio | 3.00 s | 2.07 | 0.37x | 180.4 s (+64%) |
| F6 ctx12 | the pack's `context_latent` | 1.75 s | 6.86 | 1.20x | 135.3 s |
| F6 ctx21 | the pack's `context_latent` | 3.00 s | **7.98** | **1.39x** | 210.4 s |

**The shipped one-frame pin has the tightest join of the four, by 3-4x.** Every attempt to give the
model more of the previous video either changed nothing (Route A) or made the join measurably
worse (the pack), and in both mechanisms scaling the context UP made it worse, not better.

### Route A is now properly dead — and the first pair's verdict was wrong, not just noisy

Phase 5b's first pair fed a 1.625 s window, below `MpiH3References`' documented 2 s floor, and
measured a catastrophic 1.51x join. On an in-range 3.00 s window that collapses to **0.37x against
the control's 0.36x** — identical. So the earlier "Route A makes the seam worse" reading was an
out-of-range artefact and is retracted. The correct verdict is duller and firmer: **Route A changes
nothing at the join and costs +64%.** PSNR across the join agrees (38.75/33.88/26.57 control vs
37.56/33.03/25.91 refwindow) and the frames show no quality difference.

### The pack oracle, run for the first time off an ENCODED FILE

`MpiH3EncodeAV(source) -> context_latent -> MiniMaxH3VideoExtendPatched`. The author's own graph
never does this — his `context_latent` is `GetNode(latent_1)`, his stage-1 SAMPLER output — so this
is the first time the pack's mechanism has been asked to continue a clip that came off disk, which
is Vision's entire case.

**`context_frames` counts LATENT TOKENS, not frames**, and the tokens are not uniform:
`FRAME_PER_TOKEN = (1, 4, 4, 4, 4)` indexed `k % 5` (`comfy/ldm/minimax/model.py:30`). So:

| `context_frames` | pixel frames | seconds | used by |
|---|---|---|---|
| 2 | 8 | 0.33 s | the pack author's default |
| 12 | 42 | 1.75 s | Phase 1's arms — the most this card had ever tried |
| 21 | 72 | **3.00 s** | this run; matches LTX's window exactly |

**F6 ctx21 measures 1.39x, which reproduces Phase 1's arm A "oracle bar" of 1.40x almost exactly.**
That is a strong check that this build is a faithful rebuild of the original oracle, on a different
and longer source. And Phase 1 had already recorded that the shipped route BEATS that oracle
(0.94x vs 1.40x); this reproduces the same ordering independently.

**So the answer to "have we tried the downloaded workflow with more context" is: yes, and now
properly.** Arm A tried it at 1.75 s. This ran it at 3.00 s. The join got WORSE (6.86 -> 7.98), and
both are ~3.5x looser than the one-frame pin. The encode is not obviously the culprit either — the
oracle behaves the same off an encoded file as Phase 1 recorded it behaving natively.

### What this redirects the card toward

The join is not a pixel discontinuity — at 0.36x of ordinary source motion it is tighter than the
footage's own frame-to-frame movement. What Fabio sees is a CONTENT discontinuity: the camera and
the action change direction across the cut. Three things now have evidence behind them:

1. **The prompt is a first-class cause and it is fixable in words.** Both F4 arms held the camera
   once the prompt described the CONTINUATION instead of re-describing the source. The app runs
   that failed had a source-re-describing prompt.
2. **Source length matters more than context mechanism.** On the 5 s source even the ONE-FRAME
   control produced a plausible continuation. On the 1.6 s source nothing did.
3. **None of these routes generates across the seam.** Every H3 arm - ours and the pack's - emits
   only the new frames and joins in pixel space. LTX is seamless because it does the opposite: it
   masks the source into the latent, generates THROUGH the boundary, discards its regenerated copy
   of the reference and crossfades the original back over 3 s (`#43
   ImageBatchExtendWithOverlap`, `overlap = ref_frames`, `linear_blend`). Our `#904` uses
   `overlap: 1` - a single frame.

**Route B is therefore NOT "more context".** It is "generate across the seam and blend the
overlap": `MpiH3EncodeAV` over source+extension with a mask covering only the extension, then
`MpiH3DecodeAV` compositing back through that mask with `feather` - which is the crossfade LTX has
and H3 does not. That is the one mechanism the four arms above have never tested, and it is the one
LTX's seamlessness actually comes from.


## Phase 5c - ROUTE B RUN, AND THE BENCH IS NOT STOCK COMFYUI (2026-09-03)

Route B is what Fabio approved after four arms killed "more context": stop feeding the model more
of the previous clip and instead generate ACROSS the seam, the way LTX does. Built on the bench
(8188) off the SHIPPED graph, same source (`cowboys/Media/ref2v_ms_004.mp4`), same seed
`591000591`, same continuation-shaped prompt, turbo.

### The build, and why every number in it was forced

`MpiH3EncodeAV(source tail + filler)` -> AV latent carrying a nested noise mask over the extension
only -> `SamplerCustomAdvanced` -> `MpiH3DecodeAV` compositing the original pixels back outside the
mask. The composite IS the stitch, so `#902/#903/#904/#907` and both VAE decodes leave the graph.

Three grids have to agree at once, and between them they fix N and S completely:

| constraint | source | consequence |
|---|---|---|
| `images.shape[0] % 17 == 5` | `MpiH3EncodeAV`'s inpaint guard (`h3.py:858`) | N on H3's video grid |
| audio's 40 Hz clock lands on a whole step every 3 frames | `audio_start` snapping | N % 3 == 0 |
| a latent step straddling the split unions into the mask | `FRAME_PER_TOKEN = (1,4,4,4,4)`, 17 frames per 5 steps | S % 17 == 0 |

=> N in {39, 90, 141, 192}, S a multiple of **51**. Built at **N = 141 (5.875 s), S = 51
(2.125 s of latent context), E = 90** - and E = 90 is exactly what `F5a_control` generated
(`MpiH3Length(4)` nearest-snaps 96 to 90), so the generated length is matched and the join index is
known rather than inferred.

The white filler doubles as the mask: the masked region is noised to sigma_max before the first
step, so what sits under it cannot matter, and `ImageToMask` on the same white batch is a 90-frame
all-ones mask for free.

**`feather` is NOT the crossfade the handoff called it.** `MpiH3DecodeAV`'s feather is
`max_pool2d` + `conv2d` over H,W only (`h3.py:986-1010`) - a SPATIAL edge softener. On a full-frame
mask it is a no-op and it can never soften a TEMPORAL seam. A temporal crossfade would need
fractional per-frame mask values. Left at 1 deliberately.

### The result: Route B's join is 15x LOOSER than the shipped one-frame pin

| arm | mechanism | join diff | vs source-half mean | wall clock |
|---|---|---|---|---|
| **F5a control** | shipped: ONE pinned frame | **2.02** | **0.36x** | 110.2 s |
| **F7 Route B** | source inside the sampled latent, mask over the extension | **30.18** | **5.56x** | 210.4 s |
| F8 = F7 with the composite OFF | same sample, decode returned whole | 30.38 | 5.97x | 25.1 s (cached) |

Luma steps `105.4 -> 117.4` in one frame at the seam, and the driver changes clothes across it: a
woman in a blue top and white trousers at frame 50, a man in a black hat at frame 51.

### THE MECHANISM WORKS - the model just ignores it. F8 is the proof.

F7's composite replaces frames 0..50 with the original pixels, so the saved file says nothing about
what the sampler did to that region. F8 re-runs it with `MpiH3DecodeAV`'s mask disconnected, which
returns the decode whole. Because ComfyUI caches node outputs, the sampler did not re-run - F8's
tail is bit-identical to F7's (verified per-frame) and the arm cost 25 s.

**F8's decoded head IS the source** - same woman, same wardrobe, same framing, at frames 0, 25 and
50. So the noise mask reached the sampler, the preserved region survived every step, and it decodes
back to what went in. H3 simply does not take identity from unmasked latent tokens.

Two candidate causes are eliminated with it:

- **the composite is not the seam.** F8 (no composite at all) measures 30.38 against F7's 30.18 -
  the seam is in the SAMPLE, not in the hand-off between original and decoded pixels.
- **the VAE round trip is not the seam.** F8's head (decoded) against F7's head (original) is
  **-0.83 luma** over 51 frames, against a +12 step at the join.

This is the same verdict Phase 1 reached on `MpiH3MaskedPrefix`, reached again through a different
node pair. **The two routes are one mechanism** - source latent in the head, noise mask over the
tail - and the difference the handoff drew between them (different nodes, no sparkle defect) is not
a difference in what the model is asked to do. Route B is dead for the same reason Route A was:
identity in H3 travels through the GUIDE, which is why the one-frame pin keeps winning.

### THE BENCH IS RUNNING PATCHED CORE, AND THAT BLOCKED THE TWO ARMS THAT WOULD HAVE FOLLOWED

`MiniMaxH3AddGuide` anchors a CLIP, not just a frame - core crops `image` batches to 17k+5 and
anchors them from `frame_idx`, a PIXEL index (`comfy_extras/nodes_minimax_h3.py:196-214`). That is
LTX's whole shape reachable through the path H3 actually listens to: generate with the source's
last G frames as the guide, discard the model's regenerated copy (LTX #44), keep only the new tail
(#45), crossfade the original back over the overlap (#43). Two arms were built for it (F10a with
`overlap 1` so the join lands on the same instrument as the control, F10b with a 39-frame
`linear_blend`) and a third, F9, put a one-frame anchor at the seam of Route B's latent.

**All three died inside the sampler, and none of them died because of our graph:**

| probe | result |
|---|---|
| F10a, guide clip 39 frames | `value tensor of shape [4860, 96] cannot be broadcast to indexing result of shape [405, 96]` |
| F11, the CONTROL with only `#902 num_frames` 1 -> 39 | identical failure - so it is not our graph |
| F11 at 22 frames | `[2835, 96]` into `[405, 96]` - the destination is ALWAYS 405 |
| `probe_layout.py`, stock `PackedLayout` called directly on CPU | 1 / 7 / 12 steps -> 405 / 2835 / 4860 rows, all correct |
| F9, one-frame anchor at `frame_idx 51` | `ValueError: only first/last keyframe anchors are supported` |

405 rows is exactly one frame's worth. Stock sizes it right; the runtime does not. The last probe
names the culprit outright - that string is not in ComfyUI at all:

**`custom_nodes/ComfyUI-MiniMax-H3-Extend/patch.py:141`.** The kat3ri pack replaces
`PackedLayout.__init__` and `MiniMaxH3.extra_conds` at import (`patch.py:283-284`), unconditionally
for EVERY graph on the bench - its only skip is "a ComfyUI that already has native
`MiniMaxH3VideoExtend`", and 0.34.2 does not. Its keyframe branch allocates a flat `frame_rows` per
image keyframe with no `vt` term at all (`patch.py:143-149`), and rejects any anchor that is not
frame 0 or the last frame (`patch.py:141`).

So on this bench **an H3 clip guide cannot run and a mid-clip anchor cannot run**, and neither
limitation is real - both are the pack's. The plan already said the pack must never be a
dependency; what was not known is that installing it silently makes the bench a different engine
from the one Vision ships. The clip-guide arms are BLOCKED on the bench, not on the card.

F7/F8 are believed unaffected: they carry no keyframes at all, so the patched keyframe branch never
runs, and the noise mask is handled outside `PackedLayout`. That is reasoning, not a measurement -
it should be confirmed by re-running F7 once the pack is out of the way.


## Phase 5d - THE CLIP GUIDE RUNS, AND THE SEAM METRIC WAS REWARDING THE ARTEFACT (2026-09-03)

`custom_nodes/ComfyUI-MiniMax-H3-Extend` renamed to `.disabled` and the bench restarted by Fabio.
`MiniMaxH3VideoExtendPatched` is gone from `/object_info`; `MiniMaxH3AddGuide` and both `MpiH3*`
nodes are still there. **Both arms that had been impossible then ran first time, unchanged** - so
the `[4860, 96]` into `[405, 96]` failure and "only first/last keyframe anchors are supported" were
the pack's patch and nothing else. ComfyUI-Manager on this build has no reboot endpoint (both
`/api/manager/reboot` and `/manager/reboot` 404), so the restart has to be done by hand.

### The two arms

Same source, seed `591000591`, continuation-shaped prompt, turbo. `#902 num_frames` 1 -> **39**, so
`MiniMaxH3AddGuide` anchors the source's last **1.625 s** as a clip at `frame_idx 0`, with the
matching audio tail on the guide's own `audio` input and `ref_audio_1` dropped. N = 141, of which
39 are the model's re-take of the guide and 102 are new.

- **F10a** - LTX #44/#45 only: the re-take is discarded, only the new tail is concatenated, stitch
  `overlap 1`. 225 frames, hard join at 124. **205.5 s.**
- **F10b** - LTX #43 as well: the re-take is KEPT and `linear_blend` crossfades the original back
  over all 39 frames. 226 frames, fade across 85..123. **5.0 s** - ComfyUI cached the sample, so
  only the stitch re-ran.

**A build bug was caught before the numbers were read, not after.** F10b was first wired with the
TRIMMED tail as `new_images`, which would have blended source 85..123 against generated 39..77 - a
1.6 s time offset at full opacity, with every tensor valid and the file playable. The crossfade arm
has to keep the re-take, because the re-take is what it crossfades against.

### The numbers, and why the ranking they imply is wrong

| arm | join frame diff | vs source-half mean |
|---|---|---|
| F5a control (one-frame pin) | **2.02** | 0.36x |
| F10a (clip guide, hard join) | 7.50 | 1.33x |
| F10b (clip guide + 39-frame crossfade) | 5.94 | 1.06x |

On that table the control wins again. **It does not, and the table is the problem.** Read the
diffs either side of the join instead of the single number:

| arm | diffs 118..126 |
|---|---|
| pure source, frames 0..79 | mean **5.68** |
| F5a control | 6.6, 6.1, 5.6, 4.6, 5.1, **2.0**, 5.2, 5.3, 4.5 |
| F10a | 6.6, 6.1, 5.6, 4.6, 6.7, **7.5**, 5.4, 4.7, 5.4 |
| F10b | 7.5, 6.6, 7.2, 4.7, 4.6, **5.9**, 6.7, 5.4, 4.7 |

The control's join is a **DIP**, not a tight join: 2.0 where its own neighbours run 4.6-6.6 and the
footage's ordinary motion is 5.68. The picture nearly STOPS for one frame and then starts again.
That is not seamlessness - it is precisely the artefact Fabio described, *"it almost looks like this
was done with a start frame from the last frame of the previous one"*. A pinned still is a stall,
and a stall scores near zero on a frame-to-frame difference.

**So `join / source-half mean` never measured smoothness. It measured stillness, and it ranked the
stall first.** The target is not 0; the target is **1.0x** - a join that moves exactly as much as
the footage around it. F10b's whole crossfade region measures min **3.90**, max **7.47**, mean
**5.59** across frames 84..124, against the pure-source **5.68**: statistically indistinguishable
from ordinary motion, with no spike anywhere in it.

**This retro-actively reframes Phase 5b's four-arm table.** Its ranking (control 0.36x best, pack
1.39x worst) mixed two different failures under one number - the control was stalling and the pack
arms were genuinely stepping - and it is why "more context makes it worse" looked so decisive. The
context conclusion still stands on its own evidence (the pack arms visibly step), but the control's
0.36x was never the bar to beat.

### Identity holds, which no previous arm managed

Frames 84 / 95 / 105 / 115 / 124 / 180 of F10b: the same woman, blue top, white trousers, no hat,
consistent framing, through the crossfade and 2.3 s past it. Against F7, where the driver changed
into a man in a black hat in a single frame, and against the app runs where the camera re-invented
itself. The guide clip is the first arm where the model carries the subject across the seam.

Secondary: the guide clip also CALMS the continuation - generated-half motion 4.51 (F10a) and 4.51
(F10b) against the control's 5.37 - and the wall clock is unchanged at 205.5 s against 110.2 s for
a shorter generation.

**Fabio's eyes are the gate and both clips are with him.** The metric can say the join is no longer
a stall and no longer a step; it cannot say the shot reads as one continuous take.


### FABIO'S VERDICT ON F10a / F10b (2026-09-03) - the continuation PASSES, one defect left

*"Their continuation is really good. The woman keeps looking to our right. The sound is good,
flawless."* Both arms pass on continuation, on identity and on AUDIO - the re-sung-music problem
that ran through Phase 5 is gone, and the guide's own `audio` input is what fixed it.

**The one remaining defect: a short COLOUR flicker at the transition, 1-5 frames, worse on F10b.**
Measured, and it is not colour - chroma is flat across the join on both arms (U +0.84 / V -0.2
over 20-frame windows either side). It is LUMA, and the profile names the cause exactly:

| frames | F10a (Y) | F10b (Y) | F10b - F10a |
|---|---|---|---|
| 85 (fade start) | 103.8 | 103.8 | 0.0 |
| 100 | 104.0 | 105.1 | +1.1 |
| 110 | 104.5 | 108.4 | +3.9 |
| 117 | 105.2 | 110.1 | **+4.9** |
| 119..124 | 104.9 -> 105.9 | **105.6, 107.0, 109.2, 108.9, 108.7, 106.6** | swinging |
| 125 (first pure new frame) | 103.4 | 103.6 | - |

**The model's re-take of the guide is exposure-drifted, and `linear_blend` ramps it in.** The
difference between the two arms rises monotonically from 0.0 to +4.9 across the overlap - that is
the crossfade weighting in a re-take that is up to 5 luma brighter than the original it is being
blended with. Then frames 119-124 swing 3-6 luma and drop back to 103.6 at the first pure new
frame. That excursion IS the flicker, it is 6 frames long, and it is confined to the overlap.

Note what that means: **the model's CONTINUATION (frame 125 on, 103.4/103.6) sits at the source's
own level. Only its RE-TAKE of the guide drifts.** So the defect is not a general exposure mismatch
between original and decoded pixels - it is specific to the frames the model was asked to
regenerate, which is exactly the material `linear_blend` mixes.

F10a's version of the same defect is a single **-2.4** step (105.9 at 123 -> 103.5 at 124), and it
has a second cause: the SOURCE is brightening on its own through the overlap (103.8 at 85 to 105.9
at 123) and the continuation does not follow that trend.

### Three leads for the fix, cheapest first

1. **Level-match the re-take before blending.** Per-frame gain (or mean-match over the overlap)
   against the original frames it is being crossfaded with. Image-domain, no re-sample, and it
   attacks the measured cause directly.
2. **`overlap_mode`.** `ImageBatchExtendWithOverlap` also offers `filmic_crossfade` and
   `perceptual_crossfade`; both were untested here and `linear_blend` was chosen only because it is
   what `flow_ltx_extend.json` uses.
3. **Guide length.** 39 frames is the shortest legal clip; 56 or 73 (LTX's 3 s cap) may give the
   model less room to drift, and is the next arm on the list anyway.

Do NOT reach for a wider crossfade: the excursion grows with overlap length, so a longer fade makes
this defect worse, not better.

## Phase 5e - THE FLICKER IS DEAD, AND IT WAS TWO DEFECTS WEARING ONE NAME (2026-09-03)

Eight arms off ONE cached sample. Every arm changes only nodes downstream of `#409`, so ComfyUI
re-ran the stitch alone: **5-10 s each against the 205.5 s sample**, eight arms for one dispatch.

### The instrument first

`flash.py`'s single join number cannot see this defect at all - a smooth +5 luma ramp has small
frame-to-frame differences the whole way up. `luma.py` reads **absolute** `signalstats YAVG` per
frame (no `tblend`) and prints the window around the join, with the motion series alongside so a
"fix" that flattens the exposure by freezing the picture cannot pass unnoticed. It reproduces the
Phase 5d flicker table exactly: F10b span 6.68 / worst 1-frame step 4.23, F10a span 2.57 / 2.41.

### There were TWO defects, not one

1. **The re-take is exposure-drifted** (diagnosed in 5d) - `linear_blend` ramps it in across the
   overlap.
2. **The model's FIRST GENUINELY NEW frame is a one-frame flash.** Generated frame 39 - the first
   one drawn with nothing to copy - comes out at **106.6** against 103.5 for generated 40 onward
   and 104.5 for the source beside it. It sits at output frame 124, entirely OUTSIDE the crossfade
   (`overlap_side: source` blends source 85..123 against generated 0..38), so no `overlap_mode` and
   no level match of the re-take can reach it. This is why fixing (1) alone left a 3.07 step.

### The eight arms

| arm | re-take match | overlap_mode | flash frame | luma span | worst 1-frame step | motion at join |
|---|---|---|---|---|---|---|
| F10a (5d baseline) | - | linear_blend, overlap 1 | kept | 2.57 | 2.41 | 7.50 |
| F10b (5d baseline) | - | linear_blend | kept | 6.68 | **4.23** | 5.94 |
| F12a | reinhard | linear_blend | kept | 3.25 | 3.07 | 6.98 |
| F12b | - | `filmic_crossfade` | kept | 6.95 | 4.33 | 5.95 |
| F12c | - | `perceptual_crossfade` | kept | 6.68 | 4.21 | 5.93 |
| F12g | reinhard | linear_blend | **dropped** | 1.28 | 0.95 | **8.75** |
| F12i | reinhard | linear_blend | 2 dropped | 1.27 | 1.12 | **10.84** |
| **F12k** | **reinhard** | **linear_blend** | **level-matched** | **1.33** | **1.10** | **5.34** |
| F12l | mkl | linear_blend | level-matched | 2.40 | 1.99 | 5.76 |

Source's own baseline over frames 0..79: luma mean **103.71** (drifting +1.58 across the 80),
motion mean **5.69**.

**LEAD 2 IS DEAD, and it is dead on both modes.** `filmic_crossfade` measures 6.95/4.33 - *worse*
than `linear_blend` - and `perceptual_crossfade` measures 6.68/4.21, which is `linear_blend` to two
decimal places. Both only reshape the weighting curve; neither touches the level mismatch being
weighted. `linear_blend` was never the problem and the untested modes were never the fix.

**LEAD 1 WORKS AND COSTS NO REFERENCE NODE.** `#902` is `GetImageRangeFromBatch(start_index -1,
num_frames 39)` over the cropped source, and KJNodes resolves `start_index -1` to "the last
`num_frames`" - so `#902` already IS source frames 85..123, the exact originals the crossfade mixes
the re-take against. `ColorMatch` is per-frame when both batches are the same length. `reinhard`
(mean/std matching - literally the "mean-match over the overlap" the diagnosis called for) flattens
the overlap to 103.66-104.64, tracking the source's own drift. **`mkl` is measurably worse** on
both arms it ran (3-channel transport where only luma was wrong).

**DROPPING THE FLASH FRAME TRADES ONE ARTEFACT FOR ANOTHER, and the metric says so.** Join motion
runs **6.98 -> 8.75 -> 10.84** for 0/1/2 frames dropped: each dropped frame is a 42 ms skip. This
is the Phase 5d lesson in the other direction - a metric that only watched luma would have called
F12g the winner at 0.95.

**F12k keeps the frame and level-matches it against its OWN SUCCESSOR** (generated 40, which
already sits at the source's level), so no outside reference is needed for a frame that has none.
Result: luma span **1.33** with a worst 1-frame step of **1.10** - against the source's own ±0.4
wobble - and join motion **5.34 against the footage's 5.69, or 0.94x**. No stall, no step, no skip.
The excursion is gone from the whole 84..126 window, not pushed out of the measured one.

A/V length is unchanged from F10b (226 frames / 9.4167 s video, 9.417 s audio). **The audio drop
index must NOT follow the picture's** - `fixflash` puts the dropped frame back, so `#942` starts at
`G`, not `G+1`. Nothing fails if this is wrong; the sound just slides by a frame.

### The graph F12k adds (six nodes on top of F10b)

    #409 (141 generated)
      |- #943 range 0..38    the re-take   -> #944 ColorMatch(ref #902, reinhard)  --.
      |- #946 range 39..39   the flash     -> #948 ColorMatch(ref #947, reinhard) --.  |
      |- #947 range 40..40   its successor                                        |  |
      |- #941 range 40..140  the rest      ---------------> #949 ImageBatch(948, 941)  |
                                                                    #945 ImageBatch(944, 949)
                                                                              -> #904 overlap 39

### Not yet done on this arm

- **Fabio's eyes.** The metric can say the excursion is gone; it cannot say the shot reads as one
  take, and that has been this card's real gate all through Phase 5.
- **Guide length 39 -> 56 -> 73 (lead 3) was NOT run.** It costs a fresh 205 s sample and the
  defect it was meant to attack is already fixed at 1.10. Left as a knob, not a pending fix.
- `audio_repeat.py` is still unrun against these arms (carried over from 5d).

## Phase 5f - THE SOUNDTRACK HOLE IS ROOT-CAUSED, AND THE FLICKER IS RE-OPENED (2026-09-03)

Fabio on F12k and F10b: **"Both videos still have a colour flicker, just not as much as before,
and there is also a sound artefact. Sounds like a light switch."**

So Phase 5e's claim was too strong. The metric it passed - frame-MEAN luma, span 1.33 - is real and
reproducible, but a frame mean cannot see a regional or chromatic swing, and the eye can. The
excursion Phase 5e killed was one contributor, not the whole defect.

### The sound artefact: a 17 ms hole, and it is OUR bug, not the model's

Not a click - a **dropout**. The soundtrack falls to -47 dB and on to -64 dB for 555 samples
(17.3 ms) starting exactly where the source ends, then resumes at -30 dB. Identical in F10a, F10b
and F12k, so it has been there since Phase 5d and is not caused by anything 5e changed.

Eliminated one at a time, each by measurement rather than by reading:

| suspect | probe | result |
|---|---|---|
| the model's own audio | **F13_raw** - `#442` fed `#409`/`#404`, no stitch | runs -19..-28 dB straight through its frame 39. **No hole.** |
| `MpiAudioRange`'s slice | **F14_tail** - `#442 audio = #942`, AudioConcat bypassed | starts at -24.4 dB. **Clean.** |
| `AudioConcat` | read `comfy_extras/nodes_audio.py:616-638` | a plain `torch.cat` after rate matching. Inserts nothing. |
| the source file | ffmpeg decode of `ref2v_ms_004.mp4` | 165333 samples, loud (-19.9 dB) to its very last sample |

Then the measurement that named it: cross-correlating the sliced tail against the finished file puts
**`tail[0]` at output sample 165888, not 165333** - 555 samples late, exactly the length of the hole.

**165888 = 162 x 1024 - a whole number of AAC frames.** `MpiLoadVideo._load_audio`
(`video.py:156-189`) decodes the mp4's AAC to WAV and the decoder emits its final padded frame, so
**the loader hands back a soundtrack 555 samples LONGER than the picture it came with, ending in the
encoder's zero padding.** At the end of a clip that is silent and harmless, which is why nothing has
ever caught it. This Flow CONCATENATES onto that tail, so the padding lands in the middle of the
music. The source here is itself an H3 render saved as AAC by `MpiSaveVideo`, so it compounds on
every extend of an extend.

**Fix, in the Flow, with an existing node and no code change:** `#950 MpiAudioRange(audio #906,
fps #331, start 0, end -1)` feeding `#907 audio1`. It counts in FRAMES, so it re-derives
`round(124/24 * 32000) = 165333` and drops the padding with nothing hard-coded. Verified on
**F15a/F15b**: the 4 ms envelope across the join goes from `-19 / -48 / -56 / -60 / -59 dB` to
`-19 / -24 / -27 / -28 / -28 dB`, and the worst sample step within +-30 ms of the join is 0.052,
**below** the file's own 99.99th percentile of 0.081 - so no dropout and no click.

**THE ROOT CAUSE IS STILL IN THE NODE.** `MpiLoadVideo` hands every other caller a picture and a
soundtrack of different lengths, silently. That fix belongs in `ComfyUi-MpiNodes` under
`/mpi-nodes-sync` and means a pin bump, so it is Fabio's call - but any Flow that concatenates onto
a loaded soundtrack has this bug today.

### Measurement gotchas found while doing this

- **The bench arms are 864x480, not 1280x704.** `ref2v_ms_004.mp4` is an 864x480 H3 render, and
  `#916` sizes off the loader. Phase 5 part 2 already found one metric that **inverted** between
  bench resolution and real resolution ("2x luma energy"), so no number in Phase 5b-5f should be
  quoted at app resolution without re-running it there.
- `MpiSaveVideo` truncates the audio to the PICTURE length (`-t vid_dur`), which is why F14's tail
  measured 134667 samples rather than the 136000 `MpiAudioRange` actually returned. The node is
  fine; the probe was reading a truncated copy.
- `select=gte(n\,N)` returned an empty stream from these files; an accurate `-ss` after `-i` does
  not. `flickermap.py` and `sharpness.py` use the latter.

### The flicker: what the three new instruments say, and what they do not

`flickermap.py` (per-frame full-frame U/V + a 4x4 grid of per-cell luma) and `sharpness.py`
(Laplacian variance per frame), both against an untouched stretch of the same source:

| measurement | at/near the join | untouched source baseline |
|---|---|---|
| worst per-cell luma step, frames 112..129 | 4.64 (frame 124) | up to 4.60 |
| frame-mean chroma step dU at frame 124 | **-0.97** | +-0.19 |
| detail (Laplacian variance) frames 84 -> 105 -> 127 | 1.04x -> **0.54x** -> 0.59x | spread 37% frame to frame |

So: **regional luma at the join is inside the source's own range** and does not convict; **chroma
does step at frame 124, about 5x the source's own frame-to-frame chroma variation**, though it is
small in absolute terms; and **detail falls to roughly 0.6x through the overlap and STAYS there
afterwards** - which is the model's continuation simply being softer than the source, not an
oscillation. A crossfade between two different renderings of the same moment does soften the middle
of the fade, and that reads as a breath rather than a flash.

None of these is nailed as "the flicker Fabio sees", and saying otherwise would repeat 5e's mistake.

### The arm that settles it

**F15b joins hard - no crossfade anywhere in the graph** - and carries the same audio fix. F15a is
F12k's picture with the audio fix. Both are with Fabio.

- flicker still present on **F15b** -> the crossfade is exonerated, and the defect is in the model's
  continuation or at the single join frame; chroma at frame 124 becomes the lead.
- flicker gone on **F15b** -> the crossfade causes it, and the fade itself has to change (shorter
  overlap, or none, given a hard join now measures span 2.21 / worst step 1.14).

F15b's luma profile for the record: span 2.21, worst 1-frame step 1.14, join motion 6.79 against the
footage's 5.69.

### FABIO'S VERDICT ON F15 - THE PICTURE CROSSFADE IS CONVICTED (2026-09-03)

*"On F15B, it's barely noticeable, but the audio artefact is still there."* and *"I never mentioned
it, but F-15A, the colour flicker is more apparent. And it also has the audio artefact."*

Two independent findings from one pair, which is what the arm was built to separate:

**1. The 39-frame picture crossfade CAUSES most of the flicker.** F15a (fade) is worse than F15b
(hard join, no crossfade anywhere), and on F15b the flicker drops to "barely noticeable". So the
whole LTX-shaped crossfade - carried over because `flow_ltx_extend.json` uses it - is the wrong
mechanism here, not merely a mechanism that needed level-matching. **The hard join is the base from
here.** Phase 5e's `filmic`/`perceptual` sweep and the level-match work were all inside a fade that
should not be there; the level-match still earns its place (it fixes the flash frame the hard join
also carries), but the 39-frame blend does not.

Measured on F15b for the record: chroma at the join is FLAT (dU -0.08, dV -0.03 at frame 124,
against F12k's fading arm at -0.97), which retires the chroma lead. What is left is a two-frame luma
decline, -1.33 at 123 and -1.02 at 124, totalling -2.35: the source brightens through its last 40
frames (103.8 -> 105.5) and the model's continuation does not follow that trend, so the join steps
down to the continuation's own level. That is the residual "barely noticeable", and it is a
different defect from the one Phase 5e fixed.

**2. The audio artefact is NOT the picture stitch and NOT the AAC hole.** It survives both arms,
and F15b provably has no dropout anywhere in the file (a whole-file scan finds nothing below -12 dB
of its local median except the AAC priming at 0.000-0.025 s, which the source has too). So the
17 ms hole was real and is fixed - and it was not what Fabio was hearing.

What is left is the splice itself. `#907 AudioConcat` butt-joins two different recordings at one
sample with no fade, while the picture faded over 39 frames. **MpiNodes already knows this** -
`MpiAudioSplice`'s own tooltip reads *"A hard splice clicks, and a click is the one artefact an
audio edit cannot hide."* The Flow simply never used that node. F16 fades the sound over the model's
own re-take of the same moment, which is real matching material rather than an invention:

    #907 AudioConcat(source, tail)                    the full-length hard track
    #951 MpiAudioRange(gen, tail_start - F, -1)       tail + F frames of the re-take
    #952 MpiAudioSplice(#907, patch #951, start -(TAIL + F), crossfade C ms)

`start` is negative, so it counts from the end and carries no hard-coded source length, and the
patch lands flush with the end - `i1 == total` - which is the condition `MpiAudioSplice` raises on,
so a mis-wired arm fails loudly instead of sliding the sound.

**A note on the whole-file scan.** The biggest single-sample step in every arm sits at 4.7553 s
(frame 114), at about 2x the file's 99.99th percentile - but the SOURCE clip has it too, at 1.8x.
It is the source's own content, not something the Flow introduced, and it must not be chased.

### F16 - the audio crossfade is BUILT, and the metric says it changes almost nothing

`#951 MpiAudioRange` + `#952 MpiAudioSplice` on the hard-joined picture, at 300 ms (12-frame
pre-roll) and 800 ms (24-frame). Both run; F16a cost a full 205.3 s because another job on the
bench had evicted the sample from ComfyUI's cache, F16b then cached at 5.0 s.

| arm | worst sample step within +-40 ms of the join |
|---|---|
| F15b, hard splice | 0.04872 (0.60x the file's own 99.99th pct) |
| F16a, 300 ms fade | 0.04181 (0.65x) |
| F16b, 800 ms fade | 0.04057 (0.65x) |

**The splice was never a large step to begin with** - 0.6x of the file's own 99.99th percentile,
i.e. quieter than the music's ordinary transients - so crossfading it can only move the number a
little, and it does. That cuts both ways and it is worth being explicit about which:

- if F16 fixes what Fabio hears, then the step metric is the wrong instrument for it (a
  content discontinuity between two recordings is not a large sample step), and the fade stays;
- if it does not, the splice is exonerated and the remaining candidate is that the sound is in the
  SOURCE clip already. The source's own biggest step sits at **4.7553 s (frame 114), 1.8x its own
  99.99th percentile** - about 0.4 s before the transition, which is close enough to read as "at
  the transition". The source clip was sent to Fabio on its own to settle exactly that, because no
  measurement here can distinguish "a percussive transient in the music" from "an artefact".

### FABIO'S GATE ON F16 - F16b PASSES CLEAN (2026-09-03)

*"F-16A still has a little flicker, almost imperceptible, and the sound is good. F-16B is perfect,
both sound and image, no flicker at all."*

**THE TWO ARMS HAVE BIT-IDENTICAL VIDEO.** `ffmpeg -map 0:v -f md5` returns
`e56a0cd65c540e57bf2bd3fac81b67cf` for both - F16a and F16b differ ONLY in the audio crossfade
(300 ms over a 12-frame pre-roll vs 800 ms over 24). So the "little flicker" seen on F16a and not on
F16b was **not in the pixels**: the same frames read as flickering with the shorter audio fade and
clean with the longer one. The audio splice was being perceived as a VISUAL event at the transition,
which is why every picture-side instrument kept coming back flat while the eye kept objecting.

That also retires the residual two-frame luma decline as a thing to chase: it is present in both
arms, byte for byte, and it is invisible once the sound is right.

**THE WINNING CONFIGURATION - all four changes are needed, and each has its own evidence:**

| # | change | fixes |
|---|---|---|
| 1 | `MiniMaxH3AddGuide` anchors the source's last 39 frames as a CLIP with its own audio, `ref_audio_1` dropped | continuation, identity, the re-sung music (Phase 5d) |
| 2 | **Hard join** - `#904 overlap 1`, the model's re-take discarded. NO 39-frame crossfade | most of the flicker (Phase 5f) |
| 3 | `ColorMatch`/`reinhard` on the flash frame against its own successor | the model's first free frame, +3 luma (Phase 5e) |
| 4 | `#950 MpiAudioRange(#906, 0, -1)` trims the AAC padding; `#951`/`#952 MpiAudioSplice` crossfades the splice over 24 frames / 800 ms | the 17 ms dropout, and the artefact that was reading as flicker |

### A reproducibility gotcha, found by the same md5

`F15b` and `F16a` share the same seed, the same prompt and the same upstream graph, yet their video
md5s differ (`8d4baf30...` vs `e56a0cd6...`). F16a re-sampled from scratch because another job on the
bench had evicted ComfyUI's cache; F16b then reused F16a's sample. **So the bench is not bit-
reproducible across a cache eviction, and any A/B that spans one is comparing two different samples,
not two different stitches.** Build variant arms back to back, and check the video md5 before
attributing a difference to the change under test.
