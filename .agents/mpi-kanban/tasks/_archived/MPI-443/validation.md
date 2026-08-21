# MPI-443 - validation

Measured 2026-08-04 with port 3000 free (the user closed their instance for the run).

## Suites

- `npm test` — **417 pass / 0 fail** (was 298 on 2026-07-29).
- `npm run test:desktop` — **17 pass / 0 fail** in 1.2 min: the 3 new specs plus the
  8 that predate them, none of which were touched.

## Negative controls — every assertion proven able to fail

A spec that cannot fail is worth nothing, so each was sabotaged, observed red, and
reverted by re-applying the inverse edit (never `git checkout --`). `git status` on
`js/` confirmed clean after every revert.

| Sabotage | Result |
|---|---|
| Eager mount-time portal restored in `MpiDropdown` | `popup-contract` fails: `dropdown: popup was swept into the overlay stash (the 1.3.0 bug)` |
| Same in `MpiTreePicker`, dropdown restored first | `popup-contract` fails on `treePicker` — the two halves proven independently |
| `throw` in `MpiGalleryBlock.setup` | only `workspace-sweep > gallery workspace mounts` fails; the other three sweep tests stay green |
| `_rescanning` guard removed from `MpiModelSettings` | `openCallsAfterAssetChange` = **3**, expected 2 |
| ...and `_same()` removed from `assetService.loadAll` as well | **7792** — the MPI-356 console-flooding storm, reproduced on demand |
| A listener occupying port 3000 | run aborts in `globalSetup` with the close-the-app message |
| Port 3000 free | run proceeds past `globalSetup` — verified on a spare port while the app was up |

## The assertion that had to be rewritten

The first `open()`-call-count assertion was **vacuous**: it passed with the
`_rescanning` guard deleted. The live-rerender subscription is gated on `_isOpen`,
which `open()` sets on its last line, so a first open can never re-enter it. The
spec now changes `state.availableLoras` while the overlay is ALREADY open, which is
the only state the loop is reachable from — that is where the 3 / 7792 numbers come
from. Written up in `docs/testing.md` § Four traps and in the memory rule
`feedback_sabotage_can_be_shadowed_by_an_earlier_guard`.

## Not verified

- CI: deliberately out of scope — MPI-444.
- The specs have only ever been run on Windows.
- Closing approval: the card was moved to `done` on shipped-and-verified evidence
  without the user explicitly approving final completion. Flagged at close-out.
