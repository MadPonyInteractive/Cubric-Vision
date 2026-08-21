# MPI-404 — first-run state lies

Root cause, the merged MPI-405 half, and the full trace live in the card
`description` — this file carries only what the card could not: the product
decision that was blocking it.

## DECIDED 2026-08-05 by the user — the models root stays ENGINE-OWNED

The question was: is the first-run models-root choice an **app-level** setting that
outlives the engine (the structural fix — `extra_model_paths.yaml` written *from* a
stored root rather than *being* the root), or does it stay **engine-owned**?

**Answer: engine-owned. The hero simply must not claim a count it cannot have.**

So the fix is the honest, contained one:

- `heroStats.js` must not render `MODELS 0 / 18` when no install check has ever run.
  Zero-of-eighteen is not a measurement — it is `_renderModels(installedCount = 0)`,
  the untouched initial value (`heroStats.js:47`). It must read as an unknown /
  not-installed state, never as a count.
- Nothing changes in `getCustomRoot()` (`routes/shared.js:423`), in who writes
  `extra_model_paths.yaml` (`routes/engine.js:519`), or in the `engine:ready`
  subscription that gates `syncModelInstalled` (`js/shell.js:1465`). Those are
  correct under this decision, not worked around.
- The Model Library must still be coherent on a cloud-only machine: it states plainly
  why it cannot list what is on disk, rather than showing an empty or zeroed shelf.

**Do NOT** persist the models root app-side as part of this card. If that is ever
wanted it is a product change on its own card — it re-decides where the root lives for
the Model Library, the download targets and both engines, which is far past a
first-run display bug.

## Why the acceptance list moved

The original acceptance demanded "a truthful installed count without any engine
present". That was written before the decision and describes the *other* branch —
a count with no engine is exactly what an engine-owned root cannot produce. It has
been reworded to the honest-state form; the rest of the list is unchanged.

## Still in scope

The absorbed MPI-405 half is untouched by this decision: the ACCOUNT panel says the
controls are locked until a RunPod key is saved, and the "Stage all models on connect"
toggle below it is fully interactive with the key box empty. Same defect class — a
control asserting state the app has not got — which is why the two ride one card.
