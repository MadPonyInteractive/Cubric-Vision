# MPI-572 Plan — kill the `uiComponent` escape hatch

**Verify mode:** user-ux

## Current State

Card premise was half-stale when opened 2026-08-17.

- **"First+last should be a frame-owned template" is ALREADY TRUE.** `_buildInputsSlide` /
  `_buildRunSlide` are frame-owned, no FlowDef declares them, `steps: []` yields a 2-step
  carousel, the ticker derives itself. Nothing to build.
- **The card's OPEN QUESTION was already settled and shipped 2026-08-16**, inside MPI-531:
  flow-level `controls` collapsed into `fields`. Code reads `flow.fields`
  (`MpiBaseFlow.js:254`); `docs/playbooks/add-flow/ui/carousel-frame.md`
  § "`fields` is the ONE control surface" records it and cites MPI-572 by name.
- **What is left is `uiComponent`** — the last thing in a FlowDef a manifest cannot carry,
  i.e. MPI-531's acceptance clause ("the FlowDef is fully expressible as a third-party
  manifest") is unmet by exactly one flow.

One user remains: `MpiFlowHeadSwap` (126 lines). It does two things:

1. The tier radio → `injectionParams.Input_Tier`. No `radio` field type exists
   (`select · button · toggle · number · slider · text`) but the `MpiRadioGroup` primitive does.
2. **Step value → graph param naming** (`stepValues.image1.box` → `injectionParams.box1`,
   key rename `w/h` → `width/height`). Not declarable today at all. This is the real blocker.

**2026-08-17 — all four phases SHIPPED, card is `validating`.** No flow ships JS any more, so
MPI-531's acceptance clause ("the FlowDef is fully expressible as a third-party manifest") is
met. Automated + live-render checks passed (`validation.md`); the one thing left is Fabio's own
run: a NON-default tier + two boxes, diffed against Comfy `/history`. A headless probe cannot
reach it — Head Swap's empty-run guard needs media in a slot.

**2026-08-17 — Fabio ran Head Swap on real weights. RESULT WAS BAD and the cause is UNVERIFIED.**
The swapped head came back as a BLEND of the original head and the reference head, rather than a
clean replacement. Fabio's read is "workflow related, not app related". **That has not been
checked, and it must be before this card closes** — a blend is exactly what a wrong or missing
`box1` produces (the mask fails to cover the original head, so its features survive the inpaint),
and `box1` is the precise path this card rewrote. Do not accept the workflow hypothesis on trust.

Next action: read the output's `.meta/` sidecar for that run and confirm
`injectionParams.box1` / `box2` are present and shaped `{x, y, width, height}` in absolute
top-left source pixels, and `Input_Tier` is a NUMBER. Sidecar first — it is a disk read and needs
no app. If the params are right, the app half is exonerated and it is a graph problem
(`docs/models/qwen-edit/` + `flow_head_swap.json`). If they are wrong or absent, this card
regressed Head Swap and the fix belongs here.

**Do NOT drive `:3000`** — that is Fabio's live session. Read from disk, or spin
`npm run app:isolated`.

## Approach

The frame must not learn "which role feeds which node" — that stays flow knowledge. But a
FlowDef can *declare* it instead of computing it in JS:

```js
{ kind: 'box', role: 'image1', param: 'box1', ... }
```

The frame reads `step.param` and writes the step kind's reported value into
`injectionParams[param]`. The `w/h` → `width/height` rename moves into the **box step kind**,
not the frame and not the flow: step kinds are a frame-side registry and a third party picks a
kind rather than writing one, so kind-shaped knowledge is manifest-safe.

`COORDS PASS THROUGH UNCONVERTED` (box-gizmo.md § Coord contract) still holds — the rename is
the only transform, exactly as today. Adding arithmetic here is the centre-anchor bug.

## Phases

### Phase 1: Declarative step→param binding
Frame reads `step.param`; box step kind owns the `w/h`→`width/height` rename. Head Swap's two
steps gain `param: 'box1'` / `param: 'box2'`. Component still mounted — both paths live, so
the payload can be diffed before anything is deleted.
**Verify:** `_collectInputs()` emits identical `injectionParams.box1/box2` with the component's
`getInputs` stubbed out.

### Phase 2: `radio` field type
One `_buildField` branch over `MpiRadioGroup`, carrying `options[].info` and the cost label
(`baseline` / `~25% of time` / `~13% of time`). Cost labels are RELATIVE, never seconds
(carousel-frame.md § Tier cost is RELATIVE).
**Verify:** Head Swap's tier declared as a field renders 3 columns, seeds from persisted
`injectionParams.Input_Tier`, and reaches the payload as `Input_Tier`.

### Phase 3: Delete the hatch
Remove `props.uiComponent` + the `extra`/`getInputs` merge in `_collectInputs`, delete
`js/components/Organisms/MpiFlowHeadSwap/`, and its 5 references:
`js/shell.js:460,469` · `js/shell/preloadStyles.js:56` · `js/components/types.js:1044` ·
`js/data/flowsRegistry.js:140`.
**Verify:** zero flows carry JS; `grep -r uiComponent js/` returns only doc prose.

### Phase 4: Doc drift
`docs/playbooks/add-flow/01-descriptor-and-ops.md` still documents `controls,` in the FlowDef
shape and says *"declare `controls`"* — a live bug, anyone running `/mpi-add-flow` today
authors a dead field. Fix to `fields`; record the step `param` binding in
`ui/carousel-frame.md` and drop `uiComponent` from the legacy-surface prose.

## Verification

**Verify mode:** user-ux — Head Swap is a shipping flow and the box gizmo is a hand-feel surface.

1. `npm test`
2. `npm run app:isolated` → open Head Swap, box both heads, pick a non-default tier, Generate.
3. Diff the dispatched graph from Comfy `/history` against a pre-change run —
   `Input_Tier` / `box1` / `box2` byte-identical.

## Out of scope

`inputSchema.media` `labels` / `roles` parallel arrays. The card names them as repetition;
they are two index-aligned arrays that work and have tripped nobody. Left alone deliberately.

## Plan Drift

- 2026-08-17: plan written at pickup. Card had no plan.md — the description's open question
  was already answered by MPI-531 before this card was ever opened, so the scope narrowed from
  "design the step template" to "remove the one remaining non-manifest surface".
