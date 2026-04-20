# Plan: Single App Instance Lock

## Context
Multiple Electron instances can launch simultaneously — each spawning its own Express backend and ComfyUI process. This wastes resources and risks port conflicts. Task tsk_mo4dldqkb270g9 requires enforcing exactly one running instance.

## Approach
Use Electron's `app.requestSingleInstanceLock()` at module top-level. If lock fails, quit immediately. If a second instance tries to launch, focus the existing window.

## Critical File
- `main.js` — sole Electron main process entry (confirmed via `package.json` `"main"` field)

## Implementation

### Insertion point
After line 12 (`let windowState = {};`), before line 14 (`function loadWindowState()`).

### Code to insert
```js
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
```

No other files need changes. The existing `app.on('ready', ...)` at line 212 runs only if `gotTheLock` is true (the `app.quit()` path exits the process before `ready` fires).

## Verification
1. Build/run the app normally — should open as usual.
2. While running, launch a second instance (double-click or `npm start` again).
3. Second instance should immediately exit; the first instance window should focus/restore.
4. Check `logs/app.log` — no duplicate server or ComfyUI startup logs on second launch attempt.
