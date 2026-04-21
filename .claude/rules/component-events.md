## Sub-Agent Briefing
> Use this file when you need to know what events a component emits or listens to.

---

## Primitives

### MpiButton
EMITS:   `toggle` `{ active: boolean }` — only in icon-button toggleable mode
         `click`  `{ originalEvent: Event, active: boolean }`
LISTENS: (none — pure DOM events only)

### MpiCanvas
EMITS:   `modechange` `{ mode: 'none'|'mask'|'crop'|'compare' }`
LISTENS: (none)

### MpiDragList
EMITS:   `reorder` `{ items: any[], indices: number[] }`
LISTENS: (none)

### MpiDropdown
EMITS:   `change` `{ value: string, label: string }`
LISTENS: (none — uses document click + MutationObserver for cleanup)

### MpiInput
EMITS:   `input`  `{ value: string|number, originalEvent: Event }`
         `change` `{ value: string|number, originalEvent: Event }`
LISTENS: (none)

### MpiMediaDropzone
EMITS:   `click`  `{ title: string }`
         `remove` `{ title: string }`
         `drop`   `{ url: string, file: File, title: string, mediaType: string }`
LISTENS: (none)

### MpiModal
EMITS:   (none)
LISTENS: `ui:close-all-popups` — calls `el.hide()` if backdrop is active

### MpiOverlay
EMITS:   `close` `{}`
LISTENS: `ui:close-all-popups` — calls `el.hide()` if currently shown
         (MutationObserver for safety release only)

### MpiPopup
EMITS:   `close`      `{}`
         `mouseenter` `MouseEvent`
         `mouseleave` `MouseEvent`
         `select`     `{ id: string, el: HTMLElement }` — item clicked (when items prop used)
         `click`      `MouseEvent`
LISTENS: `ui:close-all-popups` — removes `is-active`, emits `close`

### MpiMediaDropOverlay
EMITS:   (none — dumb primitive; calls `props.onDrop({ file, mediaType })` on valid drop; all side effects in caller)
LISTENS: `ui:close-all-popups` — hides overlay (Escape during drag)
NOTE:    Accepts any image/video OS file drag. Ignores internal `application/mpi-media` drags. Replaced `MpiGalleryDropOverlay`.

### MpiProjectDropOverlay
EMITS:   (none — dumb primitive; calls `props.onDrop({ folderPath, source })` on valid drop; all side effects in caller)
LISTENS: `ui:close-all-popups` — hides overlay
NOTE:    Accepts a project folder OR a project.json file. Resolves absolute path via Electron `webUtils.getPathForFile`; no-op when `window.require` is absent (browser dev mode). Used by landing page (projectUI.js) — `onDrop` calls `addProjectByFolder()` then reloads the grid.

### MpiProgressBar
EMITS:   `input`  `{ value: number }`
         `change` `{ value: number }`
LISTENS: (none)

### MpiRadialMenu
EMITS:   `select` `{ action: string }`
         `open`   `{}`
         `close`  `{}`
LISTENS: Hotkeys 'tab' (open/close toggle), window keyup/mousemove (close on release — intentional exception for radial menu gesture)
NOTE:    Reads `state.currentProject?.tutorialSeen` and calls `updateProject()` to mark tutorial seen.

### MpiRadioGroup
EMITS:   `select` `{ value: string }`
LISTENS: (none)

### MpiScrollableBox
EMITS:   `select` `{ value: string, selection: string[] }`
LISTENS: (none)

### MpiToast
EMITS:   `close` `{}`
LISTENS: (none)

---

## Compounds

### MpiAutoMaskThumbs
EMITS:   `change` `{ picks: Set<number> }`
LISTENS: (none)

### MpiCameraConfig
EMITS:   `change` `{ values: Object }` — keys: cam_type, cam_lens, cam_focal, cam_aperture, cam_shutter, cam_iso, shot_angle, shot_size, shot_dof, shot_comp
LISTENS: (none — internal MpiDropdown instances handle their own events)

### MpiCompareOverlay
EMITS:   `close` `{}`
LISTENS: (forwarded from internal MpiOverlay 'close')

### MpiEngineInstall
EMITS:   (none — emits to Events bus, not component events)
LISTENS: `engine:downloading` — displays download progress
         `engine:extracting` — displays extraction status
         `engine:patching` — displays patching status
         `engine:upgrade-status` — displays upgrade progress
         `engine:uw-installing` — displays universal workflow deps install
         `download:progress` — filters for modelId='__universal_workflow__', aggregates with engine progress
         `engine:complete` — hides modal, emits `engine:ready` to Events bus
         `engine:error` — displays error message with retry button
