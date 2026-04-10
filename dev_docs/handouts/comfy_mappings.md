# ComfyUI Node Injection Standard

When modifying or integrating with ComfyUI workflows in this application, **NEVER use hardcoded Node IDs** (e.g., `workflow["14"]`). Node IDs are inherently unstable in ComfyUI and change whenever users rebuild or copy parts of the workflow.

Instead, the application uses **Title-Based Node Injection**. You must parse the workflow JSON and locate nodes dynamically based on their `_meta.title` property.

## How It Works
The user manually renames key parameter nodes in the ComfyUI UI. These custom names become the specific hooks our application uses to inject text prompts, settings, or seed values.

To find nodes to inject into, always use `filter` to support multiple nodes with the same title:
```javascript
const nodeIds = Object.keys(workflow).filter(id => workflow[id]._meta?.title === "Positive");
nodeIds.forEach(nodeId => {
    // Inject into .text, .value, or .int based on node class
    workflow[nodeId].inputs.text = "Your payload here";
});
```

## Standard Mapping Dictionary

When building new tools (like a Detailer, Upscaler, Video Maker) or parsing new workflows, adhere to this mapping standard.

The application will look for exactly these titles to inject data:

| Node `_meta.title` | Expected Value / Injection Target | Description |
| :--- | :--- | :--- |
| **"Positive"** | `inputs.value` (String) | Receives the positive text prompt. (Usually a PrimitiveStringMultiline node) |
| **"Negative"** | `inputs.value` (String) | Receives the negative text prompt. |
| **"Seed"** | `inputs.int` / `inputs.value` (Integer) | Receives the randomised or custom integer seed. Fallback: `noise_seed`. |
| **"Width"** | `inputs.value` (Integer) | Receives the render width dimension. |
| **"Height"** | `inputs.value` (Integer) | Receives the render height dimension. |
| **"Checkpoint"** | `inputs.ckpt_name` / `unet_name` / `model_name` (String) | The primary model filename (`.safetensors`). Alias: **"Model"**. |
| **"Checkpoint_Refiner"**| `inputs.ckpt_name` (String) | The refiner model filename (`.safetensors`). |
| **"Lora_1" to "Lora_6"** | `inputs.lora_name` (String), `inputs.strength_model`, `inputs.strength_clip` (Float) | Standard LoRA stack injection. |
| **"Use_Refiner"** | `inputs.boolean` or `inputs.value` | (Boolean) Standard toggle for refiner usage. |
| **"Output"** | N/A (Read-only) | **REQUIRED for Result Capture**. Identifying the final PreviewImage, SaveImage, SaveAudio, or SaveVideo node. Results from nodes without this exact title will be ignored. |
| **"Batch_Size"** | `inputs.value` (Integer) | Number of images to generate in a single batch. |
| **"Input_Image"** | `inputs.image` (Image) | Receives the input image for detailing, img2img, upscaling, img2vid. |
| **"Input_Video"** | `inputs.video` (String — absolute path) | Receives the absolute local path to the input video file from the project media folder. Used with `VHS_LoadVideoPath` node for video-to-video, interpolation, and upscaling workflows. |
| **"Input_Mask"** | `inputs.mask` (Mask) | Receives the image mask for inpainting/detailing. |
| **"Denoise"** | `inputs.denoise` / `inputs.value` (Float) | Denoising strength ("Power"). |
| **"Steps"** | `inputs.steps` / `inputs.value` (Integer) | Number of sampling steps. |
| **"Upscale_Model"** | `inputs.upscale_model` (String) | Name of the upscale model file (`.safetensors`). |
| **"sams"** | `inputs.ckpt_name` / `model_name` (String) | The segment anything / detection model filename. |
| **"Box"** | `inputs.boolean` (Boolean) | Toggle for box detection (true) vs segment (false). |
| **"Selected_Masks_Input"** | `inputs.text` / `picks` (String) | Comma-separated indices of masks to process (e.g. "1,3,5"). |
| **"Detected"** | N/A (Read-only) | **REQUIRED for Auto-Masking Preview**. Identifying the node that outputs detected objects as images. |
| **"Upscale_Factor"** | `inputs.float` / `inputs.value` (Float) | Factor to upscale (1.0 to 4.0). |
| **"Auto_Grid"** | `inputs.boolean` (Boolean) | Toggle for automatic grid split calculation. |
| **"Grid_H"** | `inputs.int` / `inputs.value` (Integer) | Number of horizontal grid splits. |
| **"Grid_V"** | `inputs.int` / `inputs.value` (Integer) | Number of vertical grid splits. |
| **"Creative"** | `inputs.boolean` (Boolean) | Toggle for creative vs standard upscaling. |

## Result Capture & Duplication Filtering
To prevent history duplication and ensure the application accurately captures generating intent, the system ignores all standard output nodes (e.g., Save Image, Preview Image) unless they are explicitly titled **"Output"** (case-insensitive).

1. The user must rename their desired final output node in the ComfyUI UI to exactly **"Output"**.
2. This allows the workflow to contain multiple preview or save nodes (e.g., intermediate steps) without triggering multiple entries in the application's history flow.
3. The system will collect all `images`, `audio`, and `video` results emitted by any node titled "Output".

*Note: If adding new parameters in the future (e.g., LoRA strengths, ControlNet images), define a clean, capitalized title (e.g., `"InputImage"`) and update this registry.*

### Node-Specific Injection Patterns
- **MpiNodes/Boolean**: Nodes of class `MpiBoolean` (often titled **"Use_Refiner"**) use `inputs.boolean` for their value.
- **Primitives**: Standard ComfyUI Primitive nodes use `inputs.value`.
- **KSamplers**: If a "Seed" primitive isn't found, the app attempts to inject directly into any node with `class_type` containing "KSampler" via `noise_seed` or `seed` inputs.

## The "Batch Number" Troubleshooting Report
**Issue:** Previous integrations of batch size often failed because they attempted to inject directly into the `Empty Latent Image` node or used hardcoded IDs like `workflow["5"]`. 

**What was wrong:** 
The `Empty Latent Image` node's `batch_size` input is frequently connected to an external **PrimitiveInt** node. If you try to overwrite the input on a node that is already connected to a link, ComfyUI ignores the API injection in favor of the link value. 

**The Fix:**
1. The user MUST rename the `PrimitiveInt` node to exactly **"Batch_Size"** (case-sensitive) in the ComfyUI UI.
3. This ensures the primitive drives the latent node correctly via the link, which is the only reliable way to override parameters in complex workflows.

## Workflow Caching & Asset Uploads
To enable ComfyUI's internal execution caching (preventing redundant runs when the seed/prompt hasn't changed), you must follow these rules for asset uploads:

1. **Use Static Filenames**: When uploading images or masks for a specific tool (like the Detailer), use a fixed filename (e.g., `mpi_detailer_input.png`) instead of a timestamped one. 
2. **Deterministic JSON**: By keeping the filenames constant in the workflow JSON, the server can identify that the prompt is identical to a previous run and skip execution.
3. **Cache Invalidation**: If the asset content actually changes (e.g., the user painted a new mask), the application must overwrite the static file on the server. ComfyUI will detect the file change on disk during the next execution.