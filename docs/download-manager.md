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

### Shared-dep uninstall guard — resolve installed-state from DISK, not `MODELS[].installed` (MPI-216)

`MODELS[].installed` is a **renderer-only** flag, set at runtime by
`syncModelInstalled()`. It is **NEVER defined in the backend (Node) process** —
every `m.installed` reads `undefined` there. So any backend guard filtering on
`m.installed === true` matches nothing and protects nothing.

Both engines resolve "is another model still using this dep" from the actual
store, never the dead flag:

- **Remote** (`_remoteSharedDepIds`, MPI-122): asks the Pod volume via
  `remoteModelsCheck`. Aborts the uninstall if the volume can't be verified.
- **Local** (`_localSharedDepsMap`, MPI-216): stats local disk via
  `comfy.js`'s exported `localModelsCheck` (same custom-root + default-root +
  recursive-search + completeness logic as `/comfy/models/check`). Computed once
  before the delete loop; fail-safe **aborts** (`500 shared-dep-check-failed`) if
  the check throws. A dep is protected iff another model still has that specific
  dep **complete on disk** (per-dep, so a partially-installed sibling still
  protects the shared files it has).

The old local `_findOtherModelsUsingDep` filtered on `m.installed` → always `[]`
→ uninstalling one LTX-2.3 tier deleted the Gemma/VAE/LoRAs the other tier
shares. **Trap:** the remote path was fixed (MPI-122) and the local twin was
forgotten. This repo repeatedly fixes one engine path and not its twin (also
MPI-164, the `allBytesDone` "Verifying…" gate — fixed remote, ported to local
only at MPI-216). **On any shared-dep / install / engine-split change, check
BOTH the local and remote paths.**

The renderer must also not read an arch weight alone as "installed": a flat
arch-variant model (LTX-2.3 balanced) is installed only when its common deps are
ALSO on disk (`MpiModelManager._commonDepsOnDisk`), else a card whose shared deps
were deleted would show a green INSTALLED and hide the loss.

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
| `download:complete` | Backend→SSE→Frontend | Fires PER-DEP with `{depId, modelId:null}` as each file lands, then ONCE model-level with a real `modelId` when the whole dep set is done (`_checkModelJobsComplete`). Frontend consumers doing expensive work (registry re-sync, grid rebuild) MUST gate on `data.modelId` — running per-dep re-synced the registry N× and flashed the Model Library grid (see ui-gotchas § Model Library flash). |
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

**custom_nodes progress = indeterminate, never a byte ratio (MPI-231).** A GitHub `/archive/` zip is served with NO Content-Length → `stats.total`=0 → the denominator falls back to the tiny registry `seedBytes` (~15MB) while the numerator counts real streamed bytes; the following pip requirements phase has no honest up-front total either. A determinate bar overshoots (RES4LYF read `203 MB / 15 MB`). Fix: `_byteRatioExcludingNodes()` drops `type==='custom_nodes'` from BOTH sides on local (`_wireProgress`) + remote (`_onRemoteInstallEvent`); node ticks broadcast `indeterminate:true, phase:'preparing'`. Weights keep their real ratio (they send Content-Length). `MpiEngineInstall.setProgress` honors the flag (guarded by `!engineHasBytes`) → loading sweep + "Preparing dependencies…". The ComfyUI engine archive download/update is untouched — it uses the `engine:downloading` path with a real total, never this one.

## Node commit-drift + `.mpi_node_commit` marker (MPI-222)

A pinned custom-node commit bump (`dev_configs/node_lock.json`) used to leave the
installed node silently STALE — the install-check was folder-exists only. Now each
node install stamps `<node>/.mpi_node_commit` with its pinned commit (written LAST =
success sentinel). `checkUniversalWorkflowDepsStatus` (`routes/shared.js`) drift-checks
every folder-present `custom_nodes` dep (marker ≠ pinned, or absent → drifted) and
returns `driftedDeps`.

