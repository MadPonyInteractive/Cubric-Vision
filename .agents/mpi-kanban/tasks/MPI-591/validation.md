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
