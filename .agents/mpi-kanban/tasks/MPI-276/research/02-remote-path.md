# Remote (RunPod) install/uninstall path + dual-engine drift

Agent sweep 2026-07-13. App-side refs vs `routes/downloadManager.js` / `routes/remoteModels.js`; Pod-side vs `c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper.py`.

## Pipeline

- Entry: same `POST /comfy/models/download/start` :628 → `isRemoteActive()` → `_startRemoteDownload()` :1179 — engine-filter deps, volume pre-check (`remoteModelsCheck`), disk pre-flight via `remoteVolumeFreeBytes()` :1335-1358, per-dep `remoteInstallDep()` :1390.
- `remoteModels.js`: `remoteInstallDep` :349 → `POST /wrapper/models/install`; `remoteUninstallDep` :401 → `POST /wrapper/models/delete`; `remoteModelsCheck` :263 → `POST /wrapper/models/status`; `remoteCancelInstall` :593; `openInstallEventStream` :608 → `GET /wrapper/events/stream`; all via `wrapperFetch` :91 (15-retry on 404/502/503/504); `splitDepFilename` :72 (FIRST-`/` split, MPI-141); `_isImageResident` :204.
- Events back: `_ensureRemoteEventStream` :958/:1381 → `_onRemoteInstallEvent` :1053 maps `models:install-progress/verifying/complete/error` → `download:*`; `needs_comfy_restart` → `comfy:needs-restart {depId, remote:true}` :1160.
- Belts: `_remoteStallWatchdog` 90s :899-935 (MPI-136); 15s poll + `_reconcileOutstandingRemoteDeps` :913-1004 (`allBytesInButUnsettled` settles by volume truth — MPI-255).
- Pod-side (`wrapper.py`): install :2127 (aria2c 16-conn + httpx fallback; 0.2.36 aria2-RPC shutdown fix MPI-254); delete :2239 (file+`.part`, manifest update); status :1161 (`_is_complete_on_disk`, VOLUME only); events :2295; hot-store ensure :1183 (volume→NVMe staging, LRU); `_installs` dict :1350; `manifest.json` :66.

## Cross-contamination / untagged state

- `comfy:needs-restart`: local emits `{modelId}` (no `remote` field) :1688; remote emits `{depId, remote:true}` :1161 — FE routes on `data?.remote===true` (downloadService :525-534). Shape asymmetry = drift trap.
- `processState.comfyNeedsRestart` (server flag) set only on local path :1685-1686; remote restart-need lives ONLY in FE `state.remoteComfyNeedsRestart` — app restart mid-remote-install loses the signal.
- Remote install forces `installCustomNodes=false` :1195 — the ONLY wall preventing `_runCustomNodeInstall` on a remote job.
- `MODELS[].installed` = single un-engine-tagged boolean, in-place mutated (modelRegistry :149); `_modelDepStatusCache` (modelRegistry :31) also engine-untagged — stale cross-engine reads in the refresh window.
- `remoteEngineClient._active` staleness window between `remote:connection` emit and async `refresh()` (MPI-179 note, :209-210).

## Local↔remote duplication (drift table)

| Concern | Local | Remote | Risk |
|---|---|---|---|
| Shared-dep uninstall guard | `_localSharedDepsMap` :133 (+ in-flight `_depJobs` status protection :179-185) | `_remoteSharedDepIds` :197 (volume only — **NO in-flight protection**: concurrent remote install of a shared dep can be deleted mid-flight; `_remoteDepIds` only covers same-model) | HIGH |
| Custom-node install | `_runCustomNodeInstall` :1471 (honors `pipPins`, `_nodeFolderHasFiles` MPI-243 guard, `.mpi_node_commit` via shared.js) | `wrapper.py _run_node_install` :1991 (**ignores `pipPins`**, no files-guard, stamps marker directly :2057) | HIGH |
| Downloader | NDH single-stream cancel-only | aria2c 16-conn + httpx resume fallback | by design |
| Disk pre-flight | statfs :726-755 | `remoteVolumeFreeBytes` :1335-1358 | by design |
| `{type,filename}` split | none needed | `splitDepFilename` :72 | reinvention trap |

## Uninstall differences

- Local keeps `installRequirements===true` nodes (pip-keep :1908); remote has NO such carve-out (volume nodes deleted).
- `deleteFiles=false`: local keeps only managed-root model files; remote keeps ALL deps :1816-1819.
- Remote updates Pod `manifest.json`; local has no manifest.
- **BUG (hot-store ghost):** wrapper delete does NOT evict the NVMe hot-store copy or `_hot_state` entry — `_hot_ensure_one` later reports "source missing on volume" but the disk file lingers until LRU pressure; uninstall doesn't free fast disk. Fix pod-side (in scope per user decision).
- **Uninstall endpoint applies NO engine filter** to the client-supplied dep array (install-start has `_filterDepsForEngine`; uninstall trusts the wire).
