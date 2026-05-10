## Sub-Agent Briefing
> Use this file when you need to know who mounts a component, what props it receives, or where it appears in the UI.

> **Scope:** Lists only components that perform internal sub-mounts. Components absent from this file have no internal mounts.

## MpiCanvas (Primitive: interactive image canvas)

DOM structure: `.mpi-canvas` root → `.mpi-canvas__stack` (CSS-transform pan/zoom target) → `canvas[data-role=base]` + `canvas[data-role=overlay]` (both image-native px) + `canvas[data-role=screen-ui]` (container px, sibling of stack).

Props: `{ onBrushSizeChange?: fn, onBrushTypeChange?: fn }`

---

## MpiMaskedImagePreview (Primitive: lightweight prompt-mode image preview)

DOM structure: `.mpi-masked-preview` root (overflow:hidden) → `.mpi-masked-preview__stack` (CSS-transform pan/zoom, sized to image-native px) → `img.mpi-masked-preview__base` + `img.mpi-masked-preview__masked` (CSS `mask-image` overlay).

No canvas, no GPU texture backing. Zero VRAM beyond the two `<img>` decode buffers.

Props: none

**Instance API (on `el`):**
- `loadImage(url)` — load image; resets view to contain
- `setMaskDataURL(dataUrl)` — show PNG mask as CSS `mask-image` tinted overlay
- `clearMask()` — hide overlay
- `destroy()` — remove listeners, disconnect ResizeObserver

**Mounted by:** `MpiCanvasViewer` (`swapToPreview`) into `_previewWrap` (absolute-positioned sibling of `#canvas-wrap`)

---

## MpiGalleryBlock

- `MpiGalleryGrid`   props: `{ groups: ItemGroup[] }`   slot: top-level workspace container
- `MpiMediaDropOverlay`   props: `{ onDrop({ files: [{ file, mediaType }, ...] }) }` callback   slot: `document.createElement('div')` appended to `el` — full-area OS-file drop target; shown/hidden via window `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); ignores internal `application/mpi-media` drags; `onDrop` loops over files: uploads each, emits `media:imported` per file. PromptBox slots filled up to `_pb.el.remainingCapacity(mediaType)` (per-type); overflow files still become gallery cards but are not injected into the strip.
- `MpiPromptBox` (Organism)   props: `{ model, modelList: installedImageModels, operation: 't2i', includeNegative: true }`   slot: `gid('prompt-box-mount')` — Block keeps handle in `_pb`, destroys before remount AND in `el.destroy`; only mounted when `installedImageModels.length > 0`
  - `updateContext`: called on `media-change` event — `{ imageCount, videoCount, hasMask: false }`
- `MpiCompareOverlay`   props: none   slot: `document.createElement('div')` — singleton; shown on `grid 'compare-requested'` event from MpiGalleryGrid
- `MpiOkCancel`   props: `{ title: 'Delete', text: '...', okLabel: 'Delete', cancelLabel: 'Cancel' }`   slot: `document.createElement('div')` — singleton delete-confirmation dialog; shown on `grid 'delete'` event
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event

> **Note:** `MpiModelsModal` is NOT mounted here — it is a shell-level singleton in `shell.js`. `MpiGalleryBlock` emits `Events.emit('models:open')` to trigger it.
> **Selection:** No `MpiSelectionBar`. Ctrl/Cmd-click toggles card into selection; shift-click range-selects; right-click opens `MpiContextMenu`. `MpiCheckbox` is also removed from cards.

---

## MpiGroupHistoryBlock

Photoshop-style layout: `grid-template-columns: 3.5rem 1fr 14rem`. Slots: `#left-slot` (toolbar), `#centre-slot` (viewer), `#right-top-slot` (active tool options), `#right-bottom-slot` (history list), `#prompt-box-mount` (shell PromptBox, centre-bottom floating).

**Mediator pattern:** `mountOptions(mode)` is `async`. Destroys previous `MpiToolOptions*` instance and mounts the new one into `#right-top-slot`. `prompt` mode is special — no compound, toggles CSS class `mpi-group-history-block--prompt-active` which shows PromptBox and hides `#right-top-slot`. For image groups, `prompt` mode also calls `await viewer.el.swapToPreview()` (destroys `MpiCanvas`, mounts `MpiMaskedImagePreview`). Switching away from prompt calls `await viewer.el.swapToCanvas()` (destroys preview, remounts fresh `MpiCanvas`, reloads image + mask) before mounting the tool compound. Always `await` both swaps — tool compounds must not mount before canvas is ready.

