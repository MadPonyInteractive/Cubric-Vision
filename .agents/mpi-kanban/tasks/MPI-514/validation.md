# MPI-514 - validation

Verified live 2026-08-10 against an isolated app instance (`npm run app:isolated`,
port 63061) driven with `playwright-cli`. Model Library opened via `models:open`.

**Flags render.** 20 tiles, 5 flags: 4 `Featured` + 1 `Marked for deprecation`
(nvidia-pid), matching the four `featured: true` defs (krea2, krea2-nsfw,
klein-4b, minimax-h3) plus the one `deprecated: true`.

**Hover explainer.** `mouseover` on the deprecated flag mounts one popup:
`.mpi-popup--glass.mpi-popup--top.is-active` holding
`.mpi-badge--danger.mpi-badge--pill` reading "Marked for deprecation", placed
ABOVE the flag (`popup.bottom <= flag.top`). The star gives
`.mpi-badge--warning` / "Featured". `mouseout` destroys it (0 popups left), and
re-hovering the same flag does not stack a second one (1 popup after a repeat
`mouseover`).

**Native tooltip gone.** No `title` attribute is written on a flag any more.

**Screenshots** confirm both pills paint on screen, taken with a real
`page.mouse.move` onto the flag.

## The one real bug this pass caught

First screenshot showed NO popup while the DOM said `is-active`, `opacity: 1`,
correct rect. Cause: MpiPopup portals to `<body>` at `z-index: 9999`, and the
Model Library runs in a body-mode MpiOverlay at `10010` - the tip was painting
BEHIND the grid. Fixed consumer-side per the documented MpiPopup-reuse rule:
`.mpi-popup.mpi-popup--model-flag { z-index: 11000 }` in MpiModelManager.css,
11000 being the portal layer MpiDropdown / MpiTreePicker already occupy (above
the overlay, below toasts at 20000). The shared primitive was not touched.

`npx eslint js/components/ js/data/modelConstants/models.js` - clean.
`npm test` - 535 tests, 535 pass, 0 fail.

## Open

Fabio's own eyes on the popup styling. The model PICKER renders the flags with
no explainer (deliberate - see docs/model-library.md).
