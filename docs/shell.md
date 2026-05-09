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

Stack-based overlay controller. Multiple overlays can be visible simultaneously, each at its own z-index.
- `Overlays.request({ show, hide, id })`: Pushes onto stack, calls `show()` immediately, returns `{ depth, zIndex }` — caller applies z-index to DOM nodes.
- `Overlays.release(instance)`: Splices instance out of stack (any position).
- `Overlays.closeTopOverlay()`: Calls `hide()` on top of stack only (Escape key).
- `Overlays.isTop(instance)`: Returns true if instance is current top — use to gate Enter hotkeys.
- `Overlays.onDepthChange(cb)`: Subscribe to stack depth changes; returns unsubscribe fn.
- `Overlays.reset()`: Clears all overlays (used after navigation to fix stale state).

## hotkeyManager.js (`js/managers/hotkeyManager.js`)

- `Hotkeys.init()`: Call once at shell startup — attaches window listeners and registers builtins.
- `Hotkeys.bind(id, fn) → unbindFn`: Bind a handler to a registry entry by stable id (e.g. `'mask.brush.toolbar'`). Returns an unbind function — store and call in `destroy()`.
- `Hotkeys.unbind(id, fn)`: Remove a specific handler.
- `Hotkeys.getRegistry()`: Returns the full `HOTKEY_REGISTRY` array (used by MpiHelp).
- F11 toggles fullscreen. Ctrl+Shift+I opens devtools (dev mode only, gated by `APP_CONFIG.dev_mode`).
- Focus gating treats only text-entry controls as typing (`TEXTAREA`, contenteditable, and text-like `INPUT` types such as `text`, `number`, `search`, `email`, `password`, date/time types). Non-text controls such as `input[type="range"]`, checkboxes, radios, and buttons may keep focus without blocking global hotkeys.

### Adding a hotkey

1. Declare an entry in `js/managers/hotkeyRegistry.js` — set `id`, `key`, `type`, `category`, `scopeLabel`, `description`, `allowWhileTyping`, and optionally `when(ctx)`.
2. In the component `setup()`, call `Hotkeys.bind(id, fn)` and push the returned unbind fn into `_unsubs`.
3. `_unsubs` is called in `el.destroy()` — no manual `unbind` needed.

### Help page — hand-authored HTML

The Help overlay (`MpiHelp`) is **not** generated from `hotkeyRegistry.js`. Its layout is hand-authored static HTML inside `js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js` (the component's `template`). This is intentional: the user curates wording, grouping, ordering, and which entries appear, without writing custom display fields on every registry entry.

**Authoring rule (mandatory):** Whenever you add, rename, or remove a hotkey in `hotkeyRegistry.js`, you MUST also add/rename/remove the matching `<li><span>KEY</span><span>Description</span></li>` row in `MpiHelp.js`. Treat the two files as paired: a registry change without a help-page change is incomplete work.

**Row format:**
```html
<li><span>KEY</span><span>Verb-first description</span></li>
```
- Key text uppercase (`F5`, `CTRL+F5`, `SHIFT`, `ESCAPE`).
- Description in concise imperative phrasing ("Release Memory", "Pan canvas (hold)").
- Group rows under an existing `<div class="mpi-help__shortcut-group"><h4>Group Name</h4><ul>…</ul></div>`, or add a new group following the same pattern.
- Modifier variants of one concept become sibling rows (e.g. `F5` "Release Memory" + `CTRL+F5` "Release Memory + Cache").
- Hold/release pairs collapse into a single "(hold)" row — do not list keyup mirrors separately.

### Gating model

`isTyping` means a real text-entry context: `TEXTAREA`, `[contenteditable]`, or text-like `INPUT` types. Non-text controls such as `input[type="range"]`, checkboxes, radios, and buttons are not typing contexts, so global hotkeys continue to work after those controls receive focus.

Keydown fires handlers only if all guards pass (in order):
1. Entry found in registry for normalized key + type.
2. `isTyping` check — single-letter and bare-modifier keys blocked while a text-entry control is focused, unless `allowWhileTyping: true`. F-keys and `Ctrl+`-chords always pass.
3. `when(ctx)` optional gate — receives `{ state, event, activeElement, isTyping }`.
4. `preventDefault`/`stopPropagation` called only after all guards pass.

## statusBar.js (`js/shell/statusBar.js`)

Bottom status bar. Shows ComfyUI engine status, active model, generation progress.
- Listens to `comfy:starting`, `comfy:ready`, `comfy:error`, `tool:running`, `tool:loading-model`, `tool:sampling-start`, `tool:cancelled`, `tool:idle`.
- On `tool:running`: starts progress bar with "Generating..." label (blue variant)
- On `tool:loading-model`: updates label to "Loading model..." (model VRAM load phase)
- On `tool:sampling-start`: updates label back to "Generating..." (KSampler steps begin)
- On `tool:cancelled`: cancels progress bar instantly
- On `tool:idle`: completes progress bar, fires success toast with "Generation finished"
- On `ui:success` / `ui:warning` / `ui:info`: fires a standalone toast via `StatusBar.notify(message, variant)` — **this is the correct way to show toasts from anywhere in the app**
- `progress.update(value)`: driven by KSampler step progress (called directly from blocks, not via events)

**Showing a toast (non-progress):**
```js
Events.emit('ui:success', { message: 'Model removed.' });
Events.emit('ui:warning', { message: 'Some files were kept.' });
Events.emit('ui:info',    { message: 'No changes made.' });
```
Never call `MpiToast.mount()` directly from components — emit the event instead.

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

**Disk write safety:** Server-side `project.json` writes in `routes/projects.js` go through a per-file queue and atomic temp-file replace. This serializes concurrent writes from `/update-project`, `/update-project-settings`, `/migrate-project`, and project template routes so group persistence and debounced settings saves cannot interleave and corrupt the JSON file.

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
