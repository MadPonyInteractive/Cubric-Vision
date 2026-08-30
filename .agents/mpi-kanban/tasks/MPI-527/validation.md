# MPI-527 — validation

Umbrella closed 2026-08-30 because both members closed. It built nothing of its own; the
evidence lives on the members.

| Member | Outcome | Evidence |
|---|---|---|
| MPI-522 | `done` — overtaken | `07b8e8b2` (2026-08-11, under MPI-542's id) fixed both defects. Re-verified here: `node --test tests/portable-win-layout.test.cjs` → 8 pass, 0 fail, **0 skipped**. Detail in `tasks/MPI-522/validation.md`. |
| MPI-523 | `done` — fixed | `apply-update.cjs` copies the manifest explicitly; new `tests/portable-update-apply.test.cjs`, mutation-checked; `npm test` 798/798. Detail in `tasks/MPI-523/validation.md`. |

## What the umbrella asked that the members answered

Its own question was *"what else in this pipeline asserts something it never verified?"* — the
sweep found one more instance and it is the reason MPI-522 read as unfixed for nineteen days:
`scripts/overtaken-cards.py` only reports a card whose **own id** appears in a later commit, so
work that lands under a neighbouring card's id is invisible to it. MPI-522 was fixed under
MPI-542. That is a limit of the sweep, not a defect in it, and it is worth knowing at the next
close-out.

## Not done here

`npm run release:check` fails on an unrelated, pre-existing gate — the engine pin moved
0.31.0 → 0.34.0 since v1.4.2 and `dev_configs/smoke-evidence.json` is stale against it. That is
MPI-595's Gate B (smoke evidence) and needs a GPU.
