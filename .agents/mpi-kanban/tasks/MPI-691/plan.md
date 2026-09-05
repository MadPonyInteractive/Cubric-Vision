# MPI-691 Plan — a Pod container restart hangs remote installs forever

## Current State

A container OOM-restart does not make remote mode inactive: the Pod is still
there and the wrapper comes back healthy on the same URL. So the app's only
terminal path for outstanding remote deps — `_failOutstandingRemoteDeps`, gated
on `!remoteModels.isRemoteActive()` — never fires.

What actually happens (`routes/downloadManager.js`):

1. SSE closes → `_onRemoteStreamClosed` → remote still active → reconcile
   against volume truth (nothing finished) → reconnect with backoff.
2. The reconnect **succeeds** — the wrapper is fine. But its `_installs`
   registry died with the container, so nothing is downloading and no tick ever
   arrives.
3. 90 s later the MPI-136 stall watchdog fires and calls
   `_onRemoteStreamClosed('silent-stall')` — back to step 1. Forever.

Observed 2026-09-04: 70+ minutes of `/health` and `models/status` polling at
200, volume frozen at 60.6 GB, `.part` bytes byte-identical over 91 s, Pod RAM
41 MB / 4 GB. The user sees "recovering", then silence — no failure, no toast,
no Retry.

The primitive to detect this **already exists**: `remoteActiveInstallIds()`
(`routes/remoteModels.js:686` → `GET /wrapper/models/install/active`, MPI-481,
shipped in every Pod image since v0.2.1). It is the wrapper's own registry of
what is really running. Today it is only consulted by the ATTACH guard in
`_startRemoteDownload`; the recovery path never asks.

## Remaining Work

1. `_recoverOrphanedRemoteInstalls()` — chained onto the reconcile in
   `_onRemoteStreamClosed`. Ask `remoteActiveInstallIds()`; any dep still in
   `_remoteDepIds` that the wrapper is **not** installing is an orphan: re-enqueue
   it through MPI-690's pump. aria2 resumes from the `.part` already on the
   volume, so a re-issue costs nothing already downloaded.
   Throws (unreachable / old wrapper) → warn and let the reconnect proceed
   exactly as today. Never force-fail on a failed *question*.
2. Bound it. `_remoteReissueRounds`, incremented per recovery round, reset to 0
   in the SSE event handler beside the existing `_remoteReconnectAttempt = 0`
   (any real event — progress or terminal — is progress). Past
   `REMOTE_REISSUE_LIMIT = 3` rounds with nothing moving, call
   `_failOutstandingRemoteDeps('remote installs will not restart')`: terminal
   state, `toast: true`, model-level `download:failed`, working Retry. A stall
   that can never recover must reach a terminal state.
3. Keep the dep spec. Re-issuing needs the full dep object (`url`, `type`,
   `filename`, `sha256`, `requirementsOnly`, `forceReinstall`), not just an id —
   `_remoteDepSpecs` map, written where the install is issued, pruned on settle.

Same silence-reads-as-progress class as MPI-539, which fixed the
remote-INACTIVE case and left this one.

## Verification

**Verify mode:** auto

- `npm run lint`
- `npm test`
- New test: wrapper reports no active installs while deps are outstanding →
  the deps are re-issued; after `REMOTE_REISSUE_LIMIT` fruitless rounds they
  fail terminally with the abandon message.
- Live: the resumed smoke matrix. If a restart happens again, the run must
  either recover on its own or end with a real failure — never 70 minutes of
  silence.
