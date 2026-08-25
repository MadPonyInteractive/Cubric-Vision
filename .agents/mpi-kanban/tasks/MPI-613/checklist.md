# MPI-613 Checklist

- [x] render the cogwheels on the run slide, one per rack-bearing slot
- [x] keep the per-slot label ("Render model" / "Blend model")
- [x] generic in `MpiBaseFlow` off `flowLoraPhases` — no FlowDef, graph or per-flow edit
- [x] handle the no-listener trap (the frame mounts its own `MpiModelSettings`)
- [x] teardown: buttons die with the slide, overlay dies with the flow
- [x] `tests/flow-lora-rack.test.cjs` gains run-slide coverage
- [x] `docs/playbooks/add-flow/ui/lora-rack.md` describes both surfaces
- [x] `npm test` — 730/730
- [x] `npx eslint js/ --max-warnings=0` — clean
- [x] desktop suite green - 26/26
- [ ] Fabio: does the Flow Library keep its cogwheels, or do they move outright?
      Kept for now — additive, nothing removed, and the Library placement is still
      right for *before* you run. One line to remove them if you want them gone.
- [ ] Fabio: eyeball the run slide (a UI placement is a human judgement)
