# MPI-47 — Ctrl+ / Ctrl- to change UI size

- [ ] Extract shared webFrame zoom-step logic in `js/init.js` (`applyUiZoom(dir)`, shared MIN/MAX/STEP)
- [ ] Add registry entries: `system.uiZoom.in` (`control++`, `control+=`) + `system.uiZoom.out` (`control+-`), `allowWhileTyping: true`
- [ ] Bind built-ins in `Hotkeys.init()` → call `applyUiZoom`
- [ ] Verify no conflict with gallery `+`/`-` (distinct mapKeys: `control++` vs `+`)
- [ ] Add System help row in `MpiHelp.js`
- [ ] UI verify: Ctrl+= / Ctrl++ enlarge, Ctrl+- shrink, clamp 0.5–3.0, works while typing, matches Ctrl+wheel
