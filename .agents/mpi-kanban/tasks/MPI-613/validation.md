# MPI-613 Validation

## What changed

`js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` — the run slide's control column now
renders one labelled cogwheel per rack-bearing model slot, above Generate. Driven off
`flowLoraPhases(flow)` + `flowModelSlots(flow)`, so it is generic: both current two-rack
flows (`character-sheet`, `scribble-object`) and any future one get it with no FlowDef, graph
or per-flow change. Plus `MpiBaseFlow.css` for the stacked row, and the doc.

The comment at the old `_openSettings()` site — which described the control this frame lost to
MPI-608 — is now the explanation of why it is back and why it lives here.

## The trap this placement did NOT inherit

`ui:open-model-settings` is listened for by exactly two components, `MpiGalleryBlock:1549` and
`MpiGroupHistoryBlock:1134`, and **both are workspace Blocks**. A flow is reachable straight
from the landing page, where neither is mounted, so an emit would land nowhere — no panel, no
error, no log. Verified rather than assumed, per the brief:

- `flows:open` (`js/shell.js:478`) guards on **engine only**, not on a project.
- `flow:open` (`js/shell.js:500`) mounts `MpiBaseFlow` with **no project check**.

So a flow really can be opened with no project, and the emit really would have been dead.

**Fix: the frame mounts its own `MpiModelSettings` and opens it directly.** No event, so it
cannot land nowhere, and a Block's listener cannot open a *second* panel over a running flow.
Mounted on first click, so a flow with no racks never pays for it.

The cogwheels are gated on `state.currentProject`, because a rack edits settings that live on
the project — `getModelSettings(project, id)` dereferences `project.modelSettings` and throws
on null. That gate costs nothing in practice: **a flow cannot run without a project either**,
`generationService.js:425` returns early on a null `currentProject`.

> **Pre-existing, NOT fixed here, and worth a card:** a flow opened with no project shows a
> Run button that silently does nothing. Out of this card's scope (it predates the cogwheel
> move and has nothing to do with LoRAs), but it is the reason the gate above is invisible
> rather than confusing.

## Evidence

| check | command | result |
|---|---|---|
| run-slide wiring, label, own-overlay, teardown | `node --test tests/flow-lora-rack.test.cjs` | **14/14 pass** (1 new) |
| full node suite | `npm test` | **730/730 pass** |
| lint | `npx eslint js/ --max-warnings=0` | clean |
| desktop suite | `npx playwright test --config=playwright.desktop.config.js` | **26/26 pass** (1.6m, exit 0) |

The new test slices the `_teardownSlide` and `el.destroy` **function bodies** rather than
matching within a character budget — the first draft used a budget, and it broke the moment
the body grew. A budget also stops proving anything silently once someone adds a comment.

## Shared-file discipline

`js/data/flowsRegistry.js` carries a **live** claim from MPI-607 (session active), so it was
not edited. `flowLoraPhases` returns `{phase, modelId}` and drops the slot label; rather than
extend it, the label is read from `flowModelSlots(flow)` — `flowLoraPhases` numbers phases
1-based over that same array, so `slots[phase - 1]` is exactly the slot that produced the
entry. Both are read-only calls into a file this card does not own.

## Not done, deliberately

- **The Library keeps its cogwheels.** Fabio said the control *"should be on the final stage"*;
  he did not say remove it from the Library, and the Library placement is still right for
  choosing *before* a run. Additive, so nothing regressed — one line removes them if he wants
  them gone. Open question on the checklist.
- **No new desktop spec.** `tests/desktop/flow-lora-button.spec.js` covers the Library surface
  and still passes unchanged. Driving a flow to its last slide with a project open is a much
  heavier probe than the wiring warrants; the node test covers the wiring, and the placement
  itself needs Fabio's eyes, not an assertion.

## Needs a human

A UI placement is a judgement call. Fabio: open Character Sheet or Scribble to Object, go to
the last step, and check the two cogwheels read right where they sit.
