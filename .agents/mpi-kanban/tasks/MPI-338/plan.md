# Dev-only Ctrl+Tab radial — move dev actions off the main radial

## Current State

Project mode: scalable-foundation.

The radial is ONE persistent instance (`js/shell/navigation.js` `_radialInstance`).
It is Tab-hold driven inside the primitive
(`js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js`):
`Hotkeys.bind('radialMenu.toggle', _onTabDown)` + a `window` `keyup` for Tab
release (release outside centre = select highlighted, ~L351-384). Items render
as `[...CONTEXTS[_context], ..._extraItems]` (~L125); `_context` follows the
page (`gallery` / `group-history`) via `el.setContext`; per-context items are
pushed with `el.setContextItems(ctx, items)`.

Dev actions ride the MAIN radial today: when `APP_CONFIG.dev_mode`,
`navigation.js` (~L313-356) appends `extraItems` = `Apps` (`apps:open`) and
`Restart Engine` (`restart-engine`) via `el.setExtraItems`. They render on
every page's radial, so tutorial videos show dev options.

Goal: a SEPARATE dev radial on **Ctrl+Tab** holding those dev actions; the main
**Tab** radial shows operations only. Whole thing gated behind
`APP_CONFIG.dev_mode` (no-op in production). Selection routing already exists —
`apps:open` / `restart-engine` fire through the same select→action path today,
so moving them to a `dev` context keeps their handlers working unchanged.

Design (reuse existing machinery — no second radial instance):
- `dev` becomes a normal `CONTEXTS['dev']`, populated only in dev mode.
- Ctrl+Tab hold swaps `_context` to `dev` for the duration of the hold, then
  restores the page context on release (mirroring the Tab hold/release +
  select-on-release semantics). No new selection lifecycle.

Conventions: `Hotkeys.bind/unbind` with a `hotkeyRegistry.js` id (never raw
keydown), `js/utils/dom.js` `on()` for the keyup, `js/utils/icons.js` for item
icons, no bare `console.log`. Ctrl+Tab is an OS tab-switch combo — must
`preventDefault` in the handler (Electron desktop owns it, fine).

Depends on MPI-337's `MpiRadialMenu` disabled-item work only loosely — this card
touches the hold/context wiring, not item availability; sequence after 337 to
avoid editing the same primitive twice, or rebase cleanly if done first.

## Implementation

- [ ] **Add a dev context on Ctrl+Tab; strip dev items from the main radial.**
  (a) `hotkeyRegistry.js` — register `radialMenu.devToggle` = Ctrl+Tab. (b)
  `MpiRadialMenu.js` — bind `radialMenu.devToggle`: on down, `preventDefault`,
  set `_context = 'dev'` and `_show()`; on the matching keyup, run the existing
  select-if-outside-centre logic, then restore the previous page context. Reuse
  `_onTabUp`'s selection path rather than duplicating it. Only act when a `dev`
  context has items (empty/absent → no-op). (c) `navigation.js` — when
  `APP_CONFIG.dev_mode`, push the two dev actions via
  `setContextItems('dev', [...])` and REMOVE the `setExtraItems(extraItems)`
  dev wiring (and the `extraItems` build) so page radials render operations
  only. Non-dev builds get no `dev` context, so Ctrl+Tab shows nothing. Keep
  the `apps:open` / `restart-engine` action handlers as-is.
  **Verify:** see `## Verification`.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Implement the single change set above end to end.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Auto (agent): `node --check` on edited files; grep that no consumer still relies
on the dev `setExtraItems` path; confirm the `dev` context is populated only
under `APP_CONFIG.dev_mode`.

User-UX (running Electron app, `npm start`, dev build):
1. Hold **Tab** in Gallery and History → radial shows operations ONLY, no
   "Apps" / "Restart Engine".
2. Hold **Ctrl+Tab** → dev radial shows "Apps" + "Restart Engine"; release
   outside centre selects (Apps opens the App Library; Restart Engine restarts
   ComfyUI). Release inside centre = cancel.
3. Flip `APP_CONFIG.dev_mode` off (or a production build) → Ctrl+Tab does
   nothing; Tab radial unchanged. Tutorial capture on Tab shows no dev options.

## Preservation Notes

- New hotkey + radial context wiring = component-events change; CLAUDE.md rule 5
  requires asking before updating `.claude/rules/` (candidates:
  `.claude/rules/component-events.md`, `docs/shell.md` if it documents the
  radial/Hotkeys).
- Coordinate with MPI-337 on `MpiRadialMenu` edits (both touch the primitive).
