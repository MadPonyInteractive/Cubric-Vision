# ComfyUI Frontend Injection Rules (js/services/comfyController.js)

> **AI INSTRUCTION:** Injection works via node `_meta.title` — never hardcode node IDs. Use `filter` (not `find`) when locating nodes — multiple nodes can share a title. Never call ComfyUI directly from UI components; always go through `ComfyUIController`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves ComfyUI workflow execution.

**Title-based injection:** Target nodes exclusively by `_meta.title` (case-insensitive). Never hardcode node IDs. Use `filter` not `find` when locating nodes — multiple nodes can share a title.

**Node naming law (two-tier) — MPI-116.** Agent-relevant node titles follow two tiers:
- **Tier 1 — legacy reserved vocabulary (unchanged):** the documented Standard Node Title Map titles (`Positive`, `Negative`, `Seed`, `Width`, `Height`, `Lora_1`…`Lora_6`, `Duration`, `Steps`, `Checkpoint`, `Output`, `Preview`, `Detected`, etc.). These keep their existing bare titles. Known title → look it up in the Standard Node Title Map below.
- **Tier 2 — all NEW workflows authored from now on:** every node the app reads from or writes into MUST be titled with an `Input_*` prefix (app injects INTO it) or `Output_*` prefix (app reads FROM it). This makes a new workflow self-describing: an agent reads the API JSON and infers direction + role from the prefix with no per-workflow dictation. A genuinely new `inputs.*` field type still needs a one-line note from the user (the prefix gives direction, not which field to write).

**Tier-2 dual-emit alias (MPI-127).** `commandExecutor._buildParams` emits EVERY bare param key (`Positive`, `Seed`, `Width`, `Duration`, `Lora_*`, …) AND an `Input_`-prefixed alias of it (`Input_Positive`, `Input_Seed`, …) in the same params object. Injection silently skips any key with no matching node title, so a tier-1 (bare-title) workflow consumes the bare keys and ignores the aliases, while a tier-2 (`Input_*`-title) workflow consumes the aliases. One code path serves a MIXED fleet — image workflows are tier-1, video workflows (WAN + LTX) are tier-2 — with no per-model `tier` branch. Exception: `LoadLatent → Input_Video_Latent` is a RENAME (not a prefix), so it is emitted explicitly, not derived. When adding a tier-2 title, you do NOT need a separate injection branch — the alias already covers it; just title the node `Input_<BareName>`.

**Enforce the law when handed new nodes.** When the user supplies a NEW ComfyUI workflow / new injection nodes whose titles are NOT in the Tier-1 reserved vocabulary AND are not prefixed `Input_*` / `Output_*`, do NOT silently invent a contract. Tell the user the node-naming law requires the `Input_*` / `Output_*` prefix on new agent-relevant nodes, name the offending node titles, and ask them to re-title in their edit-version workflow and re-export the API JSON. (Tier-1 reserved titles are exempt — never flag `Positive`, `Seed`, `Lora_N`, `Output`, etc.)

**Never edit workflow JSON. EVER.** Files under `comfy_workflows/` are owned by the user — strict read-only for agents. Do not add, rename, rewire, or change baked default values in any node there. If a new injection target is required, document the contract (title + expected `inputs.*` field) in this file and in `.claude/rules/component-comfy.md`, then ask the user to author the node in the ComfyUI graph editor and re-export the API JSON. The same rule applies even when the change looks trivial (e.g. flipping a baked default value). Agents only write injection params on the frontend side.

**Never call ComfyUI directly** from UI components. All workflow calls go through `ComfyUIController.runWorkflow(...)` in `js/services/comfyController.js`.

**Required capture node:** Every workflow must have a node titled `"Output"` (case-insensitive). This is the canonical result node. Video Helper Suite nodes may emit final videos under `output.gifs`; inspect the filename/format because that payload can still be an MP4.

**Cache-hit dedupe (seedless workflows only):** `commandExecutor` watches ComfyUI's `execution_cached` WS event. If every node in `outputNodeIds` was served from cache AND the workflow has **no node titled `"Seed"`**, `exec.cacheHit` is set and `generationService.onComplete` skips creating a new history entry / gallery card and shows a toast `"No changes, skipping..."`. Replace mode (`config.replaceItemId`) bypasses dedupe. **Convention:** every seeded workflow must include a node titled exactly `"Seed"` (case-insensitive) — its presence disables the dedupe path, so seeded re-runs always produce a new entry. Universal/utility workflows (e.g. Upscale) lack a `"Seed"` node, which is what allows their idempotent re-runs to dedupe.

