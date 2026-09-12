# MPI-730 Checklist

- [ ] Implementation
  - [x] Bake the waveform derivative — `extractAudioWaveform()` in `services/ffmpegThumb.js`,
        wired into both `thumbPath = null` sidecar writers and the backfill route
        (machine-verified, see `validation.md`)
  - [ ] Geometry and paint — 21:9 aspect branch, two mask layers split by one clip-path,
        background fill, playhead rule, cursor rule, play icon removed. **Now lands as a
        reusable `MpiWaveform` component**: the custom player replacing Electron's default
        needs the same waveform (Fabio, 2026-09-12)
  - [ ] Click to seek, and suppress `open-group` for audio cards

Nothing paints the mask yet, so there is no visible change in the app until item 2. The
user-ux sign-off is owed then, not now.
