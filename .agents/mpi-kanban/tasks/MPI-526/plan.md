# MPI-526 — Weight deletion and the disk it never gives back

Umbrella created by the consolidation sweep, 2026-08-10. Two `todo` cards, one root:
`_trash` in `routes/downloadManager.js`.

**The member cards stay on the board.** Nothing was closed, merged or deleted to make
this. Close a member when the phase covering it lands, and say so in its card. If the
members turn out to be the better unit, delete this umbrella instead.

## Members

| Card | What it is |
|---|---|
| MPI-500 | Recycle Bin or permanent delete — a Settings toggle (scope settled 2026-08-29, superseding the 2026-08-09 "delete everywhere" call; see tasks/MPI-500/plan.md) |
| MPI-499 | `npm test` leaks ~10 GB of real disk per run — `ftruncate` is not sparse on NTFS, and the code under test trashes the fixture |

## Current State

Not started. Both members carry full root-cause evidence; read those, this file only
holds the shape.

## Why one card and not two

Each card already names the other as half its own fix, independently:

- MPI-500: *"SIDE EFFECT WORTH HAVING: this is half of the npm-test-leak card's fix — a
  permanent delete makes the leaked fixture reclaimable by the test's own cleanup."*
- MPI-499: *"Fixing the permanent-delete card removes the PERSISTENCE but not the per-run
  write cost; both halves want doing."*

That is the whole argument. `downloadManager.js:305` `_trash(localPath)` is why a user's
uninstall does not return the space AND why `tests/orphan-sweep.test.cjs` cannot reclaim
its own 10.59 GiB fixture — the sweep already moved it to the Recycle Bin before
`fs.rmSync(ROOT)` runs. Fixing them in two passes means touching `_trash` twice and
re-deriving the same blast radius twice.

## Phase 1: Settle the scope, then flip `_trash`

MPI-500. **Scope is open and is the first thing to settle** — the orphan sweep is agreed,
but the UNINSTALL path also trashes and that was a deliberate "recoverable by the user"
design on MPI-276's G4 preserve-verbatim list. Changing it is a product call: **ask Fabio
before touching the uninstall surface.**

Then sweep the blast radius per the root-cause rule: grep every `_trash` call site, and
remember the engine split — the LOCAL and REMOTE uninstall branches are separate code and
the remote branch deletes through the wrapper, not through trash. A one-branch fix here is
a false done. If the answer is "everywhere", `trash@8` leaves `package.json` too.

## Phase 2: The per-run write cost

MPI-499's remaining half. Phase 1 removes the PERSISTENCE (the bin stops accumulating);
it does not stop the test writing ~10.59 GiB of real bytes per run, because `ftruncate`
fully allocates on NTFS. The completeness check only stats size, so the fixture needs the
right `st_size` and no real bytes: set the NTFS sparse flag explicitly before truncating,
or stop using a multi-GB dep as the orphan fixture.

**Do NOT weaken the assertion that the sweep really removed the file** — that assertion is
the entire point of MPI-462.

## Verification

Phase 1: uninstall a dep, then confirm the bytes are gone from disk and NOT in the Recycle
Bin — on both engine branches. Phase 2: run `npm test`, then `du` the temp root and check
`fsutil sparse queryflag` on the fixture. `npm test` gates the release and runs in CI on
every push, so a regression here is loud.

## Parallel Batch

None. Phase 2's fixture behaviour depends on what phase 1 decides about `_trash`, and both
phases reach `routes/downloadManager.js`.

## Plan Drift

(none yet)
