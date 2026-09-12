# MPI-731 Checklist

Eight items, in order. 1 → 4 are the player; 5 and 6 are the consistency pass Fabio asked
for; 7 and 8 close it. Full detail and every trap live in `plan.md` — this is the state, not
the spec.

- [ ] **Implementation**
  - [ ] 1. `MpiProgressBar` gains `orientation: 'vertical'` — additive, horizontal path
        untouched, `writing-mode: vertical-lr` (native in Chromium 142 / Electron 41)
  - [ ] 2. `MpiVolumeControl` compound — mute button + hover-reveal vertical volume, owns no
        media element, three consumers
  - [ ] 3. `MpiAudioPlayer` compound — one row, `play │ time │ waveform │ mute`, owns ONE
        `<audio>`, mounts MPI-730's `MpiWaveform` as its scrub track
  - [ ] 4. Wire it into the Flow's result pane and floating dock — `_sharedAudioPlayer`
        keyed by URL, MOVED not rebuilt (MPI-727 holds)
  - [ ] 5. `MpiVideoControlBar` adopts `MpiVolumeControl` — hotkeys `M` / volume± keep working
  - [ ] 6. `MpiGalleryGrid` adopts it, and the gallery gains a real mute button.
        **LAST, and hunk-staged**: that file holds MPI-733's and MPI-678's uncommitted work
  - [ ] 7. `tests/desktop/flow-audio-player.spec.js` + the MPI-727 regression spec + a live
        check in Fabio's own app (the specs run maskless, so only a real app paints the wave)
  - [ ] 8. Registrations (`preloadStyles.js`, `types.js` — both held by MPI-728) and
        `docs/gallery-audio-cards.md`

## Waiting on nobody

Items 1–5 touch only unclaimed files. Two things are deliberately deferred rather than
blocked: the `types.js` / `preloadStyles.js` registrations (MPI-728's claim) and the demo-page
variant (MPI-739's claim on `js/pages/components.js`). Neither gates the feature.

## Not in this card

`MpiFader`'s wheel defects are **MPI-740**, filed from the same conversation: it crawls at
0.1 dB per tick and cannot leave the unity detent at all. Independent in both directions.
