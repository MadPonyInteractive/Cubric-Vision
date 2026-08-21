# MPI-564 validation

Probed live in an isolated app instance (`npm run app:isolated`, port 61339), grid
mounted standalone with two fake groups — one whose selected item carries notes,
one with an empty string.

- Action column order is `fav-wrap, notes-wrap, reuse-wrap` on every card.
- Notes wrap `display: block` on the annotated card, `none` on the other.
- No hover needed: computed `opacity: 1`, box 42x34, icon SVG present.
- Clicking the marker emits `card-notes` for that group and does NOT emit
  `open-group` (the card-click guard holds); a click on the media still opens
  the group.
- `npm test` — 592/592 pass, 0 fail.

Not machine-checkable: whether the marker reads right visually beside the heart.
Screenshot taken and shown to the user; awaiting his eye.