```js
const TOOL_OPTIONS_REGISTRY = {
    crop:         MpiToolOptionsCrop,
    mask:         MpiToolOptionsMask,
    videoUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
};
```

**Both group types:**
- `MpiHistoryTools`   props: `{ mode: 'image'|'video' }` — builds own tool list from `mode` prop   slot: `#left-slot`
- `MpiHistoryList`   props: `{ history, selectedIndex, isVideo }` — ctrl/shift/right-click selection   slot: `#right-bottom-slot`
- `MpiMediaDropOverlay`   props: `{ onDrop({ files: [{ file, mediaType }, ...] }) }` callback   slot: `document.createElement('div')` appended to `el` — loops files: uploads each, calls `_pb.el.injectMedia()` per file (no history card created)
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event
- `MpiModelsModal`   props: `{ icon, title, text, footer, closable }`   slot: `document.createElement('div')` — local singleton; shown when zero models installed

**Image groups** (`_group.type !== 'video'`):
- `MpiCanvasViewer`   props: `{ initialImageUrl, initialIdx, initialItem, groupId }`   slot: `#centre-slot` — handles crop/mask viewer modes internally; does NOT own any bars. `initialItem` (full HistoryItem) + `groupId` are required for layered-mask TEMP persistence (key = `<projectId>/<groupId>/<itemId>`); omitting them disables persistence silently.
- Tool options in `#right-top-slot`: `MpiToolOptionsCrop`, `MpiToolOptionsMask`
- `MpiPromptBox` (Organism) into `#prompt-box-mount` — only when `_hasPromptOps()` true (active model exposes ≥1 enabled prompt op); Block keeps handle in `_pb`

**Video groups** (`_group.type === 'video'`):
- `MpiVideoViewer`   props: `{ fps, controls }`   slot: `#centre-slot`
- Tool options in `#right-top-slot`: `MpiToolOptionsCrop`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`
- `MpiPromptBox` (Organism) into `#prompt-box-mount` — only when `_hasPromptOps()` true (video model exposes prompt ops); Block keeps handle in `_pb`

---

## MpiToolOptions* (Organisms — js/components/Organisms/MpiToolOptions<Name>/)

Four self-contained tool-options compounds. Each mounts into `#right-top-slot` via the Block mediator. No bars inside viewers.

**Pattern:** `setup` enters viewer mode → owns controls → `destroy` evaluates mask + exits viewer mode. No apply buttons on mask panel (PromptBox drives ops). No cancel buttons.

- `MpiToolOptionsCrop`   props: `{ viewer, kind: 'image'|'video' }`   — family `MpiDropdown` (SDXL/FLUX/SOCIAL/FREE) + orientation `MpiRadioGroup` (icon-only, sdxl/flux only) + ratio `MpiRadioGroup` (icon-only, hidden for FREE) + apply (image) / snapshot+save (video) buttons. Pushes ratio to `viewer.el.setCropRatio(ratio|null)` — `null` = FREE (no aspect lock). Emits `apply { kind: 'image'|'video-save'|'video-snapshot' }`. Crop drag honors Shift modifier (scales from rect center) via `Hotkeys.register('shift', …)` inside `CropManager`/`cropTool`.
- `MpiToolOptionsMask`   props: `{ viewer }`   — unified panel: detection-model `MpiDropdown` + box/segment `MpiRadioGroup` + `MpiAutoMaskThumbs` strip + Detect button + brush/eraser `MpiButton` toggles + invert + clear. No `apply` emitted. Hotkeys B/E registered while mounted. `destroy` calls `viewer.el.evaluateMask()` then `exitMode()`. Auto-detect composites picked thumbs ONTO existing mask (`compositeMaskDataURL`); Detect button does NOT clear existing paint.
- `MpiToolOptionsUpscale`   props: `{ viewer, onApply }`   — `MpiOptionSelector` (factor) + `MpiDropdown` (model) + run. Emits `apply { factor, model }`.
- `MpiToolOptionsInterpolate`   props: `{ viewer, onApply }`   — `MpiOptionSelector` (multiplier) + run. Emits `apply { multiplier }`.

