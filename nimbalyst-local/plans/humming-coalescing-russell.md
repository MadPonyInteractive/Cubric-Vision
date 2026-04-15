# Plan: Enter Key to Confirm — MpiOkCancel

## Context

Pressing Enter in an `MpiOkCancel` dialog should trigger the OK action (confirm), consistent with standard dialog UX. The component currently handles Escape (via `OverlayManager`'s global `Hotkeys.register('escape', ...)`) but has no Enter handling.

## Design

- Register `Hotkeys.register('enter', handler)` when `el.show()` is called
- Unregister via the returned unsubscribe function when `el.hide()` is called
- No stash pattern conflict — `MpiModal` (used internally) does not use the Stash Pattern; it just appends backdrop/wrapper to `document.body`

## Changes

### `js/components/Compounds/MpiOkCancel/MpiOkCancel.js`

In `setup()`, replace the `el.show` / `el.hide` assignments to wrap `MpiModal`'s methods and add Enter key registration:

```js
// After the okBtn click handler, before actionsSlot.appendChild(okBtn.el):

let unregisterEnter = null;

const handleEnter = () => {
    const inputValue = inputComponent
        ? inputComponent.el.querySelector('input')?.value
        : undefined;
    emit('ok', { inputValue });
    el.hide();
};

const _origShow = el.show;
el.show = () => {
    _origShow();
    unregisterEnter = Hotkeys.register('enter', handleEnter);
};

const _origHide = el.hide;
el.hide = () => {
    if (unregisterEnter) { unregisterEnter(); unregisterEnter = null; }
    _origHide();
};
```

Also ensure cleanup if `destroy` is called while visible — add to `el.destroy` if present, or add it:

```js
el.destroy = () => {
    if (unregisterEnter) { unregisterEnter(); unregisterEnter = null; }
};
```

## Verification

1. Open any dialog that uses `MpiOkCancel` (e.g., confirm delete, rename)
2. Press Enter — dialog should confirm (emit `ok`)
3. Press Escape — dialog should cancel (already works)
4. If dialog has input field, type text then press Enter — should confirm with input value
5. After hide(), pressing Enter should not trigger anything
