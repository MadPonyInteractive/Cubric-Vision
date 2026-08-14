# MPI-531 — Checklist (item 1 slice)

- [x] One field builder serves the step row AND the run controls
- [x] `number` field type (implemented; no live consumer until extend's width/height)
- [x] `slider` field type (with a live value readout)
- [x] `text` field type (`rows > 1` → textarea)
- [x] `FlowDef.controls` renders on the run slide, stacked
- [x] Control values seed from `state.s_flowInputs[flow.id]` and survive close→reopen
- [x] Control values reach `_collectInputs()` — top-level, or `injectionParams` for `Input_*`
- [x] `uiComponent` path unchanged — Head Swap still mounts, and wins on merge
- [x] Typedefs updated in `js/data/flowsRegistry.js`
- [x] CSS for the new types, tokens only, BEM
- [x] `docs/playbooks/add-flow/` updated (hub checklist, `01`, `ui/carousel-frame.md`)
- [x] `node --check` clean, `npm test` green (591/591), eslint clean
- [x] A Flow authored with no `uiComponent` renders + collects — **MPI-520**, live in an
      isolated app (the real generation is MPI-520's own gate, not this card's)

Items 2–4 of the card remain OPEN and are not in this slice.