PATTERN: Single SSE connection bridge — all events come from `downloadService` (no own EventSource)

### MpiErrorDialog
EMITS:   `dismiss`     `{}`
         `downloadLog` `{}`
LISTENS: (none — internal MpiModal handles `ui:close-all-popups`)

### MpiGroupCard
EMITS:   `open`          `{ group: ItemGroup }`
         `select`        `{ group: ItemGroup, selected: boolean }`
         `media-missing` `{ group: ItemGroup, itemId: string }`
LISTENS: (none)

### MpiHistoryTools
EMITS:   `activate`   `{ mode: string }`
         `deactivate` `{ mode: string }`
LISTENS: (none — callers call `el.syncMode(mode)` imperatively)

### MpiInstalledDisplay
EMITS:   `delete`      `{}`     — Action button clicked (Install when idle)
         `pause`       `{}`     — Pause button clicked (during download)
         `resume`      `{}`     — Resume button clicked (when paused/partial)
         `cancel`      `{}`     — Cancel button clicked
         `uninstall`   `{}`     — Uninstall button clicked (when installed)
LISTENS: (none)

### MpiLightingConfig
EMITS:   `change` `{ values: Object }` — keys: light_type, light_color, light_intensity, light_dir
LISTENS: (none)

### MpiMemoryMonitor
EMITS:   `release` `{ deep: boolean }`
LISTENS: (none — uses raw `window.addEventListener('keydown/keyup')` for Ctrl detection)
FLAG:    Uses raw `window.addEventListener` for Ctrl key — not using Hotkeys.register. Acceptable for modifier-key visual feedback only (not a registered hotkey action).

### MpiModelSettings
EMITS:   `saved` `{}`
         `close` `{}`
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:model:select` `{ modelId }` — emitted in `el.open()` when opened for a model
         `settings:tool:select`  `{ toolKey }`  — emitted in `el.open()` when opened for a tool
         `settings:model:update` `{ modelId, key, value }` — loras + upscaleModel on _autoSave
         `settings:tool:update`  `{ toolKey, key, value }` — upscaleModel on _autoSave
LISTENS: (none — reads `state.currentProject`, `state.upscaleModels`, `state.availableLoras`)
         `ui:error` emitted on save failure via `Events.emit`

### MpiModelsModal
EMITS:   `close` `{}`
LISTENS: `state:changed` `{ key: 's_installedModelIds' }` — re-renders card list when install state changes
         `download:progress` `{ modelId, progress, speed, downloadedBytes, totalBytes }` — patches single card in place
         `download:started` `{ modelId }` — sets card to 'downloading' state
         `download:paused` `{ modelId }` — sets card to 'paused' state
         `download:resumed` `{ modelId }` — sets card to 'downloading' state
         `download:installing` `{ modelId }` — sets card to 'installing' state
         `download:cancelled` `{ modelId }` — sets card to 'cancelled' state
         `download:complete` `{ modelId }` — calls awaitReSync() to fetch new install state
         `download:failed` `{ modelId }` — calls `awaitReSync()` to re-render list (no `ui:error` emitted)
PATTERN: Cards stored in Map by modelId for in-place updates; state polling replaced with event-driven updates

### MpiNewProject
EMITS:   `create` `{ name: string, location: string|null }`
         `cancel` `{}`
LISTENS: (none — internal MpiModal handles `ui:close-all-popups`)

### MpiOkCancel
EMITS:   `ok`     `{ inputValue?: string }`
         `cancel` `{}`
         `input`  `{ value: string }`
LISTENS: (none — internal MpiModal handles `ui:close-all-popups`)

### MpiProjectCard
EMITS:   `click`  `{}`
         `delete` `{}`
LISTENS: (none)

### MpiProjectName
EMITS:   `up`      `{}`
         `gallery` `{}`
LISTENS: (none)

### MpiRatioSelector
EMITS:   `change`             `{ value: string, ratio: number|null, w: number|null, h: number|null, orientation: string|null }`
         `orientation_change` `{ orientation: 'portrait'|'landscape' }`
         `quality_change`     `{ qualityTier: string }`
         `popup_toggle`       `{ active: boolean }`
LISTENS: `ui:close-all-popups` — closes popup if open
API:     `instance.el.getValue()` → `{ value, w, h, orientation, qualityTier }` — reads live props; use for injection instead of change-event cache

### MpiSelectionBar
EMITS:   `compare`  `{}`
         `download` `{}`
         `delete`   `{}`
         `cancel`   `{}`
LISTENS: (none)

### MpiStartingComfy
EMITS:   (none)
LISTENS: (none — direct portal, bypasses Overlays queue intentionally)

### MpiStyleConfig
EMITS:   `change` `{ values: Object }` — keys: color_grade, color_contrast, color_sat, color_sharp
LISTENS: (none)

### MpiToolActionBar
EMITS:   `action` `{ key: string, active: boolean }`
LISTENS: (none)

### MpiToolbar
EMITS:   `select`      `{ value: string }`
         `save`        `{}` — only when `props.comps` is falsy
         `delete`      `{}` — only when `props.comps` is falsy
         `modelChange` `{ value: number }`
         `clipChange`  `{ value: number }`
LISTENS: (none)

### MpiVideoScene
EMITS:   `change` `{ scenes: MpiVideoSceneItem[] }`
LISTENS: (none)

### MpiVolumeControl
EMITS:   `change` `{ volume: number, muted: boolean }`
LISTENS: (none)

---

## Blocks

### MpiGalleryGrid
EMITS:   `open-group`      `{ group: ItemGroup }`
         `compare`         `{ groups: [ItemGroup, ItemGroup] }`
         `delete`          `{ groups: ItemGroup[] }`
         `download`        `{ groups: ItemGroup[] }`
         `gc-group`        `{ group: ItemGroup }`
         `gc-remove`       `{ groupId: string }`
         `favourite`       `{ group: ItemGroup, favourite: boolean }`
         `reuse`           `{ positive: string, negative: string }`
         `select`          `{ group: ItemGroup, selected: boolean }`
         `media-missing`   `{ group: ItemGroup, itemId: string }`
         `selection-start` `{}` — selection mode activated (hide PromptBox)
         `selection-end`   `{}` — selection mode exited (show PromptBox)
LISTENS: (none — internal MpiSelectionBar/MpiGroupCard events handled internally)

### MpiPromptBox
EMITS:   `input`            `{ positive: string, negative: string, activeMode: 'positive'|'negative' }`
         `copy`             `{ text: string }`
         `mode-change`      `{ mode: 'positive'|'negative' }`
         `media-change`     `{ imageCount: number, videoCount: number, items: MediaItem[] }`
         `media-imported`   `{ url: string, filename: string, mediaType: string, source: 'file' }` — also emitted on EventBus as `media:imported`
         `run`              `{ operation: string, positive: string, negative: string, mediaItems: MediaItem[], injectionParams: Object }`
         `cancel`           `{}`
         `model-change`     `{ model: ModelDef }`
         `operation-change` `{ operation: string }`
         `settings`         `{ model: ModelDef }`
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:model:select` `{ modelId }` — on model dropdown change (ensures modelSettings key exists)
         `settings:model:update` `{ modelId, key, value }` — from PromptBoxControls ratio/orientation/quality handlers
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs internal active operation; cleanup via `_unsubs` array