**Upload images/masks:** Pass Data URIs, blob URLs, http URLs, or local paths to `Input_Image` / `Input_Mask` — the controller uploads automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching.

**Selected history entry:** In Group History, `Input_Image` must come from the currently selected history item at execution time, not from mount-time props or the last history entry. Auto-mask detection in `MpiCanvasViewer` resolves `_currentItem.filePath` immediately before `runAutoMask(...)`; prompt-driven image ops in `MpiGroupHistoryBlock` use `_group.history[_currentIdx]`.

**Media slot completeness:** Model operations declare media slots through `commandRegistry.mediaInputs` and `commandExecutor._buildParams()` owns slot-to-title mapping. Every declared image/video/audio slot that has any compatible current media available MUST receive a current asset URL. Do not leave optional Comfy input nodes pointing at filenames saved inside the workflow JSON. If a workflow has multiple image inputs and the user supplies fewer images than slots, fill unassigned image slots with the first compatible image (for example, single-image `Input_Start_Frame`/`Input_End_Frame` image-to-video runs inject the start frame into both titles and use the boolean gate to control behavior). This rule applies to future multi-image, multi-video, and audio-capable workflows too. **Audio slots are model-capability-gated:** the shared `i2v_ms`/`t2v_ms` ops declare an `Input_Audio_File` audio slot, but `filterMediaInputsForModel(slots, model)` (commandRegistry) drops it for models without `capabilities.audio` — so WAN never shows/accepts/injects audio, LTX does. Applied at both the PromptBox slot read point and `commandExecutor`'s slot map.

**Trimmed video media inputs:** When a video `mediaItem` has `trim: { in, out }`, `commandExecutor` prepares a temporary trimmed MP4 through `/api/video/trim-input` before title-based injection. Comfy still receives the normal `"Input_Video"` path, but it points at the temporary clip, not the full source. The route treats `out` as the last included frame, resets timestamps to zero, and the executor cleans the temp file after completion/error.

**Standard title map:** `"Positive"`/`"Negative"` → `inputs.value`, `"Seed"` → `inputs.int`, `"Checkpoint"` → `inputs.ckpt_name`, `"Lora_1"`…`"Lora_6"` → `{ lora_name, strength_model, strength_clip }`, `"Input_Image"`/`"Input_Mask"` → auto-uploaded. Full table in `docs/comfy.md`.

See `docs/comfy.md` for the full injection pattern and example.

Staged LoRA models may also inject keys such as `"Lora_High_1"` and `"Lora_Low_1"`.
These use the same LoRA object shape as flat slots, and the controller writes
`lora_name` plus whichever strength input the workflow node exposes
(`strength`, `strength_model`, and/or `strength_clip`).

## Standard Node Title Map

