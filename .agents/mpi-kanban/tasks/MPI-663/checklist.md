# MPI-663 - checklist

- [x] Raw graph -> `comfy_workflows/raw/flow_stems.json`, synced to the runtime API JSON
      (author's test scene scrubbed: the baked `D:\WORK\...` input path, 3 `false` gate defaults)
- [x] Op registered in the 4 files (`commandRegistry`, `universal_workflows`, `operationRegistry`,
      `operation_registry.json`)
- [x] `FlowDef` in `flowsRegistry.js` - `requiredModels: []`, one audio slot, `mediaType: 'audio'`
- [x] Multi-output capture: `Output_Audio_1..4` each land their own card
      (`outputAudioMultiNodeIds`, numbered from `_1` because bare `Output_Audio` is the mux
      side-channel)
- [x] Per-card naming from the graph's `filename_prefix` (`labelFromComfyOutputUrl`)
- [x] Four stem toggles + `combine`; cross-field rules declared (`group`/`minActive`,
      `enabledWhen`) and painted by the frame
- [x] App-side combine: `mixAudioFiles` (amix, `normalize=0`) via `save-generation`'s
      `mixViewUrls`
- [x] Node pack pinned in `dev_configs/node_lock.json` (`installRequirements: false` - its
      librosa cap would downgrade the engine's 1.0.0); `compile-node-deps.mjs --check` green
      with `moviepy` dropped-with-reason
- [x] Tests: inject titles (input + 4 gates + 4 captures), field constraints, card label,
      mix levels. `npm test` 812 pass / 0 fail; `npm run lint` clean
- [x] Docs: `existing-flows/stems.md`, `02-media-io.md` § multi-audio capture,
      `ui/carousel-frame/fields.md` § fields that constrain each other
- [ ] Preview assets - `flow-stems.webp` + `flow-stems.mp4` (`/mpi-flow-graphics`)
- [ ] Release note + roster line in `docs/releases/UNRELEASED.md`
- [ ] DECISION (user): the four stem toggles all use the generic `audio` icon (only `mic` for
      Vocals is unambiguous). Proper stem icons would be new entries in `js/utils/icons.js`
- [ ] USER: live run - four cards, then a combine run, and listen to both

## Verified

- Runtime graph: 14 nodes, `Input_Audio` -> `AudioSeparation` -> 4x (`MpiBlocker` ->
  `MpiClearVram` -> `SaveAudioAdvanced`), all four saves flac with their own `filename_prefix`.
- `MpiBlocker.input` is lazy (`/object_info`), so an all-off run never loads the separator -
  which is exactly why the `minActive: 1` floor exists: it would succeed and land nothing.
- `amix` sums rather than averages: mixing a tone with a copy of itself measured **+6.0 dB**
  through the real bundled ffmpeg (`-30.1` -> `-24.1` dBFS). `normalize=1` would have been
  +0 dB.
- `AudioCombine` was NOT used - confirmed against `/object_info` (it takes exactly 2 AUDIO
  inputs), which is why a subset combine cannot be done in-graph without a silence source.
