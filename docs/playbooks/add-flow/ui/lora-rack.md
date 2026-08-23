# A Flow's user LoRA racks — one per model phase, reusing the app's Model Settings panel

> **Origin:** Character Sheet (MPI-504) as one flow-level rack. **Rewritten for MPI-608**,
> which made it one rack PER MODEL SLOT, and MPI-610, which gave the Character Sheet its
> second. **Portable:** any flow whose graph carries `Input_Lora_Phase<N>_1..6` and whose
> user might already own a LoRA.
>
> 🔴 **`settingsModel`, `flowSettingsModel()` and `config.loraModelId` are GONE** (MPI-608).
> One string could name only one rack, so a flow choosing a model per phase could never fill
> both. A FlowDef still declaring `settingsModel` reads as wired and injects nothing;
> `tests/flow-lora-rack.test.cjs` fails the whole vocabulary across five files.

## The shape

A flow does **not** build LoRA UI, and since MPI-608 it declares no button either. One flag
on the model SLOT is the whole declaration:

```js
requiredModels: [
    { label: 'Render model', models: ['krea2', 'krea2-nsfw'], loras: true },   // phase 1
    { label: 'Blend model',  models: ['klein-4b', 'klein-9b'], loras: true },  // phase 2
],
```

**The phase number is the slot's 1-based position in `requiredModels`**, and it names the
graph nodes: slot 0 fills `Input_Lora_Phase1_1..6`, slot 1 fills `Input_Lora_Phase2_1..6`.
Retitle the graph, do not renumber the slots.

The opener is a **cogwheel beside each model dropdown** in the Flow Library's detail panel —
so the rack is edited where the model it belongs to is chosen, and a third model in a future
flow costs a third cogwheel and no new UI. It opens **`MpiModelSettings`**, the same panel
the model picker opens, with the six-slot rack, per-slot strengths, bypass and the folder
drop zones already in it. Fabio, MPI-504: *"the same panel as the models have, which is
called the settings panel, which has everything already built in."*

## Why it is an event, not a component

`MpiModelSettings` is mounted by the **Blocks** (`MpiGalleryBlock`, `MpiGroupHistoryBlock`),
one overlay each. Nothing reaches into another Block's component — the cogwheel emits
`ui:open-model-settings { modelId }` and the owning Block opens its own overlay, exactly the
ownership split `ui:open-model-picker` already uses.

**Both Blocks must carry the listener.** Each mounts its *own* overlay, so wiring only one
leaves the cogwheel dead in the other workspace — with no error, no log, nothing on screen.
Pinned by `tests/flow-lora-rack.test.cjs`.

## The half that is easy to forget

Opening the panel is decoration until the values reach the graph. A flow dispatches as an
**operation** with `model: { id: null }`, and `commandExecutor` injects a model's rack only
under `payload.modelId` — so a flow injected **no LoRAs at all** before this pattern existed.
The resolved phases ride a separate key the whole way down:

```
flowLoraPhases(flow)   [{ phase, modelId }] — one entry per slot that opted in, resolved
  → flowService        config.loraPhases
    → generationService  runCommand({ loraPhases })         ← an explicit WHITELIST
      → commandExecutor  params.Lora_Phase<N>_<i>  →  Input_Lora_Phase<N>_<i>
                                                    ← via the Input_ canonicalization pass
```

Every one of those hops drops an unknown key **in silence**. Nothing throws: the panel opens,
the LoRAs save, the run succeeds, and the output has no LoRA in it. If you add a hop, add an
assertion to `tests/flow-lora-rack.test.cjs` with it.

## Rules

- **It is not a model selection.** The rack never reaches model resolution or workflow lookup
  — those stay driven by `operation`. It answers one question: whose rack fills this phase's
  LoRA nodes. And it follows the RESOLVED member of an any-of slot, so the NSFW arm opens the
  NSFW card's rack (MPI-590).
- **OPT-IN, and it must stay that way.** `flow_ltx_extend` and `flow_ltx_foley` both carry
  `Input_Lora_1..6` nodes while deliberately declaring no rack. Filling every slot whose graph
  HAS the nodes would silently start injecting the user's LTX LoRAs into two shipped flows.
- **Retitle, never add.** `commandExecutor` still emits the flat `Lora_N` beside
  `Lora_Phase1_N` for graphs that predate the phase titles. Injection skips a title with no
  node, so a graph on one form takes only that one — but a graph carrying BOTH takes the
  phase-1 rack **twice over**. No flow with a declared rack is on the flat form any more
  (`flow_character_sheet` was the last, retitled in MPI-610).
- **The rack is the MODEL's own settings**, shared with its ordinary generations. A LoRA
  loaded for krea2 is the same LoRA whether the flow or the prompt box runs it. There is no
  flow-private copy — that is what makes this free.
- **Flat-slot models only.** A `loraStages` model (high/low staging) needs its stage prefixes;
  the injection warns and skips **that phase only**, leaving the other phases' racks alone.
  Give it stage support before declaring `loras: true` on a slot holding a staged model.
- **The rack chain must be one chain, loader → sampler.** Six `MpiLoraModel` (or
  `MpiLoraModelClip` where the phase needs CLIP too) in series between the phase's loader and
  the sampler that runs it. A rack wired off to the side injects fine and changes nothing.
