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
LISTENS: (forwarded from internal MpiOverlay 'close')

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

---

## Workspaces (cross-cutting event usage)

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation dropdown
EMITS:   `tool:running` — NOT emitted here; emitted by MpiGroupHistoryBlock
NOTE:    Reads `state.s_selectedModelId`; writes `state.s_selectedModelId` and `state.currentProject`

### MpiGroupHistoryBlock (Block — js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js)
Owns the Group History workspace. Mounts MpiHistoryTools, MpiCanvasViewer, MpiHistoryList, and wires them via Events.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
EMITS:   `tool:running` `{ tool: 'groupHistory', type: string }` — fired on generation start
NOTE:    Reads `state.currentProject`; writes `state.currentProject`
