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
- `cancel(modelId)`: stop an active download (cancel-only — `pause`/`resume` were removed, MPI-258 Bug 2). Idempotent client-side: a second press or a settled card skips the POST; a `_recentlyCancelled` guard blocks the MPI-241 SSE-open re-inject from resurrecting the phantom.
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
- On reconnect (SSE `open`), fetches `/comfy/downloads/status` to recover state and **MERGES** it into `state.downloadJobs` — it must NOT overwrite.

**SSE-open clobber (MPI-241) — don't reintroduce.** `start()` opens the SSE stream *and* creates the client `downloading` job in the SAME tick, so on the FIRST install after a reload the `open` handler's `/status` fetch races ahead of the backend registering it and returns only OLD `complete` jobs. Overwriting `state.downloadJobs` with that snapshot wiped the live job → the Model Library footer reverted Cancel→**Install** mid-download (bar kept climbing; only the state was wrong). Later installs never hit it — `_ensureSSE()` no-ops once open, hence "only the first time". Contract: keep any **active** client job (`downloading`/`queued`/`paused`/`installing`) whose `modelId` the backend snapshot omits; backend wins for shared ids. Footer hardening: a lingering terminal `complete` job still counts as *busy* (holds Cancel/progress, never flashes Install), and `anyInstalled` is checked BEFORE busy so Uninstall wins on re-sync. No "Finishing…" label — `Verifying…` is the only end-phase text. Guard: `tests/model-footer-settling.test.cjs`.

## Backend — `routes/downloadManager.js`
Non-blocking download router using `node-downloader-helper`. **Downloads are CANCEL-ONLY (no pause/resume)** — resume was removed (MPI-258 Bug 2, commit c7313dff): NDH `resumeFromFile` sends `Range: bytes=<n>-` on an append-mode file; when R2/Cloudflare answers 200 (full body) not 206 it appends the WHOLE file onto the partial → SHA256 mismatch (hit live on the 25GB LTX transformer). A cancelled/interrupted install restarts clean.

**Endpoints:**
- `POST /comfy/models/download/start` — enqueue a model's dependencies
- `POST /comfy/models/download/cancel` — stop + scrub a model's active/queued download. **Idempotent**: an unknown job returns 200 (+ `download:cancelled` broadcast), NOT 404 (MPI-258).
- `GET /comfy/downloads/status` — full queue snapshot
- `GET /comfy/downloads/active` — active model downloads plus engine-download flag for Electron quit warnings
- `GET /comfy/downloads/stream` — SSE broadcast channel
- `POST /comfy/models/uninstall` — uninstall a model

> The `/download/pause`, `/download/resume`, `/engine/pause`, `/engine/resume` routes and the `_pausedDownloaders` map were DELETED in c7313dff. Do not reintroduce them.

**ResumableDownloader class** (`routes/downloadManager.js` — name is historical; it no longer resumes):
A plain single-stream `node-downloader-helper` wrapper: start, cancel (clean `stop()` + remove), SHA256 verify, SSE progress broadcast.
- `.download()`: always scrubs any stale/partial file at `localPath` first, then starts one clean stream (no `resumeIfFileExists`, no resume option). 30s socket-inactivity `timeout` so a black-hole route emits `error` instead of hanging (MPI-120).
- `.cancel()`: `_downloader.stop()` + the caller removes the partial + marker.
- On completion: verifies `sha256Expected`, clears `<file>.cubricdl`, marks dep `complete`.
- On SHA256 mismatch: deletes the file, clears the marker, marks dep `failed`.

**Job storage:**
- `_depJobs Map<depId, DepJob>` — individual dependency jobs (URL, bytes, status, refCount, sha256)
- `_modelJobs Map<modelId, DownloadJob>` — model-level aggregate job (totalBytes, downloadedBytes, speed, progress, deps[])
- `_activeDownloaders Map<depId, ResumableDownloader>` — actively downloading
- `_sseClients Set<res>` — SSE subscribers

**RefCount:** Each `depId` can be shared across multiple model jobs. `refCount` tracks how many model jobs reference it. **TRAP (MPI-258): refCount LEAKS upward — a successful download NEVER decrements it** (only uninstall / disk-full rollback / cancel do). So after an install completes the dep sits at refCount ≥1, and a *second* install of the same model stacks it to 2. Do NOT gate any "is this dep still needed" decision on `refCount === 0`:
- **Shared-dep uninstall protection** already learned this (see the `_localSharedDepsMap` note above) — it gates on live `depJob.status` (`downloading`/`queued`), never refCount.
- **Cancel** (`/comfy/models/download/cancel`) learned it the hard way: gating "stop the downloader" on `refCount <= 0` meant a refCount-2 dep was never stopped — cancel deleted `_modelJobs` but left NDH streaming invisibly and every re-press 404'd. It now gates on `_otherActiveModelUsesDep(depId, thisModelId)` (another ACTIVE model job references the dep), not refCount. Unknown-job cancel returns an **idempotent 200** (+ `download:cancelled` broadcast), never 404.

**Uninstall on Windows — Recycle Bin has a QUOTA (MPI-258).** `windows-trash.exe` exits **255** (uninstall silently no-ops, `removed:0`, misleading "all files shared" toast) when a weight exceeds the drive's *Recycle Bin* budget — this is the bin cap, NOT disk free space (a 6.9GB file failed with 37GB free on the drive). Since uninstall exists to free space (parking a 25GB weight in the bin wouldn't free it anyway), the uninstall loop tries `_trash` first, then falls back to permanent `fs.remove` on any trash failure. Small files still go to the bin (undo-safety); only over-quota weights hit the fallback.

**Idle partial bar — 1GB floor (MPI-258).** `MpiModelManager._computePartial` draws a partial bar only when ≥1GB of a model's OWN deps are on disk. Below that, only shared support files are present (Wan 5B borrows Wan 2.2's CLIP/VAE; anime packs share a 65MB upscaler owned by no installed model) which read as a phantom 1-3% on a never-touched pack — the floor suppresses those. This is separate from `_sharedOwnedDepIds` (excludes deps owned by an *installed* other-model, MPI-258 Bug A).

**Custom-node install — "already extracted" is FILES, not folder-exists (MPI-243).** A `targetPath` weight (e.g. RIFE's `ckpts/rife/rife47.pth` resolves UNDER `custom_nodes/comfyui-frame-interpolation/`) downloads BEFORE the node extracts, creating the node dir as a subdir-only **shell**. `_runCustomNodeInstall` keys "already extracted" on `_nodeFolderHasFiles(targetDir)` (folder holds a top-level FILE — real nodes ship `__init__.py`/`install.py`), NOT `pathExists`. `pathExists` false-positived → skipped extraction → `python install.py` in an install.py-less folder → Errno 2, "UW deps installation failed / Press Retry". The rename block MERGES the extracted node into a weight-shell (`fs.copy` overwrite + remove source), preserving `ckpts/`, instead of deleting the node as a "duplicate". Order-independent. Two support fixes same card: stale-zip scrub in `download()` (no NDH ` (1)` dups) + a per-dep reqs failure sets `anyFailure + continue` (one node's install hiccup no longer aborts the batch). Guard: `tests/node-install-batch-resilience.test.cjs`. [[project_targetpath_weight_shell_trap]]

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
`download:failed` SSE path already used. **MPI-237:** the same telemetry backs
the UI disk bar via `GET /remote/pod/disk`, which returns `{used,total,ephemeral}`
— total resolved by the pure `resolveDiskTotalBytes(pod, volumeList)` (volume
size, or ephemeral `containerDiskInGb`).

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
