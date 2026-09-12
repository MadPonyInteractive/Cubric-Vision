# MPI-730 Checklist

- [ ] Implementation
  - [x] Bake the waveform derivative — `extractAudioWaveform()` in `services/ffmpegThumb.js`,
        wired into both `thumbPath = null` sidecar writers and the backfill route
        (machine-verified, see `validation.md`)
  - [x] Geometry and paint — 21:9 aspect branch, two mask layers split by one clip-path,
        background fill, playhead rule, cursor rule, play icon removed. Landed as the
        reusable `MpiWaveform` compound (machine-verified, see `validation.md`); MPI-731's
        player mounts the same component
  - [x] Click to seek, and suppress `open-group` for audio cards — the card consumes
        `MpiWaveform`'s `seek`, the play/stop toggle is gone, and a type check in the
        generic click handler stops an audio card opening. Both halves proven live
        against a deliberately broken build (see `validation.md`)
  - [x] Repaint in the Cubric Audio accent — `--accent-audio` added to `styles/01_base.css`
        (Fabio chose the single token; the rest of the family is MPI-736)
  - [x] End-of-clip fix (Fabio, from his own app) — a click in the last pixels no longer
        empties the fill and stops the card dead; a finished clip holds the fill at the end
        and leaving still resets. Both halves proven by falsification (see `validation.md`)

The card now paints, seeks, and wears Audio's own colour. **The user-ux re-check after the
end-of-clip fix is what this card waits on** — the fill, the two rules, a 21:9 card in a
mixed gallery, and whether a click lands where it feels like it should are Fabio's eyes.

The gallery demo page question is closed: **no**, `MpiWaveform` does not go on
`js/pages/components.js`.
