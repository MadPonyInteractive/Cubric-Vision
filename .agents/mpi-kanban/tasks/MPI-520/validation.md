# MPI-520 — Validation

App-side wire **complete and verified**; one gate stays open and it is the user's.

## What shipped

`ltx-extend` — the first Flow with **no `uiComponent`**. Its three controls are declared data
(`FlowDef.controls`, unblocked by MPI-531 item 1 in the same session).

| Piece | Where |
|---|---|
| Workflow | `comfy_workflows/raw/flow_ltx_extend.json` (renamed from `ltx_v2v_template.json`) → `comfy_workflows/flow_ltx_extend.json`, 56 API nodes |
| Op (4 files) | `flowLtxExtend` in `commandRegistry.js`, `universal_workflows.js`, `js/core/operationRegistry.js`, `operation_registry.json` (`appVersionIntroduced: 1.4.1`) |
| Descriptor | `js/data/flowsRegistry.js` |
| Doc | `docs/playbooks/add-flow/existing-flows/ltx-extend.md` |

## Evidence

| Check | Result |
|---|---|
| `workflow-to-api.mjs` against the APP engine (48188, not the 8188 bench) | 56 nodes, exit 0 |
| `validate-injection-rules.mjs` | ✓ clean |
| `tests/inject-params-titles.test.cjs` (new case pins `input_video/positive/negative/seed/duration` + `output_video`) | pass |
| `npm test` | 591/591 |
| `eslint js/ --max-warnings=0` | clean |

**Live in an isolated app instance** (own port + profile; the user's `:3000` untouched):

- `flow:open` mounts a 2-step carousel with no per-flow component.
- The run slide renders the prompt, the negative (pre-filled with the bench negative) and the
  seconds slider with its readout.
- The collected payload, read from `state.s_flowInputs` while the availability guard held the
  dispatch (nothing queued, engine queue empty afterwards):

  ```json
  { "positive": "the camera pushes in as she turns to leave",
    "negative": "letterbox, black bars, …",
    "injectionParams": { "Input_Duration": 7 } }
  ```

- Close → reopen restores all three.

## The open gate

**No real generation has been run through the app.** The graph itself is bench-proven and
user-approved, and `docs/playbooks/add-flow/05-verify.md` puts the live run with the user.
Until that run happens the card is `validating`, not `done`.

The run needs: the `ltx-23-balanced` card installed (the graph bakes the int8 transformer), a
source clip dropped on step 0, a prompt, and Generate. What to watch: the delivered clip
should keep the SOURCE resolution (the graph derives width/height from `Input_Video`), and the
added seconds should match the slider after the graph's 8-frame snap.

## Deferred, deliberately

`Input_Width` / `Input_Height` as `MpiInt` (the card's second half). It needs a bench
re-export — agents never hand-edit a workflow JSON — and the flow is coherent without them:
output matches the source. Detail + the "do not copy foley's opposite decision" warning are in
`docs/playbooks/add-flow/existing-flows/ltx-extend.md`.
