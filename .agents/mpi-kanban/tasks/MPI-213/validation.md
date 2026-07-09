# MPI-213 Validation

## Root cause: intent-lane vs store-lane key mismatch (no-Pod local gen)

`generationService._laneOf` keyed the lane on `forceLocal` alone (`forceLocal ? 'local' : 'remote'`), but `generationStore` keys the job lane off commandExecutor's RESOLVED engine (`forceLocal ? 'local' : isRemote() ? 'remote' : 'local'`). No-Pod local gen (forceLocal=false, isRemote=false): intent lane='remote', store lane='local' -> the store's 'local' drain fires `_loopCallbacks.local` (never set), `_lanes.remote.active` never clears -> phantom '1 RUNNING'.

Initial 'settle(DONE) no-op on a pre-cancelled job' hypothesis DISPROVEN by the trace agent: no code path cancels the active job without user Stop.

## Fix (shipped, logic-verified)

`_laneOf` now mirrors the store's engine->lane rule: `forceLocal===true -> 'local'; else remoteEngineClient.isRemote() ? 'remote' : 'local'`. Files: js/services/generationService.js.

## Auto (green)
- `node tests/lane-agreement.test.cjs` -> all (forceLocal x isRemote) cases: intent lane == store lane (new guard, fails if either rule drifts).
- `node tests/generation-store.test.cjs` -> 20/20.
- `node --check` + `eslint` generationService.js -> clean.

## Live (user) - PASSED 2026-07-07
No Pod connected, LOCAL engine. Cue any local gen (PiD upscale with an image, or any t2i) -> on completion the Cue panel drains to '0 RUNNING / 0 QUEUED' and Stop/Clear re-enable. Repeat a few times; each completes and drains clean. VERIFIED by user 2026-07-07 (was: phantom '1 RUNNING' that never cleared).

## Residual (deferred, narrow - NOT fixed here)
- Async-gap race: a prior local job terminating in the ~1-microtask window between _dispatchNextCue's setLoopCallback and commandExecutor's async register() can consume _loopCallbacks.local early. Needs a prior in-flight local job + exact timing.
- Async-refresh edge: first gen right after Pod connect can lag isRemote() by one gen (MPI-179 resolve-once territory).
Both are hardening follow-ups. Deeper fix: derive the Cue panel + isGenerating from the store snapshot, not _lanes.active.
