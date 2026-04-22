# ComfyUI Frontend Injection Rules (js/services/comfyController.js)

> **AI INSTRUCTION:** Injection works via node `_meta.title` — never hardcode node IDs. Use `filter` (not `find`) when locating nodes — multiple nodes can share a title. Never call ComfyUI directly from UI components; always go through `ComfyUIController`.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves ComfyUI workflow execution.

**Title-based injection:** Target nodes exclusively by `_meta.title` (case-insensitive). Never hardcode node IDs. Use `filter` not `find` when locating nodes — multiple nodes can share a title.

**Never call ComfyUI directly** from UI components. All workflow calls go through `ComfyUIController.runWorkflow(...)` in `js/services/comfyController.js`.

**Required capture node:** Every workflow must have a node titled `"Output"` (case-insensitive). This is the canonical result node.

**Upload images/masks:** Pass Data URIs, blob URLs, http URLs, or local paths to `Input_Image` / `Input_Mask` — the controller uploads automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching.

**Standard title map:** `"Positive"`/`"Negative"` → `inputs.value`, `"Seed"` → `inputs.int`, `"Checkpoint"` → `inputs.ckpt_name`, `"Lora_1"`…`"Lora_6"` → `{ lora_name, strength_model, strength_clip }`, `"Input_Image"`/`"Input_Mask"` → auto-uploaded. Full table in `docs/comfy.md`.

See `docs/comfy.md` for the full injection pattern and example.

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
| `"Use_Refiner"` | `inputs.boolean` / `inputs.value` | MpiBoolean uses `inputs.boolean` |
| `"Batch_Size"` | `inputs.int` | `MpiInt` node driving Empty Latent via link. Value from `MpiBatchSelector` (1–4). Workflow returns N images → N gallery cards (one per URL). |
| `"Input_Image"` | `inputs.image` | Auto-uploaded by controller |
| `"Input_Mask"` | `inputs.mask` | Auto-uploaded by controller |
| `"Denoise"` | `inputs.denoise` / `inputs.value` | Denoising strength |
| `"Steps"` | `inputs.steps` / `inputs.value` | Sampling steps |
| `"Upscale_Model"` | `inputs.upscale_model` | Upscale model filename |
| `"Upscale_Factor"` | `inputs.float` / `inputs.value` | 1.0 – 4.0 |
| `"Auto_Grid"` / `"Creative"` | `inputs.boolean` | Upscaler toggles |
| `"Grid_H"` / `"Grid_V"` | `inputs.int` / `inputs.value` | Grid splits |
| `"sams"` | `inputs.ckpt_name` / `model_name` | SAM / detection model |
| `"Box"` | `inputs.boolean` | Box (true) vs segment (false) |
| `"Selected_Masks_Input"` | `inputs.text` / `picks` | Comma-separated mask indices |
| `"Output"` | read-only | **Required** — final output node for result capture. Nodes without this title are ignored. |
| `"Detected"` | read-only | **Required** — auto-masking preview output node |

> When adding new params: use a capitalized title (e.g. `"Input_Video"`) and add it here.

## Image & Mask Uploads
Pass `Input_Image` / `Input_Mask` as Data URIs, blob URLs, http URLs, or local project paths — controller uploads them automatically. Use **static filenames** (e.g. `mpi_detailer_input.png`) to enable ComfyUI execution caching; overwrite the file when content changes.

## Example
```javascript
const params = {
    "Positive": "A landscape",
    "Seed": 45678,
    "Upscale_Model": "4x_NMKD-Siax_200k.pth",
    "Lora_1": { lora_name: "my_lora.safetensors", strength_model: 0.8, strength_clip: 0.8 },
    "Input_Image": "data:image/png;base64,..."
};
const result = await ComfyUIController.runWorkflow('sdxl_t2i', params, onProgress);
```
