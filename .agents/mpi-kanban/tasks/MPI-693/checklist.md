# MPI-693 Checklist

- [x] Implementation
  - [x] `_collect()` returns one entry per non-archived group (selected item, `group.type` filter, skip no-`filePath`)
  - [x] label = `customName || item.name || group.name || basename(filePath)`, carried on the entry
  - [x] `_buildTile` consumes `entry.label` for caption, tooltip and the Preview `aria-label`
  - [x] audio tiles play on hover (lazy `<audio>`, gallery volume, 0 = skip, leave resets, glyph swap)
  - [x] playback stops on `modal.el.hide()` (wrapped — Escape/backdrop run no picker code), `el.destroy()` and on opening a preview
  - [x] `tests/desktop/media-picker-cards.spec.js` — 3/3
  - [x] `docs/component-contracts.md` — the picker's card contract + the `data-src` trap
- [x] Verification
  - [x] `npx eslint js/components/Compounds/MpiMediaPicker tests/desktop/media-picker-cards.spec.js` — clean
  - [x] the new spec passes — 3/3, 26.1s
  - [x] four mutants run, four killed (see `validation.md`)
  - [ ] `user-ux` — Fabio's call on losing direct access to a non-selected take from a Flow slot

Machine verification passed (`validation.md`). One `user-ux` question is outstanding and has
been asked in-session; the card stays in `doing` until it is answered.
