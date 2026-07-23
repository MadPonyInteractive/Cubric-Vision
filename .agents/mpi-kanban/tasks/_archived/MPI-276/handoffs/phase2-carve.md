# MPI-276 Handoff — resume at Phase 2 (backend carve)

**Date:** 2026-07-13. **Branch:** 1.2.0. **Session budget:** stopped ~ before Phase 2 to avoid a mid-carve uncommittable state.

## Status

- **Phase 1: DONE + committed `0d4f0301`.** `routes/install/installStore.js` + `routes/install/computeProgress.js` + `tests/install-store.test.cjs` (23) + `tests/install-progress.test.cjs` (11) — all green, lint clean. Card moved todo→doing (board.json + task.json + both event logs).
- **Phases 2–8: NOT started.** Plan checkboxes for P1 marked `[x]` in `plan.md`.

## What Phase 1 gives you (the tools Phase 2 wires in)

`createInstallStore({ broadcast, logger, now })` exports:
- `registerModelJob({ modelId, engine, deps:[{depId,type,size,seedBytes,totalBytes,downloadedBytes,alreadyInstalled}] })` → creates model + dep jobs, REPLACES on re-POST (kills totalBytes+= bug), sets `totalBytes` never accumulates.
- `transitionModel(modelId, to, reason)` / `transitionDep(depId, to, reason)` → legal-move table, REJECTS illegal (returns false, logs warn, no version bump). Model states: `queued→downloading→verifying→installing→done|failed|cancelled`. Dep: `queued→downloading→verifying→complete|failed|cancelled`.
- `pruneTerminal(confirmedInstalled:Set)` → G10 TTLs (done: on-confirm or 120s belt; failed/cancelled: 30s). Drops orphan deps, keeps shared.
- `snapshot()` → `{version, jobs:[...]}`; `broadcastSnapshot()` emits `download:snapshot`.
- `hasActiveJobs()`, `activeModelsForDep(depId)` → **the refCount replacement.** "Is dep still needed" = `activeModelsForDep(depId).length > 0` + disk truth.
- `version()`, `modelJob(id)`, `depJob(id)`, `allModelJobs()`, `allDepJobs()`, `clear()`.

`computeProgress(modelJob)` → `{totalBytes, downloadedBytes, progress, phase, indeterminate}`. Reproduces `_byteRatioExcludingNodes` + `_depDenominator` + allBytesDone verifying gate EXACTLY. Also exports `parseSizeToBytes`, `depDenominator`.

## SCOPING DECISION for Phase 2 (agreed with user this session: "push Phase 2 now, handoff after" — but budget ran short before the carve; next session owns it fresh)

**Two sub-decisions the next agent should confirm cheap, not re-ask the Gate:**
1. **File split (G6) vs cure-in-place.** G6 wants physical `localAdapter.js`/`remoteAdapter.js`. The remote driver alone is lines 879–1418 (~540 lines: SSE stream, stall watchdog, `_onRemoteInstallEvent`, `_startRemoteDownload`, `_reconcileOutstandingRemoteDeps`). Full physical relocation + rewire + refCount-delete + store-wire + boot-verify is realistically 2 sessions. **Recommended: do the DISEASE CURE first (store-wire + register-before-respond + refCount deletion), commit that as Phase 2a, THEN physically split files as Phase 2b.** Same end state, commit-safe intermediate. The cure is the value; file layout is cosmetic.
2. Confirm with user only if they want strict G6 file-layout in one shot regardless of session count.

## Phase 2 carve map — VERIFIED anchors (re-grep by content before editing; concurrent sessions move lines)

`routes/downloadManager.js` (2223 lines). Key sites:

| What | Anchor (2026-07-13) | Action |
|---|---|---|
| refCount field | `_createDepJob` :273 `refCount: 0` | DELETE field |
| refCount bump local | :702 `depJob.refCount += 1` | DELETE |
| refCount rollback | :746-747 disk-full | DELETE (loop) |
| refCount bump remote | :1222 | DELETE |
| refCount bump UW | :2066 | DELETE |
| refCount decrement | cancel :1706, uninstall :1960, rollback :746/:1351 | DELETE all |
| refCount gate `_startPendingDeps` | :787 `d.refCount > 0` | replace w/ `store.activeModelsForDep(d.id).length` (or just drop — consumer test covers it) |
| refCount gate uninstall delete | :1961 `refCount<=0` | replace w/ `!store.activeModelsForDep(depId).length` |
| totalBytes+= bug | :669 `modelJob.totalBytes += allDepsSize` | store handles (SET) |
| register-before-respond (G8) | :628-764 `/download/start` | register full job in store BEFORE `res.json`; response body includes snapshot of that job |
| `ResumableDownloader` rename→`FileDownloader` (OPEN-6) | class :337; **ALSO `routes/engine.js:17` imports it by name** | rename both |
| `_depHasActiveDownloadConsumer` :859 | prime silent-swallow suspect C | replace w/ store query |
| `_otherActiveModelUsesDep` :870 | already status-based | fold into `store.activeModelsForDep` |
| `/downloads/status` :582 | | return `{version, jobs:[]}` snapshot shape (G8 verify) |
| custom-node uninstall FOLDER bug | install localPath=ZIP :682-684; uninstall re-derives ZIP :1887-1890 → skip; log lies :1957 | Phase 5 fix (folder deletion) — note only in P2 |

## Exports that MUST keep name+signature (G6) — `routes/engine.js` + shutdown depend on them
`cancelAllDownloads` :1976, `registerEngineDownload` :2197, `clearEngineDownload` :2202, `startUniversalWorkflowInstall` :2003, `finishCustomNodeInstall` :2164, `runCustomNodeInstall` (via `_runCustomNodeInstall` :1471), `broadcastEngineEvent` :2185, plus `ResumableDownloader`→`FileDownloader` (update engine.js:17).

## Preserve verbatim (G4 — DO NOT reintroduce pause/resume)
NDH cancel-only transport (`download()` scrubs partial :460, `markDownloadInProgress`, 30s socket timeout :444), `.cubricdl` contract, sha256 verify :477, `resolveComfyPath`/`getCustomRoot` path logic, `_filterDepsForEngine` :92 + `_withEngineExtraDeps` :110, `_localSharedDepsMap` :133 + `_remoteSharedDepIds` :197 (whole-model-installed rule), disk-full pre-flight :725, `_extractZipArchive` :54, `_nodeFolderHasFiles` :75 (MPI-243), all wrapper endpoint signatures, all existing SSE event NAMES.

## Phase 2 verify gate (from plan)
- `node tests/node-install-batch-resilience.test.cjs` + `node tests/node-drift.test.cjs` still pass.
- `npm run lint` clean.
- `grep -rn "refCount" routes/` → ZERO hits.
- Server boots; `GET /comfy/downloads/status` → `{version, jobs:[]}`.
- All Phase-1 tests still green.

## Then: P3 reconciler (`routes/install/reconciler.js`, G11), P4/P5 parallel batch (FE mirror + uninstall), P6 wrapper (`c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper.py` 0.2.36→0.2.37, `git -C`), P7 docs, P8 user-ux. All detail in `plan.md`.

## Hazards
- Shared tree: `downloadManager.js`, `js/shell.js`, kanban files edited by peers mid-task — content-anchor edits, re-read on stale-Edit, re-grep after. Peer moved MPI-271 todo→doing during this session; board stayed consistent.
- Commit hygiene: never `git add .`. New files → `git add <paths>` then `git commit -n` (no pathspec). Co-owned files → stage by content anchor.
- Research dossiers `research/00`–`04` = the regression matrix. `04` is the bug table (each = a test case).
