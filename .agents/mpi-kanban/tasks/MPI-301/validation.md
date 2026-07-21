# MPI-301 — validation

## Automated (Playwright harness, standalone server on :3999)

- 11 cards render (None + 10 styles), no console errors, no page errors.
- Initial selection highlighted; trigger label matches the selected style.
- Click a card → trigger label updates, panel closes, `change {index, label}` fires
  with the correct INDEX → `Input_Style` contract intact.
- All 11 images load (`naturalWidth > 0`), 0 placeholders remaining, None card
  renders its baseline image.
- Panel centers on the trigger (trigger center 390.0 == panel center 390.0) and sits
  above it.
- Wheel: `scrollLeft` 0 → 146 → 292 → 438 with card pitch 146 — exactly one card per
  notch, every stop on a card boundary, reverses correctly, page never scrolls.
- `node --check` clean on all edited JS; ESLint passed at commit.

## User-verified (live Electron, real Krea2 project)

- 2026-07-18: user confirmed the picker in the real app on a Krea2 project —
  screenshots show the button, the card strip over the gallery, and the selected
  style applied. Follow-up tweaks (center-align, lighter `--surface-bar` ground,
  wheel snap, low-contrast button) all requested and confirmed live.
- User approved final completion in the same session.

## Not covered

- Models other than Krea2 have no style rack yet; the placeholder path (no
  `styleLoraImages`) is harness-verified only, not seen in the app.
