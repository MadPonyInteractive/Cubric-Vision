# MPI-638 — the slide-over stops being a toll booth, and the model picker moves to where the decision is made

## The two asks, and why they are one card

Fabio, 2026-08-28:

> "Right now, when a flow is installed and the user clicks it, the slide over shows up for
> the user to press open. The first thing that the user sees is an explanation of how the
> flow works and what it does, so the slide over is an unnecessary step."

> "The LoRAs at the moment have wording that I never liked very much, like 'render model'
> and 'edit model.' They are not names that are sustainable because we might have 'pinpaint
> model' or 'remove model' or something like that. If those names were introduced, it would
> die, or it would introduce complexity. So if we move the model drop downs to the last stage
> of the flow and place a little cogwheel next to the model drop down that is solved."

They are one card because the first ask *removes the only surface the model picker lives on*.
Skipping the slide-over for a Ready flow with the picker still in it would silently take the
choice away from every user who already has both candidates on disk.

## What is actually duplicated today

The slide-over shows: the hero, the title, the description, the model pickers, the required-
models rows, and one footer button. Phase 1 of `MpiBaseFlow` (`_buildInputsSlide`) already
paints **title + hero clip + description** in its right column. For a Ready flow, three of the
drawer's six things are a second copy of what the next screen shows, and the other three are
install machinery a Ready flow has no use for.

The cogwheel is duplicated too, and nobody noticed: MPI-608 put it in the Library drawer, and
MPI-613 put it on the run slide. Both are live right now.

## The shape

Run slide, control column (236px), one row per model slot:

```
+-------------------------+---+
| FLUX.2 Klein 9B       v | * |
+-------------------------+---+
```

- **More than one INSTALLED candidate** -> `MpiDropdown` of model names.
- **One candidate** -> a static name. A one-option dropdown implies a choice that is not
  there, and a lie in a control is worse than an inconsistent row.
- **`loras: true`** -> icon-only cogwheel, immediately right of the model it configures. The
  model name is one element away, so the button needs no words of its own.
- A slot with one candidate and no rack renders nothing, exactly as today.

## The naming fix is a rendering rule, not a rename

`label` stops being a **name** and becomes a **disambiguator**: rendered only when a flow
declares two or more model slots.

No shipped flow declares two or more slots (verified 2026-08-28: nine declare exactly one - `head-swap`,
`ltx-extend`, `ltx-foley`, `ltx-upscale`, `scribble-object`, `scribble`, `character-sheet`,
`outpaint`, `object-stamp`; the audio three declare none). So "Render model" and "Edit model"
leave the UI today with **zero descriptor edits and zero migration**, and nobody ever has to
invent "Pinpaint model" for a one-slot flow — the dropdown says "FLUX.2 Klein 9B", which is
the true answer and the sustainable one.

The day a two-slot flow ships, the label comes back and its author has a real distinction that
earns words. MPI-610 shipped exactly that case and MPI-628 removed it; the field stays in the
descriptor, tested and documented, for its return.

## Two pickers, two questions, one Map

| Surface | Question | Candidates |
|---|---|---|
| Library slide-over | which one do I **download**? | all, installed or not (MPI-599) |
| Run slide | which one do I **run**? | installed only |

Both write the same session `_modelChoice` Map in `flowsRegistry.js`, so there is no new state
and no persistence work. Installed-only on the run slide is load-bearing: `flowModelIds`
lets a pick win even when uninstalled (MPI-599, deliberately), so an unfiltered in-flow picker
would let the user flip an open flow to unavailable and meet a toast at Generate.

With Ready flows skipping the drawer, exactly one picker is reachable per situation.

## Deletion

The cogwheel leaves the Library slide-over. That drawer now only ever shows an **uninstalled**
flow, and a LoRA rack for a model that is not on disk is dead UI. This removes the MPI-608 /
MPI-613 duplication rather than adding a third copy.

## Two tests pin shapes this card reverses on purpose

- `tests/desktop/flow-lora-button.spec.js` asserts
  `.mpi-detail__field-label:text-is("Render model")` has count 1, commented *"the slot must
  label itself rather than read 'Model'"*. That is the MPI-610 decision, taken when two slots
  existed and two cogwheels had to be told apart. Both premises are gone.
- `tests/flow-lora-rack.test.cjs:170` grep-pins the Library's cog markup. It goes with the cog.

Neither is a bug to work around — a red there is the contract change, which is what the pins
are for.

## Not in scope

- The inputs slide (phase 1) is untouched. An earlier draft of this work put the picker there;
  Fabio moved it to the run slide, which is also where the LoRA cogwheels already sit for the
  same reason (MPI-613: "LoRA choice is a COMPARE decision, not a set-up one" — you run, you
  look, you want the same prompt with a different model).
- No `FlowDef` changes. No `requiredModels` migration.
