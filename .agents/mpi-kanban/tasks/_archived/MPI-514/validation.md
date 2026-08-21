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

## Second pass (same session)

Ink gaps re-measured live after the centring fix, `.mpi-tile__flag--deprecated`:
L 3.67 / R 3.67 / T 4.66 / B 4.67 - dead centre, was 2.75/2.75/3.5/4.25. The
star was already symmetric (5/5/4.25/4.25) and was not touched.

Featured set now: krea2, krea2-nsfw, klein-4b, minimax-h3, minimax-h3-ref2va
(read back by importing models.js in bare node).

EPIPE: reproduced the exact failure by launching with stdout piped into
`head -1`. BEFORE the fix that wrote three `[FATAL] [main] uncaughtException:
Error: EPIPE` lines into the agent profile's app.log (10:45:10, 10:54:32,
10:54:35), each with the modal dialog. AFTER the fix the same launch logged 12
further lines with ZERO FATAL entries. The app still exits in that scenario, but
that is the third-party electron npm CLI wrapper dying on its own dead stdout,
not our process, and it exits quietly.

`npm test` after the main.js change - 535 tests, 535 pass, 0 fail.

