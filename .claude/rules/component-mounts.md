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
- `MpiAddToProject`   props: `{ projects: [{id,name}], onConfirm(projectId) }`   slot: `document.createElement('div')` — mounted on demand on `grid 'add-to-project'` event; dropdown picks a target project, `onConfirm` POSTs `/project-media/:id/add-from-cards` to copy the selected cards
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event

> **Note:** `MpiModelManager` is NOT mounted here — it is a slide-over content component opened via `slide-over:open`. `MpiGalleryBlock` emits `Events.emit('models:open')` which shell re-emits as `slide-over:open { title: 'Models', component: MpiModelManager }`. PromptBox mounts only when `s_installedModelIds.length > 0`; post-install mount is keyed off `state:changed (s_installedModelIds)`, not a `models:closed` event.
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
    imageUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
    resize:       MpiToolOptionsResize,
    resizeVideo:  MpiToolOptionsResize,
};
```

> `MpiToolOptionsUpscale` is shared by both image (`imageUpscale`) and video (`videoUpscale`). Block passes `kind: modeKind` ('image'|'video'). Organism keys persistence as `toolSettings.imageUpscale` / `toolSettings.videoUpscale` and only calls `viewer.el.enter/exitUpscaleMode()` for video (image canvas has no upscale overlay).

**Both group types:**
- `MpiHistoryTools`   props: `{ mode: 'image'|'video' }` — builds own tool list from `mode` prop   slot: `#left-slot`
- `MpiHistoryList`   props: `{ history, selectedIndex, isVideo }` — ctrl/shift/right-click selection   slot: `#right-bottom-slot`
- `MpiMediaDropOverlay`   props: `{ onDrop({ files: [{ file, mediaType }, ...] }) }` callback   slot: `document.createElement('div')` appended to `el` — loops files: uploads each, calls `_pb.el.injectMedia()` per file (no history card created). Suppressed while video prompt mode is active so start/end-frame slot drops keep local targeting.
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; shown on `promptBox 'settings'` event
- *(no model manager here — MpiModelManager is a slide-over content component, not mounted by MpiGroupHistoryBlock)*

**Image groups** (`_group.type !== 'video'`):
- `MpiCanvasViewer`   props: `{ initialImageUrl, initialIdx, initialItem, groupId }`   slot: `#centre-slot` — handles crop/mask viewer modes internally; does NOT own any bars. `initialItem` (full HistoryItem) + `groupId` are required for layered-mask TEMP persistence (key = `<projectId>/<groupId>/<itemId>`); omitting them disables persistence silently.
- Tool options in `#right-top-slot`: `MpiToolOptionsCrop`, `MpiToolOptionsMask`, `MpiToolOptionsResize`, `MpiToolOptionsUpscale` (`kind:'image'`)
- `MpiPromptBox` (Organism) into `#prompt-box-mount` — only when `_hasPromptOps()` true (active model exposes ≥1 enabled prompt op); Block keeps handle in `_pb`

**Video groups** (`_group.type === 'video'`):
- `MpiVideoViewer`   props: `{ fps }`   slot: `#centre-slot`
- `MpiVideoControlBar`   props: `{ fps, showTrim: true }`   slot: `#controls-slot` (Block-owned, full-width row spanning all 3 grid columns below the viewer). Wired to viewer via `viewer.el.attachControlBar(controlBarInstance)` (which internally calls `controlBar.el.attachSurface(viewerSurfaceInstance)`). Block listens to `controlBar.on('range-change')` for trim persistence (debounced 250ms POST to `/project-media/.../update-meta`).
- Tool options in `#right-top-slot`: `MpiToolOptionsCrop`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`, `MpiToolOptionsPrompt` (prompt mode, video + frame-ops-capable model: `_modelHasFrameOps()` — any `i2v*`/`v2v*` op)
- `MpiPromptBox` (Organism) into `#prompt-box-mount` — gated by `_shouldShowPromptBox() = _hasPromptOps() || _modelHasFrameOps()`. `_modelHasFrameOps()` matches any `supportedOps` starting with `i2v` or `v2v`. Frame-ops capability bypass keeps PromptBox visible BEFORE any chip lands so the user can drop a start/end-frame image (or input video) from outside; the existing media-change listener unlocks the op as soon as a chip is staged. Block keeps handle in `_pb`.

