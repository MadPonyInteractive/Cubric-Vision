# MPI-590 Checklist

Read `brief.md` first — it carries the two traps that make this more than a dropdown.

## Gate

- [ ] `requiredModels` accepts an array entry as **any-of**; single-id entries behave exactly as
      before
- [ ] Every consumer of `requiredModels` swept, not just the availability badge — shared primitive
- [ ] `modelFamily` NOT used (MPI-316 removed it from both krea2 cards on purpose; it means tier)
- [ ] Character Sheet declares `[['krea2','krea2-nsfw'], 'klein-4b']`

## Graph — the half that makes the picker real

- [ ] `flow_character_sheet.json` node 55 `UNETLoader` becomes injectable (title it `Input_*`, or
      route through an MpiNodes switch)
- [ ] The picked model's weight reaches the dispatched graph — verified from Comfy `/history`,
      not from the UI
- [ ] `settingsModel` follows the picked model, so `loraModelId` and the LoRA rack match it

## UI

- [ ] `MpiDropdown` in the Flow Library slide-over detail panel, before the flow opens
- [ ] Lists only INSTALLED members; no picker when only one is installed
- [ ] Decide where the choice persists (project.json / flow store / session-only) and say why

## Ship

- [ ] `npm test`, `npm run test:desktop`, eslint `--max-warnings=0`, `release:check`
- [ ] A test that fails if the picker stops reaching the graph — the silent-no-op is the whole risk
- [ ] `docs/playbooks/add-flow/01-descriptor-and-ops.md` updated (FlowDef contract change)
- [ ] Release note: user-visible once Flows ship (MPI-589 took the dev gate off)
