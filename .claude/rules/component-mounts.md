## Sub-Agent Briefing
> Use this file when you need to know who mounts a component, what props it receives, or where it appears in the UI.

> **Scope:** Lists only components that perform internal sub-mounts. Components absent from this file have no internal mounts.

---

## MpiGalleryBlock

- `MpiGalleryGrid`   props: `{ groups: ItemGroup[] }`   slot: top-level workspace container
- `MpiMediaDropOverlay`   props: `{ onDrop({ file, mediaType }) }` callback   slot: `document.createElement('div')` appended to `el` — full-area OS-file drop target; shown/hidden via window `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); ignores internal `application/mpi-media` drags; `onDrop` uploads file, emits `media:imported`, then calls `PromptBoxService.injectMedia()`
- `MpiSelectionBar`   props: `{ count: 0 }`   slot: `.mpi-gallery-grid__selectionbar-slot` (inside grid's footer) — hidden by default; shown when selection mode activates
- `PromptBoxService.mount()`   config: `{ model, modelList: installedImageModels, operation: 't2i', includeNegative: true }`   — mounts shell-level PromptBox; only called when `installedImageModels.length > 0`
  - `updateContext`: called on `media-change` event — `{ imageCount, videoCount, hasMask: false }`
- `MpiCompareOverlay`   props: none   slot: `document.createElement('div')` — singleton; shown on `grid 'compare'` event
- `MpiOkCancel`   props: `{ title: 'Delete', text: '...', okLabel: 'Delete', cancelLabel: 'Cancel' }`   slot: `document.createElement('div')` — singleton delete-confirmation dialog; shown on `grid 'delete'` event
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event

> **Note:** `MpiModelsModal` is NOT mounted here — it is a shell-level singleton in `shell.js`. `MpiGalleryBlock` emits `Events.emit('models:open')` to trigger it.

---

## MpiGroupHistoryBlock

**Image groups** (`_group.type !== 'video'`):
- `MpiHistoryTools`   props: `{ tools: [{mode,icon,info}, ...] }` — image tools: crop, mask, autoMaskImg   slot: `#left-slot`
- `MpiCanvasViewer`   props: `{ initialImageUrl, initialIdx }`   slot: `#centre-slot` — handles crop/mask/compare tool modes internally
- `MpiHistoryList`   props: `{ history, selectedIndex }`   slot: `#right-slot`
- `PromptBoxService.mount()`   config: `{ model, modelList: installedModels, operation: activeOperation, includeNegative: true }`   — shell-level PromptBox; only called when `activeModel` is non-null

**Video groups** (`_group.type === 'video'`):
- `MpiHistoryTools`   props: `{ tools: [{mode,icon,info}, ...] }` — video tools: crop (mode='crop'), videoUpscale (mode='videoUpscale'), interpolate (mode='interpolate')   slot: `#left-slot`
- `MpiVideoViewer`   props: `{ barContainer: bottomSlot }` — `bottomSlot` is a DOM node in `#centre-slot`; `MpiVideoViewer` mounts all 3 action bars there   slot: `#centre-slot`
- `MpiHistoryList`   props: `{ history, selectedIndex }`   slot: `#right-slot`
- PromptBox is **hidden** for video groups (no model-based operations exposed); `PromptBoxService.hide()` called on mount

