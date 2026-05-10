# ComfyUI Integration

ComfyUI is the generation engine. Communication is via REST + WebSocket.

## comfyController (`js/services/comfyController.js`)

Singleton that manages the ComfyUI server lifecycle and workflow execution.

- `ensureServerRunning()`: Starts ComfyUI if not running (calls `POST /comfy/start`).
- `runWorkflow(workflowFile, params, onProgress?)`: Loads workflow JSON, uploads input assets, injects params by node `_meta.title`, captures `Output` node results via WebSocket, and routes messages by ComfyUI `prompt_id` so queued jobs complete into the correct active-generation entry.
- `getQueue()`: Reads ComfyUI's native queue and returns `{ running, pending }`.
- `clearQueue()`: Clears pending ComfyUI jobs without interrupting the current job.
- `deleteQueueItem(promptId)`: Removes one pending ComfyUI queue item.
- `interrupt()`: Aborts running generation.
- `generateRandomSeed()`: Returns a random seed for the Seed node.

## commandExecutor (`js/services/commandExecutor.js`)

Orchestrates a full generation request.

- `runCommand(payload)`: Single argument — a `RunPayload` object `{ operation, modelId, positive, negative, seed?, injectionParams?, mediaItems?, maskDataUrl? }`. Resolves workflow file, builds title-keyed param map (including `injectionParams` for PromptBox controls), runs via comfyController, captures Output node.
- `runAutoMask(imageData, modelId, params, onProgress?)`: Runs auto-mask workflow, captures both `Detected` and `Output` nodes.
- `_depFilename(depId)`: Maps dep ID to filename.
- `_resolveWorkflowFile(operation, modelId)`: Returns workflow JSON path.
- `_buildParams(payload)`: Builds the title→value map for injection. Merges `payload.injectionParams` (from PromptBox controls) into the params object alongside standard fields (Positive, Negative, Seed, media slots).
- Execution handles expose `promptId`, `seed`, and `onPromptAck`. `generationService` stores `promptId` in `activeGenerations` and saves the resolved seed on generated items.

## Generation Flow — Cue + Loop

There is one execution path: the in-app Cue queue in `generationService.js`. Loop is a session-only boolean (`state.loopArmed`) layered on top — never persisted to `project.json`. There is no Single mode.

- **Cue (default)**: tap Cue button or `Ctrl+Enter` enqueues one job into `_cueQueue`. Only ONE prompt is ever submitted to ComfyUI at a time (single-dispatch); Comfy never holds pending. `state.generationQueueCount = _cueQueue.length + (_cueDispatchInFlight ? 1 : 0)` updated synchronously on enqueue/dispatch — no Comfy polling. Stop interrupts the current job; the dispatcher pulls the next pending item. Clear empties `_cueQueue` (current job continues). API: `enqueueGeneration(config, callbacks, opts)`.
- **Loop**: `state.loopArmed = true` — set by holding the Cue button ≥700ms or `Ctrl+L`. When the dispatcher drains to empty AND `loopArmed`, it re-fires using the last job's `getNextGeneration` callback (live PromptBox payload — model/op/prompt/media at re-fire time). Re-fire triggers on complete, cancel, AND error. Only flipping `loopArmed = false` (tap Cue while armed, or Ctrl+L) halts re-fire.

Cue StatusBar progress is per active generation, not aggregate across the full queue. The dispatcher waits for the current lifecycle to unwind before starting the next queued item.

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

Models with staged LoRAs, such as WAN, inject title keys from `model.loraStages`.
WAN uses `Lora_High_1` ... `Lora_High_6` and `Lora_Low_1` ... `Lora_Low_6`.
ComfyUI nodes may expose either `strength` or `strength_model`; the injector supports both.

**Static filenames for uploads** (e.g. `mpi_detailer_input.png`) enable ComfyUI execution caching.

## assetService (`js/services/assetService.js`)

Loads available LoRA and upscale model filenames from `GET /comfy/list-files` into `state.availableLoras` and `state.upscaleModels`. Called lazily on ModelSettings open.

### `/comfy/list-files?subDir=<path>`

Recursively walks the requested `subDir` under the resolved models root (custom root from `extra_model_paths.yaml` when set, else engine default). Returns relative paths from `subDir` for files with extensions `.safetensors | .ckpt | .pt | .bin | .pth`. Only scans the requested bucket — does NOT return siblings from other top-level folders (checkpoints, sams, ultralytics, etc).

### LoRA and upscaler visibility

LoRA dropdowns show every file returned from the active models root `loras/`
folder. The app does not filter LoRAs by `model.type` because users control their
own LoRA folder names and conventions.