> **Video-history workspace gates:**
> - `#right-top-slot` visibility under `--prompt-active` is `:empty`-scoped — slot stays visible whenever a child mounts. Image-history prompt mode keeps slot empty + hidden.
> - `_applyPreview` in MpiGroupHistoryBlock short-circuits for `isVideo`. Latent previews are PNGs and cannot load into `<video>`; viewer stays on the previously-loaded video so the user can queue parallel ops. Mascot + StatusBar still drive feedback.

---

## MpiToolOptions* (Organisms — js/components/Organisms/MpiToolOptions<Name>/)

Five self-contained tool-options compounds. Each mounts into `#right-top-slot` via the Block mediator. No bars inside viewers.

**Pattern:** `setup` enters viewer mode → owns controls → `destroy` evaluates mask + exits viewer mode. No apply buttons on mask panel (PromptBox drives ops). No cancel buttons.

- `MpiToolOptionsCrop`   props: `{ viewer, kind: 'image'|'video' }`   — family `MpiDropdown` (SDXL/FLUX/SOCIAL/FREE) + orientation `MpiRadioGroup` (icon-only, sdxl/flux only) + ratio `MpiRadioGroup` (icon-only, hidden for FREE) + apply (image) / snapshot+save (video) buttons. Pushes ratio to `viewer.el.setCropRatio(ratio|null)` — `null` = FREE (no aspect lock). Emits `apply { kind: 'image'|'video-save'|'video-snapshot' }`. Crop drag honors Shift modifier (scales from rect center) via `Hotkeys.register('shift', …)` inside `CropManager`/`cropTool`.
- `MpiToolOptionsMask`   props: `{ viewer }`   — unified panel: detection-model `MpiDropdown` + box/segment `MpiRadioGroup` + `MpiAutoMaskThumbs` strip + Detect button + brush/eraser `MpiButton` toggles + invert + clear. No `apply` emitted. Hotkeys B/E registered while mounted. `destroy` calls `viewer.el.evaluateMask()` then `exitMode()`. Auto-detect composites picked thumbs ONTO existing mask (`compositeMaskDataURL`); Detect button does NOT clear existing paint.
- `MpiToolOptionsResize` props: `{ viewer, kind: 'image'|'video', currentItem? }` — width/height `MpiInput`, method/proportion/crop-position `MpiDropdown`, `MpiColorPicker` for pad color, divisible-by `MpiInput`, flip/rotation `MpiRadioGroup`, inline preview `<img>` slot, Apply `MpiButton`. Live preview runs the **image** `resize` workflow on a 512px-longest-edge thumbnail extracted from `viewer.el.getSourceElement()` (HTMLImageElement or HTMLVideoElement), with `width`/`height`/`divisible_by` proportionally scaled to thumb space. Result paints into the inline preview slot — viewer is never touched. Apply appends a new full-resolution entry via `startGeneration` (`resize` for image, `resizeVideo` for video); preserves the source. Persists controls under `project.toolSettings.resize` via `settings:tool:update`.
- `MpiToolOptionsUpscale`   props: `{ viewer, onApply }`   — `MpiOptionSelector` (factor) + `MpiDropdown` (model) + run. Emits `apply { factor, model }`.
- `MpiToolOptionsInterpolate`   props: `{ viewer, onApply }`   — `MpiOptionSelector` (multiplier) + run. Emits `apply { multiplier }`.
- `MpiToolOptionsPrompt`   props: `{ promptBox, project }`   — video-history-only toolbar. Two frame thumbs (Start / End) with role-tagged drop targets + swap button + clear-slot `x` + two action `MpiButton`s (Extend, Create new). Subscribes to PromptBox `media-change` to mirror chips by role via `promptBox.el.getMediaByRole(role)`. Drop on thumb → uploads with operation `frame-drop` → `promptBox.el.injectMedia({ url, mediaType: 'image', role })`; right-click frame capture uses operation `frame-capture`. Both staging operations are excluded from landing recent thumbnails. Swap fires `promptBox.el.swapMediaRoles('startFrame', 'endFrame')`. `x` fires `promptBox.el.removeMediaByRole(role)`. Buttons emit `prompt-box-tools:extend` / `prompt-box-tools:create-new` on the Events bus. Single listener lives in MpiGroupHistoryBlock — do NOT pre-wire elsewhere. Thumb sizing is CSS-only (`max-height` + `object-fit: contain`); no aspect-ratio prop or JS measurement.

