# MPI-451 validation

Commits: `08ca8805` (gate), `3ee86238` (drawer route), `a56a9a09` (stray clientLogger fix).

## Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| 1 | A gated dep cannot download until shown + accepted | Driven live: `downloadService.start('minimax-h3', deps)` with `_start` stubbed — dialog opened, `_start` not called. Cancel and Escape both declined without installing. |
| 2 | Acceptance recorded per model, survives a restart | Receipt written to `mpi_model_licence_accepted` on accept; a second `start()` of the same model ran **synchronously with no dialog**. `tests/licence-gate.test.cjs` pins the restart case and the version bump. **Deviation, see below:** the receipt is keyed by LICENCE id, not model id. |
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

## Deviation from criterion 2 — receipts are keyed by LICENCE, not by model

Criterion 2 says "recorded per model". It is now recorded per AGREEMENT, and the reason
is a fact the criterion predates: **H3 ships as two ModelDefs**, `minimax-h3` (fl2va) and
`minimax-h3-ref2va`, different transformer weights under one licence (confirmed by the
MPI-452 session, 2026-08-06). Keyed per model, a user would be shown the identical 25
clauses twice for one agreement.

The licence binds the **person** — "bind each recipient or user to enforceable terms" —
so a second dialog buys no consent, only friction. Two models under genuinely different
licences still get two dialogs; they have different licence ids. The receipt keeps
`acceptedVia` so we still know which install prompted it, and a `version` bump still
re-prompts.

Reverting to per-model is a one-line change (`all[licence.id]` → `all[modelId]`) if the
literal criterion is preferred; `tests/licence-gate.test.cjs` § "models sharing one
agreement share one acceptance" is the test that would need to go with it.

## H3 model id — CONFIRMED, no longer open

The MPI-452 session confirmed the ModelDef id is `minimax-h3` (message
`c4a91f7e-2d38-4b6a-9e15-7f2c8d4b3a60`), so the descriptor key is correct as written.
They also flagged the ref2va variant; **this session took that key** — `minimax-h3-ref2va`
is already in `MODEL_LICENCES` pointing at the same descriptor, so their ModelDef is
gated the moment it lands, with nothing to wire (reply
`e2d5b81a-6c07-4f93-8b24-5a90e6f7c132`).

Verified live through the chokepoint after the change: accepting via `minimax-h3` let
`minimax-h3-ref2va` install **synchronously with no second dialog**, and the ungated path
is still synchronous.

## Deliberately left to MPI-452 (they are in its acceptance criteria, not this card's)

The `NOTICE` file with the licensor's exact string, the shipped licence text reachable
in-app (the gate links the HF blob instead), and the "Powered by MiniMax H3" attribution.
