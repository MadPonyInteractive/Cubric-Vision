# ComfyUI Integration

ComfyUI is the generation engine. Communication is via REST + WebSocket.

## comfyController (`js/services/comfyController.js`)

Singleton that manages the ComfyUI server lifecycle and workflow execution.

- `ensureServerRunning()`: Starts ComfyUI if not running (calls `POST /comfy/start`).
- `queuePrompt(workflow, prompt)`: Enqueues a workflow via REST.
- `runWorkflow(workflowFile, params, onProgress?)`: Loads workflow JSON, uploads input assets, injects params by node `_meta.title`, captures `Output` node results via WebSocket.
- `interrupt()`: Aborts running generation.
- `generateRandomSeed()`: Returns a random seed for the Seed node.

## commandExecutor (`js/services/commandExecutor.js`)

Orchestrates a full generation request.

- `runCommand(payload)`: Single argument — a `RunPayload` object `{ operation, modelId, positive, negative, seed?, injectionParams?, mediaItems?, maskDataUrl? }`. Resolves workflow file, builds title-keyed param map (including `injectionParams` for PromptBox controls), runs via comfyController, captures Output node.
- `runAutoMask(imageData, modelId, params, onProgress?)`: Runs auto-mask workflow, captures both `Detected` and `Output` nodes.
- `_depFilename(depId)`: Maps dep ID to filename.
- `_resolveWorkflowFile(operation, modelId)`: Returns workflow JSON path.
- `_buildParams(payload)`: Builds the title→value map for injection. Merges `payload.injectionParams` (from PromptBox controls) into the params object alongside standard fields (Positive, Negative, Seed, media slots).

## Workflow Injection Pattern

Nodes are matched by `_meta.title` (case-insensitive). Example:

```javascript
const params = {
    "Positive": "A landscape",
    "Seed": 45678,
    "Checkpoint": "sdxl-realistic.safetensors",
    "Lora_1": { lora_name: "my_lora.safetensors", strength_model: 0.8, strength_clip: 0.8 },
    "Input_Image": "data:image/png;base64,..."
};
```

Known titles: "Positive", "Negative", "Seed", "Checkpoint", "Lora_1"…"Lora_6", "Input_Image", "Input_Mask", "Output", "Detected", "Upscale_Model", etc. See `.claude/rules/comfy_injection.md` for the full table.

**Static filenames for uploads** (e.g. `mpi_detailer_input.png`) enable ComfyUI execution caching.

## assetService (`js/services/assetService.js`)

Loads available LoRA and upscale model filenames from `GET /comfy/list-files` into `state.availableLoras` and `state.upscaleModels`. Called lazily on ModelSettings open.

## Download Manager

### Frontend — `js/services/downloadService.js`
Singleton that owns the frontend download queue.

- `start(modelId, dependencies)`: Enqueue a model for download via backend SSE.
- `pause(modelId)` / `resume(modelId)` / `cancel(modelId)`: Control an active download.
- `uninstall(modelId, dependencies)`: Remove model files via backend.
- SSE stream at `/comfy/downloads/stream` is auto-connected on first `start()` call.
- Emits Events for all download state transitions (`download:started`, `download:progress`, etc.).

### Backend — `routes/downloadManager.js`
Non-blocking download router using `node-downloader-helper` with pause/resume support.

**Endpoints:**
- `POST /comfy/models/download/start` — enqueue a model's dependencies
- `POST /comfy/models/download/pause` / `resume` / `cancel`
- `GET /comfy/downloads/status` — full queue snapshot
- `GET /comfy/downloads/stream` — SSE broadcast channel
- `POST /comfy/models/uninstall` — uninstall a model

### State Keys
In `js/state.js`:
- `downloadJobs[]` — `DownloadJob[]` array, persisted for shutdown recovery
- `downloadQueueActive` — `boolean`, true when any download is in progress
- `comfyNeedsRestart` — `boolean`, true after custom node install; triggers auto-restart in `ensureServerRunning()`

### ComfyUI Auto-Restart
When `comfyNeedsRestart` is true, `ensureServerRunning()` in `comfyController.js` stops ComfyUI, starts it again with `{ isUserRestart: true }`, and polls until ready before any generation proceeds.
