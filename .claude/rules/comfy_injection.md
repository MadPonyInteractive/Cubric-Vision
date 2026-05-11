# ComfyUI Frontend Injection Rules (js/services/comfyController.js)

> **AI INSTRUCTION:** Injection works via node `_meta.title` — never hardcode node IDs. Use `filter` (not `find`) when locating nodes — multiple nodes can share a title. Never call ComfyUI directly from UI components; always go through `ComfyUIController`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves ComfyUI workflow execution.

**Title-based injection:** Target nodes exclusively by `_meta.title` (case-insensitive). Never hardcode node IDs. Use `filter` not `find` when locating nodes — multiple nodes can share a title.

**Never edit workflow JSON.** Files under `comfy_workflows/` are owned by the user — read-only for agents. Do not add, rename, or rewire nodes there. If a new injection target is required, document the contract (title + expected `inputs.*` field) in this file and in `.claude/rules/component-comfy.md`, then ask the user to add the node. Agents only write injection params on the frontend side.

**Never call ComfyUI directly** from UI components. All workflow calls go through `ComfyUIController.runWorkflow(...)` in `js/services/comfyController.js`.

**Required capture node:** Every workflow must have a node titled `"Output"` (case-insensitive). This is the canonical result node. Video Helper Suite nodes may emit final videos under `output.gifs`; inspect the filename/format because that payload can still be an MP4.

**Upload images/masks:** Pass Data URIs, blob URLs, http URLs, or local paths to `Input_Image` / `Input_Mask` — the controller uploads automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching.

**Selected history entry:** In Group History, `Input_Image` must come from the currently selected history item at execution time, not from mount-time props or the last history entry. Auto-mask detection in `MpiCanvasViewer` resolves `_currentItem.filePath` immediately before `runAutoMask(...)`; prompt-driven image ops in `MpiGroupHistoryBlock` use `_group.history[_currentIdx]`.

**Media slot completeness:** Model operations declare media slots through `commandRegistry.mediaInputs` and `commandExecutor._buildParams()` owns slot-to-title mapping. Every declared image/video/audio slot that has any compatible current media available MUST receive a current asset URL. Do not leave optional Comfy input nodes pointing at filenames saved inside the workflow JSON. If a workflow has multiple image inputs and the user supplies fewer images than slots, fill unassigned image slots with the first compatible image (for example, single-image `Start_Frame`/`End_Frame` image-to-video runs inject the start frame into both titles and use the boolean gate to control behavior). This rule applies to future multi-image, multi-video, and audio-capable workflows too.

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
| `"Denoise"` | `inputs.denoise` / `inputs.value` | Denoising strength |
| `"Steps"` | `inputs.steps` / `inputs.value` | Sampling steps |
| `"Upscale_Model"` | `inputs.upscale_model` | Upscale model filename |
| `"Upscale_Factor"` | `inputs.float` / `inputs.value` | 1.0 – 4.0 |
| `"Interp_Multiplier"` | `inputs.float` | Frame multiplier for RIFE VFI (2, 3, 4) |
| `"Auto_Grid"` / `"Creative"` | `inputs.boolean` | Upscaler toggles |
| `"Grid_H"` / `"Grid_V"` | `inputs.int` / `inputs.value` | Grid splits |
| `"sams"` | `inputs.ckpt_name` / `model_name` | SAM / detection model |
| `"Box"` | `inputs.boolean` | Box (true) vs segment (false) |
| `"Selected_Masks_Input"` | `inputs.text` / `picks` | Comma-separated mask indices |
| `"Preview_Only"` | `inputs.boolean` | **Required on multi-stage video workflows** (ops with `_ms` suffix). Boolean toggle: `true` halts the workflow at the preview stage; `false`/absent runs full final stage. See "Multi-stage video workflows" below. |
| `"Output"` | read-only | **Required** — final output node for result capture. Nodes without this title are ignored; capture `images` and VHS `gifs` payloads. |
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

## Multi-stage video workflows

Operations with `_ms` suffix (e.g. `t2v_ms`, `i2v_ms`) are **multi-stage**: a low-res preview pass plus a final pass, gated by a `Preview_Only` boolean node inside the workflow JSON.

**Authoring contract:** every `_ms` workflow file MUST contain:
- A `MpiBoolean` node titled `"Preview_Only"` whose `inputs.boolean` gates the preview/final branch.
- A capture node titled exactly `"Preview"` (typically `VHS_VideoCombine` saving to `temp/`) whose `gifs[]` payload is the preview clip.
- A capture node titled exactly `"Output"` (typically `VHS_VideoCombine` saving to `output/`) whose `gifs[]` payload is the final clip.

Single-stage workflows (no `_ms`) MUST NOT have the `Preview_Only` node and need only the `Output` capture node.

**Symptom of missing node:** when the user toggles "Preview initial stage" in PromptBox and runs, the gen completes a full final video instead of stopping at preview. `comfyController.runWorkflow` defensively scans for the node when `Preview_Only` is present in params; if missing, it strips the param and emits a `clientLogger.warn('comfy', 'Preview_Only requested but workflow has no matching node — running full generation')`. Check the dev console / `logs/app.log` first when preview mode silently produces a full video.

**Fix:** add a `Preview_Only` boolean node to the workflow JSON, wire it into the stage-branching logic (typically a Switch node before the final SaveVideo). Keep the title spelled exactly `Preview_Only` — case-insensitive match but spacing/underscores must be exact.

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
