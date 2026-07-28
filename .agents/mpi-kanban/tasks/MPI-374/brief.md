# MPI-374 — Persist the UI size

Small card, no design questions. Written down so it is not re-investigated from scratch.

## Where it lives

`js/utils/uiZoom.js` is the single source of truth for the bounds and the step:

```js
export const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0, ZOOM_STEP = 0.1;
export function applyUiZoom(dir) { … webFrame.setZoomFactor(…) }
```

It reads `getZoomFactor()` live from webFrame on every step and writes nothing, so the
value is window-lifetime only. Callers:

- `js/init.js` — the Ctrl+wheel handler
- `js/managers/hotkeyManager.js` ~90 — Ctrl+plus / Ctrl+minus
- `js/managers/hotkeyRegistry.js` ~520 — the registry ids for those two

## Fix

1. Declare a key in `js/core/storageKeys.js` (mandatory home for every storage key).
2. In `applyUiZoom`, after `setZoomFactor`, write the new value via `js/core/storage.js`.
3. Restore on boot — read, clamp to `[ZOOM_MIN, ZOOM_MAX]`, `setZoomFactor`. Put it as
   early as the webFrame handle allows so the window does not visibly resize after
   first paint.
4. Guard the null-webFrame (Browser Mode) path on both write and restore.

Clamp on read, not just on write: a hand-edited or half-written value must not be able
to leave the UI at a size the user cannot read well enough to fix.

## Verify

Change size, restart, size holds. Then set a junk value in storage by hand and confirm
the app comes up at 1.0 rather than something unusable.
