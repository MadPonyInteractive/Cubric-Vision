# ComfyUI Frontend Injection Rules (js/services/comfyController.js)

> **AI INSTRUCTION:** Injection works via node `_meta.title` — never hardcode node IDs. Use `filter` (not `find`) when locating nodes — multiple nodes can share a title. Never call ComfyUI directly from UI components; always go through `ComfyUIController`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves ComfyUI workflow execution.

**Title-based injection:** Target nodes exclusively by `_meta.title` (case-insensitive). Never hardcode node IDs. Use `filter` not `find` when locating nodes — multiple nodes can share a title.

**Never edit workflow JSON. EVER.** Files under `comfy_workflows/` are owned by the user — strict read-only for agents. Do not add, rename, rewire, or change baked default values in any node there. If a new injection target is required, document the contract (title + expected `inputs.*` field) in this file and in `.claude/rules/component-comfy.md`, then ask the user to author the node in the ComfyUI graph editor and re-export the API JSON. The same rule applies even when the change looks trivial (e.g. flipping a baked default value). Agents only write injection params on the frontend side.

**Never call ComfyUI directly** from UI components. All workflow calls go through `ComfyUIController.runWorkflow(...)` in `js/services/comfyController.js`.

**Required capture node:** Every workflow must have a node titled `"Output"` (case-insensitive). This is the canonical result node. Video Helper Suite nodes may emit final videos under `output.gifs`; inspect the filename/format because that payload can still be an MP4.

**Cache-hit dedupe (seedless workflows only):** `commandExecutor` watches ComfyUI's `execution_cached` WS event. If every node in `outputNodeIds` was served from cache AND the workflow has **no node titled `"Seed"`**, `exec.cacheHit` is set and `generationService.onComplete` skips creating a new history entry / gallery card and shows a toast `"No changes, skipping..."`. Replace mode (`config.replaceItemId`) bypasses dedupe. **Convention:** every seeded workflow must include a node titled exactly `"Seed"` (case-insensitive) — its presence disables the dedupe path, so seeded re-runs always produce a new entry. Universal/utility workflows (e.g. Upscale) lack a `"Seed"` node, which is what allows their idempotent re-runs to dedupe.

**Upload images/masks:** Pass Data URIs, blob URLs, http URLs, or local paths to `Input_Image` / `Input_Mask` — the controller uploads automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching.

**Selected history entry:** In Group History, `Input_Image` must come from the currently selected history item at execution time, not from mount-time props or the last history entry. Auto-mask detection in `MpiCanvasViewer` resolves `_currentItem.filePath` immediately before `runAutoMask(...)`; prompt-driven image ops in `MpiGroupHistoryBlock` use `_group.history[_currentIdx]`.

**Media slot completeness:** Model operations declare media slots through `commandRegistry.mediaInputs` and `commandExecutor._buildParams()` owns slot-to-title mapping. Every declared image/video/audio slot that has any compatible current media available MUST receive a current asset URL. Do not leave optional Comfy input nodes pointing at filenames saved inside the workflow JSON. If a workflow has multiple image inputs and the user supplies fewer images than slots, fill unassigned image slots with the first compatible image (for example, single-image `Start_Frame`/`End_Frame` image-to-video runs inject the start frame into both titles and use the boolean gate to control behavior). This rule applies to future multi-image, multi-video, and audio-capable workflows too.

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
| `"Denoise"` | `inputs.float` | Denoising strength. `MpiFloat` node injected by `denoise` PromptBoxControl on `upscale` (default 0.20) and `detail` (default 0.30). Per-op defaults declared via `commands[op].defaults.denoise` in `commandRegistry.js`; persisted under `modelSettings[modelId].operations[opName].denoise` so each op holds independent state. |
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
| `"Output_Video"` | read-only | **(Video pipeline — MPI-64 2026-06-14, B3.)** Native `SaveVideo` node that writes the VIDEO (no audio) into a `video/` SUBFOLDER under ComfyUI `output/` (e.g. `output/video/<op>_00001_.mp4`). Captured exactly like `"Output"` — `commandExecutor`/`comfyController` `_collectComfyOutputUrls` read its `videos[]` payload (file dicts → `/view` URLs). Treated as an output node alongside `"Output"` so the SAME capture path serves every video workflow. Replaces the single `"Output"` `VHS_VideoCombine` (whose `nvenc_h264` encode fails on the Blackwell Pod). Pairs with optional `"Output_Audio"`; the two are MUXED server-side at save time (video master, stream-copy) in `routes/projects.js` `/project/save-generation` via `services/ffmpegMux.js`. |
| `"Output_Audio"` | read-only | **(Video pipeline — MPI-64 2026-06-14, B3.)** Native `SaveAudioMP3`/`SaveAudio` node that writes audio into an `audio/` SUBFOLDER under ComfyUI `output/` (e.g. `output/audio/<op>_00001_.mp3`). Captured by `commandExecutor` `_collectComfyAudioUrl` from the node's `audio[]` payload (first entry → `/view` URL), threaded through `onComplete({audioUrl})` → `saveGeneration({audioViewUrl})` → the save route, which downloads it and muxes it into the video. **Present ONLY when the source had audio** — the workflow gates the audio with an `MpiHasAudio` (ffmpeg stream-probe on the input path) → `MpiIfElse`, because saving EMPTY audio throws and fails the run the same way `SaveVideo` does. When absent, the save keeps the silent video. NOTE: ComfyUI increments each save node's `_00001_` counter INDEPENDENTLY, so the video and audio sequence numbers do NOT match — pairing is by the SAME prompt's `executed` payloads (the two capture nodes), never by filename counter. |
| `"Preview"` | read-only | **Required on multi-stage video workflows** — the node whose `gifs[]` payload carries the preview clip when `Preview_Only=true`. `commandExecutor.js` switches its capture-title filter from `"output"` → `"preview"` for preview-only runs; without the exact title, the executed message is silently dropped and the run reports "no output returned". |
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