**Both group types:**
- `MpiMediaDropOverlay`   props: `{ onDrop({ file, mediaType }) }` callback   slot: `document.createElement('div')` appended to `el` — full-area OS-file drop target; `onDrop` uploads file and calls `PromptBoxService.injectMedia()` only (no card created); window drag-counter pattern same as GalleryBlock
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event
- `MpiModelsModal`   props: `{ icon, title, text, footer, closable }`   slot: `document.createElement('div')` — local singleton; shown when zero image models installed (separate instance from shell's modal; emits `models:all-installed` to hide)

---

## MpiVideoViewer (Compound — js/components/Compounds/MpiVideoViewer/MpiVideoViewer.js)

Wraps `MpiVideoPlayer` + crop overlay canvas + reserved timeline slot. Mounted by `MpiGroupHistoryBlock` for video groups.

- `MpiVideoPlayer`   props: `{ fps, controls }`   slot: `[data-mount="player"]` inside viewer
- `MpiRatioSelector`   props: `{ modelType: 'social', value: SOCIAL_RATIOS[0].label }`   slot: leftSlot of cropBar — only when `barContainer` prop provided
- Crop `MpiToolActionBar`   props: `{ leftSlot: ratioSel, actions: [snapshot, cancel, apply] }`   slot: `cropBarSlot` div appended to `barContainer`
- Upscale `MpiToolActionBar`   props: `{ actions: [cancel, run] }`   slot: `upscaleBarSlot` div appended to `barContainer`
- Interpolate `MpiToolActionBar`   props: `{ actions: [cancel, run] }`   slot: `interpolateBarSlot` div appended to `barContainer`

All three action bars are hidden by default. Only one bar is visible at a time. `hideAllToolBars()` resets all bars and disables the crop overlay.

**Instance API (on `el`):** `loadVideo(url, meta)`, `enterCropMode(rect)`, `exitCropMode()`, `getCropRect()`, `setCropRatio(ratio)`, `captureSnapshot()`, `hideAllToolBars()`, `enterUpscaleMode()`, `exitUpscaleMode()`, `enterInterpolateMode()`, `exitInterpolateMode()`, `destroy()`

---

## projectUI.js (landing page — mounted once at boot)

- `MpiProjectDropOverlay`   props: `{ onDrop({ folderPath, source }) }` callback   slot: `document.createElement('div')` appended to `#page-landing` — full-area OS drop target for project folders / `project.json`; shown/hidden via `#page-landing` `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); `onDrop` calls `addProjectByFolder()` then `loadProjectGrid()`. Feature-gated on `window.require` — skipped in plain-browser dev mode.
- `MpiNewProject`, `MpiSettings`, `MpiHelp`, `MpiAbout`, `MpiOkCancel` (delete-confirm)   slot: `document.createElement('div')` — lazy singletons shown on user action; not mounted until first trigger.
- `MpiProjectCard` (one per project)   props: `{ title, date, media }`   slot: `#projectGrid` children — rebuilt on every `loadProjectGrid()`.
- `MpiButton` (landing header actions + "+ New Project")   slot: `#landingActions` / `#newProjectBtn`.

---

## shell.js (global singletons — mounted once at startup)

- `MpiErrorDialog`     props: none   slot: `document.createElement('div')` — shown on `ui:error` event
- `MpiStartingComfy`   props: none   slot: `document.createElement('div')` — shown on `comfy:starting`, hides on `comfy:ready`
- `MpiModelsModal`     props: `{ icon, title, text, footer, closable: true }`   slot: `document.createElement('div')` — shown on `models:open` event or when zero image models installed
- `MpiMemoryMonitor`   props: none   slot: `#memory-monitor-mount`
- `MpiProjectName`     props: `{ projectName }`   slot: `#project-name-mount`
- `PromptBoxService`   initialized against `#prompt-box-mount` — workspaces claim via `PromptBoxService.mount(config)`

> **Rule:** Never mount any of the above singletons inside workspace Blocks. Use Events to trigger them.

---

## MpiGalleryGrid.js (Compound: grid layout + card rendering)

MpiGalleryGrid is now a Compound that handles both justified layout and card display (logic merged from deleted MpiGroupCard).

**Primitives mounted:**
- `MpiProgressBar` (size slider)   props: `{ min:1, max:5, step:1, value:3, interactive:true, wheel:true, info:'Size: {value}' }`   slot: `.mpi-gallery-grid__slider-wrap`
- `MpiButton` (info toggle)   props: `{ icon:'info', size:'sm', variant:'ghost', toggleable:true, active, info }`   slot: `.mpi-gallery-grid__info-btn-slot`

**Card rendering:**
- Cards are now rendered as DOM elements (not components)
- Card logic (generating state, preview, drag) integrated directly
- One card per ItemGroup in `.mpi-gallery-grid__grid` with justified layout
- Generating cards detected by `isGenerating` flag and rendered in `.mpi-gallery-grid__generating-slot`

**Video card rendering:**
- Video groups (`group.type === 'video'`) swap `<img>` thumb for native `<video>` element (`_swapThumbToVideo`)
- Video element: `muted`, `loop`, `playsInline`, `preload='metadata'` — first frame shows at rest, hover triggers `play()`/`pause()`
- No canvas/poster extraction — browser/Electron decodes natively

**Public API (on `instance.el`):**
- `setGroups(groups)` — replace all groups and re-render; generating cards flow through `isGenerating` flag
- `updatePreview(tempId, url)` — push latent preview to generating card during image generation
- `removeCard(groupId)` — remove single card from grid and `_cardMap`
- `setSelectionMode(bool)` — toggle selection mode CSS on all cards

---

## MpiPromptBox.js (internal mounts)

- `MpiInput` (textarea)   props: `{ type:'textarea', placeholder:'Type your prompt...', value }`   slot: `#textarea-slot`
- `MpiButton` (expand-lock)   props: `{ icon:'chevronDown', iconActive:'chevronUp', info, size:'sm', variant:'ghost', toggleable:true, active: !isExpansionLocked }`   slot: `#expand-lock-slot`
- `MpiButton` (copy)   props: `{ icon:'copy', variant:'ghost', size:'sm', info }`   slot: `#copy-btn-slot`
- `MpiDropdown` (model selector)   props: `{ options: modelList mapped to {value,label}, value: model.id, info, direction:'up' }`   slot: appended to `#bottom-left-slot` — only when `model && modelList.length >= 1`
- `MpiButton` (gear/settings)   props: `{ icon:'settings', variant:'ghost', size:'sm', info }`   slot: appended to `#bottom-left-slot` — only when `model && showSettings !== false`
- `MpiButton` (negative toggle)   props: `{ icon:'check', iconActive:'negative', info, size:'sm', variant:'primary', toggleable:true, active:isNegativeMode }`   slot: `#bottom-neg-slot` — only when `includeNegative` prop is true
- `MpiButton` (run/stop)   props: `{ icon:'play', iconActive:'stop', info, size:'md', variant:'primary', toggleable:true, active:isGenerating }`   slot: fresh div appended to `#bottom-right-slot`
- `MpiDropdown` (op dropdown)   props: `{ options: availableOps, value: activeOperation, info:'Operation', direction:'up' }`   slot: `#op-dropdown-slot` — refreshed on every model/context change
- `PromptBoxControl components` (e.g. `MpiRatioSelector`, `MpiBatchSelector`)   props: `{ modelId }`   slot: `#bottom-bottom-slot` — one control per operation's `components[]` array; cleared and remounted on operation change
- `MpiButton` (download manager)   props: `{ icon:'download', variant:'ghost', size:'sm', info:'Open Download Manager' }`   slot: fresh div appended to `#bottom-left-slot` — always rendered; on click emits `Events.emit('models:open', {})`

---

## MpiCompareOverlay.js (internal mounts)

- `MpiOverlay`   props: `{ closable: true }`   slot: `document.createElement('div')`
- `MpiCanvas`   props: none (lazy, created on first `open()` call)   slot: `#canvas-wrap`

---

## MpiModelSettings.js (internal mounts)

- `MpiOverlay`   props: `{ closable: true }`   slot: `document.createElement('div')`
- `MpiDropdown` (upscale)   props: `{ options: upscaleOptions from state.upscaleModels, value, placeholder }`   slot: `.mpi-model-settings__upscale-slot`; remounted on each `open()` call
- `MpiDropdown` (lora slot ×6)   props: `{ options: loraOptions from state.availableLoras, value, placeholder }`   slot: per-slot `dropHost` div; remounted on each `open()` call
- `MpiInput` (model strength ×6)   props: `{ type:'number', size:'sm', value, min:-2, max:2, step:0.05, decimals:2 }`   slot: per-slot `strengthsEl`
- `MpiInput` (clip strength ×6)   props: same pattern as model strength

---

## MpiVideoPlayer.js (internal mounts, when `controls !== false`)

- `MpiButton` (play/pause)   props: `{ icon:'play', iconActive:'pause', active, size:'md', info }`   slot: `.mpi-video-player__play-pause-wrapper`
- `MpiProgressBar` (seek slider)   props: `{ min:0, max:1000, step:1, value:0, info, variant:'primary' }`   slot: `.mpi-video-player__slider-wrapper`
- `MpiVolumeControl`   props: `{ volume, muted }`   slot: `.mpi-video-player__volume-wrapper`

---

## MpiHistoryTools.js (internal mounts)

- `MpiButton` (per tool)   props: `{ icon, size:'sm', variant:'ghost', info, toggleable:true, active:false }`   slot: fresh div appended to root

---

## MpiToolActionBar.js (internal mounts)

- (optional) `topSlot.el`   appended to `.mpi-tool-action-bar__top`
- (optional) `leftSlot.el`   appended to `.mpi-tool-action-bar__left`
- `MpiButton` (per action)   props: `{ icon, label, labelPosition:'top', size:'sm', variant, info, toggleable, active }`   slot: fresh div appended to `.mpi-tool-action-bar__actions`
