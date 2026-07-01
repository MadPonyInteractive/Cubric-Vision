# Download Manager

Resumable model-download system (frontend + backend IPC + SSE). Split out of
[comfy.md](comfy.md) (MPI-170). For remote/Pod download behaviour and the
silent-stall belt, see [runpod-troubleshooting.md](runpod-troubleshooting.md).

## Architecture Overview

The download manager is a **frontend + backend IPC system** with **resumable downloads**. Communication flows:

```
js/services/downloadService.js  ←→  REST/POST  →  routes/downloadManager.js
       ↑ SSE /comfy/downloads/stream  ←  SSE broadcast ←┘
       ↓ Events.emit(...)
   Components subscribe
```

The backend uses `node-downloader-helper` under the hood. NDH writes directly to the final filename, so Cubric creates `<file>.cubricdl` sidecars while managed downloads are in progress. Installed-state checks require `exists && no sidecar`, which prevents a killed partial model from being treated as installed.

## Frontend — `js/services/downloadService.js`
Singleton that owns the frontend download queue.

- `start(modelId, dependencies)`: Enqueue a model for download via backend SSE.
- `pause(modelId)` / `resume(modelId)` / `cancel(modelId)`: Control an active download.
- `uninstall(modelId, dependencies)`: Remove model files via backend.

> **Operation-selectable models (MPI-122).** `dependencies` here is ALWAYS a
> resolved, flat dep array. For operation-keyed models (e.g. Wan 2.2) the
> renderer runs `resolveDeps(model, selectedOps)` at the call site — install uses
> the user's op selection, whole-model uninstall and install-status checks use
> `resolveFullUniverse(model)`. The download lifecycle (jobs, SSE, refcounts,
> `.cubricdl` markers) is unchanged and never learns about operations; jobs stay
> keyed by `modelId`. Backend shared-dep protection resolves every other model's
> full universe so a common/op-specific dep another model needs is never deleted.

- SSE stream at `/comfy/downloads/stream` is auto-connected on first `start()` call.
- Emits Events for all download state transitions (`download:started`, `download:progress`, etc.).
- On reconnect (SSE `open`), fetches `/comfy/downloads/status` to recover state and repopulate `state.downloadJobs`.

## Backend — `routes/downloadManager.js`
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

## State Keys
In `js/state.js`:
- `downloadJobs[]` — `DownloadJob[]` array, persisted for shutdown recovery
- `downloadQueueActive` — `boolean`, true when any download is in progress
- `comfyNeedsRestart` — `boolean`, true after custom node install; triggers auto-restart in `ensureServerRunning()`

## Download Events (Lifecycle)

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

## ComfyUI Auto-Restart
When `comfyNeedsRestart` is true, `ensureServerRunning()` in `comfyController.js` stops ComfyUI, starts it again with `{ isUserRestart: true }`, and polls until ready before any generation proceeds.

## NDH Resumable Download Gotchas

`node-downloader-helper` v2.1.11 key traps: writes straight to final filename (no `.part` suffix). `resume:true` is NOT a real NDH option (silently ignored) — the real flag is `resumeIfFileExists` but it makes `pause()` fail; leave `resume:true` (harmless, keeps `start()` synchronous so pause works). `pause()` mid-chunk can throw `ERR_STREAM_WRITE_AFTER_END` — defer via `setImmediate`. `models/check` uses bare `fs.pathExists` — partial-at-final-path reads as installed (false positive). MPI-54: implemented `<file>.cubricdl` sidecar marker + `isCompleteOnDisk()` + `routes/downloadCompletion.js` to fix this.
