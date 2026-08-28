# Model slots — the flow declares a ROLE, the user picks which model fills it

**MPI-590, SHIPPED. Generalised by MPI-599.** Read with
[01-descriptor-and-ops.md](01-descriptor-and-ops.md), which owns the rest of the `FlowDef`
contract.

Each entry in `requiredModels` is a **slot** — one role the flow's graph plays a model in. The
object form makes that role choosable: `models` are interchangeable candidates for it, the flow
runs on whichever one resolves, and the badge is satisfied by any of them. A plain string is the
one-candidate shorthand, which is most flows.

```js
requiredModels: [
    { label: 'Render model', models: ['krea2', 'krea2-nsfw'] },   // choosable
    'seedvr2',                                                     // fixed, one-candidate
],
modelParams: {
  'krea2':      { 'Input_Base_Model': 'krea2_raw_int8_convrot.safetensors',            'Input_Bypass_Filter_Lora.strength_model': 1 },
  'krea2-nsfw': { 'Input_Base_Model': 'lustify-v10-krea-raw-int8_convrot.safetensors', 'Input_Bypass_Filter_Lora.strength_model': 0 },
},
```

Character Sheet and Outpaint declare the Krea 2 pair — the same architecture with a different
bake, so demanding both means asking for a **second 12.25GB** download of a model the user
effectively already has.

**A slot can also go the other way — be deleted rather than grown.** Character Sheet had a
second slot for its head-removal phase: fixed `'klein-4b'`, opened by MPI-610 into a choosable
`klein-4b` / `klein-9b` blend slot, then removed entirely by MPI-628 when the head removal
stopped being a model pass at all (a BiRefNet matte minus the SAM3 head mask, composited onto
a flat plate — no checkpoint, no sampler). Deleting a slot means deleting its `modelParams`
arms in the same edit: an arm naming a model that is in no slot is a dead pick, and
`tests/flow-model-choice.test.cjs` § 'every modelParams title EXISTS in the flow workflow'
fails on it.

**A flow may declare SEVERAL choosable slots, and they resolve independently** — each gets its
own dropdown, its own pick, and its own `modelParams` contribution to the one merged
`injectionParams`. `label` is what the picker shows — two fields both reading "Model" tell the
user nothing, which is why the label is not optional in the object form. **No shipped flow
declares two slots today**; the resolver is exercised by a synthetic fixture in
`tests/flow-model-choice.test.cjs`.

**`models[0]` is the RECOMMENDED candidate.** Declaration order is preference order: it is what an
untouched picker resolves to, and the picker stars it. There is no separate `recommended` field —
if you find yourself wanting one, reorder the list instead.

## Never read `flow.requiredModels` directly

A slot reaches a plain consumer as an object. Resolve it through `flowsRegistry.js`:

| Helper | Returns |
|---|---|
| `flowModelSlots(flow)` | Every slot normalised to `{ label, models }`, including the one-candidate ones. The shape helpers below are built on. |
| `flowModelIds(flow)` | ONE id per slot — the pick, else the first installed candidate, else the recommended one. This is what the badge, the install keys, the required-models rows and the progress bar all use. |
| `flowModelChoices(flow)` | The slots with a real choice in them, as `{ label, models, recommended }` — one dropdown each. Empty means no picker. |
| `setFlowModel(flowId, id)` | Records the pick. **Session-only** — a pick that outlived the app would silently run a later sheet on the NSFW bake because of a click made days ago. Replaces any earlier pick in the SAME slot and leaves the other slots alone. |
| `flowModelParams(flow)` | Every resolved candidate's `modelParams`, merged. `flowService` puts these into `injectionParams` FIRST, so a collected field of the same name still wins. |
| `flowLoraPhases(flow)` | `[{ phase, modelId }]` for every slot that opted in with `loras: true` — resolved, so each phase LoRA rack follows the candidate that actually runs (MPI-608). Replaced `flowSettingsModel()`, which could name only one rack. |

## The picker offers candidates the user has NOT installed

This is the MPI-599 change, and it reverses two MPI-590 behaviours on purpose:

- **A slot with nothing installed still shows its dropdown.** The old rule filtered candidates to
  what was on disk, so the user who most needed the choice — the one about to download 12.25GB —
  never saw it, and silently got `models[0]`. The choice only exists *before* the weight lands.
- **A pick holds even when its candidate is uninstalled.** It is a statement of intent, so the
  Required-models row flips to "Install" and the Install button fetches *that* candidate. The cost
  is that picking an uninstalled candidate while holding another takes the flow to unavailable
  until it downloads. That is correct — the user asked for it — and it is session-only and one
  click back.

Both are pinned in `tests/flow-model-choice.test.cjs`, so a failure there is a contract change
rather than a bug.

## `modelParams` is what makes the picker REAL

A graph bakes ONE loader per role. Without an injection param the pick changes the badge, the
dropdown label and nothing else — and injection drops an unmatched title in **silence**, so
nothing anywhere reports the dead pick. It is the same shape as the MPI-504 LoRA rack (slots
saved, image identical) and MPI-242's `Input_Batch` typo (batch N rendered 1 image, in two models).

So:

