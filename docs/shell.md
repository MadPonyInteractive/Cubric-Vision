# Shell

The shell wires the application together — global dialogs, window controls, project UI, memory ops, StatusBar, and navigation.

## shell.js (`js/shell.js`)

Entry point that runs after the HTML shell loads. Calls `initShell()` which:
- Wires global error dialog (`ui:error` → show error dialog)
- Binds window controls (minimize, maximize, close)
- Sets up project UI (model badge, gallery title)
- Initializes memory ops
- Wires StatusBar
- Calls `initNavigation()`

## navigation.js (`js/shell/navigation.js`)

History-stack router. Key functions:
- `handleNavigation()`: Dispatches to `_showLanding` or `_loadView` (lazy-imports workspace).
- `navigate(route, params?)`: Pushes to history stack.
- `back()`: Pops history.
- `refreshRadial()`: Rebuilds gallery radial items when data changes.
- `MpiRadialMenu` context switching via `OP_ICONS` map.

## overlayManager.js (`js/managers/overlayManager.js`)

Queue-based blocking overlay controller.
- `Overlays.request({ show, hide, id })`: Pushes overlay onto queue, shows it, blocks input.
- `Overlays.release(el)`: Pops from queue, shows previous or resumes.
- `Overlays.reset()`: Clears all overlays (used after navigation to fix stale state).

## hotkeyManager.js (`js/managers/hotkeyManager.js`)

- `Hotkeys.register(key, fn)`: Registers a hotkey. Modifier keys: `control+shift+i`, etc.
- `Hotkeys.unregister(key, fn)`: Removes a registration.
- F11 toggles fullscreen. Ctrl+Shift+I opens devtools (dev mode only).

## statusBar.js (`js/shell/statusBar.js`)

Bottom status bar. Shows ComfyUI engine status, active model, generation progress.
- Listens to `comfy:starting`, `comfy:ready`, `comfy:error`, `tool:running`, `tool:idle`.

## windowControls.js (`js/shell/windowControls.js`)

Electron window controls — minimize, maximize, close. Uses Electron `remote` API.

## projectUI.js (`js/shell/projectUI.js`)

Project-scoped UI elements — project name display, breadcrumb, up-arrow navigation.

## memoryOps.js (`js/shell/memoryOps.js`)

Project export/import (portability).
