# Any-of models — the flow runs on EITHER, and the user picks

**MPI-590, SHIPPED.** Read with [01-descriptor-and-ops.md](01-descriptor-and-ops.md), which owns
the rest of the `FlowDef` contract.

An entry in `requiredModels` that is itself an **array** is an **any-of set**: the flow runs on
whichever member is installed, and the badge is satisfied by any one of them. Character Sheet is
the only flow that declares one — the two Krea 2 cards are the same architecture with a different
bake, so demanding both means asking a user for a **second 12.25GB** download of a model they
effectively already have.

```js
requiredModels: [['krea2', 'krea2-nsfw'], 'klein-4b'],   // any-of Krea 2, AND Klein
modelParams: {
  'krea2':      { 'Input_Base_Model': 'krea2_raw_int8_convrot.safetensors',            'Input_Bypass_Filter_Lora.strength_model': 1 },
  'krea2-nsfw': { 'Input_Base_Model': 'lustify-v10-krea-raw-int8_convrot.safetensors', 'Input_Bypass_Filter_Lora.strength_model': 0 },
},
```

## Never read `flow.requiredModels` directly

A set reaches a plain consumer as a nested array. Resolve it through `flowsRegistry.js`:

| Helper | Returns |
|---|---|
| `flowModelIds(flow)` | ONE id per slot — the pick, else the first installed member, else the first. This is what the badge, the install keys, the required-models rows and the progress bar all use. |
| `flowModelChoices(flow)` | The installed members of every slot with **more than one** installed — i.e. exactly what needs a picker. Empty means no picker: one installed member is not a decision. |
| `setFlowModel(flowId, id)` | Records the pick. **Session-only** — a pick that outlived the app would silently run a later sheet on the NSFW bake because of a click made days ago. It is also ignored once the picked member is uninstalled, so the flow never demands back a model the user removed. |
| `flowModelParams(flow)` | The resolved members' `modelParams`, merged. `flowService` puts these into `injectionParams` FIRST, so a collected field of the same name still wins. |
| `flowSettingsModel(flow)` | `settingsModel` resolved through the sets, so the LoRA rack — and the settings button — follow the member that actually runs. |

## `modelParams` is what makes the picker REAL

A graph bakes ONE loader. Without an injection param the pick changes the badge, the dropdown
label and nothing else — and injection drops an unmatched title in **silence**, so nothing
anywhere reports the dead pick. It is the same shape as the MPI-504 LoRA rack (slots saved, image
identical) and MPI-242's `Input_Batch` typo (batch N rendered 1 image, in two models).

So:

- The node the arms differ on must be `Input_*`-titled in the workflow. Character Sheet's
  UNETLoader became `Input_Base_Model`; its filter-bypass LoRA was already titled, and takes the
  `Title.widget` form (`Input_Bypass_Filter_Lora.strength_model`) because only one of its widgets
  moves.
- Restate the **default** arm's own baked values too. A pair reads as a pair, and it catches a
  graph re-export that quietly moves the default.
- `tests/flow-model-choice.test.cjs` asserts every `modelParams` key names a title that EXISTS in
  that flow's graph, that the arms differ, and that the widgets are on the injector's spray list.
  Mutation-checked: restoring node 55's generic title turns it red.

## Do NOT reach for `modelFamily`

MPI-316 removed that field from both Krea 2 cards on purpose: it drives the H/B/L **tier letter**,
and SFW/NSFW are content variants, not tiers. Re-adding it renders "Krea 2 NSFW H" again — the
exact bug MPI-316 fixed.

## The picker

An `MpiDropdown` (never a bare `<select>` — MPI-582) in the Flow Library slide-over, **above** the
required-models list because the pick drives that list, and **before** the flow opens. It renders
only when a slot has more than one installed member; a change re-renders the whole drawer, since
the resolved id feeds the rows, the install keys and the footer button.
