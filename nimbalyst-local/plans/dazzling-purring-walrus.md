# Plan: Push Enter-to-Confirm to MpiModal

## Context

The Enter-key-to-confirm behavior was lifted into `MpiModal` so any compound using `MpiModal` gets this behavior automatically. `MpiModal` emits a `confirm` event when Enter is pressed; compounds listen and react.

## Bug: Enter fires multiple handlers (project delete while history delete is active)

### Root Cause

`HotkeyManager.register()` stores handlers in a `Map<string, Set<Function>>`. Every call to `register('enter', ...)` **adds** to the Set — it never replaces. When Enter fires, **all** registered handlers execute.

Additionally, `projectUI._showDeleteConfirm` (line 122–131) creates a **fresh** `MpiOkCancel` each time and calls `dialog.el.show()` **directly**, bypassing `Overlays.request()`. This means when the gallery history-card delete dialog is showing (registered through `Overlays.request`), the project delete dialog can also register its own Enter handler (through the direct `el.show()` call). When Enter is pressed, **both** handlers fire — gallery's `ok` deletes the history entry AND project's `ok` attempts to delete the project.

### Fix A: Make `Hotkeys.register` exclusive per key

In `hotkeyManager.js`, change `register` to store one handler per key (replacing the previous). The returned unsubscribe restores the replaced handler.

```js
// Before (Set — multiple handlers per key):
register(keyString, callback) {
    const key = keyString.toLowerCase();
    if (!this._handlers.has(key)) this._handlers.set(key, new Set());
    this._handlers.get(key).add(callback);
}

// After (single handler per key, with restore-on-unregister):
register(keyString, callback) {
    const key = keyString.toLowerCase();
    const prev = this._handlers.get(key) ?? null;
    this._handlers.set(key, callback);
    return () => {
        this._handlers.set(key, prev);
    };
}
```

`unregister` is updated to be consistent (deletes the key if it matches the current handler):

```js
unregister(keyString, callback) {
    const key = keyString.toLowerCase();
    if (this._handlers.get(key) === callback) {
        this._handlers.delete(key);
    }
}
```

`_handleKeyDown` calls the single stored handler directly (was calling `callbacks.forEach`).

### Fix B: Make `projectUI._showDeleteConfirm` use Overlays

The `dialog.el.show()` → `modal.el.show()` path bypasses `Overlays.request()`. Two options:

1. Route through `Overlays.request` (correct architecture, requires `projectUI` to import Overlays)
2. Make `_showDeleteConfirm` reuse a single persistent dialog instance (like `_newProjectDialog` does)

Option 2 is simpler and matches the existing pattern for `_newProjectDialog`.

## Files Modified

- `js/managers/hotkeyManager.js` — `register` replaces per-key (no longer accumulates); `unregister` is consistent; `_handleKeyDown` calls single handler
- `js/shell/projectUI.js` — make `_showDeleteConfirm` reuse a persistent dialog instance instead of creating a new one each time

## Verification

1. Open gallery delete history dialog → press Enter → only history card is deleted (no project delete attempt)
2. Open project delete dialog → press Enter → project is deleted
3. Open gallery delete, close it, then open project delete → each works independently
4. Open gallery delete, then quickly press Enter → only gallery fires
5. Press Escape in any dialog → closes via `OverlayManager` (unchanged)
