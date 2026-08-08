# MPI-481 — validation

## What shipped

`_startRemoteDownload`'s ATTACH guard no longer trusts its own in-flight cache.
A new `remoteActiveInstallIds()` (`routes/remoteModels.js`) reads
`GET /wrapper/models/install/active` — the wrapper's own `_installs` registry —
and the guard skips a dep only if the wrapper still reports it
`state: 'downloading'`. A dep the wrapper disowns is a corpse: it is dropped from
`_remoteDepIds` and falls through to a real install.

## Corrections to the brief

- **Fix (1) as written would have regressed MPI-97.** The brief proposed
  cross-checking the `'downloading'` arm against `statusResults`, "already in
  scope". It cannot answer this question: `installed: false` is what a corpse AND
  a genuinely live download both report, so treating it as "not in flight" fires
  a duplicate `/wrapper/models/install` for every real shared-dep attach. The
  wrapper 409s that ("this model is already downloading") and the whole model
  fails with the Download-Failed + Report-on-GitHub dialog MPI-97 removed. The
  live install registry is the only source that separates the two.
- **Fix (2) folded into fix (1), and it covers more than "no Pod is active".**
  `_remoteDepIds` and `depJob.status === 'downloading'` are set and cleared on the
  same lines — they are one cache, so one cross-check settles both. Scoping the
  invalidation to "no Pod active" would also have missed the case where a Pod is
  active: a REPLACEMENT Pod (new id, fresh wrapper) and a warm-stop/resume (same
  id, restarted wrapper, empty `_installs`) both leave the app's records stale
  while `isRemoteActive()` reads true.
- **Fix (3): there is no third instance.** The guard's third arm is
  `reallyComplete`, already covered by MPI-100. The local siblings
  (`startModelDownload` :1635, `startUniversalWorkflowInstall` :3118) skip a dep
  reading `'downloading'` too, but a local download and its `_activeDownloaders`
  entry live and die in ONE process, so that state cannot outlive its producer.

## Proven

`tests/remote-attach-stale-inflight.test.cjs` — 4 cases, runs the REAL
`_startRemoteDownload` with every wrapper call stubbed (no Pod, no port, no disk):

- a live install still ATTACHES (MPI-97 does not regress)
- a corpse is re-installed once the wrapper disowns it
- a corpse already on the volume drops its `_remoteDepIds` record, so the MPI-136
  stall watchdog and the SSE stream can go idle
- an unanswerable wrapper falls back to the old cache-trusting behaviour

Mutation-checked: reverting `reallyInFlight` to the cached value fails cases 2
and 3 and leaves 1 and 4 green. Full suite `node --test "tests/*.test.cjs"`:
**503/503 pass**.

## Still owed before this card closes

A LIVE remote reproduction. Nothing here has touched a Pod: the wrapper contract
(`/wrapper/models/install/active`, keyed by `inst_id` = our dep id, present since
image v0.2.1) was read out of `wrapper/wrapper.py`, not observed. The bar is a
Pod install interrupted for real — kill or delete the Pod mid-fill, press Install
again on the same model, and see a wrapper install actually fire where it
previously did nothing. That fits the MPI-467 smoke run, which is where the bug
was found.
