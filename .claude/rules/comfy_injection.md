# ComfyUI Frontend Injection Rules (js/services/comfyController.js)

> **AI INSTRUCTION:** Injection works via node `_meta.title` — never hardcode node IDs. Use `filter` (not `find`) when locating nodes — multiple nodes can share a title. Never call ComfyUI directly from UI components; always go through `ComfyUIController`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves ComfyUI workflow execution.

**Title-based injection:** Target nodes exclusively by `_meta.title` (case-insensitive). Never hardcode node IDs. Use `filter` not `find` when locating nodes — multiple nodes can share a title.

**Node naming law (single, MPI-116 + MPI-252).** Every node the app reads from or writes into MUST be titled with an `Input_*` prefix (app injects INTO it) or `Output_*` prefix (app reads FROM it). This makes a workflow self-describing: an agent reads the API JSON and infers direction + role from the prefix with no per-workflow dictation. A genuinely new `inputs.*` field type still needs a one-line note from the user (the prefix gives direction, not which field to write). **Tier-1 (the old bare vocabulary — `Positive`, `Seed`, `Width`, `Output`, `Preview`, `Detected`, `Box`, …) is DEPRECATED (MPI-252):** the whole workflow fleet was converted, so every app-touched node is now `Input_*`/`Output_*`. The Standard Node Title Map below lists the canonical `Input_*`/`Output_*` titles. Workflow-internal helper nodes that the app never touches (e.g. a link-fed `Positive` CLIP node inside an upscaler, or `sams` on the auto-mask graph) keep their own titles — the law is only about nodes the app injects into or captures from.

**Input_ canonicalization (rename, not dual-emit — MPI-127 + MPI-252).** `commandExecutor._buildParams` builds params under bare control names then runs a pass that RENAMES every bare key to its `Input_` form and DELETES the bare key (keys already `Input_*`/`Output_*` pass through). There is no longer a tier-1 node to consume a bare key, so only the `Input_*` form is emitted. Injection matches node title EXACTLY and silently skips a param with no matching node (see silent-skip trap), so a title mismatch fails silently. When adding a new title you do NOT need a separate injection branch — title the node `Input_<Name>` and the control return `Input_<Name>` and it flows.