---

## MpiVideoViewer (Organism — js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js)

Wraps `MpiVideoPlayer` + crop overlay canvas. Mounted by `MpiGroupHistoryBlock` for video groups.
Tool bars are owned by `MpiToolOptions*` compounds — NOT by the viewer.

- `MpiVideoPlayer`   props: `{ fps, controls }`   slot: `[data-mount="player"]` inside viewer

**Instance API (on `el`):** `loadVideo(url, meta)`, `enterCropMode(rect)`, `exitCropMode()`, `getCropRect()`, `setCropRatio(ratio)`, `captureSnapshot()`, `enterUpscaleMode()`, `exitUpscaleMode()`, `enterInterpolateMode()`, `exitInterpolateMode()`, `destroy()`

---

## projectUI.js (landing page — mounted once at boot)

- `MpiProjectDropOverlay`   props: `{ onDrop({ folderPath, source }) }` callback   slot: `document.createElement('div')` appended to `#page-landing` — full-area OS drop target for project folders / `project.json`; shown/hidden via `#page-landing` `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); `onDrop` calls `addProjectByFolder()` then `loadProjectGrid()`. Feature-gated on `window.require` — skipped in plain-browser dev mode.
- `MpiNewProject`, `MpiOkCancel` (delete-confirm)   slot: `document.createElement('div')` — lazy singletons shown on user action; not mounted until first trigger.
- `MpiProjectCard` (one per project)   props: `{ title, date, media, ... }`   slot: `#projectGrid` children — rebuilt on every `loadProjectGrid()`. Stage redesign: rendered as a row, not a card-grid item. Per-row stats (asset count + bytes-on-disk) come from `fetchStats()` in `js/services/projectStatsService.js`; in-flight fetches are aborted via the module-local `_statsBatchAC` AbortController when the grid rebuilds, so late responses don't write into rows that no longer exist.
- **`#landingActions` slot:** plain `<a>` text links (`Settings · Help · About`) — NOT `MpiButton`s. Each click dispatches `Events.emit('slide-over:open', { title, component })` where `component` is one of `MpiSettings | MpiHelp | MpiAbout` (imported as content blueprints, not mounted directly). Hero version label `Cubric Studio · v${APP_VERSION}` mounts at `#heroVersion`.
- **`MpiSlideOver`**   import-side-effect at module load: `import '../components/Compounds/MpiSlideOver/MpiSlideOver.js'` registers the module-level `Events.on('slide-over:open', ...)` handler. No direct mount call. The handler mounts a fresh instance per open into `document.createElement('div')`, appended to `document.body` by `el.open()`.

> **MpiSettings is NOT mounted directly anymore.** It is a *content component* of `MpiSlideOver` — its body element is mounted inside `.mpi-slide-over__body` via `props.component.mount(bodyEl)` from inside `MpiSlideOver.setup()`. The legacy `el.show()/el.hide()` methods are gone. Field initialisation runs via `el.onOpen()`, which `MpiSlideOver` calls once on every open. Internal mounts inside `MpiSettings._initFields()` are unchanged:
> - `MpiCheckbox`   props: `{ checked: Storage.getAutoStartComfy(), label:'Auto-start ComfyUI on Launch' }`   slot: `#mpiSettingsAutoStartSlot`
> - `MpiInput` (Ollama URL)   props: `{ label:'Llama API URL', placeholder:'http://localhost:8080', value }`   slot: `#mpiSettingsOllamaUrlSlot`
> - `MpiInput` (ComfyUI URL)   props: `{ label:'ComfyUI API URL', placeholder:'http://localhost:8188', value }`   slot: `#mpiSettingsComfyUrlSlot`
> - `MpiInput` (ComfyUI path)   props: `{ label:'ComfyUI Models Path', placeholder:'Default (internal engine)', value }`   slot: `#mpiSettingsComfyRootPathSlot`
> - `MpiButton` (Browse)   props: `{ text:'Browse', variant:'secondary', size:'md', extraClasses:'mpi-settings__browse-btn' }`   slot: `#mpiSettingsBrowseBtnSlot`

---

## shell.js (global singletons — mounted once at startup)

