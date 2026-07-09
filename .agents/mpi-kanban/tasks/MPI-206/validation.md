# MPI-206 Validation

## Fix
`js/shell.js` — `remote:connection` handler re-syncs installed-state on EVERY
resolved `connected:true` (was: first connect only, edge-dedup'd on
`!_wasRemoteConnected`).

## Self-verified (this session)
- [x] `node --check js/shell.js` — syntax OK
- [x] Emit path confirmed: `MpiRunpodSettings.js:682` fires `remote:connection
      {connected:true, ..._specs, phase:null}` on EACH successful connect →
      the second Pod re-triggers the branch.
- [x] `_specs` carries new Pod gpuType → `state.runpodConfig` updated before
      sync → `archSync` resolves the NEW arch.
- [x] `syncModelInstalled` replaces the whole per-model dep-status Map each
      run (modelRegistry.js:119-128) → no stale mxfp8/fp8 status lingers.
- [x] Resolver correctness (node repro): balanced card on Blackwell with only
      fp8 present → `fullyInstalled:false` for arch=blackwell / null / none.
      Data was already correct; only the re-check gate was wrong.

## Needs LIVE verify (user-ux — real Pod swap required)
- [ ] Connect a 4090 (modern) → install/confirm balanced tier shows installed
      (fp8). Delete Pod. Connect a 5090 (blackwell) in the SAME session.
- [ ] Models panel: balanced tier must now show NOT installed (mxfp8 missing),
      NOT a stale 'installed'.
- [ ] Generation picker + panel AGREE (no card shown installed while the
      picker hides it).
- [ ] Reverse (5090 → 4090) also re-checks correctly.

Verify per [[feedback_server_truth_over_ui_timing]] / [[feedback_runpod_not_local_engine_proof]]:
this is the REMOTE path; a real Pod swap is required, no local proxy.