| Title | Input field | Notes |
| :--- | :--- | :--- |
| `"Positive"` | `inputs.value` | Positive prompt |
| `"Negative"` | `inputs.value` | Negative prompt |
| `"Seed"` | `inputs.int` / `inputs.value` | Falls back to `noise_seed` on any KSampler |
| `"Width"` / `"Height"` | `inputs.value` | Render dimensions |
| `"Checkpoint"` / `"Model"` | `inputs.ckpt_name` / `unet_name` / `model_name` | Primary checkpoint |
| `"Checkpoint_Refiner"` | `inputs.ckpt_name` | Refiner checkpoint |
| `"Lora_1"` … `"Lora_6"` | `inputs.lora_name`, `strength_model`, `strength_clip` | User LoRA slots — system LoRAs are baked in, not injected |
| `"Lora_High_1"` ... `"Lora_High_6"` | `inputs.lora_name`, `strength` / `strength_model` | WAN high-noise LoRA slots. Generated from `model.loraStages[].injectionPrefix` |
| `"Lora_Low_1"` ... `"Lora_Low_6"` | `inputs.lora_name`, `strength` / `strength_model` | WAN low-noise LoRA slots. Workflow node titles must be unique (`Lora_Low_1` ... `Lora_Low_6`) |
| `"Use_Refiner"` | `inputs.boolean` / `inputs.value` | MpiBoolean uses `inputs.boolean` |
| `"Batch_Size"` | `inputs.int` | `MpiInt` node driving Empty Latent via link. Value from `MpiBatchSelector` (1–4). Workflow returns N images → N gallery cards (one per URL). |
| `"Duration"` | `inputs.int` | `MpiInt` node — video length in seconds (1–30, step 1). Injected by PromptBox `duration` control on `t2v`, `i2v`, `t2v_ms`, `i2v_ms`. |
| `"Motion_Intensity"` | `inputs.float` | `MpiFloat` node — motion strength (0.0–1.0, step 0.01). Injected by PromptBox `motionIntensity` control on `i2v`, `i2v_ms`. |
| `"Input_Image"` | `inputs.image` | Auto-uploaded by controller |
| `"Input_Mask"` | `inputs.mask` | Auto-uploaded by controller |
| `"Input_Start_Frame"` / `"Input_End_Frame"` | `inputs.image` | **(Tier-2 video frame slots — MPI-127.)** Start/end-frame image slots for `i2v` / `i2v_ms`, declared in `commandRegistry.mediaInputs`. Auto-uploaded. Replaced the legacy bare `Start_Frame` / `End_Frame` titles when WAN + LTX moved to tier-2 (both models share these titles now). `Input_End_Frame` is optional (gated by `Input_Use_End_Image`). |
| `"Input_Audio_File"` | `inputs.audio` | **(LTX-2.3 audio — MPI-127.)** `LoadAudio` node. Audio media slot on the shared `i2v_ms` / `t2v_ms` ops, capability-gated by `model.capabilities.audio` (LTX only; WAN never receives it). Auto-uploaded like image/video media. |
| `"Input_Use_Reference_Audio"` | `inputs.boolean` | **(LTX-2.3 audio mode — MPI-127.)** `MpiIfElse` gate. `true` → voice-ID from the reference clip. Set by the PromptBox `audioMode` control when an audio file is present and mode = Reference. No injection when audio absent (baked default wins). |
| `"Input_Use_Input_Audio"` | `inputs.boolean` | **(LTX-2.3 audio mode — MPI-127.)** `MpiSimpleBoolean` gate. `true` → use the input audio directly. Set by `audioMode` when audio present and mode = Original. Mutually exclusive with `Input_Use_Reference_Audio`. |
| `"Input_Use_Transition"` | `inputs.boolean` | **(LTX-2.3 — MPI-127.)** `MpiBoolean`. The i2v motion/lipsync enabler (`[[project-ltx-transition-lora-enables-lipsync]]`). Forced `true` by the `audioMode` control whenever audio is present (either mode). |
| `"Input_Use_Audio"` | `inputs.boolean` | **(LTX-2.3 — MPI-127.)** Master audio enable, baked `true` in the workflow. App does not currently inject this; listed so its title is reserved + recognized. |
| `"Denoise"` | `inputs.float` | Denoising strength. `MpiFloat` node injected by `denoise` PromptBoxControl on `upscale` (default 0.20) and `detail` (default 0.30). Per-op defaults declared via `commands[op].defaults.denoise` in `commandRegistry.js`; persisted under `modelSettings[modelId].operations[opName].denoise` so each op holds independent state. **(MPI-182)** The PiD `pid` op reuses this SAME control (default 0.0) → the workflow's degrade_sigma node is titled `Input_Denoise` (`MpiFloat`); the bare `Denoise` key's tier-2 alias `Input_Denoise` bridges it. So the app "denoise" slider drives PiD's degrade_sigma with no new control. |
| `"Input_Type"` | `inputs.select` | **(PiD 4-path VAE selector — MPI-182.)** `MpiAnySwitch`, **1-INDEXED** (`select` starts at 1). Injected by the `pidVariant` PromptBoxControl on the `pid` op: 1=flux, 2=sd3, 3=qwen, 4=sdxl. NOTE: `select` was ADDED to the `comfyController._inject` target list for MPI-182 (MpiAnySwitch was previously un-injectable). |
| `"Input_Resolution"` | `inputs.select` | **(PiD output-size selector — MPI-182.)** `MpiAnySwitch`, **1-INDEXED**. Injected by the `pidResolution` PromptBoxControl on the `pid` op: 1=1K, 2=2K, 3=4K (native passthrough). |
| `"Steps"` | `inputs.steps` / `inputs.value` | Sampling steps |
| `"Upscale_Model"` | `inputs.upscale_model` | Upscale model filename |
| `"Upscale_Factor"` | `inputs.float` / `inputs.value` | 1.0 – 4.0 |
| `"Upscale_Using_Model"` | `inputs.boolean` | MpiBoolean (MpiIfElse) gate on `image_upscale.json` / `video_upscale.json`. `true` → workflow routes through `Upscale_Model` + `ImageUpscaleWithModel` branch. `false` → bypasses model, runs plain `ImageScaleBy` lanczos. Injected by `MpiToolOptionsUpscale` based on dropdown selection (`None` = `false`). |
| `"Interp_Multiplier"` | `inputs.float` | Frame multiplier for RIFE VFI (2, 3, 4) |
| `"Auto_Grid"` | `inputs.boolean` | Use a grid toggles |
| `"Grid_H"` / `"Grid_V"` | `inputs.int` / `inputs.value` | Grid splits |
| `"sams"` | `inputs.ckpt_name` / `model_name` | SAM / detection model |
| `"Box"` | `inputs.boolean` | Box (true) vs segment (false) |
| `"Selected_Masks_Input"` | `inputs.text` / `picks` | Comma-separated mask indices |
| `"Preview_Only"` | `inputs.boolean` | **Required on multi-stage base workflows** (ops with `_ms` suffix). Boolean toggle: `true` halts the workflow at the preview stage. Defensive-strip in `comfyController` removes the param when no matching node exists (the `_stage2.json` sibling workflow intentionally lacks this node). See "Multi-stage video workflows" below. |
| `"LoadLatent"` | `inputs.latent` | **Required on every multi-stage workflow** (base + `_stage2`). Filename basename of the latent in the active ComfyUI `input/` folder. Always injected by `commandExecutor`: stage-1 runs receive the default `ComfyUI_00001_.latent`; stage-2 runs receive the per-preview `<previewUuid>.latent` staged by `POST /comfy/stage-preview-latent`. |
| `"Output"` | read-only | **Required** — final output node for result capture. Nodes without this title are ignored; capture `images`, VHS `gifs`, and native `SaveVideo` `videos` payloads. |
| `"Output_Image"` | read-only | **(Tier-2 IMAGE capture title — MPI-182.)** The tier-2-named equivalent of bare `"Output"` for a fully tier-2 IMAGE workflow (self-describing, like video's `Output_Video`). Captured on the SAME non-preview image path — `commandExecutor.js` (~L979) aliases `_imageOutputTitle = 'output_image'` alongside `_captureTitle='output'`, so a `PreviewImage` titled `Output_Image` is captured with no bare-title exception. A tier-2 image workflow (e.g. NVIDIA PiD, Chroma) may use `Output_Image`; tier-1 image workflows keep bare `Output`. Both work. **TRAP (MPI-217):** the match is on the EXACT lowercased title — a typo in the capture-node title (e.g. `Ouptput_Image`) matches nothing → the run completes with no error and reports `Generation completed but no output returned`. If a newly-authored workflow generates fine (log shows `Prompt executed in N seconds`) but the app captures nothing, check the capture node's title first. |
| `"Output_Video"` | read-only | **(Video pipeline — MPI-64 2026-06-14, B3.)** Native `SaveVideo` node that writes the VIDEO (no audio) into a `video/` SUBFOLDER under ComfyUI `output/` (e.g. `output/video/<op>_00001_.mp4`). Captured exactly like `"Output"` — `commandExecutor`/`comfyController` `_collectComfyOutputUrls` read its `videos[]` payload (file dicts → `/view` URLs). Treated as an output node alongside `"Output"` so the SAME capture path serves every video workflow. Replaces the single `"Output"` `VHS_VideoCombine` (whose `nvenc_h264` encode fails on the Blackwell Pod). Pairs with optional `"Output_Audio"`; the two are MUXED server-side at save time (video master, stream-copy) in `routes/projects.js` `/project/save-generation` via `services/ffmpegMux.js`. |
| `"Output_Audio"` | read-only | **(Video pipeline — MPI-64 2026-06-14, B3.)** Native `SaveAudioMP3`/`SaveAudio` node that writes audio into an `audio/` SUBFOLDER under ComfyUI `output/` (e.g. `output/audio/<op>_00001_.mp3`). Captured by `commandExecutor` `_collectComfyAudioUrl` from the node's `audio[]` payload (first entry → `/view` URL), threaded through `onComplete({audioUrl})` → `saveGeneration({audioViewUrl})` → the save route, which downloads it and muxes it into the video. **Present ONLY when the source had audio** — the workflow gates the audio with an `MpiHasAudio` (ffmpeg stream-probe on the input path) → `MpiIfElse`, because saving EMPTY audio throws and fails the run the same way `SaveVideo` does. When absent, the save keeps the silent video. NOTE: ComfyUI increments each save node's `_00001_` counter INDEPENDENTLY, so the video and audio sequence numbers do NOT match — pairing is by the SAME prompt's `executed` payloads (the two capture nodes), never by filename counter. |
| `"Preview"` | read-only | **(Tier-1 legacy capture title.)** **Required on multi-stage video workflows** — the node whose payload carries the preview clip when `Preview_Only=true`. **(MPI-64 2026-06-15, B3.)** Now a native `CreateVideo`→`SaveVideo` titled `Preview` (was a `VHS_VideoCombine`, whose `nvenc_h264` encode fails on the Blackwell Pod the same as the final output did) → its payload arrives under `videos[]`, captured by the SAME `_collectComfyOutputUrls` path (reads `images`+`gifs`+`videos`) — no app change. No `Output_Audio` on preview (throwaway clip, audio only on the final `Output_Video`). `commandExecutor.js` switches its capture-title filter from `"output"` → `"preview"` for preview-only runs; without the exact title, the executed message is silently dropped and the run reports "no output returned". |
| `"Output_Preview"` | read-only | **(Tier-2 preview capture title — LTX-2.3 / MPI-127.)** The tier-2-named equivalent of `"Preview"`: a `SaveVideo` titled `Output_Preview` carrying the preview clip on `Input_Preview_Only=true` runs. Tier-2 workflows pair `Output_Video` (final) + `Output_Preview` (preview) by prefix instead of the legacy bare `Output`/`Preview`. **App wired (MPI-127):** `commandExecutor.js` (~line 906) maps the preview-only capture title to `'output_preview'`, so tier-2 preview-only runs capture correctly; tier-1 video previews still match `"preview"`, and finals still match `"output"`/`"output_video"`. | |
| `"Detected"` | read-only | **Required** — auto-masking preview output node |

> When adding new params: use a capitalized title (e.g. `"Input_Video"`) and add it here.

## Standalone Workflow Injectors

Most params are injected by `comfyController.runWorkflow()` from the title-keyed
params map produced by `commandExecutor._buildParams()`. Tool-panel utility
workflows may also use a standalone injector when the params do not fit the
standard title map.

- Operation declares `injector: '<name>'` in `js/data/commandRegistry.js`.
- `commandExecutor.runCommand()` loads the workflow JSON, then applies
  `INJECTORS[name](workflow, payload.injectionParams || {})` before submit.
- Injector code lives in `js/services/workflowInjectors/` and must target nodes
  by `_meta.title` using case-insensitive filtering. Never hardcode numeric IDs.
- Current injector: `resize` (`resize` and `resizeVideo` ops). It writes:
  `"Resize Image v2"` inputs `width`, `height`, `upscale_method`,
  `keep_proportion`, `pad_color`, `crop_position`, `divisible_by`, `device`;
  `"ImageFlip"` input `flip_method`; `"Image Rotate"` input `rotation`; and
  `"Flip"` input `boolean`.
- Universal video tool trim prep is not a workflow injector; it happens before
  `_buildParams()` so all video operations with declared media slots can receive
  the temporary clipped input path.

## Multi-stage video workflows

Operations with `_ms` suffix (e.g. `t2v_ms`, `i2v_ms`) are **multi-stage**: a low-res preview pass plus a final pass that consumes the saved stage-1 latent. The two phases are implemented as **two separate workflow files** rather than one branched workflow, because ComfyUI's `/prompt` API has no runtime node-bypass flag — a single-file branched workflow always executes every node referenced in the dependency graph regardless of any `MpiIfElse`/boolean gating.

**Multi-stage is per-MODEL, not per-op (MPI-127).** The `_ms` op keys (`t2v_ms`/`i2v_ms`) are SHARED across WAN and LTX. Whether a model actually exposes the preview/stage-2 flow is gated by `model.capabilities.multiStage`: both WAN and LTX = `true` (show the `previewStage` toggle, run the two-file flow below). LTX was single-stage in MPI-127 (`multiStage:false`) because preview→stage-2 needs DUAL-latent staging (video + audio); **MPI-128 wired that and flipped LTX to `multiStage:true`** (see dual-latent note under "LoadLatent injection contract"). So "an `_ms` op = multi-stage" is only true when the active model declares `multiStage`. A model with `multiStage:false` would use only the stage-1 file (no stage-2). Separately, `capabilities.branchingContinue` gates the Continue (branch) button: WAN = `true` (per-stage LoRAs vary stage-2); LTX omits it → **Finish-only** (refined LTX workflow locks stage-2 to stage-1, prompt has no effect on the continuation). See `commandAllowsBranchingContinue(key, model)` in `commandRegistry.js`.

**Two-file convention:**
- `<name>.json` — stage-1 (preview) workflow. Contains `SaveLatent`, `Preview_Only`, `Preview` and `Output` capture nodes, full sampler chain.
- `<name>_stage2.json` — stage-2 workflow. **Authored by saving the API JSON with the stage-1 KSampler node toggled to Bypass mode in the ComfyUI graph editor.** ComfyUI's "Save (API)" export then deletes the bypassed node and rewires every consumer to the bypassed node's upstream feeder slot (Comfy's standard splice behavior). The result is a stage-2-only graph where `LoadLatent` feeds directly into the low-noise sampler. **NOTE: WAN/LTX stage-2 siblings are now GENERATED from the stage-1 API export by `comfy_workflows/scripts/workflow_generation/` (see its `README.md`) — the bypass+re-export is mechanical (title-keyed on `Stage1_Bypass` + `Is_Continue`), not hand-authored.**

`resolveWorkflowFile(model, op, engine, {stage2})` (in `modelConstants/resolveModelDeps.js`, called from `commandExecutor.runCommand`) returns `<name>.json` normally; when `stage2 === true` it swaps the basename to `<name>_stage2.json`, then appends the engine's `workflowSuffix` (e.g. `_gguf` on a Pod → `<name>_stage2_gguf.json`). (MPI-165)

**Authoring contract** (titles below are the TIER-1 names; tier-2 video workflows use the `Input_*`/`Output_*` equivalents — `Input_Preview_Only`, `Output_Preview`, `Output_Video`, `Input_Video_Latent` — see the title map + dual-emit alias note above):

Stage-1 base file MUST contain:
- A `MpiBoolean` node titled `"Preview_Only"` (tier-2: `"Input_Preview_Only"`) whose `inputs.boolean` gates the preview/final branch.
- A `LoadLatent` node titled `"LoadLatent"` (tier-2: `"Input_Video_Latent"`) (kept for ComfyUI validation; never reached by stage-1's data flow).
- A `SaveLatent` node titled `"SaveLatent"` (tier-2: `"Output_Video_Latent"`) that emits the stage-1 latent on preview runs. **LTX saves TWO** (MPI-128) — a video `SaveLatent` titled `"Output_Video_Latent"` (prefix `ltx_video_latent`) and an audio one titled `"Output_Audio_Latent"` (prefix `ltx_audio_latent`). The app tells them apart by SaveLatent node TITLE (`_collectComfyLatents` tags role: title containing "audio" → audio, else video; legacy bare `"SaveLatent"` → video, so WAN single-latent is unaffected).
- A capture node titled exactly `"Preview"` (tier-2: `"Output_Preview"`) whose payload is the preview clip.
- A capture node titled exactly `"Output"` (tier-2: `"Output_Video"`) whose payload is the full-run final clip.

Stage-2 sibling file (`_stage2.json`) MUST contain:
- A `LoadLatent` node titled `"LoadLatent"` whose `inputs.latent` is the per-preview filename injected at runtime.
- A capture node titled exactly `"Output"`.
- NO `Preview_Only` node, NO `SaveLatent`, NO stage-1 sampler (these vanish when the base file is exported with stage-1 KSampler bypassed).

The `Is_Continue` boolean node is **no longer used by WAN** — WAN branch selection happens via the file swap, not an injected boolean. **LTX differs (MPI-127):** LTX's stage-2 is GENERATED no-splice — `Input_Is_Continue` drives an `MpiIfElse` that selects the loaded `Input_Video_Latent`/`Input_Audio_Latent` over the live stage-1 latent, so the generator derives the stage-2 file by flipping that one boolean (no node deletion/rewire). The app still does NOT inject `Is_Continue` at runtime for either model — the stage-2 FILE is pre-stamped. (Live as of MPI-128: LTX preview→Finish reuses both staged latents; this path is exercised, no longer moot.)

Single-stage workflows (no `_ms`) MUST NOT have the `Preview_Only` node and need only the `Output` capture node.

**LoadLatent injection contract:** ComfyUI validates the `LoadLatent` selector even when the workflow branches away from it. The app always injects `LoadLatent`:
- Stage-1 runs (Preview ON or OFF): `LoadLatent = 'ComfyUI_00001_.latent'`. The default lives at `comfy_workflows/input/ComfyUI_00001_.latent` and is copied into the active engine `input/` folder by `POST /comfy/prepare-workflow-inputs` before every `_ms` submission.
- Stage-2 runs (Continue/Finish): `LoadLatent = '<previewUuid>.latent'`. The per-preview latent lives in `<project>/Media/.latents/<previewUuid>.latent`; `POST /comfy/stage-preview-latent` copies it into the active engine `input/` folder before the stage-2 submission.

**Dual-latent (LTX, MPI-128).** LTX preview→stage-2 stages BOTH a video and an audio latent. The audio one rides a parallel optional set of fields, so WAN (single latent) is untouched (all audio fields stay undefined):
- Producer: stage-1 emits `Output_Video_Latent` + `Output_Audio_Latent`; `generationService` splits them into `previewAssets.latent` (video) + `previewAssets.audioLatent` (audio).
- Persist: `materializePreviewAssets` writes `<project>/Media/.latents/<id>.latent` (video) + `<id>.audio.latent` (audio); the sidecar records both with `status`.
- Validate: `validate-preview-assets` stats both; `canFastPath` requires the audio latent on disk **only when the sidecar declares one**.
- Dispatch: `MpiGalleryBlock` Continue/Finish pass `loadAudioLatentName` + `audioLatentFilePath` alongside the video pair.
- Stage: `_stagePreviewLatent` calls the route TWICE (once per latent), staging the audio latent under engine name `ltx_audio_latent_00001_.latent`.
- Inject: `_buildParams` emits `Input_Audio_Latent` (the staged audio name) next to `Input_Video_Latent`. Stage-1 / WAN fall back to the baked default `ltx_audio_latent_00001_.latent` (validation-only, never read on those runs).
- Cleanup: item delete drops both `<id>.latent` and `<id>.audio.latent`.

**THE VALIDATION TRAP (read before adding ANY new video/multi-stage model).** ComfyUI validates the file selector on **EVERY** `LoadLatent`, `LoadImage`, AND `LoadAudio` node in a submitted graph — even nodes the data flow never reaches (e.g. nodes behind an `Is_Continue` gate, an i2v start/end-frame loader sitting unused in a t2v workflow, or an audio-input loader on a no-audio gen). If a baked filename has no matching file in the active engine `input/` folder, the whole prompt dies with `Invalid latent file` / `Invalid image file` / `Invalid audio file` and `Output will be ignored` — even though that node is dead in this run. This bit LTX-2.3 (MPI-127): its t2v graph carries two `LoadLatent` nodes (`Input_Video_Latent` + `Input_Audio_Latent`, both behind the continue gate), two leftover i2v `LoadImage` nodes (`Input_Start_Frame` / `Input_End_Frame`), AND a `LoadAudio` node (`Input_Audio_File`) only injected when the user attaches audio — when none were staged, all failed validation. The fix (still in force): every one of those baked names has a real default in `WORKFLOW_INPUT_DEFAULTS` staged before each submit (`ltx_video_latent_00001_.latent`, `ltx_audio_latent_00001_.latent`, `ltx_placeholder.png`, `ltx_silence.wav`). On a stage-2 run the two LoadLatent nodes additionally get the staged per-preview latents injected over their baked names (dual-latent, MPI-128). Still: a gen WITH audio passes partly because the audio chip injects over the baked name; remove the chip and the baked `ltx_silence.wav` must hold — so always test with NO audio attached too.

**The contract:** every baked `LoadLatent.inputs.latent` and `LoadImage.inputs.image` filename in a shipped workflow MUST have a real default file present. The mechanism is the flat `WORKFLOW_INPUT_DEFAULTS` list in `routes/comfy.js` — `POST /comfy/prepare-workflow-inputs` copies all of it from repo-owned `comfy_workflows/input/` into the engine `input/` before EVERY `_ms` submit (so it survives the shutdown GC). When you add a model:
1. For each `LoadLatent` node, ship its baked-name latent into `comfy_workflows/input/` and add the name to `WORKFLOW_INPUT_DEFAULTS`. Multi-latent models (LTX = video + audio) need ALL their latent names listed; the single `ComfyUI_00001_.latent` default only covers WAN.
2. For leftover/optional `LoadImage` nodes (i2v frame loaders that also exist in the t2v graph), bake them to a shipped placeholder image (LTX uses `ltx_placeholder.png`, a 1×1 PNG that `ImageResizeKJv2` rescales fine) and add it to `WORKFLOW_INPUT_DEFAULTS`. t2v validates against the placeholder; i2v injects the real frame over it via the media-slot mapping. WAN t2v sidesteps this entirely by having NO `LoadImage` nodes — that is also valid, but only if your stage-1/stage-2 generation + AddGuide wiring doesn't need them.
3. For `LoadAudio` nodes injected only when the user attaches audio (LTX `Input_Audio_File`), bake them to a shipped **valid** placeholder audio — NOT an empty stub: it must decode + VAE-encode without error. LTX uses `ltx_silence.wav` (1 s silent mono 44.1 kHz PCM). Add it to `WORKFLOW_INPUT_DEFAULTS`. A no-audio gen validates against silence; an audio gen injects the real file over it. This trap is invisible if you only ever test WITH audio attached — always test a video model with NO audio/image/frame input to flush every optional-loader default.

Note the injector's `Input_Video_Latent` override (`commandExecutor` ~L479) points stage-1 at `ComfyUI_00001_.latent` regardless of model — fine because stage-1 never *reads* the latent (validation only), and that default is always staged. A model's own baked latent name still needs staging for the nodes the override doesn't rename.

Engine-input copies are NOT proactively cleaned per-run. The server's existing `cleanComfyUITempFiles` shutdown hook (SIGTERM/SIGINT in `server.js`) empties `input/` and `output/` on app exit. Mid-session bloat is bounded by uuid uniqueness — each preview owns one staged latent and stage-2 reads it; subsequent reruns overwrite the same name.

**Preview support-asset validation + cold fallback:** Before Continue/Finish dispatches, `MpiGalleryBlock` calls `projectService.validatePreviewAssets(itemId)` which hits `GET /project-media/:projectId/validate-preview-assets`. The route stats the project latent (`Media/.latents/<id>.latent`) and any I2V snapshots (`Media/.preview-assets/<id>/<role>.<ext>`) recorded on the sidecar and returns one of three states:

- `canFastPath` — latent present. Continue branches to stage-2 (existing fast path); Finish runs stage-2 with `replaceItemId`.
- `canColdFallback` — latent missing, `frozenParams` complete, all required snapshots present. Continue reruns stage-1 with `previewOnly=true` + `replaceItemId=<previewId>` to rebuild the latent in place, then on `gallery:item-updated` auto-enqueues the stage-2 branch. Finish runs the full base `_ms` workflow with `previewOnly=false` + `replaceItemId` — no `isStage2` swap, no `LoadLatent` override — so stage-1+stage-2 fuse in a single submission.
- `blocked` — neither path possible. Card shows red "Missing" badge and hides Continue/Finish; user deletes the preview to recover (`DELETE /project-media` route cleans `.latents/<id>.latent` + `.preview-assets/<id>/` when sidecar `stage === 'preview'`).

T2V previews carry no snapshot array, so snapshot validation is a no-op for them — only latent state gates Continue/Finish. Cold-fallback Continue's stage-1 rerun reuses the existing materialization route; the `copySnapshotSource` helper now guards same-path copies because the rerun reads the preview's own already-materialized snapshot into the destination path of the same name.

**Symptom of missing Preview_Only node:** when the user toggles "Preview initial stage" in PromptBox and runs, the gen completes a full final video instead of stopping at preview. `comfyController.runWorkflow` defensively scans for the node when `Preview_Only` is present in params; if missing, it strips the param and emits a `clientLogger.warn('comfy', 'Preview_Only requested but workflow has no matching node — running full generation')`. Check the dev console / `logs/app.log` first when preview mode silently produces a full video.

## Image & Mask Uploads
Pass `Input_Image` / `Input_Mask` as Data URIs, blob URLs, http URLs, or local project paths — controller uploads them automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching; overwrite the file when content changes.

For Group History actions, always resolve the source image/video from the selected history entry at the moment the action starts. Do not cache the initial mount URL for later ComfyUI injection; history selection changes without remounting `MpiCanvasViewer`.

## Example
```javascript
const params = {
    "Positive": "A landscape",
    "Seed": 45678,
    "Upscale_Model": "4x_NMKD-Siax_200k.pth",
    "Lora_1": { lora_name: "my_lora.safetensors", strength_model: 0.8, strength_clip: 0.8 },
    "Lora_High_1": { lora_name: "wan 2.2\\foo_HIGH.safetensors", strength_model: 0.8, strength_clip: 1.0 },
    "Input_Image": "data:image/png;base64,..."
};
const result = await ComfyUIController.runWorkflow('sdxl_t2i', params, onProgress);
```
