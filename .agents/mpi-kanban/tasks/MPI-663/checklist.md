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
- [x] App-side combine: `mixAudioFiles` (amix, `normalize=0`, + a clip-avoiding trim) via
      `save-generation`'s `mixViewUrls`
- [x] Node pack pinned in `dev_configs/node_lock.json` (`installRequirements: false` - its
      librosa cap would downgrade the engine's 1.0.0); `compile-node-deps.mjs --check` green
      with `moviepy` dropped-with-reason
- [x] Tests: inject titles (input + 4 gates + 4 captures), field constraints, card label,
      mix levels, clip trim, icon + preview-asset guards. `npm test` 815 pass / 0 fail; `npm run lint` clean
- [x] Docs: `existing-flows/stems.md`, `02-media-io.md` § multi-audio capture,
      `ui/carousel-frame/fields.md` § fields that constrain each other
- [x] Proven on REAL stems from the user's own track (run under a GPU lease, 10s)
- [ ] Preview assets - `flow-stems.webp` + `flow-stems.mp4` (`/mpi-flow-graphics`)
- [x] Release note + roster line in `docs/releases/UNRELEASED.md`
- [x] Icons: `stem_bass` / `stem_drums` / `stem_other` drawn and added to `icons.js`; Vocals
      reuses `mic`. Rendered at 48/24/18px and in the real toggle chrome before landing
- [x] Live run in the app (agent instance, 2026-08-30): four cards named per stem and
      playable, a combine run landing ONE `flowStems_001` card, the last stem toggle
      locking and Combine greyed below two, Flow Library opening with 0 console errors.
      The engine needed the node pack installed AND a delegated restart - see
      `validation.md`
- [ ] USER: listen to the four stems and the combined track in the app
- [ ] Fixed a RED master of my own making: the FlowDef named preview art that did not exist,
      so the Flow Library 404d (caught by tests/desktop/flows-tab-ring.spec.js). Keys dropped
      until the art lands + a guard added so it fails in `npm test` instead of in CI

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
- The combine was proven on the user's own track, not on tones: summing all four, the
  instrumental, and drums+vocals through the SHIPPED recipe. Every one peaked at 0.0 dBFS
  by `volumedetect` - which is the reading that hides the bug. Measured again in FLOAT,
  the sums were +0.01 / +0.03 / **+0.63 dB OVER full scale**: a subset sum really does
  clip, because dropping a stem removes what was pulling the waveform down. After the
  trim: 0.000 / -0.000 / -0.056 dBFS, and bass+other (which never overshot) was left
  untouched.
- A null test against the original was tried FIRST and discarded as unfair: the stems are
  44.1kHz (the separator stamps its own rate) against a 32kHz mp3 source, so decoder delay
  plus resampling leaves a -0.4 dBFS residual whether the mix is right or wrong.
