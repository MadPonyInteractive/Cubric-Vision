# MPI-320 — MPI-276 write-flip (retire the legacy runtime maps)

## Why now

MPI-317 F1 reintroduced download resume. Resume broke the lockstep the shadow-SOT
stage relies on: `download()` presets `depJob.downloadedBytes = partial.downloaded`
before streaming, and the reconciler settles the STORE from disk truth without ever
touching the legacy `_modelJobs`/`_depJobs` maps. Two trackers, two verdicts:

- **F4** — reconciler settled + immediately pruned the store job while the legacy-map
  walk was still in its custom-node phase; the pruned snapshot dropped the FE job
  mid-`installing`, so the model-level `download:complete` found `state.downloadJobs`
  empty (missed toast; cascade re-sync toasted stale models).
- **F5** — `_checkModelJobsComplete` (map-guarded) called `_setModelStatus('installing')`
  on a store job the reconciler had already settled `done` → correct but noisy
  "Illegal transition … rejected" per resumed install.

Both got narrow slices in MPI-317 (see below). The disease — two writers claiming to
know a job's state — stays until the flip.

## Already done (MPI-317 slices — keep, they die naturally with the flip)

1. `routes/downloadManager.js` `_setModelStatus`: store-terminal guard — once the
   store settles, the map finishes its walk without writing to the store.
   Test: `tests/download-completion.test.cjs` `testMapWalkDoesNotFightSettledStore`.
2. `js/services/downloadService.js` snapshot keep-set: `installing` added next to
   `pending|downloading|queued` so a reconciler prune can't drop a mid-install FE job.

Also observed (2026-07-21, benign): the DEP-level twin of F5 — user cancel pushes
`cancelled` onto already-complete store deps (3 "Illegal transition: complete →
cancelled" warns per cancel of a model with alreadyInstalled deps). `_setDepStatus`
has no terminal guard; not patched — dies with this flip.

## Scope (the deferred slice named in docs/download-manager.md § Shadow-SOT caveat)

1. Delete map status-writes: `_setModelStatus`/`_setDepStatus` write the STORE only;
   the maps keep transport detail (url, localPath, sha256Expected, pipPins) or die
   entirely in favor of a transport side-table keyed by depId.
2. `_checkModelJobsComplete` reads store dep states (today it reads the map — the
   F5 divergence site).
3. Flip pull endpoints onto `store.snapshot()`: `/downloads/status`, `/downloads/active`,
   `_serializeModelJob`.
4. Retire the remote stall-watchdog into the reconciler (OPEN-7 in the dossier).
5. G6 adapter split (local/remote engine adapters — recurring-pattern A cure).

## Non-negotiable inputs

- `tasks/MPI-276/research/04-bug-history-invariants.md` — the 12 invariants ARE the
  regression matrix. Read before any code.
- `docs/download-manager.md` — NOTE: § Backend still says "downloads are CANCEL-ONLY
  (no pause/resume)" — STALE since MPI-317 F1. Fix the doc as part of this card.
- Both engines, one pass (recurring pattern A: fix one engine, forget twin — 4+ hits).
- Live resume test on local AND remote before close.

## Process

`/mpi-create-large-plan` with MPI-276 research as backing. Not session-tail work.
