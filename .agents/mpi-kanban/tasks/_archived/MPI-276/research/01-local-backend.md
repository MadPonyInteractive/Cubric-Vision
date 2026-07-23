# Local backend download/install pipeline — architecture map + defects

Agent sweep 2026-07-13. File:line refs against `routes/downloadManager.js` (2223 lines) at commit ~57ca545d — verify anchors before editing (concurrent sessions).

## Modules

| Module | Role |
|---|---|
| `routes/downloadManager.js` | Core: ALL job state, download exec, uninstall, UW install, SSE broadcast |
| `routes/downloadCompletion.js` | `.cubricdl` contract: `isCompleteOnDisk`, `markDownloadInProgress`, `clearDownloadMarker` |
| `routes/comfy.js` | `localModelsCheck` (exported :915, consumed by downloadManager :138) |
| `routes/shared.js` | `resolveComfyPath` :303, `getCustomRoot` :380, `getDefaultModelsRoot` :398, `checkUniversalWorkflowDepsStatus` :556 |
| `routes/engine.js` | calls `startUniversalWorkflowInstall`, `finishCustomNodeInstall`, `ResumableDownloader` |
| `js/services/downloadService.js` | frontend singleton (see 03-frontend-ui.md) |

## Install lifecycle (click → installed)

1. FE `downloadService.start()` :55 — creates client job SYNC, emits `download:started`, chains `_firePost` behind `_installChain` (serial, MPI-184).
2. BE `POST /comfy/models/download/start` :628 — offline check :638; remote branch :647; local: `_filterDepsForEngine`+`_withEngineExtraDeps` :655; modelJob create-or-REUSE :657; **`modelJob.totalBytes += allDepsSize` :669 — ACCUMULATES on re-POST (bug)**; per-dep loop :671-719 (`isCompleteOnDisk` :694, `_createDepJob` :698, `refCount += 1` :702, installed→`complete` :709, else reset to `queued` ONLY if not already queued/downloading :713); disk pre-flight :725-755; `modelJob.status='downloading'` :757; `_startPendingDeps()` :761.
3. `_startPendingDeps()` :784 — filter: `status==='queued' && refCount>0 && _depHasActiveDownloadConsumer(id)` :785-789; slots = 3 − active :790; skip if `_activeDownloaders.has(id)` :797; logs `Starting download for …` :806.
4. `ResumableDownloader.download()` :450 — scrub stale partial :460, `markDownloadInProgress` :461, NDH `start()` :465. CANCEL-ONLY (resume deleted c7313dff — R2 answers 200 not 206 → append corruption, MPI-258 Bug 2). 30s socket timeout :443 (MPI-120).
5. NDH `end` :362 — `allBytesDone` gate (custom_nodes excluded :381-385) → verifying sweep; `_verifySha256` :397; `clearDownloadMarker`, `status='complete'`, `download:complete {depId, modelId:null}` :398-401; `_checkModelJobsComplete()` + `_startPendingDeps()`.
6. `_checkModelJobsComplete()` :1438 — allComplete + installCustomNodes → `installing` + `_runCustomNodeInstall` :1455-1459; else `complete` + `download:complete {modelId}` :1463-1465.
7. FE `download:complete` (real modelId) :356 — `reSyncInstalledModels()`, `/comfy/refresh-models`.

## Silent no-op guards (each can swallow an install with NO log)

- **A** FE `_firePost` :127 — job gone from `state.downloadJobs` → skip POST.
- **B** BE :713 — depJob already `queued`/`downloading` → untouched. If prior cancel left a zombie `queued` dep whose modelJob was deleted → sits queued FOREVER (no consumer).
- **C** `_depHasActiveDownloadConsumer` :788/:859 — queued dep with refCount>0 but no `downloading` modelJob listing it → NEVER started, NO log. **Prime suspect for the live evidence.**
- **D** `_activeDownloaders.has(id)` :797 — stuck downloader (NDH died without `end`/`error`) → dep skipped every pass.
- **E** remote inFlight :1249-1255 — `status==='complete'` trusted when volume pre-check failed (`freshStatus` undefined → trust stale).
- **F** remote `toInstall.length===0` :1366 — instant settle.
- **G** `isCompleteOnDisk` false positive — file present without marker (manual copy / crash between clearMarker and status write) reads installed.

## Job stores (module-level, survive across jobs)

- `_depJobs` :245 — cleared by `cancelAllDownloads` :1986; uninstall deletes only when `refCount<=0` :1961 (unreliable — refCount leaks up); cancel deletes non-shared :1736. Stale `complete` entries survive; re-install works ACCIDENTALLY because `isCompleteOnDisk` takes priority.
- `_modelJobs` :246 — uninstall/cancel delete unconditionally; REUSED on re-install :657 (totalBytes accumulation).
- `_activeDownloaders` :247 — leaks if NDH never emits terminal.
- `_remoteDepIds` :888, stall watchdog state (5 interrelated vars :887-906).

## refCount (post-MPI-258 state)

Incremented: :702 (local), :1222 (remote), :2066 (UW). Decremented ONLY: cancel :1706, uninstall :1960, disk-full rollbacks :746/:1351. **Never on success.** MPI-258 moved cancel/shared-dep gates to live-status checks (`_otherActiveModelUsesDep` :870, `_localSharedDepsMap` :179), but refCount still gates `_depJobs.delete` at uninstall :1961 AND still filters `_startPendingDeps` :787. Vestigial + misleading → DELETE in refactor.

## Uninstall (local) :1749

Guard order: universal set → `sharedKeep` (`_localSharedDepsMap` — whole-model-installed rule post-MPI-258 :153-170 + in-flight status protection :179-184) → `installRequirements===true` pip-keep :1908 → path-safety → trash-with-`fs.remove`-fallback :1947-1952 (Recycle-Bin quota, MPI-258 Bug A) → `refCount -= 1` :1960 → `_modelJobs.delete` :1969 → broadcast.

**BUG (custom-node folder never deleted):** install sets custom_nodes `localPath` = ZIP path :682-684; post-install the zip is deleted :1530, only the FOLDER remains; uninstall re-derives the ZIP path :1887-1890 → `pathExists` false :1940 → silently skipped, yet dep pushed to `removed[]` :1957 (log lies). Fix in refactor: resolve node FOLDER.

## Other defects

- `_parseSizeToBytes` duplicated 4×: downloadManager :532, comfy.js :147, downloadService :573, MpiModelManager :269.
- Path-resolution sequence duplicated 3× inside downloadManager (install :672-693, UW :2036-2055, uninstall :1882-1895) — already diverged (the zip bug).
- `startUniversalWorkflowInstall` busy-polls 500ms/30min :2102-2125 instead of event-driven.
- `_localSharedDepsMap` = O(models×deps) disk stats per uninstall, no cache.
- docs drift: download-manager.md still documents `/engine/pause|resume` (deleted); rules downloads.md still shows pause/resume API.
