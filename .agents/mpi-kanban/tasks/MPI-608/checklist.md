# MPI-608 checklist

Derived from `brief.md` on pickup, 2026-08-23. The graph half is already done and
shipped under MPI-567 (`Input_Lora_Phase1_1..6` / `Input_Lora_Phase2_1..6` in
`flow_scribble_object.json` and its raw twin) - this card is the wiring.

- [x] Widen the LoRA-object matcher in `comfyController.js` (~1429):
      `[A-Za-z]+` -> `[A-Za-z0-9]+`. One character; `Phase1` carries a digit.
      A param that misses this branch falls to `_inject` and dies with a ComfyUI
      400 (MPI-219). Add a test for the phase form.
- [x] `commandExecutor._buildParams`: emit `Lora_Phase<N>_<i>` per model phase
      instead of flat `Lora_<i>` off a single `loraModelId`. The `loraStages`
      branch above it (Wan HIGH/LOW) is a DIFFERENT axis - leave it working.
- [x] Single-model dispatch (the prompt box) must KEEP emitting flat `Lora_N`.
      Every shipped graph is titled `Input_Lora_1..6`; namespacing unconditionally
      stops filling all of them.
- [x] `flowService` / FlowDef: resolve a rack PER `requiredModels` slot, still
      through `flowSettingsModel()` so an any-of slot follows the picked member
      (MPI-590). Retire the single `settingsModel` string.
- [x] Cogwheel beside each model selector. `_modelChoiceHtml(flow)` in
      `MpiFlowLibrary.js` (~223) renders the slots; the `settings` icon already
      exists in `js/utils/icons.js`. It emits the EXISTING
      `Events.emit('ui:open-model-settings', { modelId })` - no new panel.
- [x] Delete the character sheet's last-stage
      `{ id: 'loras', type: 'button', action: 'settings' }` field and its
      `settingsModel: 'krea2'`. Update the two tests in `flow-lora-rack.test.cjs`
      that currently PIN both of them.
- [x] Declare the scribble flow's two phases so the twelve nodes actually fill.
- [x] `npm test` green; every new assertion mutation-checked RED with the file
      restored and verified by sha256.
- [ ] Live run: pick a LoRA in each phase's panel, confirm both reach the graph.
