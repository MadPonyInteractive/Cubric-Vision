# MPI-581 checklist

- [x] Measure the real slot: `preview` = 4/5 still, three placements
- [x] Confirm the toolchain: Krea2 connector route, sharp, ffmpeg, HyperFrames
- [x] Write `docs/playbooks/add-flow/06-preview-image.md` + route it
- [x] SCOPE CHANGE (Fabio): hero is its OWN wide autoplaying clip, not the still
- [x] `FlowDef.video` + `MpiBaseFlow` hero renders `<video>` autoplay/muted/loop
- [x] Fallback proven: broken filename -> clip removed, still shown, no black box
- [x] **Add Foley**: tile + hero from a real run (waveform draws in sync; NO before/after,
      the flow returns the same pixels). 78KB webp, 481KB mp4.
- [x] **Head Swap**: tile + hero from Fabio's group A plates (wipe with visible seam;
      tile is that wipe frozen where the seam bisects the face). 47KB webp, 114KB mp4.
- [x] Playbook rewritten from what building the two taught: ffmpeg-first, three silent
      ffmpeg traps, the one-run-plates rule, the punch-in rule; two stale specs healed
- [x] Verified live in an isolated instance each time; all four assets 200 with right bytes
- [ ] **Extend Video** — the last placeholder; still shares `ltx23_balanced_preview.webp`
      with nothing now, but it is a model preview, not a flow asset
- [ ] Promote the ffmpeg/sharp recipes to `scripts/` only if they survive a third flow

## Notes

- **Extend Video device (proposed, not built):** play the original, mark where it
  ended, let the extension run past the mark. Needs a real extend run with the
  source clip kept, so the seam is truthful.
- **Not mine, seen in passing:** `tests/shared-dep-uninstall-direction.test.cjs`
  fails on master - "MPI-258 B1 regression: 5 tier-family deps stranded". It is an
  LTX dep-family assertion and the tree has uncommitted `models.js` /
  `pluginsRegistry.js` work; belongs to MPI-579/MPI-580, not to this card.
- **Co-owned file:** `flowsRegistry.js` carried a peer's scratch `character-sheet`
  flow marked NOT SHIPPABLE, so the Head Swap change was staged as a single hunk
  via `git apply --cached` rather than `git commit --only`.
