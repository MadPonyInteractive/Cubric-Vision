# MPI-481 checklist

- [x] `remoteActiveInstallIds()` in `routes/remoteModels.js` — read the wrapper's own
      install registry (`GET /wrapper/models/install/active`, present since image v0.2.1)
      and return the dep ids it reports as `state: 'downloading'`.
- [x] Cross-check BOTH in-flight arms of the ATTACH guard in `_startRemoteDownload`
      against it — `_remoteDepIds` and `depJob.status === 'downloading'` are the same
      Pod-scoped cache and go stale together, so one mechanism covers both.
- [x] Drop the corpse from `_remoteDepIds` when the wrapper disowns it, or the stall
      watchdog and the SSE stream never go idle again.
- [x] Wrapper unreachable / no answer -> keep the old cache-trusting behaviour. Never
      false-fire a duplicate install: the wrapper 409s it and that is the MPI-97
      Download-Failed dialog.
- [x] Sweep the sibling guards (local `startModelDownload`, `startUniversalWorkflowInstall`).
- [x] Node test in `tests/` proving the corpse now reaches `toInstall` and a live
      shared-dep install still ATTACHES.

All six done. The sweep found no third instance — see `validation.md`.
Remaining before `done`: one LIVE interrupted-Pod install.
