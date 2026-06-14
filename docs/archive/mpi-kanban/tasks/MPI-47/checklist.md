# MPI-47 — Ctrl+ / Ctrl- to change UI size

- [x] Extract shared webFrame zoom-step logic in `js/init.js` (`applyUiZoom(dir)`, shared MIN/MAX/STEP) → `js/utils/uiZoom.js`
- [x] Add registry entries: `system.uiZoom.in` (`control++`, `control+=`) + `system.uiZoom.out` (`control+-`), `allowWhileTyping: true`
- [x] Bind built-ins in `Hotkeys.init()` → call `applyUiZoom`
- [x] Verify no conflict with gallery `+`/`-` (distinct mapKeys: `control++` vs `+`)
- [x] Add System help row in `MpiHelp.js`
- [x] UI verify: Ctrl+= / Ctrl++ enlarge, Ctrl+- shrink, clamp 0.5–3.0, works while typing, matches Ctrl+wheel — user-verified
