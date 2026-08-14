# MPI-531 — Plan (item 1 slice only)

Picked up 2026-08-14 to **unblock MPI-552** (foley / extend / lipsync). Scope is
deliberately ONE slice of the card:

- **IN:** item 1 — extend `FlowStepField` with `slider` / `number` / `text`.
- **IN (scope extension, see below):** `FlowDef.controls` — declared fields on the
  RUN slide.
- **OUT:** item 2 (`steps[].image`), item 3 (author every 1.5 Flow declaratively —
  that is MPI-552's own work), item 4 (port `MpiFlowHeadSwap`).
- **OUT:** MPI-532 entirely. The 1.6 package format is not being designed here.

The card stays in `doing` only for this slice; the remaining items stay open on it.

## Why the scope grew by one key

Item 1 as carded is not sufficient and the card did not know it. `fields` render on
MIDDLE steps only — `_buildStepSlide` → `_buildFieldsRow`. The LAST step's controls
come from exactly one place:

```js
if (props.uiComponent) {
    _perFlow = props.uiComponent.mount(contentSlot, { initialInputs: seeded });
}
```

`MpiBaseFlow.js:732`. So a Flow that needs a prompt, a seed or a width TODAY must
ship a JS component — which is the debt this card exists to stop. Adding field types
without a run-slide surface would leave MPI-552 exactly as blocked as it is now.

`controls: FlowStepField[]` is the smallest fix: same field vocabulary, same
renderer, values merged into the run inputs under the field's own `id`. That is
already the contract the ripped `MpiFlowImageRegen` implemented by hand —
`el.getInputs = () => ({ positive: promptEl.value.trim() })` — so this is the
declarative form of a shape the app already ships, not a new one.

`uiComponent` is untouched and still mounts. Head Swap keeps working unchanged.

## Steps

1. Extract the per-field renderer out of `_buildFieldsRow` so ONE builder serves both
   the step row and the run controls — the frame renders both, which is the reason
   the doc gives for the frame owning fields at all (consistency for free).
2. Add `number`, `slider`, `text` to that builder. `text` takes an optional `rows`;
   `rows > 1` renders a `textarea` (the prompt case — `MpiFlowImageRegen` used
   `rows="3"`).
3. Add `FlowDef.controls`, rendered stacked into the run slide's `contentSlot`,
   seeded from `state.s_flowInputs[flow.id]`, merged top-level in `_collectInputs()`.
   `uiComponent`'s `getInputs()` merges AFTER, so a flow declaring both keeps the
   component authoritative.
4. Typedefs in `js/data/flowsRegistry.js` (`FlowStepField` + `FlowDef.controls`).
5. CSS for the new types + the stacked modifier.
6. Update `docs/playbooks/add-flow/ui/carousel-frame.md` — it currently documents the
   3-type row and says the last step's controls are the flow's component.

## Verification

- `node --check` on every edited `.js`; `npm test` stays green.
- **The real proof is MPI-536 (foley) authored with NO `uiComponent`** and running in
  my own app instance (`npm run app:isolated`, never `:3000`). Field types with no
  Flow using them is not evidence. That run closes this slice.

## Plan Drift

(none yet)
