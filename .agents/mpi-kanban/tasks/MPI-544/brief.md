# MPI-544 - install-toast spam

Carried out of the MPI-542 umbrella so 1.4.1 can ship without it.

## What was seen

During the 2026-08-11 download-mode Pod incident, a burst of install/completion
toasts appeared for installs that were not running.

## What it is NOT

- NOT the MPI-539 reconcile path. The client's `download:complete` handler drops
  events with no `modelId` by design (MPI-97), and that path broadcasts
  `modelId: null`.
- NOT the remote-abandon path. Since a75c8a3e that goes terminal exactly once per
  model job, through `_checkModelJobsComplete()`.

## First candidate

A MODEL-LEVEL `download:complete` re-broadcast when the install SSE reconnects and
replays. The snapshot protocol (MPI-276 G9) versions deltas so a stale one is
dropped - but a replayed TERMINAL event is not a delta.

## What to capture before writing any code

1. The `[download]` lines in `logs/app.log` around the burst.
2. Whether the SSE reconnected in that window.
3. Whether the toasts name a model, or are the generic one.

Unreproduced is not the same as ignored: with no evidence, any fix here is a guess
at a mechanism nobody has observed.
