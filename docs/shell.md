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
- On `tool:idle`: completes progress bar, fires success toast with "Generation finished"
- `progress.update(value)`: driven by KSampler step progress (called directly from blocks, not via events)

## windowControls.js (`js/shell/windowControls.js`)

Electron window controls — minimize, maximize, close. Uses Electron `remote` API.

## projectUI.js (`js/shell/projectUI.js`)

Project-scoped UI elements — project name display, breadcrumb, up-arrow navigation.

## memoryOps.js (`js/shell/memoryOps.js`)

Project export/import (portability).

## projectService.js (`js/services/projectService.js`)

Centralized persistence layer for project mutations. Replaces the old `projectManager.js` pattern where blocks directly mutated `state.currentProject` and called ad-hoc save functions.

**Key pattern:** All group mutations (add, update, remove) go through ProjectService. The service handles in-memory state update, disk persistence (via `/update-project`), and event emission in a single atomic operation.

**API:**
- `addGroup(group)` — Add group, persist, emit `project:group-added`
- `updateGroup(group)` — Update group, persist, emit `project:group-updated`
- `removeGroup(groupId)` — Remove group, persist, emit `project:group-removed`
- `persistGroups()` — Low-level: serialize and write all groups to disk
- `saveGeneration(opts)` — Save a generated media file to the project folder with sidecar metadata

**Architectural principle:** Blocks never write `state.currentProject.itemGroups` directly. They call ProjectService methods which handle the full mutation → persist → emit cycle.

**Settings pipeline:** `projectService` subscribes to `settings:model:*` and `settings:tool:*` events and processes them through per-model/per-tool debounced queues (300ms). All writes to `modelSettings` and `toolSettings` in `project.json` are centralized here.

**Queue behavior:** Each `modelId` (and `toolKey`) has its own queue. Multiple models write in parallel. `ratioSelector` sub-keys are deep-merged so rapid partial updates (`orientation`, `qualityTier`, `selectedRatio`) don't drop each other. `loras` and `upscaleModel` are full replacements.

**Key creation:** Keys are created on first `select` event using defaults from `getModelSettings` / `getToolSettings`. Components never need to check key existence.

**Events consumed:**
- `settings:model:select` — create `modelSettings[modelId]` key with defaults if missing
- `settings:tool:select` — create `toolSettings[toolKey]` key with defaults if missing
- `settings:model:update` — queue partial update, debounced write
- `settings:tool:update` — queue partial update, debounced write

## generationService.js (`js/services/generationService.js`)

Centralized generation lifecycle manager. Wraps `runCommand()` with project persistence, StatusBar progress, and callback-based state management.

**API:**
- `startGeneration(config, callbacks, opts)` — Run a generation with automatic save, group creation/update, and progress tracking. Returns `{ cancel }`.

**Callbacks:** `onPreview`, `onComplete`, `onCancel`, `onError`

**Key pattern:** Blocks call `startGeneration()` and handle their own UI lifecycle (placeholders, spinner) via callbacks. The service handles the backend lifecycle (command execution, file save, project mutation).
