# MPI-581 checklist

- [x] Measure the real slot: `preview` = 4/5 still, three placements
- [x] Confirm the toolchain: Krea2 via the connector route, sharp (already a dep), HyperFrames, ffmpeg
- [x] Write `docs/playbooks/add-flow/06-preview-image.md`
- [x] Route it: README section table + checklist line + trap row, `docs/flows.md` row, 01's stale "reuse any existing webp" healed
- [x] SCOPE CHANGE (Fabio, 2026-08-19): hero is its OWN wide autoplaying clip, not the still
- [x] `FlowDef.video` typedef + `MpiBaseFlow` hero renders `<video>` autoplay/muted/loop, poster = still
- [x] Fallback proven: broken filename -> clip removed, still shown, no black box
- [x] Live proof in an isolated instance (port 55123, user's :3000 untouched); 630/630 tests
- [x] Playbook rewritten for two assets + the invisible-change rule (audio flows)
- [ ] Fabio picks the per-flow hero device / supplies before-after material
- [ ] Head Swap: still + hero clip (before/after, real results)
- [ ] Extend Video: still + hero clip (original, marker, extension running past it)
- [ ] Add Foley: still + hero clip (waveform drawing over an unchanged frame - NOT a before/after)
- [ ] Point `preview` + `video` at the new files in `flowsRegistry.js`
- [ ] Promote the sharp/ffmpeg recipe to `scripts/` only if it survived three uses unchanged

## Open question for the tile stills

The three tiles still wear model previews. Head Swap = sdxl-real-05.webp, and
Extend Video + Add Foley SHARE ltx23_balanced_preview.webp, so two flows read as
one card. That is independent of the hero work and can ship first.
