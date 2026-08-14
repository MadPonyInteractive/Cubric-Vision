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

## Current State (2026-08-14, handoff)

Item 1 slice **SHIPPED and verified** — `55461326` (frame + typedef + playbook docs) and
`621174e6` (the first Flow using it). Evidence in `validation.md`; checklist fully ticked.
591/591 suite green, eslint clean, both commits pushed.

Items 2 (`steps[].image`), 3 (author every 1.5 Flow declaratively) and 4 (port
`MpiFlowHeadSwap`) are **untouched and still open**. The card is a 1.5 release blocker until
they land. MPI-532 was deliberately not started.

## Plan Drift

**The scope grew by one key, and it had to.** Item 1 alone unblocks nothing: `fields` render
on middle steps only, and the run slide's controls came solely from `props.uiComponent`. So
`FlowDef.controls` shipped with it — declared run-slide controls, `Input_*` ids routed into
`injectionParams`. The card body still describes item 1 as just the field types; that is now
understated, not wrong.

`number` is implemented but has **no live consumer yet**. Its first will be extend's
width/height (MPI-520), which needs a bench re-export.
