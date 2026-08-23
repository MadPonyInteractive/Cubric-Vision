# MPI-610 checklist

Built 2026-08-23 on the REWRITTEN brief. The first attempt built the wrong design off the
old brief and was reverted in full — see `brief.md` § History. Nothing in that reading
survived: no Krea 2 machinery was removed here.

## Gates — both cleared

- [x] **MPI-608 landed** (e0173e5d) — `flowLoraPhases()` + `loras` on the slot verified live
      in `flowsRegistry.js` / `commandExecutor.js`, not taken on the handoff's word
- [x] **MPI-603 landed** (08dbde02) — head-removal branch re-authored onto LanPaint, #708 /
      #716 / #713 gone, so both blend arms are symmetric

## Graph — `raw/flow_character_sheet.json`

- [x] #726 UNETLoader → `Input_Edit_Model`; #724 CLIPLoader → `Input_Edit_Clip`
- [x] `Input_Lora_1..6` → `Input_Lora_Phase1_1..6` (renamed by TITLE — the chain order is
      1,4,2,5,3,6, so renaming by position would have scrambled the rack)
- [x] Six new `MpiLoraModel` → `Input_Lora_Phase2_1..6` (#778–#783), between
      `Input_Edit_Model` and `Set_klein model`, so BOTH Klein consumers get them (the
      LanPaint sampler and the MaskDetailer refinement)
- [x] #708 handled by MPI-603, not here
- [x] **Krea 2 phase untouched** — ladder, `Input_is_Turbo`, `Input_Negative`,
      `Input_Bypass_Filter_Lora`, accelerator LoRA, `qwen_image` VAE; asserted in the script
- [x] API twin regenerated via `scripts/workflow-to-api.mjs` against 48188
- [x] Link integrity: unique ids, inputs/outputs round-trip, `last_node_id`/`last_link_id`
      advanced, every surviving `pos`/`size` byte-identical except the one deliberate move
- [x] `scripts/validate-injection-rules.mjs` clean
- [x] Every class_type on `/object_info`, every required input present, no orphan nodes

## Descriptor — `js/data/flowsRegistry.js`

- [x] `requiredModels` → **Render model** (krea2 arms, unchanged) + **Blend model**
      (klein-4b / klein-9b), both `loras: true`
- [x] `modelParams` → krea2 arms UNCHANGED, two Klein arms added,
      `Input_Edit_Clip.clip_name` **dotted**
- [x] Per-phase rack wiring rides MPI-608's mechanism unchanged — no new app code

## Tests

- [x] `tests/flow-model-choice.test.cjs` — krea2 assertions KEPT, blend-slot + rack-chain
      assertions added, two one-slot expectations widened to two
- [x] `tests/inject-params-titles.test.cjs` — gains the two Klein titles and both racks,
      and pins that the flat `Input_Lora_N` form is gone
- [x] `tests/desktop/flow-lora-button.spec.js` — **was red since e0173e5d** (MPI-608 deleted
      the button it asserted); rewritten onto the shipped two-cogwheel shape
- [x] Node suite 727/727, desktop suite 26/26, eslint clean

## Docs

- [x] `ui/lora-rack.md` rewritten — it documented the fully retired `settingsModel` /
      `loraModelId` / `action: 'settings'` vocabulary end to end
- [x] `ui/README.md`, `any-of-models.md` (stale example + retired `flowSettingsModel` row),
      `01-descriptor-and-ops.md` (both stale passages)

## Closes the card

- [ ] **Fabio picks a render model and a blend model, runs it, judges real sheets** —
      including one on the `klein-9b` blend arm, which has never been run on this flow, and
      one with a LoRA loaded in the Blend rack. See `validation.md` for what to check first
      if the 9B arm errors. MPI-603's live run is outstanding too; one session covers both.
