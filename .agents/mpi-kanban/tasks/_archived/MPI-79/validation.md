# MPI-79 Validation

## Verified by user — 2026-06-14

User opened the four slide-over panels (Settings, Queue, About, Hotkeys) and confirmed:

- Opening a child pop-up/modal (e.g. MpiOkCancel confirm, showError) on top of a panel
  now leaves the panel OPEN underneath. (Bug fixed — was the `ui:close-all-popups` pulse
  from `Overlays.request`.)
- Clicking outside the panel no longer closes it (per card: click-away was annoying).
- Escape still closes the panel.
- Close button still closes the panel.

User statement: "I'll test. It's verified."

## How it was fixed

- `overlayManager.js` `request()` now emits `ui:close-all-popups` with payload
  `{ reason: 'overlay-open' }`.
- `MpiSlideOver` ignores that reason, so a child modal opening does not close the panel.
  Escape (empty-stack `closeTopOverlay`) and `Overlays.reset()` still emit bare → panel
  closes on those.
- The outside-click (click-away) close handler was removed from `MpiSlideOver` entirely.
- Transient popups (dropdowns, context menus) ignore the payload and still close on any
  pulse — unchanged.
