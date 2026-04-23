# Plan: Extend HotkeyManager + Migrate Raw Key Listeners

<!-- trackers
to-do-1: NIM-23
to-do-2: NIM-24
to-do-3: NIM-25
to-do-4: NIM-26
-->

**Goal:** Extend `hotkeyManager.js` to support `keyup` events and bare modifier tracking, then migrate `InputController.js` and `MpiMemoryMonitor.js` off raw `window.addEventListener` calls to use the Hotkeys manager. Archive stale tracker NIM-21.

**Branch:** `feature/hotkeys-extension` (or current working branch)

---

## Investigation Summary

- `HotkeyManager` only handles `keydown`. No `keyup`. Bare modifier keys (`Control`, `Shift`, `Alt`) stripped from key string → produce empty string → cannot be registered.
- `InputController` uses `keydown` for Space (with `offsetParent` + `isInput` guards + `preventDefault`) and `b`/`e` brush keys (masking mode only). Uses `keyup` for Space release. All handlers stored in `_boundHandlers`, cleaned up in `destroy()`.
- `MpiMemoryMonitor` tracks `Control` held/released via `keydown`/`keyup` to toggle CSS class. Cleanup via `MutationObserver` fallback (no formal destroy hook).
- `Events.emit('hotkey:keydown', e)` / `Events.emit('hotkey:keyup', e)` bridge already emits for keydown. Adding keyup emission + bare modifier support unblocks both migrations.

---

## To-Dos

- [x] **1. Extend HotkeyManager: add keyup support + bare modifier key emission**

  Modify `js/managers/hotkeyManager.js`:
  - Add separate `_keyupHandlers` Map alongside `_handlers` (keydown).
  - Add `window.addEventListener('keyup', ...)` in `_init()` that calls a new `_handleKeyUp(e)` method.
  - In `_handleKeyUp`: normalize key string same as `_handleKeyDown`, emit `Events.emit('hotkey:keyup', e)` always, fire registered handler if present.
  - Fix `_getEventKeyString`: when key IS a bare modifier (`'control'`, `'shift'`, `'alt'`, `'meta'`), include it in parts (remove the exclusion filter for the modifier that was pressed). This allows `Hotkeys.register('control', cb)` to work.
  - Add `registerKeyup(keyString, callback)` / `unregisterKeyup(keyString, callback)` public methods mirroring `register`/`unregister`.
  - Export remains `Hotkeys` singleton — no breaking changes to existing callers.

  **Verify:** Open browser console. Press `F11` — fullscreen toggles (existing keydown still works). Press and release `Control` — check `Events` bus emits `hotkey:keydown` and `hotkey:keyup` by temporarily adding `Events.on('hotkey:keyup', e => console.log('keyup', e.key))` in console.

---

- [x] **2. Migrate MpiMemoryMonitor to Hotkeys (keydown + keyup)**

  Modify `js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js`:
  - Add import: `import { Hotkeys } from '/js/managers/hotkeyManager.js';`
  - Replace `window.addEventListener('keydown', _onKeydown)` with `const _unsubKeydown = Hotkeys.register('control', _onKeydown)`.
  - Replace `window.addEventListener('keyup', _onKeyup)` with `const _unsubKeyup = Hotkeys.registerKeyup('control', _onKeyup)`.
  - In the `MutationObserver` cleanup block, replace `window.removeEventListener('keydown', _onKeydown)` + `window.removeEventListener('keyup', _onKeyup)` with `_unsubKeydown()` + `_unsubKeyup()`.
  - Keep `_onKeydown` / `_onKeyup` handler logic identical — only the registration mechanism changes.

  **Verify:** Load app. Open memory monitor. Hold `Ctrl` — button should show `mpi-mem-monitor__btn--ctrl` CSS class (visual highlight). Release `Ctrl` — class removed. No console errors.

---

- [x] **3. Migrate InputController to Hotkeys (keydown + keyup)**

  Modify `js/components/Primitives/MpiCanvas/managers/InputController.js`:
  - Add import: `import { Hotkeys } from '/js/managers/hotkeyManager.js';`
  - Replace `window.addEventListener('keydown', this._boundHandlers.keydown)` with:
    ```js
    this._boundHandlers.keydownUnsub = Hotkeys.register('space', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        if (this.container.offsetParent === null || isInput) return;
        if (this.isSpacePressed) return;
        this.isSpacePressed = true;
        this.updateCursor();
        this.options.onDraw();
    });
    this._boundHandlers.brushKeyUnsub = Hotkeys.register('b', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        if (!this.managers.mask.isMaskingMode || isInput) return;
        this.managers.mask.brushType = 'brush';
        if (this.options.onBrushTypeChange) this.options.onBrushTypeChange('brush');
        this.options.onDraw();
    });
    this._boundHandlers.eraserKeyUnsub = Hotkeys.register('e', (e) => {
        const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
        if (!this.managers.mask.isMaskingMode || isInput) return;
        this.managers.mask.brushType = 'eraser';
        if (this.options.onBrushTypeChange) this.options.onBrushTypeChange('eraser');
        this.options.onDraw();
    });
    ```
  - Note: `HotkeyManager._handleKeyDown` calls `e.preventDefault()` for registered keys. Space suppression on buttons is already handled (line 92–96 in manager). Verify this doesn't break canvas Space pan.
  - Replace `window.addEventListener('keyup', this._boundHandlers.keyup)` with:
    ```js
    this._boundHandlers.keyupUnsub = Hotkeys.registerKeyup('space', (e) => {
        this.isSpacePressed = false;
        this.updateCursor();
        this.options.onDraw();
    });
    ```
  - In `destroy()`, replace `window.removeEventListener('keydown', ...)` + `window.removeEventListener('keyup', ...)` with calls to the stored unsub functions:
    ```js
    this._boundHandlers.keydownUnsub?.();
    this._boundHandlers.brushKeyUnsub?.();
    this._boundHandlers.eraserKeyUnsub?.();
    this._boundHandlers.keyupUnsub?.();
    ```

  **Verify:** Open canvas. Press Space — pan cursor appears, canvas pans. Release Space — cursor resets. Enter mask mode, press `b` — brush tool active. Press `e` — eraser active. Press `b`/`e` in a text input — no brush change. No console errors on canvas destroy.

---

- [x] **4. Archive NIM-21 + run ESLint audit**

  - Archive tracker item `NIM-21` (superseded by this plan).
  - Run ESLint: `npx eslint js/components/ --rule mpi/no-window-hotkey` — confirm 0 violations in `InputController.js` and `MpiMemoryMonitor.js`.
  - If ESLint rule doesn't exist yet, manually grep: `grep -n "window.addEventListener" js/components/Primitives/MpiCanvas/managers/InputController.js js/components/Compounds/MpiMemoryMonitor/MpiMemoryMonitor.js` — expect 0 `keydown`/`keyup` matches.

  **Verify:** Grep returns no `keydown`/`keyup` raw listeners in those two files. NIM-21 archived in tracker.
