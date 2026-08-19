# MPI-581 checklist

- [x] Measure the real slot: one `preview` field, three placements, 4/5 cover x2 + natural-aspect hero
- [x] Confirm the toolchain: Krea2 via `/connector/generate`, sharp (already a dep), playwright-cli, HyperFrames
- [x] Write `docs/playbooks/add-flow/06-preview-image.md` (166 lines)
- [x] Route it: README section table + checklist line + trap row, `docs/flows.md` row, and 01's two stale 'reuse any existing webp' comments healed
- [ ] Fabio picks the art direction (a / b / c) - BLOCKS every generation below
- [ ] Generate + composite the Head Swap preview; verify at 213px and full-width
- [ ] Same for Extend Video and Add Foley (they currently share one image)
- [ ] Point the three `preview` fields at the new files in `flowsRegistry.js`
- [ ] Promote the sharp recipe to `scripts/` only if it survived three uses unchanged
