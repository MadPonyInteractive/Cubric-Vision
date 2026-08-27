# MPI-628 - checklist

## Workflow
- [x] Sync the rebaked graph: `COMFY_URL=http://127.0.0.1:48188 node scripts/sync-raw-workflows.mjs`
- [x] Runtime twin at 66 nodes (was 94), byte-identical to the pre-verified dry run

## Descriptor (`js/data/flowsRegistry.js`)
- [x] Removed the phase-2 slot `{ label: 'Blend model', models: ['klein-4b','klein-9b'], loras: true }`
- [x] Removed the `klein-4b` / `klein-9b` `modelParams` entries
- [x] Phase-2 LoRA rack needed no field removal — MPI-608 had already moved the rack opener
      to the per-slot cogwheel, so it dies with the slot
- [x] Healed the MPI-610 comment block that explained the two-slot shape

## Sweep
- [x] `tests/flow-model-choice.test.cjs` — six generic tests moved to a synthetic two-slot
      fixture; two Character-Sheet tests rewritten to the single-slot truth
- [x] `tests/flow-lora-rack.test.cjs` — `PHASES` down to one row
- [x] `tests/inject-params-titles.test.cjs` — `input_edit_*` and `input_lora_phase2_*` pinned ABSENT
- [x] `tests/desktop/flow-lora-button.spec.js` — one slot, one cogwheel (passes, 8.1s)
- [x] `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` — stale "two-rack flows" comment
- [x] `docs/playbooks/add-flow/ui/lora-rack.md` + `any-of-models.md`
- [x] `npm test` 747/747, `eslint js/ tests/` exit 0

## Judgement gate (Fabio) - OPEN
- [ ] Hair matte at 100% on the portrait panel - BiRefNet's edge is where this shows
- [ ] The neck cut: `GrowMask` 6 hard-edged, where the old branch grew 32 with a 16px blur