- `MpiErrorDialog`     props: none   slot: `document.createElement('div')` — shown on `ui:error` event
- `MpiStartingComfy`   props: none   slot: `document.createElement('div')` — shown on `comfy:starting`, hides on `comfy:ready`
- `MpiModelsModal`     props: `{ icon, title, text, footer, closable: true }`   slot: `document.createElement('div')` — shown on `models:open` event or when zero image models installed
- `MpiMemoryMonitor`   props: none   slot: `#memory-monitor-mount`
- `MpiProjectName`     props: `{ projectName }`   slot: `#project-name-mount`
- `#prompt-box-mount` slot   declared in `index.html` at `#app-shell` level — Blocks (Gallery, History) mount `MpiPromptBox` Organism into it directly; slot persists across workspace switches, so each Block MUST destroy its prior `_pb` handle before remount AND in `el.destroy`.

> **Rule:** Never mount any of the above singletons inside workspace Blocks. Use Events to trigger them.

---

## MpiGalleryGrid.js (Compound: grid layout + card rendering)

MpiGalleryGrid is now a Compound that handles both justified layout and card display (logic merged from deleted MpiGroupCard).

**Primitives mounted:**
- `MpiProgressBar` (size slider)   props: `{ min:1, max:5, step:1, value:3, interactive:true, wheel:true, info:'Size: {value}' }`   slot: `.mpi-gallery-grid__slider-wrap`
- `MpiButton` (info toggle)   props: `{ icon:'info', size:'sm', variant:'ghost', toggleable:true, active, info }`   slot: `.mpi-gallery-grid__info-btn-slot`
- `MpiButton` ×6 (tab buttons)   props: `{ text, variant:'ghost', size:'sm', extraClasses:'mpi-gallery-grid__tab[ mpi-gallery-grid__tab--active]' }`   slot: `.mpi-gallery-grid__tab-slot[data-order]` / `.mpi-gallery-grid__tab-slot[data-filter]` — active class toggled via `_syncTabActive()` on `state.gallerySort` change; click handlers write to `state.gallerySort`
- `MpiCheckbox` (card selection)   props: `{ checked: false }`   slot: `.mpi-group-card__select-wrap` — mounted per card inside `_makeCard()`; `on('change')` drives selection state

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

## MpiVideoPlayer.js (Compound — js/components/Compounds/MpiVideoPlayer — internal mounts, when `controls !== false`)

- `MpiButton` (play/pause)   props: `{ icon:'play', iconActive:'pause', active, size:'md', info }`   slot: `.mpi-video-player__play-pause-wrapper`
- `MpiProgressBar` (seek slider)   props: `{ min:0, max:1000, step:1, value:0, info, variant:'primary' }`   slot: `.mpi-video-player__slider-wrapper`
- `MpiVolumeControl`   props: `{ volume, muted }`   slot: `.mpi-video-player__volume-wrapper`

---

## MpiHistoryTools.js (internal mounts)

Builds its own tool list from `mode: 'image'|'video'` prop. All tools — flat or grouped — render as `MpiButton`. Multi-item groups stack their sub-tools as flat buttons directly under the group label (no popup, no portal). New tools added to a group auto-stack.

- `MpiButton` (every tool)   props: `{ icon, size:'sm', variant:'ghost', info, toggleable:false, active, disabled, extraClasses:'mpi-ibtn--rail' }`   slot: per-button wrapper div appended to the group's `__slot` — wrapper required because `ComponentFactory.mount` writes `container.innerHTML` and would clobber siblings otherwise. `toggleable:false` enforces radio behaviour (re-click = no-op)

**Image mode tools:** `prompt`, `crop`, `mask`
**Video mode tools:** `prompt`, `crop`, `videoUpscale`, `interpolate`

**Instance API (on `el`):**
- `setMode(mode)` — activate programmatically; emits `activate { mode }`; re-activating current = no-op
- `setDisabled(map)` — bulk update `{ [toolMode]: { disabled, reason? } }`; accepts top-level and sub-modes
- `getActiveMode()` — read current mode
## Gallery Preview Lifecycle

`MpiGalleryGrid.updatePreview(tempId, url)` must keep the generating spinner visible until the preview image's own `load` event fires. Do not hide the spinner immediately after assigning `img.src`; WAN/video workflows can emit early preview URLs while models are still loading.