---

## MpiVideoViewer (Organism — js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js)

Wraps a `MpiVideoSurface` + crop overlay canvas + `MpiViewerCorners` chip strip. Mounted by `MpiGroupHistoryBlock` for video groups. Tool bars are owned by `MpiToolOptions*` compounds — NOT by the viewer. **Control bar is NOT internal**: the parent Block mounts `MpiVideoControlBar` in its own `#controls-slot` and wires it via `viewer.el.attachControlBar(instance)`. This lets the bar span the full app window and lets non-video surfaces reuse the bar (e.g. audio-only via `showTrim: false`) without dragging the viewer along.

Pan/zoom transform targets the actual `.mpi-video-surface__video` element, not `.mpi-video-viewer__player`, for cross-platform hardware-video compositor compatibility. Wheel zoom works while video tools are selected; crop mode blocks left-drag pan only so crop-handle dragging remains unambiguous.

- `MpiVideoSurface`     props: `{ fps }`   slot: `[data-mount="surface"]` inside viewer stage
- `MpiViewerCorners`    no props          slot: `#corners-mount` inside viewer stage

**Instance API (on `el`):** `attachControlBar(instance)` / `detachControlBar()`, `getSurfaceInstance()`, `loadVideo(url, meta)` — `meta.fps`/`meta.frameCount`/`meta.trim` proxied to the attached control bar; `meta.trim = { in, out }` propagates as `setPendingTrim` (one-shot, applied on next `loadedmetadata`). Plus `enterCropMode(rect)`, `exitCropMode()`, `getCropRect()`, `setCropRatio(ratio)`, `captureSnapshot({ time })`, `getSourceElement()`, `resetView()`, `setRangeQuiet(in, out)`, `getRange()`, `setTopRight(items)`, `enterUpscaleMode()`, `exitUpscaleMode()`, `enterInterpolateMode()`, `exitInterpolateMode()`, `destroy()`.

> Control bar lifetime is owned externally — `viewer.destroy()` only `detachSurface()` on the attached bar; it does NOT destroy it.

---

## projectUI.js (landing page — mounted once at boot)

- `MpiProjectDropOverlay`   props: `{ onDrop({ folderPath, source }) }` callback   slot: `document.createElement('div')` appended to `#page-landing` — full-area OS drop target for project folders / `project.json`; shown/hidden via `#page-landing` `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); `onDrop` calls `addProjectByFolder()` then `loadProjectGrid()`. Feature-gated on `window.require` — skipped in plain-browser dev mode.
- `MpiNewProject`, `MpiOkCancel` (delete-confirm)   slot: `document.createElement('div')` — lazy singletons shown on user action; not mounted until first trigger.
- `MpiProjectCard` (one per project)   props: `{ title, date, media, ... }`   slot: `#projectGrid` children — rebuilt on every `loadProjectGrid()`. Stage redesign: rendered as a row, not a card-grid item. Per-row stats (asset count + bytes-on-disk) come from `fetchStats()` in `js/services/projectStatsService.js`; in-flight fetches are aborted via the module-local `_statsBatchAC` AbortController when the grid rebuilds, so late responses don't write into rows that no longer exist.
- **`#landingActions` slot:** plain `<a>` text links (`Settings · Hotkeys · About`) — NOT `MpiButton`s. Each click dispatches `Events.emit('slide-over:open', { title, component })` where `component` is one of `MpiSettings | MpiHotkeys | MpiAbout` (imported as content blueprints, not mounted directly). Hero version label `Cubric Studio · v${APP_VERSION}` mounts at `#heroVersion`.
- **`MpiSlideOver`**   import-side-effect at module load: `import '../components/Compounds/MpiSlideOver/MpiSlideOver.js'` registers the module-level `Events.on('slide-over:open', ...)` handler. No direct mount call. The handler mounts a fresh instance per open into `document.createElement('div')`, appended to `document.body` by `el.open()`. On close, `_doClose` destroys the content instance (MPI-177) before removing the panel node (`transitionend` + 400ms backstop).