**Standalone injectors own ONLY the params they DECLARE (MPI-253, scoped by MPI-306).** When a tool op declares `injector: '<name>'`, `commandExecutor` runs the injector, then deletes both the bare key AND its `Input_` alias — **but only for the keys in that injector's `consumes` list**, never every `injectionParams` key. Three traps this closes: (1) an alias like `Input_flip` outliving the injector would hit the `Input_Flip` MpiIfElse `boolean` and set it `(val==='true')`=false, clobbering the injector's correct value — so `resize` must keep `flip` in `consumes`; (2) blanket deletion swallowed params the injector never handled (Head Swap's `Input_Tier` → every tier ran Hyper); (3) a params object built OUTSIDE `_buildParams` (e.g. `runAutoMask`) never gets the canonicalization pass, so it MUST use `Input_*` keys directly to match the tier-2 nodes (`Input_Box`, `Input_Points_Mode`). Full contract + the diagnostic pattern: § Standalone Workflow Injectors below.

**Enforce the law when handed new nodes.** When the user supplies a NEW ComfyUI workflow / new injection nodes whose app-touched titles are NOT prefixed `Input_*` / `Output_*`, do NOT silently invent a contract. Tell the user the node-naming law requires the `Input_*` / `Output_*` prefix on agent-relevant nodes, name the offending node titles, and ask them to re-title in their edit-version workflow and re-export the API JSON.

**Never edit workflow JSON. EVER.** Files under `comfy_workflows/` are owned by the user — strict read-only for agents. Do not add, rename, rewire, or change baked default values in any node there. If a new injection target is required, document the contract (title + expected `inputs.*` field) in this file and in `.claude/rules/component-comfy.md`, then ask the user to author the node in the ComfyUI graph editor and re-export the API JSON. The same rule applies even when the change looks trivial (e.g. flipping a baked default value). Agents only write injection params on the frontend side.

**Never call ComfyUI directly** from UI components. All workflow calls go through `ComfyUIController.runWorkflow(...)` in `js/services/comfyController.js`.

**Required capture node:** Every workflow must have a capture node — images title `Output_Image`, video `Output_Video`, preview `Output_Preview` (case-insensitive). This is the canonical result node. Video Helper Suite nodes may emit final videos under `output.gifs`; inspect the filename/format because that payload can still be an MP4. (The bare `"output"`/`"preview"` base string is kept in the matcher as a defensive fallback only; no shipping workflow titles a capture node without the `Output_` prefix — MPI-252.)

**Cache-hit dedupe (seedless workflows only):** `commandExecutor` watches ComfyUI's `execution_cached` WS event. If every node in `outputNodeIds` was served from cache AND the workflow has **no node titled `"Input_Seed"`**, `exec.cacheHit` is set and `generationService.onComplete` skips creating a new history entry / gallery card and shows a toast `"No changes, skipping..."`. Replace mode (`config.replaceItemId`) bypasses dedupe. **Convention:** every seeded workflow must include a node titled exactly `"Input_Seed"` (case-insensitive) — its presence disables the dedupe path, so seeded re-runs always produce a new entry. Universal/utility workflows (e.g. Upscale) lack an `"Input_Seed"` node, which is what allows their idempotent re-runs to dedupe.

**Upload images/masks:** Pass Data URIs, blob URLs, http URLs, or local paths to `Input_Image` / `Input_Mask` — the controller uploads automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching.

**Selected history entry:** In Group History, `Input_Image` must come from the currently selected history item at execution time, not from mount-time props or the last history entry. Auto-mask detection in `MpiCanvasViewer` resolves `_currentItem.filePath` immediately before `runAutoMask(...)`; prompt-driven image ops in `MpiGroupHistoryBlock` use `_group.history[_currentIdx]`.

**Media slot completeness:** Model operations declare media slots through `commandRegistry.mediaInputs` and `commandExecutor._buildParams()` owns slot-to-title mapping. Every declared image/video/audio slot that has any compatible current media available MUST receive a current asset URL. Do not leave optional Comfy input nodes pointing at filenames saved inside the workflow JSON. If a workflow has multiple image inputs and the user supplies fewer images than slots, fill unassigned image slots with the first compatible image (for example, single-image `Input_Start_Frame`/`Input_End_Frame` image-to-video runs inject the start frame into both titles and use the boolean gate to control behavior). This rule applies to future multi-image, multi-video, and audio-capable workflows too. **Audio slots are model-capability-gated:** the shared `i2v_ms`/`t2v_ms` ops declare an `Input_Audio_File` audio slot, but `filterMediaInputsForModel(slots, model)` (commandRegistry) drops it for models without `capabilities.audio` — so WAN never shows/accepts/injects audio, LTX does. Applied at both the PromptBox slot read point and `commandExecutor`'s slot map.

**Trimmed video media inputs:** When a video `mediaItem` has `trim: { in, out }`, `commandExecutor` prepares a temporary trimmed MP4 through `/api/video/trim-input` before title-based injection. Comfy still receives the normal `"Input_Video"` path, but it points at the temporary clip, not the full source. The route treats `out` as the last included frame, resets timestamps to zero, and the executor cleans the temp file after completion/error.

**Standard title map:** `"Input_Positive"`/`"Input_Negative"` → `inputs.value`, `"Input_Seed"` → `inputs.int`, `"Checkpoint"` → `inputs.ckpt_name`, `"Input_Lora_1"`…`"Input_Lora_6"` → `{ lora_name, strength_model, strength_clip }`, `"Input_Image"`/`"Input_Mask"` → auto-uploaded. Full table in `docs/comfy.md`.

See `docs/comfy.md` for the full injection pattern and example.

Staged LoRA models may also inject keys such as `"Lora_High_1"` and `"Lora_Low_1"`.
These use the same LoRA object shape as flat slots, and the controller writes
`lora_name` plus whichever strength input the workflow node exposes
(`strength`, `strength_model`, and/or `strength_clip`).

## Standard Node Title Map

| Title | Input field | Notes |
| :--- | :--- | :--- |
| `"Input_Positive"` | `inputs.value` | Positive prompt (was bare `Positive` pre-MPI-252) |
| `"Input_Negative"` | `inputs.value` | Negative prompt |
| `"Input_Seed"` | `inputs.int` / `inputs.value` | Falls back to `noise_seed` on any KSampler |
| `"Input_Width"` / `"Input_Height"` | `inputs.value` | Render dimensions |
| `"Checkpoint"` / `"Model"` | `inputs.ckpt_name` / `unet_name` / `model_name` | Primary checkpoint (workflow-internal loader, not a bare-title deprecation target) |
| `"Checkpoint_Refiner"` | `inputs.ckpt_name` | Refiner checkpoint |
| `"Input_Lora_1"` … `"Input_Lora_6"` | `inputs.lora_name`, `strength_model`, `strength_clip` | User LoRA slots — system LoRAs are baked in, not injected |
| `"Input_Lora_High_1"` ... `"Input_Lora_High_6"` | `inputs.lora_name`, `strength` / `strength_model` | WAN high-noise LoRA slots. Generated from `model.loraStages[].injectionPrefix` |
| `"Input_Lora_Low_1"` ... `"Input_Lora_Low_6"` | `inputs.lora_name`, `strength` / `strength_model` | WAN low-noise LoRA slots. Workflow node titles must be unique |
| `"Input_Use_Refiner"` | `inputs.boolean` / `inputs.value` | MpiBoolean uses `inputs.boolean` |
| `"Input_Batch_Size"` | `inputs.int` | `MpiInt` node driving Empty Latent via link. Value from PromptBox `batch` control (1–4). Workflow returns N images → N gallery cards (one per URL). |
| `"Input_Duration"` | `inputs.int` | `MpiInt` node — video length in seconds (1–30, step 1). Injected by PromptBox `duration` control on `t2v`, `i2v`, `t2v_ms`, `i2v_ms`. |
| `"Input_Motion_Intensity"` | `inputs.float` | `MpiFloat` node — motion strength (0.0–1.0, step 0.01). Injected by PromptBox `motionIntensity` control on `i2v`, `i2v_ms`. |
| `"Input_Image"` | `inputs.image` | Auto-uploaded by controller |
| `"Input_Mask"` | `inputs.mask` | Auto-uploaded by controller |
| `"Input_Start_Frame"` / `"Input_End_Frame"` | `inputs.image` | **(Tier-2 video frame slots — MPI-127.)** Start/end-frame image slots for `i2v` / `i2v_ms`, declared in `commandRegistry.mediaInputs`. Auto-uploaded. Replaced the legacy bare `Start_Frame` / `End_Frame` titles when WAN + LTX moved to tier-2 (both models share these titles now). `Input_End_Frame` is optional (gated by `Input_Use_End_Image`). |
| `"Input_Audio_File"` | `inputs.audio` | **(LTX-2.3 audio — MPI-127.)** `LoadAudio` node. Audio media slot on the shared `i2v_ms` / `t2v_ms` ops, capability-gated by `model.capabilities.audio` (LTX only; WAN never receives it). Auto-uploaded like image/video media. |
| `"Input_Use_Reference_Audio"` | `inputs.boolean` | **(LTX-2.3 audio mode — MPI-127.)** `MpiIfElse` gate. `true` → voice-ID from the reference clip. Set by the PromptBox `audioMode` control when an audio file is present and mode = Reference. No injection when audio absent (baked default wins). |
| `"Input_Use_Input_Audio"` | `inputs.boolean` | **(LTX-2.3 audio mode — MPI-127.)** `MpiSimpleBoolean` gate. `true` → use the input audio directly. Set by `audioMode` when audio present and mode = Original. Mutually exclusive with `Input_Use_Reference_Audio`. |
| `"Input_Use_Transition"` | `inputs.boolean` | **(LTX-2.3 — MPI-127.)** `MpiBoolean`. The i2v motion/lipsync enabler (`[[project-ltx-transition-lora-enables-lipsync]]`). Forced `true` by the `audioMode` control whenever audio is present (either mode). |
| `"Input_Use_Audio"` | `inputs.boolean` | **(LTX-2.3 — MPI-127.)** Master audio enable, baked `true` in the workflow. App does not currently inject this; listed so its title is reserved + recognized. |
| `"Input_Denoise"` | `inputs.float` | Denoising strength. `MpiFloat` node injected by `denoise` PromptBoxControl on `upscale` (default 0.20), `detail` (default 0.30), and PiD `pid` (default 0.0 → the workflow's degrade_sigma node, MPI-182). Per-op defaults via `commands[op].defaults.denoise` in `commandRegistry.js`; persisted under `modelSettings[modelId].operations[opName].denoise`. |
| `"Input_Type"` | `inputs.select` | **(PiD 4-path VAE selector — MPI-182.)** `MpiAnySwitch`, **1-INDEXED** (`select` starts at 1). Injected by the `pidVariant` PromptBoxControl on the `pid` op: 1=flux, 2=sd3, 3=qwen, 4=sdxl. NOTE: `select` was ADDED to the `comfyController._inject` target list for MPI-182 (MpiAnySwitch was previously un-injectable). |
| `"Input_Resolution"` | `inputs.select` | **(PiD output-size selector — MPI-182.)** `MpiAnySwitch`, **1-INDEXED**. Injected by the `pidResolution` PromptBoxControl on the `pid` op: 1=1K, 2=2K, 3=4K (native passthrough). |
| `"Input_Steps"` | `inputs.steps` / `inputs.value` | Sampling steps |
| `"Input_Upscale_Model"` | `inputs.upscale_model` | Upscale model filename |
| `"Input_Upscale_Factor"` | `inputs.float` / `inputs.value` | 1.0 – 4.0 |
| `"Input_Upscale_Using_Model"` | `inputs.boolean` | MpiBoolean (MpiIfElse) gate on `image_upscale.json` / `video_upscale.json`. `true` → routes through `Input_Upscale_Model` + `ImageUpscaleWithModel`. `false` → bypasses model, plain `ImageScaleBy` lanczos. Injected by `MpiToolOptionsUpscale` (`None` = `false`). |
| `"Input_Bg_Use_Color"` | `inputs.boolean` | **(Remove Background — MPI-260.)** `MpiIfElse` gate on `remove_background.json`. `false` → transparent RGBA (`JoinImageWithAlpha`); `true` → composite subject over a solid color (`ImageCompositeMasked` over `EmptyImage`). Injected by `MpiToolOptionsRemoveBg`. |
| `"Input_Bg_Color"` | `inputs.color` | **(Remove Background — MPI-260.)** `EmptyImage.color`, an INT `0xRRGGBB` (NOT hex string). `_handleApply` converts the picker hex → int. NOTE: `color` was ADDED to the `comfyController._inject` target field list for MPI-260 (a number field, coerced via `parseFloat`). |
| `"Input_Interp_Multiplier"` | `inputs.float` | Frame multiplier for RIFE VFI (2, 3, 4) |
| `"Input_Auto_Grid"` | `inputs.boolean` | Use-grid toggle (upscale) |
| `"Input_Grid_H"` / `"Input_Grid_V"` | `inputs.int` / `inputs.value` | Grid splits |
| `"sams"` | `inputs.ckpt_name` / `model_name` | SAM / detection model — workflow-internal node on `img_auto_mask.json`, keeps its own title (app injects it directly in `runAutoMask`, not via the naming law). |
| `"Input_Box"` | `inputs.boolean` | Box (true) vs segment (false). `MpiIfElse` on `img_auto_mask.json`. Injected directly by `runAutoMask` (MPI-253 — was bare `Box`). |
| ~~`"Input_Selected_Masks_Input"`~~ | — | **DELETED with its node (MPI-421).** Was comma-separated mask indices on an `ImpactSEGSPicker`. The picker trimmed the graph's masks to the chips selected at dispatch, which made every chip toggle a fresh run; it is gone, `Output_image` emits every detected object's mask, and the client picks between them. Do NOT re-add a pick input — `docs/masking-sam3.md` § One SEGS list, two outputs. |
| `"Input_Preview_Only"` | `inputs.boolean` | **Required on multi-stage base workflows** (ops with `_ms` suffix). `true` halts at the preview stage. Defensive-strip in `comfyController` removes the param when no matching node exists (the `_stage2.json` sibling lacks it). See "Multi-stage video workflows". |
| `"Input_Video_Latent"` | `inputs.latent` | **Required on every multi-stage workflow** (base + `_stage2`). `LoadLatent` node; filename basename in the active ComfyUI `input/` folder. Always injected by `commandExecutor`: stage-1 receives `ComfyUI_00001_.latent`; stage-2 receives the per-preview `<previewUuid>.latent` staged by `POST /comfy/stage-preview-latent`. (Was bare `LoadLatent` pre-MPI-252 — that key is dead; no runtime titles a node `LoadLatent`.) |
| `"Output_Image"` | read-only | Image capture node (`PreviewImage`/`SaveImage`), self-describing like `Output_Video`. Captured on the non-preview image path — `commandExecutor.js` matches `_imageOutputTitle = 'output_image'`. **TRAP (MPI-217):** matched on the EXACT lowercased title — a typo (e.g. `Ouptput_Image`) matches nothing → run completes with no error and reports `Generation completed but no output returned`. If a workflow generates fine (`Prompt executed in N seconds`) but the app captures nothing, check the capture node's title first. |
| `"Output_Video"` | read-only | **(Video pipeline — MPI-64, B3.)** Native `SaveVideo` node that writes the VIDEO into a `video/` SUBFOLDER under ComfyUI `output/`. Captured via `_collectComfyOutputUrls` reading its `videos[]` payload. Replaces the old `VHS_VideoCombine` (whose `nvenc_h264` encode fails on the Blackwell Pod). The 3 video utility workflows (resize_video/video_upscale/video_interpolate) now emit ONE `MpiSaveVideo` titled `Output_Video` with audio embedded (MPI-252); model video workflows still pair it with an optional `"Output_Audio"`, MUXED server-side (video master) in `routes/projects.js` via `services/ffmpegMux.js`. |
| `"Output_Audio"` | read-only | **(Video pipeline — MPI-64 2026-06-14, B3.)** Native `SaveAudioMP3`/`SaveAudio` node that writes audio into an `audio/` SUBFOLDER under ComfyUI `output/` (e.g. `output/audio/<op>_00001_.mp3`). Captured by `commandExecutor` `_collectComfyAudioUrl` from the node's `audio[]` payload (first entry → `/view` URL), threaded through `onComplete({audioUrl})` → `saveGeneration({audioViewUrl})` → the save route, which downloads it and muxes it into the video. **Present ONLY when the source had audio** — the workflow gates the audio with an `MpiHasAudio` (ffmpeg stream-probe on the input path) → `MpiIfElse`, because saving EMPTY audio throws and fails the run the same way `SaveVideo` does. When absent, the save keeps the silent video. NOTE: ComfyUI increments each save node's `_00001_` counter INDEPENDENTLY, so the video and audio sequence numbers do NOT match — pairing is by the SAME prompt's `executed` payloads (the two capture nodes), never by filename counter. |
| `"Output_Preview"` | read-only | **Required on multi-stage video workflows** — a `SaveVideo` carrying the preview clip on `Input_Preview_Only=true` runs. `commandExecutor.js` maps the preview-only capture title to `'output_preview'` (finals match `'output_video'`). No `Output_Audio` on preview (throwaway clip; audio only on the final `Output_Video`). (Was bare `Preview` pre-MPI-252 — the base `'preview'` string survives only as a defensive fallback.) |
| `"Output_Detected"` | read-only | Auto-mask DETECT preview node — the per-segment thumbnails. `img_auto_mask.json` (was bare `Detected` pre-MPI-252). |
| `"Output_image"` | read-only | Auto-mask per-pick MASK output on `img_auto_mask.json` — the ordered mask images captured after a pick. Note the lowercase `image` matches the actual node title on that workflow. (Was bare `Output` pre-MPI-252.) |

> When adding new params: use a capitalized title (e.g. `"Input_Video"`) and add it here.

### The silent-skip trap (MPI-242 / MPI-217)

Injection matches node title EXACTLY and **silently drops any param whose title matches no node** — no error, no log, no toast. THE mechanism behind a family of invisible bugs. **MPI-242 hit it twice:** a batch node titled `Input_Batch` never matched (the injector emits `Input_Batch_Size` — a PURE prefix, never abbreviated), so Batch N rendered 1 image in Krea2 *and* shipped Chroma; and `Input_Is_i2i` existed only in source COMMENTS, so Krea2 i2i ran as t2i for four sessions. Branch selection is now `ModelDef.opInject` — a per-model op → `Input_wf_type` int, since every image model is one master graph whose other branches lazy evaluation prunes (MPI-365). `CommandDef.injectParams`, the older per-OP mechanism, still exists and is still supported but **nothing declares it any more**: `control` lost `Input_depth_reference` and `i2i` lost `Input_Is_i2i` when SDXL migrated. Neither mechanism removes the skip — a wrong title in EITHER is silently dropped. **The diagnostic the injector refuses to give is `tests/inject-params-titles.test.cjs`** — it asserts every `injectParams` AND every `opInject` title exists in every workflow its op runs; run it when wiring a new op onto a shared graph. Also trace a gated control to its real consumer before mounting it: `denoise` reaches the sampler only on the branches that VAE-encode a latent, so it is live on i2i/control and inert on t2i. Same family as the `Output_Image` typo trap (title-map row) and the MPI-229/198 path-heal separator mismatches.

### LoRA slot injection — bypass, choke point, clip-knob trap

- **Single choke point (MPI-223):** the `{lora_name, strength_model, strength_clip}` object for every `Input_Lora_*` slot is assembled in exactly ONE place — `commandExecutor.js` `_loraSlotParam` — **upstream of the local/remote engine split**. Any per-slot LoRA logic (bypass, normalization, defaults) belongs there so both engines get it. Don't add slot logic downstream of the split.
- **Bypass mechanic (MPI-223):** the per-slot bypass toggle injects `strength_model=0, strength_clip=0` (it does NOT remove the node or reload the model — that would OOM; see [[feedback_lora_ab_use_strength_not_bypass]]). A slot whose file is absent is **silently skipped**, not blocked.
- **`loraStrengths` clip-knob trap (MPI-224):** a model's `loraStrengths` array controls which strength inputs the PromptBox exposes AND injects. LTX shipped with `['model']`, which silently pinned `strength_clip=1.0` even though the node has a live `strength_clip` input; fixed to `['model','clip']`. **Chroma/Wan still declare `['model']` and were NOT audited** (user-scoped). If a "clip knob missing / clip strength stuck" bug surfaces on those models, audit their `loraStrengths` against the actual node graph first.

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
- **Every `INJECTORS` entry is `{ inject, consumes }` and ONLY the declared
  `consumes` keys are deleted from the generic params map (MPI-306,
  `331c3ca5`).** A new injector MUST export its `consumes` list;
  `tests/injector-consumes.test.cjs` fails if one doesn't. Current entries:
  `resize` and `headSwap` (`js/services/workflowInjectors/index.js`).
- Current injector: `resize` (`resize` and `resizeVideo` ops). It writes:
  `"Resize Image v2"` inputs `width`, `height`, `upscale_method`,
  `keep_proportion`, `pad_color`, `crop_position`, `divisible_by`, `device`;
  `"Input_Flip_Image"` (ImageFlip) input `flip_method`; `"Input_Rotate_Image"`
  (ImageRotate) input `rotation`; and `"Input_Flip"` (MpiIfElse) input `boolean`
  (the enable gate: true routes through the flip node). `resize` must keep
  `flip` in its `consumes` list — otherwise the `Input_flip` alias reaches the
  generic injector and overwrites the correct boolean with `false` (MPI-253's
  original trap; the deletion is now scoped, not blanket).
- **Why the allowlist exists.** `commandExecutor` used to delete **every**
  `injectionParams` key after running an injector, assuming an injector consumes
  everything handed to it. `headSwapInjector` handles only `box1`/`box2`, so Head
  Swap's `Input_Tier` — sent in the same object — was deleted before the generic
  title injector could write it. Node 95 kept its baked `3` and
  **Quality/Turbo/Hyper all ran Hyper.** An op pairing a custom injector with
  generic params is the danger shape.
- **Diagnostic pattern:** a control that "does nothing" and produces no error, no
  log line, and a perfectly-wired graph → suspect something DELETED the param
  before injection, before suspecting the model, the graph or performance. Here
  the only symptom was "the tiers take the same time" — a timing observation.
- Universal video tool trim prep is not a workflow injector; it happens before
  `_buildParams()` so all video operations with declared media slots can receive
  the temporary clipped input path.

## Multi-stage video workflows

Operations with an `_ms` suffix (`t2v_ms`, `i2v_ms`) run a low-res preview pass plus a final
pass that consumes the saved stage-1 latent, implemented as **two separate workflow files**.
The full contract — two-file convention, per-file authoring requirements, `resolveWorkflowFile`,
the LoadLatent injection contract, dual-latent (LTX), THE VALIDATION TRAP, and preview
support-asset validation / cold fallback — lives in
[comfy_injection_multistage.md](comfy_injection_multistage.md).

## Image & Mask Uploads
Pass `Input_Image` / `Input_Mask` as Data URIs, blob URLs, http URLs, or local project paths — controller uploads them automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching; overwrite the file when content changes.

For Group History actions, always resolve the source image/video from the selected history entry at the moment the action starts. Do not cache the initial mount URL for later ComfyUI injection; history selection changes without remounting `MpiCanvasViewer`.

## Example
```javascript
const params = {
    "Input_Positive": "A landscape",
    "Input_Seed": 45678,
    "Input_Upscale_Model": "4x_NMKD-Siax_200k.pth",
    "Input_Lora_1": { lora_name: "my_lora.safetensors", strength_model: 0.8, strength_clip: 0.8 },
    "Input_Lora_High_1": { lora_name: "wan 2.2\\foo_HIGH.safetensors", strength_model: 0.8, strength_clip: 1.0 },
    "Input_Image": "data:image/png;base64,..."
};
const result = await ComfyUIController.runWorkflow('sdxl_t2i', params, onProgress);
```
