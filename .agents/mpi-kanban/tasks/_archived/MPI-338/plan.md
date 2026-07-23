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

- [x] `hotkeyRegistry.js` — `radialMenu.devToggle` = `control+tab` DOWN, gated on
  `APP_CONFIG.dev_mode` + same page/overlay `when` as `radialMenu.toggle`.
- [x] `MpiRadialMenu.js` — `_onDevTabDown` (Ctrl+Tab) swaps `_context` → `'dev'`
  and `_show()`s only when a `dev` context has items; release reuses the shared
  `_onTabUp`; `_hide()` restores the page context on ALL close paths (select,
  cancel, lost pointer lock) via `_prevContext`.
- [x] `navigation.js` — dev actions (Components/Apps/Restart Engine) pushed via
  `setContextItems('dev', …)` in dev mode; removed the `extraItems` mount prop +
  `setExtraItems()` dev wiring so the page radial renders operations only.
- [x] Removed the now-orphaned `extraItems`/`setExtraItems` API from the primitive
  (`MpiRadialMenu.js` + `types.js`) — navigation was its only consumer.

## Remaining Work

- User-UX live test (Electron `npm start`, dev build) — see `## Verification`.

## Plan Drift

- Design deviation from the plan sketch: context restore lives in `_hide()`
  (not the tail of `_onTabUp`) so pointer-lock-loss also restores. Cleaner, one
  restore site for every close path.
- Also removed the dead `extraItems` mechanism (plan only said to stop CALLING
  it) — navigation was its sole consumer, so it was a true orphan after the move.

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
