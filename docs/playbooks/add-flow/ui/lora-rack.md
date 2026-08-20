# A Flow's user LoRA rack — reuse the app's Model Settings panel

> **Origin:** Character Sheet (MPI-504). **Portable:** any flow whose graph carries
> `Input_Lora_1..6` and whose user might already own a LoRA.

## The shape

A flow does **not** build LoRA UI. It declares two things, and both halves come for free:

```js
// on the FlowDef
settingsModel: 'krea2',

// in `fields`
{ id: 'loras', type: 'button', label: 'LoRAs', icon: 'layers', action: 'settings' },
```

The button opens **`MpiModelSettings`** — the same panel the model picker opens, with the
six-slot rack, per-slot strengths, bypass and the folder drop zones already in it. Fabio's
call, MPI-504: *"the same panel as the models have, which is called the settings panel,
which has everything already built in."*

## Why it is a button and an event, not a component

`MpiModelSettings` is mounted by the **Blocks** (`MpiGalleryBlock`, `MpiGroupHistoryBlock`),
one overlay each. The flow frame does not reach into another Block's component — it emits
`ui:open-model-settings { modelId }` and the owning Block opens its own overlay, exactly the
ownership split `ui:open-model-picker` already uses.

**Both Blocks must carry the listener.** Each mounts its *own* overlay, so wiring only one
leaves the button dead in the other workspace — with no error, no log, nothing on screen.
Pinned by `tests/flow-lora-rack.test.cjs`.

## The half that is easy to forget

Opening the panel is decoration until the values reach the graph. A flow dispatches as an
**operation** with `model: { id: null }`, and `commandExecutor` injects the LoRA rack only
under `payload.modelId` — so a flow injected **no LoRAs at all** before this pattern existed.
`settingsModel` rides a separate key the whole way down:

```
flowService      config.loraModelId = flow.settingsModel
  → generationService   runCommand({ loraModelId })     ← an explicit WHITELIST
    → commandExecutor   params.Lora_N  →  Input_Lora_N  ← via the Input_ canonicalization pass
```

Every one of those hops drops an unknown key **in silence**. Nothing throws: the panel opens,
the LoRAs save, the run succeeds, and the output has no LoRA in it. If you add a hop, add an
assertion to `tests/flow-lora-rack.test.cjs` with it.

## Rules

- **`settingsModel` is not a model selection.** It never reaches model resolution or workflow
  lookup — those stay driven by `operation`. It answers one question: whose rack fills this
  graph's LoRA nodes.
- **Opt-in.** A flow that omits it injects nothing, exactly as every flow ran before MPI-504.
  This deliberately reverses the older "a Flow RUNS CLEAN, no project LoRAs" rule; the flow is
  still the recipe, but the LoRA carries **identity** and the flow carries **layout**, and a
  user who has already trained a character should be able to load it and describe only the
  wardrobe and face on top.
- **The rack is the MODEL's own settings**, shared with its ordinary generations. A LoRA
  loaded for krea2 is the same LoRA whether the flow or the prompt box runs it. There is no
  flow-private copy — that is what makes this free.
- **Flat-slot models only.** A `loraStages` model (high/low staging) needs its stage prefixes;
  the injection warns and skips rather than injecting the wrong shape. Give it stage support
  before declaring `settingsModel` on a staged model.
- **`action` buttons hold no value.** Like `enhance`, a `settings` button never reaches the
  payload and never seeds — see [prompt-enhance.md](prompt-enhance.md).
