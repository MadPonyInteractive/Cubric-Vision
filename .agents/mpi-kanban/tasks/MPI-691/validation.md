# MPI-691 Validation

## What changed

`routes/downloadManager.js`
- `_recoverOrphanedRemoteInstalls()` — chained onto the reconcile in
  `_onRemoteStreamClosed`. Asks `remoteModels.remoteActiveInstallIds()`
  (MPI-481, `/wrapper/models/install/active`, in every Pod image since v0.2.1 —
  the primitive already existed and the recovery path simply never called it).
  Any dep still in `_remoteDepIds` that the wrapper disowns is re-enqueued
  through MPI-690's pump; aria2 resumes from the `.part` on the volume, so a
  re-issue re-downloads nothing.
- `_remoteDepSpecs` map keeps the dep object while a dep is outstanding — a
  re-issue needs `url`/`type`/`filename`/`sha256`, which `_depJobs` does not
  fully carry.
- `REMOTE_REISSUE_LIMIT = 3` bounds it. `_remoteReissueRounds` resets on any
  real SSE event (beside the existing `_remoteReconnectAttempt = 0`) and on
  teardown. Past the limit, `_failOutstandingRemoteDeps` gives a terminal state,
  `toast: true`, and a model-level `download:failed` with a working Retry.
- `_failOutstandingRemoteDeps`'s log line no longer claims the target is
  inactive — MPI-691 gave it a second caller where the Pod is still reachable.

## Evidence

`npm test` — **897/897 pass**, `npm run lint` clean, both run 2026-09-05.

New `tests/remote-restart-reissue.test.cjs` (4 cases), `isRemoteActive()` stubbed
**true** throughout, because that is the whole bug: a restart never makes remote
mode inactive.
- wrapper disowns our installs → both deps re-issued, outstanding again.
- wrapper still owns them (a plain SSE blip) → nothing re-fired; a duplicate
  install 409s and raises the Download-Failed dialog MPI-97 removed.
- wrapper unanswerable (404 / old image) → no re-issue, no settle. A failed
  *question* is not evidence of an orphan.
- installs that never restart → after `REMOTE_REISSUE_LIMIT` rounds every dep is
  `failed` with `toast: true` and the abandon message, **and the model job is
  `failed` too** — a dep-level failure alone is invisible to the client (MPI-539).

The terminal-state case drives `_recoverOrphanedRemoteInstalls` directly: in
production consecutive rounds are separated by the MPI-97 reconnect (whose
pending timer short-circuits a second close) and then the 90 s stall watchdog, so
back-to-back `_onRemoteStreamClosed` calls only ever exercise round 1. That was a
real gap in the first draft of the test, caught by it failing.

## Not yet verified

The live path. Closing evidence is the resumed smoke matrix: if the Pod restarts
again, the run must either recover on its own (a `re-issuing (round n/3)` line in
`app.log`) or end with a real failure. Never 70 minutes of silence.
