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

## The install store — the SOT (MPI-276)

`routes/install/installStore.js` is the single source of truth for the
install/download lifecycle (the MPI-208 `generationStore` medicine, applied to
downloads). Pure — no fs/express/NDH, all I/O injected — so it is unit-tested
(`tests/install-store.test.cjs`). It holds `ModelJob`/`DepJob` records with an
explicit **legal-transition table**: `transition(job, to, reason)` REJECTS +
logs illegal moves (e.g. `cancelled→done`), so a wedged or resurrected job is
impossible by construction. A monotonic `version` bumps on every mutation.

- **No `refCount` anywhere (G5).** The field was DELETED in MPI-276 — it leaked
  upward (a successful install never decremented it) and lied. "Is this dep
  still needed / in-flight" is answered from job STATUS: `store.activeModelsForDep(depId)`
  (non-terminal model jobs referencing the dep). **Never reintroduce refCount;
  never gate on `refCount === 0`.** [[feedback_refcount_leaks_never_gate_on_zero]]
- **Snapshot protocol (G9).** `store.snapshot()` = `{version, jobs[]}`. Broadcast
  as `download:snapshot` on SSE connect + after every reconcile pass. The FE
  REPLACES `state.downloadJobs` wholesale, version-gated (deltas apply only if
  `version ≥` last seen).
- **Prune (G10).** `done` jobs stay (card stays busy — no Install-flash, MPI-241)
  until a resync confirms install, then prune (belt: 120s TTL). `failed`/`cancelled`
  prune on a 30s TTL.

**Reconciler — `routes/install/reconciler.js` (G11).** One pass, both engines,
driven from disk/volume truth (`localModelsCheck` / wrapper `/models/status`):
settles wedged deps (all bytes in + truth says installed → force terminal via
legal transitions), FAILS orphans (no progress, nothing on disk, >60s grace),
NEVER resurrects terminals, then prunes + broadcasts the snapshot. Runs on SSE
connect, a 15s poll while any job is non-terminal, and after uninstall. Tests:
`tests/install-reconciler.test.cjs`.

> **Shadow-SOT caveat (as of MPI-276 Phase 4).** The store drives the
> `download:snapshot` BROADCAST (the FE mirror consumes it, progress-complete via
> `store.syncProgress`). The PULL endpoints (`/downloads/status`, `/active`,
> `_serializeModelJob`) are still MAP-backed, and the runtime maps
> (`_modelJobs`/`_depJobs`) stay write-authoritative + carry transport detail
> (url/localPath/sha256/pipPins). The old remote stall-watchdog still reads the
> maps. The full read-flip (delete map status-writes, flip pull reads onto
> `store.snapshot()`, retire the watchdog into the reconciler) is a DEFERRED
> future slice, done with the G6 adapter split.

## Frontend — `js/services/downloadService.js`
Singleton that owns the frontend download mirror (MPI-276: a mirror of the
store snapshot, not an independent queue).

- `start(modelId, dependencies)`: creates an optimistic client-only **`pending`**
  job ("Starting…", indeterminate) then POSTs. `pending` is a CLIENT-ONLY state
  (G2) — never in the backend store. `_armPendingRevert` arms a 10s timer: if no
  backend ack lands, it drops the job + emits `download:cancelled` + a
  `ui:warning` TOAST ("Install didn't start — try again"). Register-before-respond
  (G8) means `POST /download/start` returns the job snapshot, which `_firePost`
  adopts (→ `downloading`, clears the revert). [[feedback_error_dialog_vs_toast]]
- `cancel(modelId)`: stop an active download (cancel-only — `pause`/`resume` were removed, MPI-258 Bug 2). Idempotent client-side: a second press or a settled card skips the POST.
- `uninstall(modelId, dependencies)`: Remove model files via backend.

> **MPI-276 deleted the MPI-241 patch cluster.** Register-before-respond (G8)
> structurally kills the SSE-open race, so the `/status`-fetch merge heuristic,
> `orphanedActive` re-injection, and the `_recentlyCancelled` guard are GONE. The
> snapshot replaces `state.downloadJobs` wholesale; do NOT reintroduce a merge.

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
  the check throws. Plus any dep held by a live in-flight job (`_inFlightDepIds`,
  store SOT — MPI-276).

**"Is this model installed?" is answered from its EXCLUSIVE deps (MPI-310).**
A model protects every dep it *declares*, and it counts as installed when any dep
that **no other model declares** is on disk. Both earlier rules conflated shared
and exclusive evidence, and each was circular in an opposite direction:

| Rule | Circularity | Damage |
|---|---|---|
| per-dep on-disk (pre-MPI-258) | a shared file counted as proof for *every* model declaring it, so a tier family protected the same idle copy from both sides while neither was installed | ~19GB undeletable (MPI-258 B1) |
| `fullyInstalled` (MPI-258/276) | a shared **common** dep is itself an input to the gate, so the instant it went missing every model needing it stopped defending it | 5.24GB destroyed (MPI-310) |

