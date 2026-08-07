# MPI-464 — the orphan sweep has no REMOTE twin

## Read first

- `docs/download-manager.md` § **The orphan sweep** (the local implementation this
  mirrors) and § **Shared-dep uninstall guard** (why the guard keeps files at all).
- `.claude/rules/comfy_engine.md` § Engine Split — this card exists *because* of the
  half-wire trap it describes.
- `routes/downloadManager.js`: `_orphanedDepIds`, `_sweepOrphanedDeps`,
  `_localSharedDepsMap`, `_remoteSharedDepIds`, and the uninstall route
  `POST /comfy/models/uninstall` (the remote branch returns ~:2682, before the sweep).
- `tests/orphan-sweep.test.cjs` — the local guard rails to mirror.

## The gap

MPI-462 shipped a post-uninstall orphan collector on the **local** route only. The
remote branch returns early, so uninstalling on a Pod still leaves deps that nothing
installed on the volume wants, with no way to reclaim them. The volume persists across
Pod restarts, so it accumulates and the user pays for the disk.

The mechanism is identical to local and is NOT a bug in the guard: keeping a shared dep
because a sibling defends it is correct at that instant, and nothing ever re-asks once
that sibling stops being installed.

## Shape of the fix

Mirror the local one exactly — same primitive, no second notion of "orphan":

- Protection map = **`_remoteSharedDepIds(null)`** (nothing excluded), the remote twin of
  `_localSharedDepsMap(null)`. Verify it accepts a null exclusion the same way; if it
  cannot, make it, rather than hand-rolling a parallel ownership test.
- "Is it actually on the volume" needs a **volume inventory** — the local sweep gets this
  free from `fs.pathExists`. Look at `remoteModels.remoteModelsCheck` / the wrapper's
  listing endpoint. This is the part with no local analogue and the reason the card exists.
- Delete via `remoteModels.remoteUninstallDep`, the same call the remote branch already
  uses. Honour `status === 'unsupported'` (older Pod images have no delete endpoint) —
  an unsupported sweep is a no-op, never an error.

Mirror every refusal, and mirror the tests:

- never `custom_nodes` (image-resident or volume-installed, work-not-bytes),
- never `targetPath` weights, never universal deps,
- honour `deleteFiles === false` — "keep files" keeps everything, not just the selected,
- never fatal: the uninstall already succeeded before the sweep runs.

Extend the log line with `swept N orphaned`. **`swept 0` is a valid pass** — do not
manufacture an orphan to watch it fire.

## The bar for done — do not lower it

**A live Pod is required.** This card was split off precisely because deletion code aimed
at a user's volume must not ship unverified. `_localSharedDepsMap`'s history is the
warning: MPI-310 destroyed 5.24GB of user data with an adjacent change to this guard, and
MPI-258 B1 left ~19GB undeletable swinging the other way. Both directions are live
failures, not theory.

Before deleting anything on a real volume, run the classifier **read-only** first and read
the list — the local equivalent reported `65 protected / 41 eligible / 0 on disk`, which is
what caught that it would do the right thing.

Local-only evidence does NOT close this card. Pair it with a Pod session
(MPI-385 is the Pod-session umbrella).

## Concurrency note

`board.json`, `.agents/mpi-kanban/events.jsonl` and this tree are edited by peer sessions
live. Re-`git status` immediately before committing and commit only your own paths.
Card events go to `tasks/MPI-464/events.jsonl` **and** `.agents/mpi-kanban/events.jsonl` —
NOT `board.json`'s embedded `events` array, which is a stale partial mirror
(`.claude/rules/kanban.md` rule 6).
