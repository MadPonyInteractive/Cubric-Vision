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

## MPI-572 slice — one control surface (2026-08-16)

- [x] `FlowDef.controls` collapsed into `FlowDef.fields` — one name, one vocabulary
- [x] Two seeding loops merged into one `_seedField(f, persisted)` helper
- [x] Flow-level placement verified live (extend: 3 fields render stacked, all seeded)
- [x] Step placement verified live (foley step 2: 2 fields, negative default seeded)
- [x] Reuse of an OLD-shape card (top-level only, no `stepValues`) still repopulates
- [x] Prompt boxes: `resize: none`, equal size, taller — `rows` no longer sets height
- [x] `npm test` green (606/606), eslint clean, `node --check` clean
- [x] `docs/playbooks/add-flow/` updated (hub, `ui/carousel-frame.md`, both worked examples)