Exclusive deps break both cycles: a dep no one else declares cannot be another
model's footprint, and it can never be the shared file under judgement — so the
answer no longer depends on the file being protected. An absent-transformer tier
has no exclusive footprint → protects nothing → still deletable. A model whose
shared encoder was deleted still has its own transformer → still defends what it
declares. Models with no exclusive deps at all fall back to any-footprint.

> **Exclusivity MUST be computed over the whole registry** (`_multiModelDepIds`),
> never over the guard's `others` list — `others` omits the uninstall target, which
> makes its shared deps look exclusive to the sibling that also declares them. That
> is precisely the LTX-2.3 High/Balanced pair from MPI-258 B1; scoping it wrong
> reintroduces the stranding. This is **invariant 5** in
> `.agents/mpi-kanban/tasks/MPI-276/research/04-bug-history-invariants.md` — read
> that dossier before touching either guard.

> **Live incident:** uninstalling the image-describer plugin deleted the 5.24GB
> `qwen3vl_4b_abliterated_fp8_scaled.safetensors` that four Krea2 cards declared
> and one had fully installed. The dialog's *"shared files will be kept"* was a
> lie. Two compounding causes: (1) the running server's `createRequire` cache held
> a `models.js` from before the cards were moved onto that weight — **dep-graph
> edits are not live until the server process restarts; a Ctrl+R renderer reload
> does NOT clear it**; and (2) even on fresh data the circular gate above meant
> the weight stopped protecting itself once absent. Guard:
> `tests/shared-dep-uninstall-direction.test.cjs`.

`installedOps` still narrows *which* ops' deps get protected; a damaged model with
no complete op falls back to its full universe (the conservative direction).

**Test both directions AND both circularities.** `tests/plugin-dep-gc.test.cjs`
covers plugin deps during a MODEL uninstall; `tests/shared-dep-uninstall-direction.test.cjs`
covers model deps during a PLUGIN uninstall (the direction that had never run
before it broke) **and** pins the MPI-258 B1 tier-family case so a future fix
cannot swing back to over-protection. Any change here must keep both green — they
fail in opposite directions, which is the point.

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

- SSE stream at `/comfy/downloads/stream` is auto-connected on first `start()` call. On connect the backend runs a reconcile pass then broadcasts `download:snapshot`; the FE resets its version floor (no `/status` fetch — MPI-276 deleted it).
- Emits Events for all download state transitions (`download:started`, `download:progress`, etc.).
- On `download:snapshot`, REPLACES `state.downloadJobs` wholesale (version-gated); transport detail (speed/phase/indeterminate/error) rides delta events and is carried forward onto the job; the client-only `pending` job is preserved.

**Footer no-Install-flash contract (MPI-241, preserved by MPI-276).** A lingering terminal `done`→`complete` job still counts as *busy* (holds Cancel/progress, never flashes Install) until the post-complete resync prunes it; `anyInstalled` is checked BEFORE busy so Uninstall wins on re-sync. The busy set (G14) = `{pending, queued, downloading, verifying, installing, done-awaiting-resync}`; `verifying` is a `phase`, not a model status; `done` maps to `complete` in the snapshot listener. No "Finishing…" label — `Verifying…` is the only end-phase text. Guard: `tests/model-footer-settling.test.cjs`.

## Backend — `routes/downloadManager.js`
Non-blocking download router using `node-downloader-helper`. **Downloads are CANCEL-ONLY (no pause/resume)** — resume was removed (MPI-258 Bug 2, commit c7313dff): NDH `resumeFromFile` sends `Range: bytes=<n>-` on an append-mode file; when R2/Cloudflare answers 200 (full body) not 206 it appends the WHOLE file onto the partial → SHA256 mismatch (hit live on the 25GB LTX transformer). A cancelled/interrupted install restarts clean.

**Endpoints:**
- `POST /comfy/models/download/start` — register the model job in the store BEFORE responding (register-before-respond, G8); the response body carries the `job` snapshot + store `version`.
- `POST /comfy/models/download/cancel` — stop + scrub a model's active/queued download. **Idempotent**: an unknown job returns 200 (+ `download:cancelled` broadcast), NOT 404 (MPI-258).
- `GET /comfy/downloads/status` — full queue snapshot (still map-backed; carries `version`).
- `GET /comfy/downloads/active` — active model downloads plus engine-download flag for Electron quit warnings
- `GET /comfy/downloads/stream` — SSE broadcast channel; on connect: reconcile pass → `download:snapshot`.
- `POST /comfy/models/uninstall` — uninstall a model (engine-filtered, store-guarded — see below).

> The `/download/pause`, `/download/resume`, `/engine/pause`, `/engine/resume` routes and the `_pausedDownloaders` map were DELETED in c7313dff. Do not reintroduce them.

