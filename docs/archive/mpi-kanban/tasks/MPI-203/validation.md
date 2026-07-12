# MPI-203 Validation

**Verify mode:** user-ux — concurrent local/remote gens + stop timing must be felt in the app.

## Results

- 2026-07-05 (user, live, mixed local+remote on pod tviytbwibt4nbu / 4090):
  All four fixes user-verified ("verified"):
  1. Reconcile-replay: missed-terminal remote gen now completes in-app (card +
     bar + lane) instead of wedging — `_reconcileFromHistory` replays synthetic
     `executed`/`execution_success` through the prompt listener.
  2. Lane stomp: stop-with-queued-follow-up → follow-up stays in queue with STOP
     (identity guard in `_dispatchNextCue` wrapper).
  3. Status-bar stomp: stopped gen's late terminal no longer resets the bar off
     a promoted successor (id-tagged lifecycle events + `_activeGenId` guard).
  4. Two-lane bar: concurrent local+remote → bar tracks last-active gen with
     fallback to the surviving lane; no lane runs progress-blind.
- Logic sim (scratchpad latch-sim.mjs): 5 sequences pass incl. two-lane
  fallback + stop-stomp. ESLint 0, node --check clean on all edited files.

## Files
- js/services/comfyController.js (reconcile replay)
- js/services/commandExecutor.js (seen-node guard, exec.genId, id-tagged emits)
- js/services/generationService.js (lane identity guard, id-tagged terminals)
- js/shell/statusBar.js (_latch last-active-wins + terminal ownership guard)
