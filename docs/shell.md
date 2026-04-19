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
- Listens to `comfy:starting`, `comfy:ready`, `comfy:error`, `tool:running`, `tool:loading-model`, `tool:sampling-start`, `tool:cancelled`, `tool:idle`.
- On `tool:running`: starts progress bar with "Generating..." label (blue variant)
- On `tool:loading-model`: updates label to "Loading model..." (model VRAM load phase)
- On `tool:sampling-start`: updates label back to "Generating..." (KSampler steps begin)
- On `tool:cancelled`: cancels progress bar instantly
- On `tool:idle`: flashes bar, fires success toast
- `progress.update(value)`: driven by KSampler step progress (called directly from blocks, not via events)

## promptBoxService.js (`js/shell/promptBoxService.js`)

Shell-level singleton manager for the PromptBox (mounted in `#prompt-box-mount` in `#app-shell`, outside the workspace container).

**Key pattern:** The service owns the PromptBox component and all state-driven updates to it. When blocks switch, they call `PromptBoxService.mount(props)` to configure the prompt box for that workspace.

**Auto-refresh on model install:** When a new model is installed, the service automatically refreshes the PromptBox's model list without requiring blocks to manually wire that update. The service tracks the model type and subscribes to `state:changed` for `s_installedModelIds` internally.

**API:**
- `init(mountEl)` — Initialize with the DOM element (called once from `shell.js`)
- `mount(props)` — (Re)mount with fresh config. Auto-sets up state subscriptions.
- `show() / hide()` — Toggle visibility (used during selection mode)
- `get component` — Access the mounted component's imperative API (updateContext, setGenerating, setModelList, etc.)

**Architectural principle:** The service owns the component lifecycle, so the service (not individual blocks) handles reactive updates to it. This ensures consistent behavior across all blocks using the prompt box.

## windowControls.js (`js/shell/windowControls.js`)

Electron window controls — minimize, maximize, close. Uses Electron `remote` API.

## projectUI.js (`js/shell/projectUI.js`)

Project-scoped UI elements — project name display, breadcrumb, up-arrow navigation.

## memoryOps.js (`js/shell/memoryOps.js`)

Project export/import (portability).
