# ComfyUI Integration

ComfyUI is the generation engine. Communication is via REST + WebSocket.

> **Remote engine:** ComfyUI can run on a RunPod Pod instead of locally. The renderer
> keeps the same controller/executor contracts; only the transport changes (Express
> `/proxy/*` forward + a renderer-direct binary-preview WS). See
> [runpod-remote-engine.md](runpod-remote-engine.md). Video output uses the portable
> `CreateVideo → SaveVideo` split (titles `Output_Video`/`Output_Audio`/`Preview`),
> captured workflow-agnostically by `_collectComfyOutputUrls` reading `videos[]`.

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
- Operation-specific injectors: if `COMMANDS[payload.operation].injector` is set, `runCommand()` applies `INJECTORS[name](workflow, payload.injectionParams || {})` after loading workflow JSON and before submitting it.
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

### Workflow Injectors

Most workflow mutation is handled by the standard title-keyed params map passed
to `ComfyUIController.runWorkflow()`. Some tool-panel utility workflows need
more specific mutation than `_buildParams()` provides. Those operations declare
an injector in `commandRegistry.js`:

```javascript
resize: {
    universal: true,
    injector: 'resize',
}
```

`commandExecutor.runCommand()` resolves the injector from
`js/services/workflowInjectors/index.js` and calls it with the loaded workflow
JSON plus `payload.injectionParams`. The injector mutates the workflow object in
place and must target nodes by `_meta.title`, not numeric node IDs. After the
injector runs, those consumed operation-specific params are removed from the
generic title-keyed params map so names like `flip` cannot collide with a
workflow node titled `Flip`.

Current injector:
- `resize` (`js/services/workflowInjectors/resizeInjector.js`) shared by
  `resize` and `resizeVideo`. It writes Resize Image v2, ImageFlip, Image Rotate,
  and the Boolean node titled Flip. Media inputs (`Input_Image`, `Input_Video`) and
  Output capture remain handled by the standard command executor/controller path.

Resize live preview (image AND video workspaces) calls `runCommand` directly with
`previewOnly: true` AND `suppressLifecycleEvents: true`. The compound extracts a
512px-longest-edge thumbnail from the source via `viewer.el.getSourceElement()`
(HTMLImageElement on the canvas viewer, HTMLVideoElement first frame on the
video viewer) and submits it through the **image** `resize` workflow with
`width`/`height`/`divisible_by` proportionally scaled to thumbnail space. The
result paints into an inline `<img>` slot inside the resize tool panel — viewer
canvas / video stays untouched. `previewOnly` is the existing client-side
"do not save" hint; `suppressLifecycleEvents: true` suppresses
`tool:sampling-start` / `tool:loading-model` emits because tool-panel previews
bypass `generationService` and have no `tool:running`/`tool:idle` pair to
bracket them — without suppression, StatusBar would be left in active state with
its elapsed timer running. Multi-stage `_ms` previews go through
`generationService` and DO want lifecycle events; the suppression is gated on
the explicit flag, NOT on `previewOnly`. The executor still captures the
workflow `Output` node for resize; only `_ms` video preview workflows switch
capture to `Preview`. Apply (image or video) always re-runs the workflow at
full resolution via `startGeneration`; there is no fast-path / preview-URL
reuse.

### Multi-stage workflows

Full authoring contract (two-file convention, `LoadLatent` injection, `Preview` vs `Output` capture, WAN baked-vs-live LoRA semantics, LTX flat-LoRA + `allowsBranchingContinue: false`) lives in `.claude/rules/comfy_injection.md` § "Multi-stage video workflows". Read it before touching `_ms` ops.

## assetService (`js/services/assetService.js`)

Loads available LoRA and upscale model filenames from `GET /comfy/list-files` into `state.availableLoras` and `state.upscaleModels`. Called lazily on ModelSettings open.

### `/comfy/list-files?subDir=<path>`

