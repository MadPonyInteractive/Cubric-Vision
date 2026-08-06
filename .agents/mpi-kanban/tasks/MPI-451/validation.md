# MPI-451 validation

Commits: `08ca8805` (gate), `3ee86238` (drawer route), `a56a9a09` (stray clientLogger fix).

## Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| 1 | A gated dep cannot download until shown + accepted | Driven live: `downloadService.start('minimax-h3', deps)` with `_start` stubbed — dialog opened, `_start` not called. Cancel and Escape both declined without installing. |
| 2 | Acceptance recorded per model, survives a restart | Receipt written to `mpi_model_licence_accepted` on accept; a second `start()` of the same model ran **synchronously with no dialog**. `tests/licence-gate.test.cjs` pins the restart case and the version bump. |
| 3 | Renders the Use Restrictions and the AUP, and states they apply | Section V (5 clauses) and Exhibit A (20 items) verbatim from the live `LICENSE`; 25 `<li>` counted in the DOM. The second acknowledgement is the "they apply to me" statement. |
| 4 | Territory-restricted → licensor's own authorization route, no disclaimer | Banner names the four Excluded Territories and carries a "Request your authorization" button to MiniMax's own form. No "your responsibility" copy anywhere. |
| 5 | Descriptor-driven — a second model is data only | `MODEL_LICENCES` keyed by model id in `js/data/modelConstants/licences.js`. Adding Flux is one entry. |
| 6 | Models with no descriptor completely unaffected | Proved, not assumed: `start('sdxl-realistic', [])` reached `_start` **in the same tick** — the ungated path is still fully synchronous, which `MpiModelManager._install()` depends on. Ungated drawers render no licence row. |
| 7 | A misuse-reporting route is reachable from the app | Discord in the gate **and** a standing LICENCE row in the model detail drawer (licence / authorization / report), so it survives the one-time dialog. |

## Three defects the browser found and the source could not

1. **The scroll gate gated nothing.** Every scroll metric is 0 before the modal is laid
   out, and `0 + 0 >= 0 - 4` is true, so `readToEnd` was set during `setup()` and the
   dialog shipped with its checkboxes already enabled. `_atEnd()` now requires
   `clientHeight > 0`.
2. **`clientLogger.log` does not exist** (the API is info/warn/error). It threw between
   the dialog closing and the promise resolving, so the install promise stayed pending
   forever — which would have wedged the serial install chain. `finish()` now resolves
   before it logs. The same call existed once more in `MpiErrorDialog` and is fixed.
3. **The dialog overflowed the viewport at 720px**, pushing Cancel/Accept off screen.
   The restrictions pane is now the only row allowed to shrink.

## Still open — not a defect, a dependency

**The H3 model id.** The descriptor is keyed `minimax-h3`. If the MPI-452 wiring session
names its ModelDef anything else the lookup misses and H3 installs with **no gate at
all**, silently. Message sent to that session
(`state/messages/b7f1c0de-4d51-4e0a-9c2f-3a51d1c9e401.json`); re-key or confirm before
MPI-452 closes.

## Deliberately left to MPI-452 (they are in its acceptance criteria, not this card's)

The `NOTICE` file with the licensor's exact string, the shipped licence text reachable
in-app (the gate links the HF blob instead), and the "Powered by MiniMax H3" attribution.