> **MpiSettings is NOT mounted directly anymore.** It is a *content component* of `MpiSlideOver` — its body element is mounted inside `.mpi-slide-over__body` via `props.component.mount(bodyEl)` from inside `MpiSlideOver.setup()`. The legacy `el.show()/el.hide()` methods are gone. Field initialisation runs via `el.onOpen()`, which `MpiSlideOver` calls once on every open. Internal mounts inside `MpiSettings._initFields()` are unchanged:
> - `MpiCheckbox`   props: `{ checked: Storage.getAutoStartComfy(), label:'Auto-start ComfyUI on Launch' }`   slot: `#mpiSettingsAutoStartSlot`
> - `MpiInput` (ComfyUI URL)   props: `{ label:'ComfyUI API URL', placeholder:'http://localhost:8188', value }`   slot: `#mpiSettingsComfyUrlSlot`
> - `MpiInput` (ComfyUI path)   props: `{ label:'ComfyUI Models Path', placeholder:'Default (internal engine)', value }`   slot: `#mpiSettingsComfyRootPathSlot`
> - `MpiButton` (Browse)   props: `{ text:'Browse', variant:'secondary', size:'md', extraClasses:'mpi-settings__browse-btn' }`   slot: `#mpiSettingsBrowseBtnSlot`
>
> **`MpiRunpodSettings` (MPI-177):** the whole RunPod Remote Engine section is its own Compound. Mounted ONCE in `MpiSettings.setup()` (not per `onOpen`) — props: `{}`, slot: `#mpiSettingsRunpodMount`. `MpiSettings.el.onOpen()` forwards to `_runpodInst.el.onOpen()` (runs `_initRunpodSection`); `MpiSettings.el.destroy()` destroys it. Its internal mounts (RunPod toggle/key/DC/volume/GPU/connect controls) all target `#mpiSettingsRunpod*` slots inside its own template.

---

## shell.js (global singletons — mounted once at startup)