- The node each slot's candidates differ on must be `Input_*`-titled in the workflow. Character
  Sheet's UNETLoader became `Input_Base_Model`; its filter-bypass LoRA was already titled, and
  takes the `Title.widget` form (`Input_Bypass_Filter_Lora.strength_model`) because only one of its
  widgets moves. A multi-slot flow needs one such title **per slot** — two slots writing the same
  title is one slot with extra steps.
- Restate the **recommended** candidate's own baked values too. A set reads as a set, and it
  catches a graph re-export that quietly moves the default.
- `tests/flow-model-choice.test.cjs` asserts every `modelParams` key names a title that EXISTS in
  that flow's graph, that the arms differ, and that the widgets are on the injector's spray list.
  Mutation-checked: restoring node 55's generic title turns it red.

## Do NOT reach for `modelFamily`

MPI-316 removed that field from both Krea 2 cards on purpose: it drives the H/B/L **tier letter**,
and SFW/NSFW are content variants, not tiers. Re-adding it renders "Krea 2 NSFW H" again — the
exact bug MPI-316 fixed.

## The picker — TWO surfaces, TWO questions, ONE session Map

One `MpiDropdown` per choosable slot (never a bare `<select>` — MPI-582), and it appears in two
places because there are two different questions to ask. Both write the same `setFlowModel` Map,
so there is no second state and nothing to reconcile.

| surface | the question | candidates offered |
|---|---|---|
| **Flow Library slide-over** | which one do I **download**? | ALL of them, installed or not (MPI-599) |
| **Run slide** (`MpiBaseFlow`) | which one do I **run**? | INSTALLED only (MPI-638) |

**The filter on the run slide is load-bearing, not tidiness.** `flowModelIds` lets a pick win even
when its candidate is not on disk — deliberately, because that is how a user says *"download that
one instead"* — so an unfiltered picker inside an OPEN flow would let someone flip that flow to
unavailable and meet a toast at Generate, with no Install button anywhere on the slide. The
drawer is where downloading is chosen; the run slide is where running is.

The two are also reachable in disjoint situations, which is what keeps the pair from being
confusing: since MPI-638 an **installed** flow opens straight into its frame and never renders the
drawer at all, so a Ready flow's only picker is the run slide's, and an unready flow's only picker
is the drawer's.

### Slide-over specifics

Above the required-models list, because the pick drives that list. The recommended candidate
carries `icon: 'sparkle', meta: 'Recommended'` — the same sparkle the Model Library flags Featured
with (MPI-514), and the word rather than a hover tooltip, because a dropdown row has room for it.
A change re-renders the whole drawer, since the resolved id feeds the rows, the install keys and
the footer button.

### Run-slide specifics

In the control column above Generate, **paired with that slot's LoRA cogwheel** — the two controls
a slot owns, side by side (see [ui/lora-rack.md](ui/lora-rack.md)). A slot with exactly one
installed candidate renders the model's NAME as plain text instead of a dropdown: there is no
choice to offer, and a one-option dropdown claims one that is not there. A pick repaints the ROW,
never the slide — `_renderSlide()` tears down and replays the result pane, the compare view and
the video player.

## `label` is a DISAMBIGUATOR, not a name (MPI-638)

**It is rendered only when a flow declares two or more slots.** With one slot the dropdown already
says which model this is, and a caption above it is a word invented for no reader.

Fabio, 2026-08-28, on the "Render model" / "Edit model" captions that used to show unconditionally:

> They are not names that are sustainable because we might have "pinpaint model" or "remove model"
> or something like that. If those names were introduced, it would die, or it would introduce
> complexity. So if we move the model drop downs to the last stage of the flow and place a little
> cogwheel next to the model drop down that is solved.

**No shipped flow declares two or more slots** — nine declare exactly one, and the three audio
flows (`voice-changer`, `chatter-box`, `drama-box`) declare none at all and render no model row
whatever. So that wording left the app with **no descriptor edit at all** — the field stays in
the `FlowDef`, tested and documented, for the day a two-slot flow ships and its author has a real
distinction that earns words. The drawer falls back to a generic `Model` caption; the run slide
renders none.

So `label` is still **not optional in the object form**: write it for the reader who will need it,
even though today nobody sees it. What changed is when it PAINTS, not whether it is declared.

## Two candidates that share a NAME

`disambiguatedName(id, siblingIds)` in `modelRegistry.js` — the model's name, plus its
`sizeTierLetter` only when a sibling **in the same slot** shares that name. Both pickers call it;
it lives there rather than in `flowsRegistry.js` because the import is one-way
(`modelRegistry.js` § the `flowDepUniverse` import), and it is shared rather than copied because
drift shows up as one surface disambiguating and the other not.

`sizeTierLetter`, never `tierLetterFor`: the latter is install-gated, and the drawer's picker
exists to name a model the user does not have yet.

*(FLUX.2 Klein was the original clash and is not one any more — MPI-619 put the size in both
names, because 4B and 9B are two models the public knows by name and their LoRAs do not
interchange. `tests/flow-model-choice.test.cjs` now finds a live clash rather than hardcoding one,
and fails loudly if none is left.)*
