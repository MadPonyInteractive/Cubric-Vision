# Per-phase LoRA racks in flows

**Origin:** Fabio, 2026-08-23, while scoping the style problem on
[MPI-567](../MPI-567/). Split out because it is shared flow-frame + executor code, not
scribble-contained. MPI-567's own session is landing the GRAPH half (the twelve titled
nodes) and claims none of the files below.

## The problem

A flow already picks a model PER PHASE. `scribble-object` has two slots (`Render model`
over five SDXL cards, `Blend model` over `klein-4b` / `klein-9b`). The LoRA rack does not
follow:

- `settingsModel` on a FlowDef is ONE string (`js/data/flowsRegistry.js` ~line 88).
- `payload.loraModelId` is ONE id, and `commandExecutor` emits flat `Lora_1..6` from it
  (`js/services/commandExecutor.js` ~line 842).
- `scribble-object` declares no `settingsModel` at all, so it injects zero LoRAs today.

So one flow gets one rack, and a flow with two models cannot give both of them one.

## Fabio's shape, verbatim intent

> "each model has its own separate cogwheel that opens its own separate 6 LoRA selector.
> Otherwise, if in the future when we do flows that have three types of models in the
> flow, how are we going to do that? Create a new UI for that?"

A small cogwheel beside EACH model selector in the flow slide-over. It opens the app's
existing `MpiModelSettings` panel on that phase's picked model. Three models = three
cogwheels = three panels. No new UI, no per-flow special case.

## What makes this cheap

**The panel is already generic.** `_openSettings` (`MpiBaseFlow.js` ~1055) already ends at
`Events.emit('ui:open-model-settings', { modelId })` and the panel is the same one the
model picker opens - six slots, strengths, bypass, drop zones. It is only CALLED once
because `flowSettingsModel(flow)` resolves a single flow-level string. The whole UI change
is WHERE the modelId comes from.

**The rack stays the MODEL's own settings.** MPI-504's rule holds and must not be
softened: *"a flow does not get a private copy"* - the same LoRA is the same LoRA whether
the flow or the prompt box runs it. A phase names a model; the model owns the slots.

## The naming convention, SETTLED with Fabio

`Input_Lora_Phase1_1` … `Input_Lora_Phase1_6`, `Input_Lora_Phase2_1` … and so on.

**Phase-keyed, not model-keyed.** Fabio's first instinct was `Klein_Input_Lora_1` /
`SDXL_Input_Lora_1`; he revised it himself to a phase prefix, and the revision is right -
an any-of slot can swap `klein-4b` for `klein-9b` without the graph being retitled.

His literal proposal was `phase1_input_lora_1`. That ORDERING was rejected for two
concrete reasons, both verified in the code, and it is worth not re-deriving:

1. `commandExecutor.js` ~869 (the MPI-127/252 canonicalization pass) force-prefixes
   `Input_` onto any param key not already starting `Input_`/`Output_`, so `phase1_...`
   arrives as `Input_phase1_input_lora_1` and matches no node.
2. The LoRA-object matcher in `comfyController.js` ~1429 is
   `/^(?:Input_)?Lora_(?:[A-Za-z]+_)?\d+$/i` - a LEADING segment never matches, and a
   param that misses this branch falls to `_inject`, which writes the whole
   `{lora_name, strength_model, strength_clip}` object into `node.inputs.lora_name` and
   dies with a ComfyUI 400 (`Value not in list`). MPI-219 is that exact bug.

`Input_Lora_Phase1_1` rides both rules for free: params build as `Lora_Phase1_1`, the
canonicalization pass prefixes it, and the matcher needs **one character** -
`[A-Za-z]+` becomes `[A-Za-z0-9]+`, because `Phase1` carries a digit.

## Scope

1. **ModelDef / FlowDef:** replace the single `settingsModel` with per-phase resolution.
   Each `requiredModels` slot resolves its own rack, still through the existing
   `flowSettingsModel()` any-of resolution (MPI-590) so the picked member's rack is the
   one that opens - otherwise a user on the NSFW arm edits the SFW card's rack and gets
   no LoRAs, silently.
2. **`commandExecutor`:** emit `Lora_Phase<N>_<i>` per phase instead of flat `Lora_<i>`
   from one `loraModelId`. The staged branch above it (`modelDef.loraStages`, Wan's
   HIGH/LOW noise) is a DIFFERENT axis and must keep working untouched.
3. **`comfyController`:** widen the matcher character class. One character; add a test.
4. **`MpiBaseFlow` / the slide-over:** a cogwheel beside each model selector, emitting
   `ui:open-model-settings` with that phase's picked model.
5. **Character sheet:** its last-stage `{ id: 'loras', type: 'button', action: 'settings' }`
   field is DELETED - the cogwheel replaces it. `settingsModel: 'krea2'` goes with it.
6. **Back-compat:** a single-model dispatch (the prompt box) must keep emitting flat
   `Lora_N`. Every shipped graph is titled `Input_Lora_1..6` - `klein_t2i.json`,
   `klein_9b_t2i.json`, Chroma, LTX, `flow_character_sheet.json` - and namespacing them
   unconditionally would silently stop filling all of them.

## Coordination

- **Disjoint from card B** (the Klein style-LoRA rename) - safe to run in parallel.
- **Card C** (character sheet -> Klein 4B/9B) COLLIDES on `js/data/flowsRegistry.js`.
  Run it after this lands.
- MPI-567 owns `comfy_workflows/flow_scribble_object.json` and its `raw/` twin. Do not
  edit those; the twelve `Input_Lora_Phase{1,2}_{1..6}` nodes are already being placed
  there under this convention.
