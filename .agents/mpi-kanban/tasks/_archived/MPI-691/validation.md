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

## The live path DID NOT FIRE — and that is the honest result

The resumed smoke matrix ran 2026-09-05 08:07–08:57Z against the app restarted at
07:51:56Z (fix commit `819ab084` landed 07:47:46Z, so the main process carried it).
All 102 deps installed across 12 models with **no container restart during the
download phase**, so the recovery path had nothing to recover.

`app.log` under `[download]` for the whole run is one line:

```
[2026-09-05T07:51:59.432Z] [INFO] [download] curated python deps already installed (3921692037b5daec)
```

No `re-issuing (round n/3)`, no `remote deps unrecoverable`. This card therefore
**closes on its unit evidence** (4 cases in `tests/remote-restart-reissue.test.cjs`,
`isRemoteActive()` stubbed true throughout because that IS the bug), and the live
leg is recorded as UNEXERCISED rather than passed. Silence here is absence of the
trigger, not proof of the fix.

MPI-690's fix is the likely reason it never fired: capping the fan-out at 3 removed
the memory pressure that was OOM-killing the download Pod, and that OOM was what
restarted the container in the first place. The two cards were always one story.

What would exercise it, if it is ever wanted: kill the wrapper mid-install (or
`POST /wrapper/restart-comfy` while deps are outstanding) and watch for
`re-issuing (round 1/3)` followed by aria2 resuming from the `.part`.

A separate, unrelated OOM DID occur later in the same run — `minimax-h3/t2v_ms`
SIGKILLed the GPU Pod's ComfyUI during the *generation* phase (`[cubric] internal
ComfyUI exited unexpectedly (code -9)`). That is the H3 memory footprint, not a
download-path restart, and it is covered in the 1.4.5 release notes.
