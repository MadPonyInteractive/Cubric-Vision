## Sub-Agent Briefing
> Use this file when you need to know who mounts a component, what props it receives, or where it appears in the UI.

> **Scope:** Lists only components that perform internal sub-mounts. Components absent from this file have no internal mounts.

---

## gallery.js

- `MpiGalleryGrid`   props: `{ groups: ItemGroup[] }`   slot: top-level workspace container; provides `getPromptSlot()` for PromptBox
- `MpiPromptBox`     props: `{ model, modelList: installedImageModels, operation: 't2i', includeNegative: true }`   slot: `grid.el.getPromptSlot()` — only mounted when `activeModel` is non-null
  - `updateContext`: called on `media-change` event only — `{ imageCount, videoCount, hasMask: false }`; not called at initial mount (initial props are final)
- `MpiCompareOverlay`   props: none   slot: `document.createElement('div')` — singleton; shown on `grid 'compare'` event
- `MpiOkCancel`   props: `{ title: 'Delete', text: '...', okLabel: 'Delete', cancelLabel: 'Cancel' }`   slot: `document.createElement('div')` — singleton delete-confirmation dialog; shown on `grid 'delete'` event
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event
- `MpiModelsModal`   props: `{ icon, title, text, footer, closable }`   slot: `document.createElement('div')` — singleton zero-installed overlay; shown when `state.s_installedModelIds.length === 0`; owns its own model card list via internal `MpiInstalledDisplay` mounts

---

## groupHistory.js

- `MpiCanvas`   props: `{ onBrushTypeChange: fn }`   slot: `canvasWrap` div inside centre column
- `MpiSpinner`   props: `{ size: 'lg', variant: 'primary' }`   slot: `spinnerWrap` div inside centre column; shown during generation
- `MpiHistoryTools`   props: `{ tools: [{mode,icon,info}, ...] }` — includes crop, mask, plus universal tool commands from commandRegistry   slot: `leftBar` div
- `MpiRatioSelector`   props: `{ modelType: 'social', value: SOCIAL_RATIOS[0].label }`   slot: `ce('div')` — passed as `leftSlot` to `cropActionBar`
- `MpiToolActionBar` (cropActionBar)   props: `{ leftSlot: ratioSel, actions: [apply, cancel] }`   slot: `_cropBarSlot` inside `cropBar`; shown when crop mode active
- `MpiToolActionBar` (maskActionBar)   props: `{ actions: [brush, eraser, clear, invert, cancel, apply] }`   slot: `_maskBarSlot` inside `cropBar`; shown when mask mode active
- `MpiAutoMaskThumbs`   props: none   slot: `document.createElement('div')` — passed as `topSlot` to `autoMaskBar`
- `MpiDropdown` (autoMaskModelDropdown)   props: `{ options: DETECTION_MODELS, value: _autoMaskModel, info, direction: 'up' }`   slot: `document.createElement('div')` — composed into `_autoMaskLeftSlot`
- `MpiRadioGroup` (autoMaskModeRadio)   props: `{ options: [{Box,box},{Segment,segment}], value: 'box', name, info }`   slot: `document.createElement('div')` — composed into `_autoMaskLeftSlot`
- `MpiToolActionBar` (autoMaskBar)   props: `{ topSlot: autoMaskThumbs, leftSlot: _autoMaskLeftSlotInst, actions: [detect, apply, cancel] }`   slot: `_autoMaskBarSlot` inside `cropBar`; shown when autoMask mode active
- `MpiSelectionBar`   props: `{ count: 0 }`   slot: `_selBarSlot` inside `cropBar`; shown when history selection mode active
- `MpiPromptBox`   props: `{ model: activeModel, modelList: installedModels, operation: activeOperation, includeNegative: true }`   slot: `bottom` div; only mounted when `activeModel` is non-null; initial context set via `updateContext({ ..._baseCtx, hasMask: false, filterNoInputOps: true })`
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event
- `MpiModelsModal`   props: `{ icon, title, text, footer, closable }`   slot: `document.createElement('div')` — singleton zero-installed overlay; shown when `state.s_installedModelIds.length === 0`; owns its own model card list via internal `MpiInstalledDisplay` mounts

---

## MpiGalleryGrid.js (internal mounts)

- `MpiProgressBar` (size slider)   props: `{ min:1, max:5, step:1, value:3, interactive:true, wheel:true, info:'Size: {value}' }`   slot: `.mpi-gallery-grid__slider-wrap`
- `MpiSelectionBar`   props: `{ count: 0 }`   slot: `.mpi-gallery-grid__selectionbar-slot` — shown when selection mode active; hidden otherwise
- `MpiGroupCard`   props: `{ group, selectionMode, selected }`   slot: per-card wrapper div appended to `.mpi-gallery-grid__grid`; one per ItemGroup

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
- `PromptBoxControl components` (e.g. `MpiRatioSelector`)   props: `{ modelId }`   slot: `#bottom-bottom-slot` — one control per operation's `components[]` array; cleared and remounted on operation change

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
