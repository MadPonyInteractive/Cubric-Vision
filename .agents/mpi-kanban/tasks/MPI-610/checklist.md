# MPI-610 checklist

Nothing implemented. The first attempt built the wrong design off a wrong brief and was
reverted in full — see `brief.md` § History.

## Blocked on two cards — nothing here is an open question

- [ ] **MPI-608 lands** — per-phase LoRA racks are its mechanism, and it holds
      `js/data/flowsRegistry.js`
- [ ] **MPI-603 lands** — re-authors the head-removal branch onto LanPaint, deleting #708
      (outpaint LoRA), #716 (green plate) and #713. The 9B blend arm cannot exist until it
      does. Same nodes, same branch: not parallel-safe with this card.

## Graph — `raw/flow_character_sheet.json`

- [ ] #726 UNETLoader → `Input_Edit_Model`; #724 CLIPLoader → `Input_Edit_Clip`
- [ ] `Input_Lora_1..6` → `Input_Lora_Phase1_1..6` (Krea 2 chain)
- [ ] Six new `MpiLoraModel` → `Input_Lora_Phase2_1..6` (Klein chain off #726)
- [ ] Whatever the #708 decision was
- [ ] **Krea 2 phase untouched** — ladder, `Input_is_Turbo`, `Input_Negative`,
      `Input_Bypass_Filter_Lora`, accelerator LoRA, `qwen_image` VAE all still there
- [ ] Regenerate the API file via `scripts/workflow-to-api.mjs` (bench on :8188)
- [ ] Link integrity: unique ids, inputs/outputs round-trip, every `GetNode` resolves to a
      `SetNode`, `last_node_id`/`last_link_id` advanced
- [ ] `scripts/validate-injection-rules.mjs` clean
- [ ] Every class_type on `/object_info`, every required input present, no orphan nodes

## Descriptor — `js/data/flowsRegistry.js` (MPI-608 holds it)

- [ ] `requiredModels` → two labelled slots: **Render model** (krea2 arms, unchanged) +
      **Blend model** (klein-4b / klein-9b)
- [ ] `modelParams` → krea2 arms UNCHANGED, two Klein arms added,
      `Input_Edit_Clip.clip_name` **dotted**
- [ ] Per-phase rack wiring per whatever MPI-608 landed

## Tests

- [ ] `tests/flow-model-choice.test.cjs` (MPI-567/MPI-599 hold it) — krea2 assertions KEPT,
      blend-slot assertions added
- [ ] `tests/inject-params-titles.test.cjs` — keeps `input_negative` + `input_is_turbo`,
      gains `input_edit_model` + `input_edit_clip`
- [ ] Full suite green, both halves committed together

## Closes the card

- [ ] Fabio picks a render model and a blend model, runs it, judges real sheets — including
      one on the 9B blend arm, which has never been run here