- `MpiErrorDialog`     props: none   slot: `document.createElement('div')` — shown on `ui:error` event
- `MpiChangelogDialog` props: none   slot: `document.createElement('div')` — "What's New" overlay. Shown once per `APP_VERSION` by `_maybeShowChangelog()` in `_bootApp`, AFTER engine/deps gates + dev-state restore, BEFORE optional Comfy auto-start. Skipped when `Storage.getLastSeenChangelogVersion() === APP_VERSION` or `getReleaseNotes(APP_VERSION)` has no content. Content set via `el.open({ version, stage, notes })`; internally mounts `MpiButton` (Done) + `MpiIcon` (per-section). Reads notes from `js/data/releaseNotes.js`. NOT an updater.
- `MpiStartingComfy`   props: none   slot: `document.createElement('div')` — shown on `comfy:starting`, hides on `comfy:ready`
- *(MpiModelsModal removed — model manager is now `MpiModelManager`, a slide-over content component opened via `models:open` → `slide-over:open { title: 'Models', component: MpiModelManager }`. No shell-level singleton for models.)*
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
- `MpiDropdown` (model selector)   props: `{ options: modelList mapped to { value, label, meta: model.dropdownMeta || '' }, value: model.id, info, direction:'up', extraClasses:'mpi-dropdown--model-select', wrapLabels:true }`   slot: appended to `#settings-model-slot` inside the settings popup — only when `model && modelList.length >= 1`. The metadata column is data-driven from `ModelDef.dropdownMeta`; do not infer these labels from model names in UI code.
- `MpiButton` (gear/settings)   props: `{ icon:'settings', variant:'ghost', size:'sm', info }`   slot: appended to `#bottom-left-slot` — only when `model && showSettings !== false`
- `MpiButton` (negative toggle)   props: `{ icon:'check', iconActive:'negative', info, size:'sm', variant:'primary', toggleable:true, active:isNegativeMode }`   slot: `#bottom-neg-slot` — only when `includeNegative` prop is true
- `MpiButton` (run/stop)   props: `{ icon:'play', iconActive:'stop', info, size:'md', variant:'primary', toggleable:true, active:isGenerating }`   slot: fresh div appended to `#bottom-right-slot`
- `MpiDropdown` (op dropdown)   props: `{ options: availableOps, value: activeOperation, info:'Current model operation - Also accessible by holding Tab', direction:'up' }`   slot: `#op-dropdown-slot` — refreshed on every model/context change
- `PromptBoxControl components` (e.g. `qualityTier`, `ratio`, `batch`, `duration`, `motionIntensity`, `previewStage`)   props: `{ model }`   slot: `#settings-op-slot` (inside the settings popup, not the bottom bar) — one control per operation's `components[]` array; cleared and remounted on operation change. `qualityTier` is a no-op for orientation-mode models (renders nothing) and only mounts UI for `RATIO_MODES[model.type] === 'quality'`. The mount loop wraps each `ctrl.mount()` in try/catch + `clientLogger.error` so a single failing control no longer blocks subsequent controls in the same op.
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
- `MpiFolderDrop` (one per configured folder)   props: `{ folderPath, bucket, primary, onImport }`   slot: `[data-drop="loras"]` / `[data-drop="upscale_models"]`; sourced from `GET /comfy/model-folders`; remounted per `open()` via render-token-guarded async `_renderDropZones` (guard prevents duplicate zones when the live-rerender fires mid-fetch). Also mounted in `MpiSettings` External Connections.
  - Missing-model UX: a selected LoRA/upscale absent from `state.availableLoras`/`upscaleModels` shows `mpi-dropdown--missing` (red) + a synthetic `(missing)` option. A relocated file self-heals by UNIQUE basename (path updated, persisted); ambiguous same-name across folders stays red. LoRA missing → blocking `ui:warning` at generate; upscale missing → fall back to SIAX + warn. The picker live-rerenders on `state:changed` for those keys while open.

---

## MpiFolderDrop (Primitive: model-folder drop zone — js/components/Primitives/MpiFolderDrop)

Labeled model folder that is also an OS drop target. Resolves the dropped file's
disk path via Electron `webUtils.getPathForFile` and POSTs `/comfy/import-model`
to COPY it into that folder (409 → `window.confirm` replace). `onImport(filename)`
fires after success (callers call `loadAssets()`). Drop does **preventDefault only,
NOT stopPropagation** — the gallery's window-level drop cleanup must still fire, or
its media-drop overlay sticks open. Browser dev mode (no `webUtils`) ignores drops.

---

## MpiVideoSurface.js (Compound — js/components/Compounds/MpiVideoSurface — bare surface)

Owns the bare `<video>` element + click-to-toggle-play (skipped on `[data-no-toggle]` ancestors). No internal sub-component mounts. Preserves loop-disable/seeked-restore dance + frame-step wrap-on-loop semantics. Frame-step works in integer frame space (`round(t * fps)`) — float comparisons at range edges drift by a frame.

**Instance API (on `el`):** `_setSrc`, `_play`, `_pause`, `seek(seconds)`, `frameStep(direction, range?)` (`range = { rangeIn, rangeOut, loop }` — when present, wraps at range edges; `loop` is required when caller has disabled native `video.loop` for range emulation), `getVideoElement`, `_setFps`, `_setFrameCount`, `getFps`, `getFrameCount`, `_setVolume`, `_setMuted`, `destroy`. Emits component-local `play/pause/ended/timeupdate/loadedmetadata/volumechange`.

---

## MpiVideoControlBar.js (Compound — js/components/Compounds/MpiVideoControlBar — transport + trim)

