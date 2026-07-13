# Frontend Model-Library / download state — map + phantom mechanisms

Agent sweep 2026-07-13. Refs vs `js/services/downloadService.js` + `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`.

## Render chain

`renderList()` :1119 (sig-guarded full rebuild) → `_buildTile` :732 → `_modelState(model)` :637 reads: `state.downloadJobs.find(j=>j.modelId===model.id)` :638, `_computePartial` :593 (→ `_modelDepStatusCache` via `getModelDepStatus`), `_installedOpsOf` :300. In-place updates via `_patchTile(modelId)` :1200 keyed by `_tileInstances Map`. All routing id-keyed — NO positional rendering.

Card display sources: progress % = `job.progress`; "Verifying…" = `job.phase==='verifying'` :713; partial bar = `_computePartial` (1GB floor :622, MPI-258); busy = `isActiveDownload || (!!job && downloadState==='complete')` :652 — **`complete` counts as busy**.

Subscriptions :1212-1252: `download:progress/started/installing/cancelled` → patch; `complete/failed` → `awaitReSync()`; `state:changed s_installedModelIds` → renderList; `remote:connection` → force renderList.

## downloadService

- `start()` :55-91 — OPTIMISTIC: creates job sync (status `downloading`/`queued`), writes `state.downloadJobs`, emits `download:started` BEFORE any POST; `_firePost` serialized :123-169.
- SSE `_connectSSE()` — single EventSource `/comfy/downloads/stream`; on `open` fetches `/comfy/downloads/status` :263 and MERGES :286-295 (MPI-241: keep active client jobs the backend omits; **backend wins for shared modelIds**); `if (jobs && jobs.length)` :266 — EMPTY backend snapshot skips the whole block → stale client jobs survive.
- `download:started` DOUBLE-fires (client emit :73 + SSE echo :323).
- Cleanup: uninstall/cancel/failed remove the job; **`complete` jobs are NEVER removed in-session** :361-363 (MPI-241 no-flash intent). `state.downloadJobs` not persisted (reload clears).
- Refresh button `awaitReSync()` :561-572 — remoteEngineClient.refresh + reSyncInstalledModels + renderList. Does NOT touch `state.downloadJobs`, does NOT re-fetch `/downloads/status`.

## Phantom mechanisms (match live evidence)

- **A. Optimistic job + swallowed backend request** — POST returns 200 but backend no-ops (see 01 §3) → job stays `downloading` forever, 0%/stuck bar. NO cleanup path.
- **B. SSE-open rehydrates stale backend jobs** — backend `/status` returns old `complete`/`verifying` jobs (backend maps have no TTL) → injected into `state.downloadJobs` :295 → `isBusy` → stuck "100%" / "Verifying…" on untouched cards. **Exactly the user's screenshots.**
- **C. Backend-wins merge clobbers fresh client job** — stale 36% backend job for same modelId replaces the fresh 0% one.
- **D. Stale `_modelDepStatusCache` post-uninstall** until async resync lands → phantom partial bars.
- **E. `complete`-job-never-removed + `isBusy` includes complete** → "100%" persists until a renderList with updated `model.installed` happens to run.

## Multiple sources of truth (renderer)

1. `MODELS[].installed` (in-place mutated, modelRegistry :149) — MpiModelManager reads it directly.
2. `state.s_installedModelIds` — set by shell.js on `models:checked`; other components read this. TWO different installed-state sources across components.
3. `_modelDepStatusCache` (modelRegistry :31) — never invalidated except full resync.
4. `state.downloadJobs` — never pruned of terminal jobs.

## Perf note

`_listSignature()` :1056 calls `_computePartial` for EVERY model on every signature check → O(N×M) per potential render.