- **Local heal:** `/engine/repair-deps` (`routes/engine.js`) unions
  `missingDeps + driftedDeps` and **pre-wipes** each drifted folder with `fs.remove`
  BEFORE `startUniversalWorkflowInstall` — else the installer skips it as
  already-on-disk (`isCompleteOnDisk`) and the wrong commit survives. **Gotcha:** the
  pre-wipe nukes the WHOLE node folder, including any in-folder weight (see `targetPath`
  below); a tracked `targetPath` weight self-heals on the next boot-install, an
  untracked one is lost.
- **Dev-symlink skip:** on a source run (`BUILD_HASH==='dev'`) the drift check skips
  `ComfyUI-MpiNodes` — it's symlinked for live editing and a repair would `fs.remove`
  the link.
- **Remote heal:** a drifted volume node installs with `force:true` so the wrapper
  re-clones at the pinned commit; without force it short-circuits `already_installed`
  → an endless install loop. See [runpod-remote-engine.md](runpod-remote-engine.md) § 6.

### `targetPath` — a weight that lives INSIDE a node folder

Most weights resolve to `mpi_models/<type>/`. A node that hard-codes its own scan dir
(RIFE reads only `custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) needs its
weight there instead. Such a weight dep declares
`targetPath: 'custom_nodes/<node>/<subdir>'` + `engineAsset: true`; `resolveComfyPath`
(`routes/shared.js`) installs it under the ComfyUI repo root, bypassing the type→subdir
map. **Trap (MPI-222):** `downloadManager.js` has its OWN resolve at 3 sites
(size-calc, preserve-rule, installer) — each must pass the FULL dep so `targetPath`
survives; a stripped `{type,filename}` falls back to `mpi_models/` and the node never
finds the weight. Being `engineAsset`, the weight boot-installs + self-heals; on remote
it's image-resident (baked inside the node folder, so the wrapper never installs it).
Guard: `tests/node-drift.test.cjs`.

## Remote (RunPod) Disk-Full Pre-Flight

An old comment in `downloadManager.js` (MPI-100 era) claims a truthful remote
pre-flight is impossible — that's now WRONG and superseded. `remoteVolumeFreeBytes()`
in `routes/remotePodLifecycle.js` resolves real free space: `used` from the
wrapper's `GET /wrapper/disk` (`du -sb` on the mounted volume — the only honest
usage source, MPI-169), `size` (GB) from the RunPod REST volume object matched
to the pod's `networkVolumeId` (falls back to the sole volume if only one
exists). `_startRemoteDownload` in `downloadManager.js` gates on it the same
shape as the LOCAL statfs gate (MPI-99): `toInstall` deps' seed bytes × 1.05 >
free → reject with a 400 `[Errno 28] No space left on device` BEFORE any
wrapper install call fires, instead of letting a doomed multi-GB download run
and die near 100%. Either half unknown (old wrapper, `du` fail, volume
unresolved) → skip the gate, never false-block. `downloadService.js`'s
`_firePost` 400-handler must route this through `_isOutOfSpaceError()` to a
warning TOAST, not the GitHub-report dialog — the same matcher the reactive
`download:failed` SSE path already used.

**Why the reactive-only catch used to miss it live:** MPI-136 (stall/speed-limit
abort + httpx chunk-deadline) can make a genuinely-full volume manifest as a
"peer closed connection" / "download stalled" error on the Pod wrapper BEFORE a
clean `errno 28` ever gets raised — so the reactive string-match in
`downloadService.js` silently missed a real disk-full and showed the wrong
(GitHub-report) dialog. The pre-flight gate above sidesteps this entirely by
never starting the doomed download. `wrapper.py` (≥0.2.31) also fast-fails a
genuine mid-write `ENOSPC` (no pointless retry) and gives the httpx fallback
path resume+retry so a transient CDN drop doesn't restart a multi-GB file from
byte 0.
