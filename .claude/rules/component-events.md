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
LISTENS: (none — MutationObserver for safety release only)

### MpiPopup
EMITS:   `close`      `{}`
         `mouseenter` `MouseEvent`
         `mouseleave` `MouseEvent`
         `select`     `{ id: string, el: HTMLElement }` — item clicked (when items prop used)
         `click`      `MouseEvent`
LISTENS: `ui:close-all-popups` — removes `is-active`, emits `close`

### MpiProgressBar
EMITS:   `input`  `{ value: number }`
         `change` `{ value: number }`
LISTENS: (none)

### MpiProjectsPageOverlay
EMITS:   `close` `{}`
LISTENS: `ui:close-all-popups` — calls `el.hide()` if backdrop is active

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
         `download:failed` `{ modelId, error }` — emits `ui:error` and re-renders list
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
         `popup_toggle`       `{ active: boolean }`
LISTENS: `ui:close-all-popups` — closes popup if open

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
         `save`        `{}`
         `delete`      `{}`
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
EMITS:   `open-group` `{ group: ItemGroup }`
         `compare`    `{ groups: [ItemGroup, ItemGroup] }`
         `delete`     `{ groups: ItemGroup[] }`
         `download`   `{ groups: ItemGroup[] }`
         `gc-group`   `{ group: ItemGroup }`
         `gc-remove`  `{ groupId: string }`
LISTENS: (none — internal MpiSelectionBar/MpiGroupCard events handled internally)

### MpiPromptBox
EMITS:   `input`            `{ positive: string, negative: string, activeMode: 'positive'|'negative' }`
         `copy`             `{ text: string }`
         `mode-change`      `{ mode: 'positive'|'negative' }`
         `media-change`     `{ imageCount: number, videoCount: number, items: MediaItem[] }`
         `run`              `{ operation: string, positive: string, negative: string, mediaItems: MediaItem[], injectionParams: Object }`
         `cancel`           `{}`
         `model-change`     `{ model: ModelDef }`
         `operation-change` `{ operation: string }`
         `settings`         `{ model: ModelDef }`
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs internal active operation; cleanup via MutationObserver

### MpiVideoPlayer
EMITS:   `play`       `{ time: number }`
         `pause`      `{ time: number }`
         `ended`      `{ time: number }`
         `timeupdate` `{ time: number, duration: number }`
         `change`     `{ volume: number, muted: boolean }`
LISTENS: (none)

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
Owns the Gallery workspace. Mounts MpiGalleryGrid, MpiPromptBox, and handles generation lifecycle.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `models:closed` — remounts PromptBox if needed
         `state:changed` (`s_installedModelIds`) — emits `models:open` if no image models
EMITS:   `tool:running`   `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`      `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled` `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
         `models:open` — when zero image models installed
NOTE:    Reads `state.s_selectedModelId`, `state.currentProject`; writes same
         commandExecutor emits tool:loading-model and tool:sampling-start during generation (see below)

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
- Listens to `tool:idle` → calls `complete('Done!')`

**Pattern notes:**
- Blocks emit `tool:running` at generation start (in promptBox 'run' handler)
- commandExecutor emits `tool:loading-model` / `tool:sampling-start` based on WS message types
- StatusBar owns all progress UI logic; blocks don't call StatusBar methods directly (except `progress.update()` for KSampler progress)
- Generation timing saved to item sidecar: backend receives `generationMs` field in save-generation POST body

---

## Workspaces (cross-cutting event usage)

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation dropdown
         `models:closed` — remounts PromptBox if it was null (no models at gallery-open time); also sets `activeModel` directly before remount so generation works immediately after first-time model install
         `state:changed` (`s_installedModelIds`) — emits `models:open` if no image models installed
EMITS:   `models:open` — when zero image models installed at mount time or after registry update
NOTE:    Reads `state.s_selectedModelId`; writes `state.s_selectedModelId` and `state.currentProject`
         Race condition: if model registry hasn't updated when gallery mounts (e.g. user closes model manager immediately after install), `activeModel` = null and `promptBox` = null. The `models:closed` handler re-derives and sets `activeModel` before remounting PromptBox — this is the recovery path.

### MpiGroupHistoryBlock (Block — js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js)
Owns the Group History workspace. Mounts MpiHistoryTools, MpiCanvasViewer, MpiHistoryList, and wires them via Events.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
EMITS:   `tool:running`       `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`         `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled`    `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
NOTE:    Reads `state.currentProject`; writes `state.currentProject`
         StatusBar listens to tool:running, tool:loading-model, tool:sampling-start, tool:idle, tool:cancelled and updates progress label/variant
         commandExecutor emits tool:loading-model and tool:sampling-start (see commandExecutor note below)