Owns play/frame±/loop/audio/fullscreen/frames-toggle buttons + time display + (optional) embedded `MpiTrimBar`. Drives a sibling `MpiVideoSurface` via `attachSurface(instance)`. Owns the 6 video hotkeys + 3 trim hotkeys (trim hotkeys only when `showTrim` is true). Hotkeys are bound on `attachSurface`, unbound on `detachSurface`/`destroy`. Loop intent is tracked separately from `video.loop`: when the active range is a strict subset of the clip, native `video.loop` is forced off and the loop is emulated via `timeupdate` (`seek(_in)` at `_out` if loop on; `_pause()` otherwise). Range-loop emulation gates on `!video.paused` so frame-step (which pauses first) is not re-routed.

**Layout:** single horizontal row, `[left buttons + time] [trim flex:1] [right buttons]`. Mounted full-width by the parent Block (see `#controls-slot` mount above); not embedded inside the viewer.

**Props:**
- `fps` (number, default 24)
- `showTrim` (boolean, default `true`) — when `false`, no `MpiTrimBar` mount; trim hotkeys/range API become no-ops; `getRange()`/`getValue()` return `null`. Use for audio-only or trim-less surfaces.

- `MpiButton` (play, frame-back, frame-forward, frames-toggle, loop, mute, fullscreen) — slots `[data-mount="play|frame-back|frame-forward|frames-toggle|loop|mute|fullscreen"]`
- `MpiProgressBar` (volume) — slot `[data-mount="volume"]`
- `MpiTrimBar` — slot `[data-mount="trim"]` (only when `showTrim`; props: `{ duration: 0, fps, value: 0, inPoint: 0, outPoint: 0 }`; updated via `setDuration`/`setRangeQuiet` on surface `loadedmetadata`)

**Instance API (on `el`):** `attachSurface(instance)`, `detachSurface()`, `setRange(Quiet)`, `getRange`, `getValue`, `setVolume`, `setMuted`, `setFrameCount`, `setFps`, `setPendingTrim(in, out)` (one-shot for next `loadedmetadata`; no-op when `showTrim: false`), `destroy`. Emits `loop-change`, `range-change`.

---

## MpiTrimBar.js (Compound — js/components/Compounds/MpiTrimBar — two-handle trim seek bar)

Self-contained 28px track + two trim handles (in/out, ±8px overflow w/ 10×3 caps) + 2px playhead w/ triangle arrow + 12% heat selection fill. Stage tokens only. No internal sub-component mounts. Pointer drag coalesces on RAF; commits on `pointerup`. Track click drags playhead from cursor.

**Instance API (on `el`):** `setDuration`, `setFps`, `setValue(Quiet)`, `setRange(Quiet)`, `getValue`, `getRange`, `destroy`. Emits component-local `seek`, `in-change`, `out-change`, `range-change`.

---

## MpiHistoryTools.js (internal mounts)

Builds its own tool list from `mode: 'image'|'video'` prop. All tools — flat or grouped — render as `MpiButton`. Multi-item groups stack their sub-tools as flat buttons directly under the group label (no popup, no portal). New tools added to a group auto-stack.

- `MpiButton` (every tool)   props: `{ icon, size:'sm', variant:'ghost', info, toggleable:false, active, disabled, extraClasses:'mpi-ibtn--rail' }`   slot: per-button wrapper div appended to the group's `__slot` — wrapper required because `ComponentFactory.mount` writes `container.innerHTML` and would clobber siblings otherwise. `toggleable:false` enforces radio behaviour (re-click = no-op)

**Image mode tools:** `prompt`, `crop`, `resize`, `imageUpscale`, `mask`
**Video mode tools:** `prompt`, `crop`, `resizeVideo`, `videoUpscale`, `interpolate`

**Instance API (on `el`):**
- `setMode(mode)` — activate programmatically; emits `activate { mode }`; re-activating current = no-op
- `setDisabled(map)` — bulk update `{ [toolMode]: { disabled, reason? } }`; accepts top-level and sub-modes
- `getActiveMode()` — read current mode
## Gallery Preview Lifecycle

`MpiGalleryGrid.updatePreview(tempId, url)` must keep the generating spinner visible until the preview image's own `load` event fires. Do not hide the spinner immediately after assigning `img.src`; WAN/video workflows can emit early preview URLs while models are still loading.
