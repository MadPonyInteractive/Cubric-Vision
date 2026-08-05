# MPI-374 Validation — UI size survives a restart

Built under **MPI-450 Gate A**. Code is done and unit-proven; the one open item is
the user's own restart in the desktop app.

## What changed

| File | Change |
|---|---|
| `js/core/storageKeys.js` | `UI_ZOOM_FACTOR: 'mpi_ui_zoom_factor'` — declared in the mandated single home, not inlined |
| `js/core/storage.js` | `getUiZoomFactor` / `setUiZoomFactor` typed accessors alongside the rest |
| `js/utils/uiZoom.js` | `applyUiZoom()` persists the factor it applied; new `restoreUiZoom()` and `normalizeZoomFactor()` |
| `js/init.js` | `restoreUiZoom()` at **module top level**, before `init()` awaits anything |

`normalizeZoomFactor` is the guard: anything outside `[ZOOM_MIN, ZOOM_MAX]`, or
non-finite, or non-numeric, heals to `1.0`. A stored `12` would otherwise wedge the
interface at a size whose own controls cannot be read to fix it.

The restore call sits at module top level on purpose. Inside `init()` it would run
after `await initPaths()`, which is enough for the page to paint at 1.0 and then
resize under the user — the flash the card's acceptance rules out.

## Evidence

`tests/ui-zoom-persist.test.cjs` — 3 tests, all green:

1. **step → persist → restart → re-apply.** `uiZoom.js` captures `webFrame` from
   `window.require` at *module load*, so the stand-ins are installed before the first
   import and the "restart" is a second module instance reached with a cache-busting
   query. This is the whole feature, end to end, in node.
2. **corrupt / out-of-range → 1.0** — 11 cases including `NaN`, `Infinity`, `{}`,
   `'huge'`, `null`, and both bounds ±.
3. **Browser Mode** (`window` with no `require`) — neither `restoreUiZoom()` nor
   `applyUiZoom()` throws, and nothing is persisted.

**The test bites** (negative control, run 2026-08-05): with the single
`Storage.setUiZoomFactor(factor)` line removed, test 1 fails on
*"the applied factor is written to storage, under the declared key"* — 2 pass, 1 fail.
Restored → 3 pass.

Full suite after the change: **441 passed, 0 failed**. `eslint` clean on all four
touched files.

## Open — needs the user, in the desktop app

- [ ] Change the UI size with Ctrl+plus / Ctrl+minus, fully close the app, reopen:
      size is exactly as left, with no visible resize after the window appears.

Nothing else on this card needs a human; if that check passes it moves to `done`.