**FileDownloader class** (`routes/downloadManager.js`; renamed from `ResumableDownloader` in MPI-276 — it never resumed):
A plain single-stream `node-downloader-helper` wrapper: start, cancel (clean `stop()` + remove), SHA256 verify, SSE progress broadcast.
- `.download()`: always scrubs any stale/partial file at `localPath` first, then starts one clean stream (no `resumeIfFileExists`, no resume option). 30s socket-inactivity `timeout` so a black-hole route emits `error` instead of hanging (MPI-120).
- `.cancel()`: `_downloader.stop()` + the caller removes the partial + marker.
- On completion: verifies `sha256Expected` against the digest computed **incrementally while the file streamed in** (MPI-296 — a `Transform` hash-sink `.pipe()`d ahead of the file write, finalized on `end` into `_streamHashHex`), skipping a whole-file re-read that cost ~35s on a 6.6GB weight (34814ms→1ms). Safe **only because downloads never resume** (see above — the pipe sees every byte once, in order); `_verifySha256` keeps a disk re-read fallback for when no streamed digest exists. If resume is ever reintroduced, gate the fast path on `!wasResumed`. Then clears `<file>.cubricdl`, marks dep `complete`.
- On SHA256 mismatch: deletes the file, clears the marker, marks dep `failed`.

### Uninstall pipeline (G13, MPI-276)

One engine-parameterized pipeline in `POST /comfy/models/uninstall`:

1. **Server-side engine filter (MPI-276).** The route re-resolves the model's
   engine-correct universe with `_filterDepsForEngine(modelId, wireDeps, engine)`
   and keeps only deps in it — it no longer trusts the wire dep array (a stale
   client / direct API call could ask to delete the wrong engine's files).
2. **Shared-dep guard** (whole-model-installed rule, below) + **in-flight
   protection on BOTH engines** via `_inFlightDepIds` (store SOT — remote
   previously had none).
3. **Delete via the engine path** (local trash→remove, remote wrapper delete).
4. **Post-uninstall reconcile pass** + snapshot broadcast.

**Custom-node FOLDER deletion (MPI-276).** Install extracts a node to
`custom_nodes/<dep.filename>/` and removes the zip. The old uninstall re-derived
`custom_nodes/<name>.zip` — the long-gone zip — so the delete no-op'd yet the
loop still pushed the dep to `removed[]` and logged a lie. `_customNodeUninstallPath`
now targets the extracted FOLDER, and `removed[]` gets an entry ONLY when a path
actually existed and was deleted; a kept/missing path lands in `keptModelFiles`
(`reason:'already-absent'`) with an honest log line. Guard:
`tests/uninstall-guards.test.cjs`.

**Job storage (runtime maps — write-authoritative, transport carriers):**
- `_depJobs Map<depId, DepJob>` — individual dependency jobs (URL, bytes, status, sha256, pipPins). **No `refCount` field — DELETED MPI-276.**
- `_modelJobs Map<modelId, DownloadJob>` — model-level aggregate job (totalBytes, downloadedBytes, speed, progress, deps[])
- `_activeDownloaders Map<depId, FileDownloader>` — actively downloading
- `_sseClients Set<res>` — SSE subscribers

Every runtime status write goes through `_setModelStatus`/`_setDepStatus`, which set the map field AND drive the store's legal transition (a runtime→store string map; model `complete`→`done`). Live progress is mirrored to the store via `_syncStoreProgress` so the snapshot broadcast carries real bytes.

**RefCount was DELETED (MPI-276) — never reintroduce it.** It tracked "how many model jobs reference this dep" but LEAKED upward (a successful download never decremented it, only uninstall/rollback/cancel did), so it sat ≥1 after any install and lied. Liveness is now a STORE query:
- **Shared-dep uninstall protection** gates on `store`-derived in-flight (`_inFlightDepIds` = deps held by a non-terminal model job other than the one being uninstalled), not a refCount and not the old `_depJobs.status` map read.
- **Cancel** gates on `_otherActiveModelUsesDep` (another ACTIVE model job references the dep). Unknown-job cancel returns an **idempotent 200** (+ `download:cancelled` broadcast), never 404.

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

## NDH Download Gotchas

`node-downloader-helper` v2.1.11 key traps: writes straight to final filename (no `.part` suffix), so a killed partial sits at the final path. Downloads are cancel-only (no pause/resume — MPI-258 B2); `.download()` scrubs any stale partial then starts one clean stream (no `resumeIfFileExists`). `models/check` uses bare `fs.pathExists` — partial-at-final-path reads as installed (false positive). MPI-54: `<file>.cubricdl` sidecar marker + `isCompleteOnDisk()` + `routes/downloadCompletion.js` fix this.

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

**Trap (MPI-293) — reading the dep registry as TEXT.** `dependencies.js` is a
FACADE: it only spreads the four split files (`modelDeps.js`, `assetDeps.js`,
`loraDeps.js`, `nodesDeps.js`) and holds NO inline block text. Runtime
`import {DEPS}` consumers are fine (spread resolves at load), but any code that
regex-scans the *source* of `dependencies.js` finds NOTHING — silently. This
killed three scanners: `remoteModels.js` `_universalNodeFilenames` (empty baked
set → every baked node hit the wrapper → `comfyui_controlnet_aux` Errno-2 on a
fresh volume), `controlnet-aux-torch-guard.test.cjs` (asserted null → dead), and
`release-health-check.mjs` folder-type scan (MPI-143 map guard passed on
nothing). Fix: text-scanners must read the split file(s) that hold the blocks
(`nodesDeps.js` for custom_nodes; glob `*Deps.js` for a folder-type sweep).

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
