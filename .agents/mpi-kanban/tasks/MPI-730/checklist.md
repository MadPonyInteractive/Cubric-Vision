# MPI-730 Checklist

- [ ] Implementation
  - [x] Bake the waveform derivative — `extractAudioWaveform()` in `services/ffmpegThumb.js`,
        wired into both `thumbPath = null` sidecar writers and the backfill route
        (machine-verified, see `validation.md`)
  - [x] Geometry and paint — 21:9 aspect branch, two mask layers split by one clip-path,
        background fill, playhead rule, cursor rule, play icon removed. Landed as the
        reusable `MpiWaveform` compound (machine-verified, see `validation.md`); MPI-731's
        player mounts the same component
  - [ ] Click to seek, and suppress `open-group` for audio cards

The card now paints. **The user-ux sign-off is owed on item 2 and is what this card waits
on** — the fill, the two rules, and a 21:9 card in a mixed gallery are Fabio's eyes.
