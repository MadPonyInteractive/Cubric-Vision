# MPI-132 Validation — Play audio on hover

Verify mode: **user-ux** (UI behavior the user must judge in the running app).

**RESULT: PASSED — user-verified in app 2026-06-25. Card accepted → done.**

## Acceptance criteria

Setting ON (default):
- [ ] Hover a video card → its audio plays (was muted before). Leave → audio stops, video resets.
- [ ] Hover an audio card → it plays + shows stop icon. Leave → stops + resets to 0.
- [ ] Click a playing audio card → stops (existing click play/stop still works).
- [ ] Only ONE card plays at a time across the whole gallery (hover a second card → first stops). Covers video↔audio cross-stop.

Setting OFF:
- [ ] Hover a video card → silent (no audio).
- [ ] Hover an audio card → nothing plays on hover. Click still plays/stops (button behavior unchanged).

Settings page:
- [ ] New "Play audio on hover" checkbox, checked by default on a fresh profile.
- [ ] Toggling persists across app restart (localStorage).

Bug fix:
- [ ] Scroll the gallery up/down with the scroll wheel while cards are visible → NO card is left playing audio/video when the cursor is not over it.

## Implementation status (2026-06-25)

CODE COMPLETE — awaiting user-ux verification in the running app.

Files changed (commit by explicit pathspec):
- `js/core/storageKeys.js` — `PLAY_AUDIO_ON_HOVER` key.
- `js/core/storage.js` — `get/setPlayAudioOnHover` (default `true`).
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` — "Play audio on hover" checkbox (App Behavior section, after auto-start).
- `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`:
  - module helper `_stopOtherGalleryMedia(except)` — stops all other `<audio data-src>` + hover `<video>`, re-mutes videos.
  - `_onCardEnter`/`_onCardLeave` — unmute+play on hover when setting on, re-mute on leave, stop-others first.
  - audio card — new `mouseenter`→play (gated) + `mouseleave`→stop; click→stop preserved; click stop-others now uses the shared helper.
  - scroll bug fix — `on(grid,'scroll')` stops any playing media whose card is no longer `:hover` (mouseleave doesn't fire when the element moves under a still cursor).

Verified so far: `node --check` all 4 + `npx eslint` 0 errors; stop-helper pause/mute/reset logic unit-checked (scratchpad). NOT yet run in-app (server was down).

## Notes
- No regression to MPI-127 audio-card click play/stop or MPI-130 card rename (click handler untouched except shared stop helper; rename slot/handlers untouched).
- `npm run lint` clean.
- ponytail: kept raw `addEventListener` for the pre-existing video hover bindings (cardEl is discarded on re-render, so the node's lifetime IS the listener's — `on()` would add a leak-or-teardown cost for no real cleanup gain).
