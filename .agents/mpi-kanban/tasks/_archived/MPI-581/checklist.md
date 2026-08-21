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
- [x] **Extend Video**: tile + hero from Fabio's two clips. Confirmed FIRST that they are
      the same shot (result trimmed to the source's 56 frames -> PSNR avg 37.3 dB, min 31.0;
      a different clip would be under 15), so the 57.74% marker is truthful. Hero plays the
      RESULT under a progress rail: source share in `--ink-3`, an `--ink-1` mark where it
      ended, the rest in `--accent-heat`. 815 KB mp4, 50 KB webp.
- [x] Found and fixed a real colour bug: `--accent-heat` is **`#FF7EB6`**, not the `#FF5FA2`
      the playbook recipe carried and both 2026-08-19 heroes baked in. Confirmed by canvas
      readback in the browser. Playbook healed; the two shipped heroes still hold the wrong
      pink — Fabio's call whether to rebuild them
- [x] Promote the ffmpeg/sharp recipes to `scripts/`? **No — answered by the third flow.**
      They did NOT survive unchanged: each hero's filtergraph is bespoke to its device
      (xfade wipe / showwavespic reveal / progress rail), so there is no shared shape to
      extract. The only repeat is the crop-to-4:5-webp `sharp` call, which is four lines.
      A `scripts/` helper here would be an abstraction over three things that differ.

## Notes

- **Extend Video device: BUILT.** Source `i2v_ms_005.mp4` 2.334s, result
  `flowLtxExtend_002.mp4` 4.042s, both 864x480 @24fps -> the source ends at 57.74%.
  Hero is 1280x800, 5.5s (4.042s playthrough + a 1.458s hold on the full rail),
  fades black-to-black so the loop wraps cleanly.
- **Verifying a hero needs a project open AND `currentPage === gallery`.** Without both,
  `flow:open` mounts MpiBaseFlow into a 0x0 hidden overlay while the `<video>` still
  reports `paused:false` and a rising `currentTime` — a probe that passes with nothing
  on screen. Measured 444 px once done properly. Added to the playbook traps.
- **Not mine, seen in passing:** `tests/shared-dep-uninstall-direction.test.cjs`
  fails on master - "MPI-258 B1 regression: 5 tier-family deps stranded". It is an
  LTX dep-family assertion and the tree has uncommitted `models.js` /
  `pluginsRegistry.js` work; belongs to MPI-579/MPI-580, not to this card.
- **Co-owned file:** `flowsRegistry.js` carried a peer's scratch `character-sheet`
  flow marked NOT SHIPPABLE, so the Head Swap change was staged as a single hunk
  via `git apply --cached` rather than `git commit --only`.