Recursively walks the requested `subDir` under the resolved models root (custom root from `extra_model_paths.yaml` when set, else engine default). Returns relative paths from `subDir` for files with extensions `.safetensors | .ckpt | .pt | .bin | .pth`. Only scans the requested bucket — does NOT return siblings from other top-level folders (checkpoints, sams, ultralytics, etc).

For `loras` and `upscale_models`, the route also scans user-configured additive
folders from `extra_model_folders.json`. Those extras are bucket folders (for
example, a folder directly containing LoRAs), not parent models roots. Results
from the primary bucket win on same relative filename collisions, and the
response shape stays `{ success: true, files: string[] }`.

### `/comfy/extra-folders`

`GET /comfy/extra-folders` returns the persisted additive folders:

```json
{ "success": true, "folders": { "loras": [], "upscale_models": [] } }
```

`POST /comfy/extra-folders` accepts the same shape without the wrapper,
validates that every path exists, writes `extra_model_folders.json`, and
rewrites `extra_model_paths.yaml`.

Extras are re-merged whenever `/comfy/set-path` rewrites YAML. Clearing the
primary models path removes `extra_model_paths.yaml` only when no extras are
configured; with extras present, YAML is regenerated against the default
models root so ComfyUI still sees the additive folders on restart.

**Default models root.** `getDefaultModelsRoot()` (`routes/shared.js`) returns
`CUBRIC_MODELS_ROOT` when set — the portable launchers export it as
`<portable-root>/models`, OUTSIDE the engine folder — falling back to
`<ENGINE_ROOT>/mpi_models` only in dev/no-env runs. `mpi_models` is legacy and
must not be hardcoded; engine install/upgrade write the YAML and create the
folder via `getDefaultModelsRoot()`. The YAML is additive: the active root is the
`comfyui:` block and the default root is always emitted as a separate
`comfyui_default:` block so repointing the folder adds a search location rather
than replacing it.

### LoRA and upscaler visibility

LoRA dropdowns show every file returned from the active models root `loras/`
folder. The app does not filter LoRAs by `model.type` because users control their
own LoRA folder names and conventions.

Upscale model dropdowns still use model-type filtering where appropriate, with
root-level files treated as universal.

`MpiModelSettings` accepts both legacy registry dependency IDs and raw filenames
for `upscaleModel`. Registry defaults still resolve through `DEPS`; user-picked
extra-folder upscalers persist as raw filenames and inject that filename into
the `Upscale_Model` workflow node.

## Download Manager

### Architecture Overview

The download manager is a **frontend + backend IPC system** with **resumable downloads**. Communication flows:

```
js/services/downloadService.js  ←→  REST/POST  →  routes/downloadManager.js
       ↑ SSE /comfy/downloads/stream  ←  SSE broadcast ←┘
       ↓ Events.emit(...)
   Components subscribe
```

The backend uses `node-downloader-helper` under the hood. NDH writes directly to the final filename, so Cubric creates `<file>.cubricdl` sidecars while managed downloads are in progress. Installed-state checks require `exists && no sidecar`, which prevents a killed partial model from being treated as installed.

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
- `GET /comfy/downloads/active` — active model downloads plus engine-download flag for Electron quit warnings
- `GET /comfy/downloads/stream` — SSE broadcast channel
- `POST /comfy/models/uninstall` — uninstall a model
- `POST /engine/pause` / `engine/resume` — pause/resume active engine downloads

**ResumableDownloader class** (`routes/downloadManager.js`):
A wrapper around `node-downloader-helper` that adds SHA256 verification and SSE progress broadcasting.
- `_downloader`: `DownloaderHelper` instance with `{ resume: true }`
- `.download()`: starts fresh or, on a fresh app instance, resumes from a final-filename partial only when `<file>.cubricdl` exists
- `.abort()`: pauses and retains instance for later resume
- `.resume()`: in-session resume uses the same instance via `getResumeState()` + `resumeFromFile()`
- On completion: verifies `sha256Expected` against downloaded file, clears `<file>.cubricdl`, then marks dep `complete`
- On SHA256 mismatch: deletes the file, clears the marker, and marks dep `failed`

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