**Two-file convention:**
- `<name>.json` — stage-1 (preview) workflow. Contains `SaveLatent`, `Preview_Only`, `Preview` and `Output` capture nodes, full sampler chain.
- `<name>_stage2.json` — stage-2 workflow. **Authored by saving the API JSON with the stage-1 KSampler node toggled to Bypass mode in the ComfyUI graph editor.** ComfyUI's "Save (API)" export then deletes the bypassed node and rewires every consumer to the bypassed node's upstream feeder slot (Comfy's standard splice behavior). The result is a stage-2-only graph where `LoadLatent` feeds directly into the low-noise sampler.

`commandExecutor._resolveWorkflowFile` returns `<name>.json` normally; when `payload.isStage2 === true`, `_toStage2Filename` swaps the basename to `<name>_stage2.json`.

**Authoring contract:**

Stage-1 base file MUST contain:
- A `MpiBoolean` node titled `"Preview_Only"` whose `inputs.boolean` gates the preview/final branch.
- A `LoadLatent` node titled `"LoadLatent"` (kept for ComfyUI validation; never reached by stage-1's data flow).
- A `SaveLatent` node titled `"SaveLatent"` that emits the stage-1 latent on preview runs.
- A capture node titled exactly `"Preview"` (typically `VHS_VideoCombine` saving to `temp/`) whose `gifs[]` payload is the preview clip.
- A capture node titled exactly `"Output"` (typically `VHS_VideoCombine` saving to `output/`) whose `gifs[]` payload is the full-run final clip.

Stage-2 sibling file (`_stage2.json`) MUST contain:
- A `LoadLatent` node titled `"LoadLatent"` whose `inputs.latent` is the per-preview filename injected at runtime.
- A capture node titled exactly `"Output"`.
- NO `Preview_Only` node, NO `SaveLatent`, NO stage-1 sampler (these vanish when the base file is exported with stage-1 KSampler bypassed).

The `Is_Continue` boolean node is **no longer used** — branch selection happens via the file swap, not an injected boolean. Workflow authors may keep an `Is_Continue` node in stage-1 files for graph clarity, but the app does not inject it.

Single-stage workflows (no `_ms`) MUST NOT have the `Preview_Only` node and need only the `Output` capture node.

**LoadLatent injection contract:** ComfyUI validates the `LoadLatent` selector even when the workflow branches away from it. The app always injects `LoadLatent`:
- Stage-1 runs (Preview ON or OFF): `LoadLatent = 'ComfyUI_00001_.latent'`. The default lives at `comfy_workflows/input/ComfyUI_00001_.latent` and is copied into the active engine `input/` folder by `POST /comfy/prepare-workflow-inputs` before every `_ms` submission.
- Stage-2 runs (Continue/Finish): `LoadLatent = '<previewUuid>.latent'`. The per-preview latent lives in `<project>/Media/.latents/<previewUuid>.latent`; `POST /comfy/stage-preview-latent` copies it into the active engine `input/` folder before the stage-2 submission.

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
