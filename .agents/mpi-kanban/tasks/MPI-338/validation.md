# MPI-338 — Validation

Verify mode: **user-ux**. Code complete, syntax + ESLint clean, logic-traced. NOT committed.

## Files touched (commit set — 4 files)

1. `js/managers/hotkeyRegistry.js` — new `radialMenu.devToggle` = `control+tab`,
   dev_mode + page/overlay gated.
2. `js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js` — `_onDevTabDown` dev
   context swap; `_prevContext` restore in `_hide()`; removed dead `extraItems` API.
3. `js/shell/navigation.js` — dev items → `'dev'` context; dropped `extraItems`
   mount prop + `setExtraItems()` call.
4. `js/components/types.js` — dropped `extraItems`/`setExtraItems` doc, noted
   `setContextItems`.

## Auto-verify (PASSED)

- `node --check` on all 4 files — OK.
- `npx eslint` on the two component files — 0 errors.
- grep: no remaining `extraItems`/`setExtraItems`/`_extraItems` reference anywhere.

## Live-test matrix (USER — `npm start`, dev build)

- [ ] Gallery + History: hold **Tab** → radial shows operations ONLY (no Apps /
      Components / Restart Engine).
- [ ] Hold **Ctrl+Tab** → dev radial shows Components + Apps + Restart Engine.
      Release outside centre selects: Apps opens the App Library, Components loads
      the components gallery, Restart Engine restarts ComfyUI. Release inside
      centre = cancel, no action.
- [ ] After a Ctrl+Tab open, a following plain **Tab** shows operations again
      (context restored — no dev items leak into the ops radial).
- [ ] Lose pointer lock mid-dev-radial (Esc / click away) → context still restores
      (next Tab = ops).
- [ ] Production build (or `APP_CONFIG.dev_mode = false`): **Ctrl+Tab** does
      nothing; Tab radial unchanged. Tutorial capture on Tab shows no dev options.

## Docs / rules follow-up (ASK USER — CLAUDE.md rule 5)

Radial + hotkey wiring changed. Candidate updates (do NOT edit without OK):
`.claude/rules/component-events.md` (dev radial context + Ctrl+Tab), `docs/shell.md`
if it documents the radial/Hotkeys.