Upscale model dropdowns still use model-type filtering where appropriate, with
root-level files treated as universal.

## Download Manager

### Architecture Overview

The download manager is a **frontend + backend IPC system** with **resumable downloads**. Communication flows:

```
js/services/downloadService.js  ←→  REST/POST  →  routes/downloadManager.js
       ↑ SSE /comfy/downloads/stream  ←  SSE broadcast ←┘
       ↓ Events.emit(...)
   Components subscribe
```

The backend uses `node-downloader-helper` under the hood, which writes `.part` files to enable resume after pause/cancel.

### Frontend — `js/services/downloadService.js`
Singleton that owns the frontend download queue.

- `start(modelId, dependencies)`: Enqueue a model for download via backend SSE.
- `pause(modelId)` / `resume(modelId)` / `cancel(modelId)`: Control an active download.
- `uninstall(modelId, dependencies)`: Remove model files via backend.
- SSE stream at `/comfy/downloads/stream` is auto-connected on first `start()` call.
- Emits Events for all download state transitions (`download:started`, `download:progress`, etc.).
- On reconnect (SSE `open`), fetches `/comfy/downloads/status` to recover state and repopulate `state.downloadJobs`.

### Backend — `routes/downloadManager.js`
Non-blocking download router using `node-downloader-helper` with pause/resume support.

**Endpoints:**
- `POST /comfy/models/download/start` — enqueue a model's dependencies
- `POST /comfy/models/download/pause` / `resume` / `cancel`
- `GET /comfy/downloads/status` — full queue snapshot
- `GET /comfy/downloads/stream` — SSE broadcast channel
- `POST /comfy/models/uninstall` — uninstall a model
- `POST /engine/pause` / `engine/resume` — pause/resume active engine downloads

**ResumableDownloader class** (`routes/downloadManager.js`):
A wrapper around `node-downloader-helper` that adds SHA256 verification and SSE progress broadcasting.
- `_downloader`: `DownloaderHelper` instance with `{ resume: true }`
- `.download()`: starts fresh or resumes from `.part` file
- `.abort()`: pauses and retains instance for later resume
- `.resume()`: resumes from the stored `.part` file using `getResumeState()`
- On completion: verifies `sha256Expected` against downloaded file, then marks dep `complete`
- On SHA256 mismatch: deletes the file and marks dep `failed`

**Job storage:**
- `_depJobs Map<depId, DepJob>` — individual dependency jobs (URL, bytes, status, refCount, sha256)
- `_modelJobs Map<modelId, DownloadJob>` — model-level aggregate job (totalBytes, downloadedBytes, speed, progress, deps[])
- `_activeDownloaders Map<depId, ResumableDownloader>` — actively downloading
- `_pausedDownloaders Map<depId, ResumableDownloader>` — paused but kept for resume
- `_sseClients Set<res>` — SSE subscribers

**RefCount:** Each `depId` can be shared across multiple model jobs. `refCount` tracks how many model jobs reference it. A dep is only cancelled/aborted when `refCount` reaches 0.

### State Keys
In `js/state.js`:
- `downloadJobs[]` — `DownloadJob[]` array, persisted for shutdown recovery
- `downloadQueueActive` — `boolean`, true when any download is in progress
- `comfyNeedsRestart` — `boolean`, true after custom node install; triggers auto-restart in `ensureServerRunning()`

### Download Events (Lifecycle)

| Event | Direction | When |
| --- | --- | --- |
| `download:started` | Backend→SSE→Frontend | Model job enqueued and downloading begins |
| `download:progress` | Backend→SSE→Frontend | Per-dep bytes/speed updated, throttled 1/sec on backend |
| `download:complete` | Backend→SSE→Frontend | All deps verified SHA256 and complete |
| `download:failed` | Backend→SSE→Frontend | SHA256 mismatch or network error |
| `download:paused` | Backend→SSE→Frontend | User paused or pause/resume cycle |
| `download:resumed` | Backend→SSE→Frontend | User resumed |
| `download:cancelled` | Backend→SSE→Frontend | User cancelled or shutdown |
| `download:uninstalled` | Backend→SSE→Frontend | Model uninstalled |
| `download:installing` | Backend→SSE→Frontend | Custom node `requirements.txt` pip install in progress |
| `comfy:needs-restart` | Backend→SSE→Frontend | Custom node install done; ComfyUI needs auto-restart |

### ComfyUI Auto-Restart
When `comfyNeedsRestart` is true, `ensureServerRunning()` in `comfyController.js` stops ComfyUI, starts it again with `{ isUserRestart: true }`, and polls until ready before any generation proceeds.
