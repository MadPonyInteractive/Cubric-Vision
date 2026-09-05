# MPI-693 — Validation

## What shipped

One file of behaviour: `js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js`.

- `_collect()` returns one entry per non-archived ItemGroup — `history[selectedIndex]` — filtered on
  `group.type`, skipping a card whose selected entry has no `filePath`.
- `_cardLabel()` is the gallery's chain (`customName || item.name || group.name`) with a
  `basename(filePath)` tail for `createItemGroup`'s `'Untitled Group'` default. The label is carried
  on the entry, so `_buildTile` no longer derives a second name of its own — one rule, feeding the
  caption, the tooltip and the Preview `aria-label`.
- Audio tiles play on hover: `<audio>` built on first hover, `Storage.getGalleryVolume()` with 0
  skipped outright, glyph swapping `audio`↔`stop`, `mouseleave` pausing and resetting to 0.
- `_stopPickerAudio()` is wrapped around `modal.el.hide()` and called from `el.destroy()` and
  `_openPreview()`.

No CSS, no server route, no state key, no storage key.

## Machine verification — all green

| Check | Result |
|---|---|
| `npx eslint js/components/Compounds/MpiMediaPicker tests/desktop/media-picker-cards.spec.js` | clean, exit 0 |
| `npm run test:desktop -- media-picker-cards.spec.js` | **3 passed** (26.1s) |
| `validate_board.py .` | `Board validation passed`, exit 0 |

The spec covers: one tile for a 3-take card; `customName` / `group.name` / basename captions; the
archived card and the file-less card both absent; the selected take rather than `history[0]`; the
`group.type` filter asserted in both directions on a video group whose selected take is an image;
captions compared against `MpiGalleryGrid`'s own rendered `.mpi-group-card__name`; and hover
play / leave stop on a real audio element.

## Mutation-tested — four mutants, four killed

Per `docs/testing-desktop-specs.md`, a guard that has not been run against the bug it covers is not
a guard. All four via `scripts/mutate-check.mjs`, each restored byte-identical:

| Mutation | Outcome |
|---|---|
| `_collect` back to the per-item walk over `group.history` | **KILLED** — 2 tests red |
| type filter reads the selected item's type instead of `group.type` | **KILLED** — the filter test red |
| `history[selectedIndex]` → `history[0]` | **KILLED** — the caption test red |
| delete the `_wireAudioHover(...)` call | **KILLED** — the audio test red |

## Two spec defects found and fixed during the run — both were the vacuous-pass shape

1. **`assets/sounds/notify.wav` is 319 ms.** It had ENDED inside the 400 ms settle after
   `mouseenter`, so a working hover read as `paused: true`; and the `mouseleave` assertion
   (`currentTime === 0`) would then have passed on the `ended` reset whether or not `mouseleave` did
   anything at all. Diagnosed with a throwaway in-page probe (HTTP 200, `audio/wav`, `readyState 4`,
   `play()` resolved, `duration 0.318866`) rather than guessed at as an autoplay-policy block. Swapped
   to `voices/child_1.opus` (11.1 s) and the spec now asserts `duration > 2` **before** the two
   assertions that depend on it, so a future asset swap cannot silently reintroduce this.
2. **The fixture's three takes were identical**, so a `history[0]` regression would have survived.
   The second card now carries a losing take named `wrong_take` at index 0 with the real one at
   index 1 — which is what makes mutant 3 above killable.

## The one thing the code does that the gallery does not

`'Untitled Group'` renders literally in the gallery and falls through to the filename here. It
surfaced as a red cross-check assertion, not as a guess: the spec holds that one card out of the
gallery comparison and says why. Nothing in the app writes that value — only a legacy or
hand-edited `project.json` can — so every card a user can actually create is still covered by the
byte-identical comparison.

## Outstanding — a human call, not a machine one

The picker can no longer reach a **non-selected history take** for a Flow slot. It is still
reachable (select that take on the card in the gallery, then open the slot), but it is two surfaces
now instead of one. Asked in-session; the card stays in `doing` until answered.
