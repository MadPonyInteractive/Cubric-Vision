# MPI-594 — checklist

Procedure: `docs/playbooks/add-flow/` (hub + `01`, `02`, `03`, `05`). The crop gizmo's own
decisions go in `docs/playbooks/add-flow/ui/crop-gizmo.md`; the flow's in
`docs/playbooks/add-flow/existing-flows/outpaint.md`.

## Workflow

- [x] Raw graph read: Krea 2 edit, `Input_Image` (MpiLoadImageFromPath, path-reading),
      `Input_Positive` (baked "fill the back areas with the rest of the image"),
      `Input_Negative`, `Input_Seed`, `Input_is_Turbo` (MpiSimpleBoolean),
      `Input_Bypass_Filter_Lora`; single `Output_Image` (PreviewImage)
- [x] `node scripts/sync-raw-workflows.mjs` → `comfy_workflows/flow_outpaint.json`,
      injection rules pass

## The crop step kind (new, portable)

- [x] `MpiStepCrop` — `CropManager` on its own stage, own view = fit(image ∪ rect),
      refit suppressed mid-drag, black painted where the box leaves the image
- [x] Ratio bar under the canvas: `CROP_RATIOS` + orientation toggle + Free, both
      `MpiRadioGroup` (icon + label), gizmo-owned because the list is orientation-dynamic
- [x] `stepKinds.js`: `crop: MpiStepCrop` + the Run-time preparer that composes the padded
      PNG and swaps that role's media path
- [x] `preloadStyles.js` + `js/components/types.js` entries

## The flow

- [x] Op `flowOutpaint` in the 4 registries (`commandRegistry.js`,
      `universal_workflows.js`, `operationRegistry.js`, `operation_registry.json`)
- [x] `FlowDef` in `flowsRegistry.js` — `requiredModels: ['krea2']`, one image slot,
      the crop step, `fields: [Input_is_Turbo toggle]`
- [x] Copy warns that small extensions work best (description + step hint)
- [x] `tests/inject-params-titles.test.cjs` case

## Verify

- [x] `npm test` green, `node --check` on every touched JS
- [ ] Live run in an isolated app instance: pad lands in `.preview-assets`, generation
      returns a filled frame, reuse restores image + rect
- [ ] Preview art (`/mpi-flow-graphics`) — separate pass, tracked here until it lands