### MpiVideoPlayer
EMITS:   `play`       `{ time: number }`
         `pause`      `{ time: number }`
         `ended`      `{ time: number }`
         `timeupdate` `{ time: number, duration: number }`
         `change`     `{ volume: number, muted: boolean }`
LISTENS: (none)

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
Owns the Gallery workspace. Mounts MpiGalleryGrid, MpiMediaDropOverlay, MpiSelectionBar, MpiPromptBox, and handles generation lifecycle.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `models:closed` — remounts PromptBox if needed
         `state:changed` (`s_installedModelIds`) — emits `models:open` if no image models
         `media:imported` `{ url, filename, itemId, mediaType }` — creates ItemGroup from OS-dropped file; registered unconditionally (not gated by PromptBox presence)
         `generation:started` `{ id, scope, tempId, placeholderGroup }` — adds placeholder card; seeds `_myGenIds`
         `generation:preview` `{ id, url }` — calls `grid.el.updatePreview(tempId, url)`
         `generation:complete` `{ id, item, group, tempId }` — removes placeholder, inserts final card
         `generation:error` `{ id, tempId }` — removes placeholder, restores group list
         `generation:cancelled` `{ id, tempId }` — removes placeholder, restores group list
EMITS:   `tool:running`   `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`      `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled` `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
         `models:open` — when zero image models installed
NOTE:    Reads `state.s_selectedModelId`, `state.currentProject`; writes same
         On mount: rehydrates from `activeGenerations.listFor('gallery', null)` — placeholder card shown immediately with cached preview
         Cancel via `pb.on('cancel')` delegates to `activeGenerations.cancel(last.id)` — does NOT call `exec.cancel()` directly
         commandExecutor emits tool:loading-model and tool:sampling-start during generation (see below)
         Window-level drag listeners (`dragenter`/`dragleave`/`dragover`/`drop`) managed here; removed in `destroy()`

---

## Active Generation Registry (`js/services/activeGenerations.js`)

Session-scoped singleton. Survives navigation. Keyed by uuid; multi-entry (batch-ready).

**Purpose:** keeps exec handles, preview blob URLs, and placeholder group descriptors alive across page navigation so blocks can rehydrate on mount.

**Events emitted (via Events bus):**
| Event | Payload | When |
|---|---|---|
| `generation:started` | `{ id, scope, groupId, tempId, placeholderGroup }` | `activeGenerations.start()` called |
| `generation:preview` | `{ id, url }` | `activeGenerations.setPreview()` called — also writes `entry.placeholderGroup.latestPreviewUrl` |
| `generation:complete` | `{ id, item, group, tempId? }` | `generationService` emits after `end()` |
| `generation:error` | `{ id, tempId? }` | `generationService` emits after `end()` |
| `generation:cancelled` | `{ id, tempId? }` | `generationService` or `activeGenerations.cancel()` emits after `end()` |

**API:** `start({ scope, groupId, tempId, operation, modelId, placeholderGroup, exec })` → `{ id }` · `get(id)` · `list()` · `listFor(scope, groupId|null)` · `setPreview(id, url)` · `end(id, { revokePreview })` · `cancel(id)` · `cancelAll()`

**Scope values:** `'gallery'` | `'groupHistory'`

**Rehydration pattern (on block mount):**
1. Call `activeGenerations.listFor(scope, groupId)` filtered by `status === 'running'`
2. Seed local `_myGenIds` Set
3. Apply cached preview via `placeholderGroup.latestPreviewUrl` (already set on placeholder; grid reads it in `setGenerating()`)
4. Subscribe to `generation:*` events filtered by `_myGenIds`; unsubscribe in `destroy()` — **do NOT cancel exec on destroy**

---

## Generation Lifecycle (commandExecutor & StatusBar)

**commandExecutor.js**
- Analyzes workflow JSON to detect loader nodes (CheckpointLoaderSimple, UNETLoader, LoraLoaderModelOnly, etc. by class_type)
- Emits `tool:loading-model` when a loader node starts executing (VRAM load phase)
- Emits `tool:sampling-start` on first KSampler progress callback (sampling phase begins)
- Both events carry `{ tool: 'groupHistory' }` payload

**StatusBar (js/shell/statusBar.js)**
- Listens to `tool:running` → calls `start('Generating...')` + `setVariant('primary')` (blue badge)
- Listens to `tool:loading-model` → calls `updateLabel('Loading model...')`
- Listens to `tool:sampling-start` → calls `updateLabel('Generating...')`
- Listens to `tool:cancelled` → calls `cancel()`
- Listens to `tool:idle` → calls `complete('Generation finished')` (fires success toast)

**Pattern notes:**
- Blocks emit `tool:running` at generation start (in promptBox 'run' handler)
- commandExecutor emits `tool:loading-model` / `tool:sampling-start` based on WS message types
- StatusBar owns all progress UI logic; blocks don't call StatusBar methods directly (except `progress.update()` for KSampler progress)
- Generation timing saved to item sidecar: backend receives `generationMs` field in save-generation POST body

---

## Workspaces (cross-cutting event usage)

### MpiGroupHistoryBlock (Block — js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js)
Owns the Group History workspace. Mounts MpiHistoryTools, MpiCanvasViewer, MpiHistoryList, MpiMediaDropOverlay, and wires them via Events.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `generation:started` `{ id, scope, groupId }` — seeds `_myGenIds` if scope+groupId match; shows generating state on canvas
         `generation:preview` `{ id, url }` — loads preview into canvasViewer if id in `_myGenIds`
         `generation:complete` `{ id, item, group }` — appends history entry, updates canvas, clears generating state
         `generation:error` `{ id }` — clears generating state
         `generation:cancelled` `{ id }` — clears generating state
EMITS:   `tool:running`       `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`         `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled`    `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
NOTE:    Reads `state.currentProject`; writes `state.currentProject`
         On mount: rehydrates from `activeGenerations.listFor('groupHistory', _group.id)` — canvas shows cached preview immediately
         `destroy()` unsubscribes all events but does NOT cancel exec — generation continues across navigation
         StatusBar listens to tool:running, tool:loading-model, tool:sampling-start, tool:idle, tool:cancelled and updates progress label/variant
         commandExecutor emits tool:loading-model and tool:sampling-start (see commandExecutor note below)
         Window-level drag listeners (`dragenter`/`dragleave`/`dragover`/`drop`) managed here; removed in `destroy()`
         MpiMediaDropOverlay onDrop: uploads file + calls PromptBoxService.injectMedia() only (no history card created)
