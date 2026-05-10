## Sub-Agent Briefing
> Use this file when you need to know what events a component emits or listens to.

---

## Primitives

### MpiButton
EMITS:   `toggle` `{ active: boolean }` — only in icon-button toggleable mode
         `click`  `{ originalEvent: Event, active: boolean }`
LISTENS: (none — pure DOM events only)
API:     `el.setActive(active)` · `el.setLabel(label)` · `el.setDisabled(disabled)`
NOTE:    Stage redesign added `shape: 'sharp' | 'pill'` prop (default `'sharp'`, applies `--r-1: 0`); pass `shape: 'pill'` to opt into the legacy rounded look. Icon-button variant supports `'ghost'` (transparent, hover lifts) in addition to `secondary`/`danger`.
         External callers MUST use `el.setActive(bool)` / `el.setDisabled(bool)` to mutate state — the click handler reads `props.active` / `props.disabled` and toggling the DOM attributes alone leaves `props.*` stale, causing clicks to silently bail.

### MpiCanvas
EMITS:   `modechange` `{ mode: 'none'|'mask'|'crop'|'compare' }`
LISTENS: (none)

### MpiCheckbox
EMITS:   `change` `{ checked: boolean }`
LISTENS: (none)
API:     `el.isChecked()` → boolean · `el.setChecked(bool)` — imperative sync

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
EMITS:   (none — dumb primitive; calls `props.onDrop({ files: [{ file, mediaType }, ...] })` once per drop with all valid image/video files; all side effects in caller)
LISTENS: `ui:close-all-popups` — hides overlay (Escape during drag)
NOTE:    Accepts any image/video OS file drag (multi-file supported). Ignores internal `application/mpi-media` drags. Replaced `MpiGalleryDropOverlay`.

### MpiProjectDropOverlay
EMITS:   (none — dumb primitive; calls `props.onDrop({ folderPath, source })` on valid drop; all side effects in caller)
LISTENS: `ui:close-all-popups` — hides overlay
NOTE:    Accepts a project folder OR a project.json file. Resolves absolute path via Electron `webUtils.getPathForFile`; no-op when `window.require` is absent (browser dev mode). Used by landing page (projectUI.js) — `onDrop` calls `addProjectByFolder()` then reloads the grid.

### MpiProgressBar
EMITS:   `input`  `{ value: number }`
         `change` `{ value: number }`
LISTENS: (none)

### MpiRadialMenu
EMITS:   `select`    `{ action: string }`
         `will-open` `{}` (fires BEFORE items render; listeners can call `setContextItems()` synchronously to refresh availability)
         `open`      `{}`
         `close`     `{}`
LISTENS: Hotkeys 'tab' (open/close toggle), window keyup/mousemove (close on release — intentional exception for radial menu gesture)
NOTE:    Single-item context auto-activates (full-circle cone, no movement needed).

### MpiRadioGroup
EMITS:   `select` `{ value: string, option: object|string }`
LISTENS: (none)
NOTE:    Options accept `string` or `{ label, value, icon?, info?, disabled? }`. Props: `iconOnly` (bool) hides labels and renders icon-only buttons; per-option `info` overrides group `info` for status-bar text.

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

### MpiContextMenu
EMITS:   (none — calls `props.onSelect(key)` callback then self-closes)
LISTENS: `ui:close-all-popups` — self-close
API:     Static `MpiContextMenu.show({ x, y, items, onSelect })` — portals to body, clamps to viewport, dismisses on outside-click / Escape
NOTE:    `items` shape: `[{ key, icon?, label, kbd?, separator?, disabled?, danger? }]`. Stage redesign: `kbd` renders right-aligned keyboard hint (3-column grid layout); `separator: true` renders a divider line and ignores other fields.

### MpiHistoryList
EMITS:   `entry-selected`    `{ idx, item }` — card clicked (single-select)
         `selection-changed` `{ indices: number[], anchor: number }` — ctrl/shift/right-click updated selection
         `selection-exited`  `{}` — selection mode ended (count → 0)
         `delete-selected`   `{ indices: number[] }` — Delete chosen from context menu
         `compare-requested` `{ indices: [number, number] }` — Compare chosen from context menu (exactly 2 selected)
LISTENS: (none)
API:     `el.setActiveIndex(idx)` · `el.setGroups(history)` · `el.appendEntry(item)` · `el.removeEntries(indices)` · `el.exitSelectMode()`
NOTE:    Selection: plain-click single-selects; ctrl/cmd-click first-time seeds anchor+selection from current active entry then toggles clicked; shift-click range-selects. Right-click on unselected entry replaces selection. Dev-mode gate: if `APP_CONFIG.dev_mode` truthy, skips `e.preventDefault()` on contextmenu so Electron inspect-element works.

### MpiHistoryTools
EMITS:   `activate` `{ mode: string }` — any mode change (user click or `setMode`). No `deactivate` event.
LISTENS: (none)
API:     `el.setMode(mode)` — activate programmatically; re-activating current = no-op; emits `activate`
         `el.setDisabled(map)` — bulk update `{ [toolMode]: { disabled: bool, reason?: string } }`; sub-modes accepted
         `el.getActiveMode()` — read current mode
NOTE:    Radio behaviour: re-click active tool = no-op. `mask` is now a flat tool (no group/sub-modes). `disabled` tools render grayed, non-interactive, show `reason` as tooltip.

### MpiNumberSelector
EMITS:   `change`       `{ value: string }` — user picked a new value
         `popup_toggle` `{ active: boolean }` — popup opened/closed
LISTENS: `ui:close-all-popups` — closes popup if open
API:     `instance.el.getValue()` → current string · `instance.el.setValue(string)` → imperatively set + re-render
NOTE:    Generic replacement for MpiBatchSelector. Props: `values: string[]`, `value`, `icon`, `popupTitle`, `info`. Portals popup to body manually (MpiPopup.template() used as raw HTML, no setup() runs). Used by PromptBoxControls `batch` entry.

### MpiOptionSelector
EMITS:   `change` `{ value: string, def?: object }` — user picked a value (all variants)
         `popup_toggle` `{ active: boolean }` — popup opened/closed
LISTENS: `ui:close-all-popups` — closes popup if open
API:     `el.getValue()` · `el.setValue(v)` · `el.setTriggerIcon(icon)` · `el.setTriggerActive(bool)` · `el.setButtons(buttons)` · `el.getButtons()`
NOTE:    Three variants — `ratio`: preset ratio picker (renders `.ratio-row` + `.ratio-pick.r-X-Y` Stage selectors inside the popup, not generic MpiButton items); `number`: value list (replaces MpiNumberSelector inline); `buttons`: generic button-list popup. All share: trigger button, portal popup, outside-click dismiss, viewport clamp, `ui:close-all-popups` self-close.
         Delegated `popupEl` click handlers call `e.stopPropagation()` first — sub-popup interactions never bubble to document-level listeners. Required because handlers rewrite `grid.innerHTML` / `trigger.innerHTML` synchronously; without it, `e.target` detaches mid-bubble and breaks parent popup `closest('.mpi-popup')` exclusion → parent closes incorrectly.
         Ratio quality controls are embedded with `MpiRadioGroup.template()` only; `MpiRadioGroup.setup()` does not run there. `MpiOptionSelector` owns delegated clicks on `#speed-radio-slot .mpi-radio-group__btn`, emits `quality_change`, and refreshes the active button state.

### MpiSlideOver  *(Stage redesign — replaces full-page modal pattern for landing actions)*
EMITS:   `close` `{}` — panel dismissed (close button, outside-click, or `ui:close-all-popups`)
LISTENS: `ui:close-all-popups` — closes
         (module-level) `slide-over:open` `{ title, component }` — mounts a fresh instance into a fresh `<div>`, calls `el.open()`, registers `close` → singleton clear. Opening a second slide-over closes the first.
API:     `el.open()` — append to `document.body`, force reflow, set `aria-expanded="true"` (slide-in)
         `el.close()` — set `aria-expanded="false"`, await transitionend, remove from DOM, emit `close`
NOTE:    Owns chrome only (header with UPPERCASE title + close button, scrollable body, optional footer). Content is supplied via `props.component` — a ComponentFactory blueprint mounted into `.mpi-slide-over__body`. Calls `_contentInstance.el.onOpen?.()` after mount so content can re-init fields. Module-level `let _active = null;` enforces the singleton. Outside-click is registered on `document` with a `setTimeout(..., 0)` so the triggering click does not immediately close.

### MpiSettings *(content-only — body of MpiSlideOver)*
EMITS:   (none — chrome owned by MpiSlideOver; no `close` event from this component)
LISTENS: (none)
API:     `el.onOpen()` — re-runs `_initFields()` with current values from `Storage` / `state`. Called by `MpiSlideOver.setup()` once per open.
NOTE:    Trigger via `Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings })`. The legacy `el.show()/el.hide()` instance methods have been removed.

### MpiHelp *(content-only — body of MpiSlideOver)*
EMITS:   (none)
LISTENS: (none)
NOTE:    Static hand-authored HTML. Trigger via `Events.emit('slide-over:open', { title: 'Help', component: MpiHelp })`. Hotkey rows still hand-authored — see `docs/shell.md` and `components.md` for the registry/help-page pairing rule.

### MpiAbout *(content-only — body of MpiSlideOver)*
EMITS:   (none)
LISTENS: (none)
NOTE:    Trigger via `Events.emit('slide-over:open', { title: 'About', component: MpiAbout })`.

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
FLAG:    Uses `Hotkeys.bind('memoryMonitor.ctrl.down/up', fn)` for Ctrl visual feedback.

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

### MpiBatchSelector
EMITS:   `change`        `{ value: 1|2|3|4 }` — batch size pick
         `popup_toggle`  `{ active: boolean }`
LISTENS: `ui:close-all-popups` — closes popup if open
API:     `instance.el.getValue()` → `1|2|3|4`
NOTE:    Mounted via PromptBoxControls `batch` for ops with `components: ['batch']`.
         Persists as `modelSettings[modelId].batch` via `settings:model:update`.
         Injects workflow param `Batch_Size` (ComfyUI node title "Batch_Size", MpiInt.inputs.int).
         N outputs → N cards in gallery; N placeholders shown from generation start.

### MpiStartingComfy
EMITS:   (none)
LISTENS: (none — direct portal, bypasses Overlays queue intentionally)

### MpiStyleConfig
EMITS:   `change` `{ values: Object }` — keys: color_grade, color_contrast, color_sat, color_sharp
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

## Organisms

### MpiVideoPlayer
EMITS:   `play`        `{ time: number }`
         `pause`       `{ time: number }`
         `ended`       `{ time: number }`
         `timeupdate`  `{ time: number, duration: number }`
         `change`      `{ volume: number, muted: boolean }`
         `loop-change` `{ loop: boolean }`
LISTENS: (none)
NOTE:    Compound (lives at `js/components/Compounds/MpiVideoPlayer/`). Imports only Primitives (`MpiButton`, `MpiProgressBar`). Volume control inlined. Loop + fullscreen + frame-step buttons included.

### MpiVideoViewer (Organism — js/components/Organisms/MpiVideoViewer/)
EMITS:   `play`, `pause`, `ended`, `timeupdate`, `change`, `loop-change` — forwarded from MpiVideoPlayer
         `crop-change`  `{ rect: { x, y, w, h } }` — crop rect updated (normalized 0–1)
LISTENS: (none — tool bars are owned by MpiGroupHistoryBlock, not viewer)
NOTE:    Viewer owns display + crop overlay state only. Bar action events (`crop-save-snapshot`,
         `crop-save-video`, `upscale-run`, etc.) now emitted by Block-owned MpiToolActionBars.

### MpiCanvasViewer (Organism — js/components/Organisms/MpiCanvasViewer/)
EMITS:   `mode-changed`  `{ mode }` — tool mode changed (from any source)
         `crop-applied`  `{ item }` — crop completed; item is the new HistoryItem
         `mask-ready`    `{ hasMask }` — mask painted or cleared
         `entry-loaded`  `{ idx, hasMask }` — image loaded for index
         `brush-changed` `{ type: 'brush'|'eraser' }` — brush type changed via hotkey
LISTENS: (none — all wiring done by parent MpiGroupHistoryBlock via `on()`)
API:     `compositeMaskDataURL(dataUrl)` — OR incoming mask onto existing canvas mask (no clear). Used by auto-detect thumb-pick flow.
         `setAutoMaskModel/setAutoMaskUseBox` — reset thumbs+picks only; do NOT clear existing paint.
         `runAutoMaskDetect` — reset thumbs+picks, run detection; do NOT clear existing paint.

### MpiToolOptionsMask (Organism — js/components/Organisms/MpiToolOptionsMask/)
EMITS:   (none)
LISTENS: (none — Hotkeys.bind 'mask.brush.toolbar'/'mask.eraser.toolbar' while mounted; unbound in destroy)
NOTE:    Unified auto+manual mask panel. No apply button. Mask is canvas-resident; PromptBox drives ops. Auto picks composite onto manual paint via `compositeMaskDataURL`. destroy() calls `evaluateMask()` then `exitMode()`.

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
         `preview:continue`     `{ group: ItemGroup, item: MediaItem }` — Continue button on preview-stage card; Block enqueues a final-pass run via `enqueueGeneration` with `previewOnly: false` + `replaceItemId: item.id`
         `preview:discard`      `{ group: ItemGroup, item: MediaItem }` — Discard button on preview-stage card; Block confirms then deletes media + sidecar and removes the group
         `preview:pop-continue` `{ group: ItemGroup, item: MediaItem }` — Cancel button on a queued-Continue card; Block calls `removeCueJob` to drop the matching pending job and revert the card to preview state
LISTENS: (none — internal MpiButton tab events handled internally)
NOTE:    Tab buttons (order/filter) write directly to `state.gallerySort`; active-state sync via `_syncTabActive()` on `state:changed`. Card selection: ctrl/cmd-click toggles, shift-click range-selects, right-click opens `MpiContextMenu`. No `MpiSelectionBar` or `MpiCheckbox`.

### MpiPromptBox
EMITS:   `input`            `{ positive: string, negative: string, activeMode: 'positive'|'negative' }`
         `copy`             `{ text: string }`
         `mode-change`      `{ mode: 'positive'|'negative' }`
         `media-change`     `{ imageCount: number, videoCount: number, items: MediaItem[] }`
         `media-imported`   `{ url: string, filename: string, mediaType: string, source: 'file' }` — also emitted on EventBus as `media:imported`
         `run`              `{ operation: string, positive: string, negative: string, mediaItems: MediaItem[], injectionParams: Object }`
         `cancel`           `{}`
         `queue-clear`      `{}`
         `model-change`     `{ model: ModelDef }`
         `operation-change` `{ operation: string }`
         `settings`         `{ model: ModelDef }`
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:model:select` `{ modelId }` — on model dropdown change (ensures modelSettings key exists)
         `settings:model:update` `{ modelId, key, value }` — from PromptBoxControls ratio/orientation/quality handlers (not generation mode)
LISTENS: `workspace:inject-prompts` `{ positive, negative }` — sets textarea values
         `promptbox:generation-end` — clears generating state
         `state:changed` — updates Cue button label on `generationQueueCount` change; re-renders Cue/Loop label on `loopArmed` change
         Hotkeys `generation.run` (Ctrl+Enter) cue, `generation.stop` (Ctrl+Alt+Enter) stop, `generation.loop` (Ctrl+L) toggle `state.loopArmed` — all bound in setup
         (NOT `workspace:set-operation` — parent block validates op + calls `el.setOperation()`)
API:     `el.getRunPayload()` returns the current live run payload. Loop re-fire reads it via `getNextGeneration` callback so prompt/model/control changes apply to the next iteration.
         `el.setModel(model)` / `el.setModelList(list)` auto-pick `activeOperation` for current media context (image/video counts) and emit `operation-change` when the picked op differs. Block-side `model-change` listeners must NOT force-reset op to `model.supportedOps[0]` — only override when current op is unsupported by the new model.
         `el.injectMedia({ url, mediaType })` adds one item to the strip (overflow evicts oldest of same type). Bulk callers should query `el.remainingCapacity(mediaType)` first and inject only that many — exceeding capacity silently evicts earlier items, which is rarely what bulk drops want.
GESTURE: Cue button — tap = enqueue 1 job. Hold ≥700ms = arm loop (color sweep fills button left→right; suppresses trailing click). Tap while armed = disarm. Hold while armed = no-op.

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
Owns the Gallery workspace. Mounts MpiGalleryGrid, MpiMediaDropOverlay, and handles generation lifecycle. No MpiSelectionBar.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `models:closed` — remounts PromptBox if needed
         `state:changed` (`s_installedModelIds`) — emits `models:open` if no image models
         `media:imported` `{ url, filename, itemId, mediaType }` — creates ItemGroup from OS-dropped file; registered unconditionally (not gated by PromptBox presence)
         `generation:started` `{ id, scope, tempId, placeholderGroup, extraTempIds, extraPlaceholders, replaceItemId }` — seeds `_myGenIds`; in Queue mode only the first running generation's placeholders are visible. Block uses `replaceItemId` to flip queued-Continue cards from "Queued…" → "Generating final…"
         `generation:preview` `{ id, url }` — updates preview only for the first running visible placeholder set
         `generation:complete` `{ id, item, group, tempId, extraTempIds }` — removes all N placeholders, `setGroups` from state
         `generation:error` `{ id, tempId, extraTempIds }` — removes all N placeholders, restores group list
         `generation:cancelled` `{ id, tempId, extraTempIds }` — removes all N placeholders, restores group list
EMITS:   `tool:running`   `{ tool: 'groupHistory', type: string }` — fired on generation start
         `tool:idle`      `{ tool: 'groupHistory', type: string }` — fired on generation success
         `tool:cancelled` `{ tool: 'groupHistory' }` — fired on user cancel, error, or empty result
         `models:open` — when zero image models installed
         `gallery:item-updated` `{ groupId, item, group }` — fired by `generationService` after a `replaceItemId` run mutates an existing history slot (preview → final). Block listens and refreshes the matching card via `grid.el.refreshGroup(group)`; clears any continuing-state flag.
         `gallery:item-removed` `{ groupId, itemId }` — fired by Block after a `preview:discard` confirms and deletes the sidecar + media file
NOTE:    Reads `state.s_selectedModelIdByType` (via `resolveActiveModel('image')`), `state.currentProject`; writes selected model via `setSelectedModelId(model.mediaType, id)` (in `js/utils/modelHelpers.js`), `state.currentProject`. NEVER writes at mount time.
         On mount: rehydrates from `activeGenerations.listFor('gallery', null)` — placeholder card shown immediately with cached preview
         Cancel targets the first running gallery entry. Clear calls `clearPendingQueue()`.
         commandExecutor emits tool:loading-model and tool:sampling-start during generation (see below)
         Window-level drag listeners (`dragenter`/`dragleave`/`dragover`/`drop`) managed here; removed in `destroy()`
         Continue (`preview:continue`) enqueues a final-pass job via `enqueueGeneration` (rides the in-app Cue queue, single-dispatch). Block tracks `_queuedContinueGroupIds` (Map: groupId→itemId, "Queued…" badge) and `_continuingGroupIds` (Set, "Generating final…" badge); flips queued→continuing on `generation:started` by matching `replaceItemId`. PromptBox shows generating while either set is non-empty. On Continue, Block also auto-syncs PB model + op to the preview's (`item.modelId` / `item.operation`) when mismatched. `preview:pop-continue` calls `removeCueJob(job => job.config.replaceItemId === item.id)`; the cleared job's `onCancel` reverts the card. Cue Clear and per-job cancellation both fire `onCancel` chains, so card markers stay coherent.

---

## Active Generation Registry (`js/services/activeGenerations.js`)

Session-scoped singleton. Survives navigation. Keyed by uuid; multi-entry (batch-ready).

**Purpose:** keeps exec handles, preview blob URLs, and placeholder group descriptors alive across page navigation so blocks can rehydrate on mount.

**Events emitted (via Events bus):**
| Event | Payload | When |
|---|---|---|
| `generation:started` | `{ id, scope, groupId, tempId, placeholderGroup, extraTempIds, extraPlaceholders, replaceItemId }` | `activeGenerations.start()` called |
| `generation:preview` | `{ id, url }` | `activeGenerations.setPreview()` — preview broadcast to all N placeholders (same latent, ComfyUI emits one) |
| `generation:complete` | `{ id, item, group, tempId?, extraTempIds? }` | `generationService` emits after project mutation + `end()` |
| `generation:error` | `{ id, tempId?, extraTempIds? }` | `generationService` emits after `end()` |
| `generation:cancelled` | `{ id, tempId?, extraTempIds? }` | `generationService` or `activeGenerations.cancel()` emits after `end()` |

**API:** `start({ scope, groupId, tempId, operation, modelId, placeholderGroup, extraTempIds, extraPlaceholders, exec })` → `{ id }` · `get(id)` · `list()` · `listFor(scope, groupId|null)` · `setPreview(id, url)` · `setPromptId(id, promptId)` · `end(id, { revokePreview })` · `cancel(id)` · `cancelAll()`

**Batch semantics:** `extraTempIds` + `extraPlaceholders` describe N-1 sibling placeholder cards for a batch > 1. Gallery renders all N up front, broadcasts preview to all, removes all on complete/error/cancelled, then `setGroups()` with the N real groups already in `state.currentProject.itemGroups` (generationService calls `addGroup` N times before emit).

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
- Emits `tool:sampling-start` only when sampling/generation actually begins. Do not treat node execution alone as sampling; some sampler/upscale nodes report a model-initialization phase first.
- For ComfyUI terminal phases, `/comfy/events/stream` bridges `Model Initializing ...` to `tool:loading-model` and `Model Initialization complete!` to `tool:sampling-start`.
- Both events carry `{ tool: 'groupHistory' }` payload

**StatusBar (js/shell/statusBar.js)**
- Listens to `tool:running` → prepares active state without starting elapsed timer
- Listens to `tool:loading-model` → calls `updateLabel('Loading model...')`
- Listens to `tool:sampling-start` → calls `updateLabel('Generating...')` and starts elapsed timer
- Listens to `tool:cancelled` → calls `cancel()`
- Listens to `tool:idle` → calls `complete('Generation finished')` (fires success toast)
- Listens to `state.generationQueueCount` → appends pending Cue depth to the active label only, e.g. `GENERATING (2 queued)`

**Pattern notes:**
- Blocks emit `tool:running` at generation start (in promptBox 'run' handler)
- Cue mode progress is per active generation, not aggregate across the whole queue. `generationService` defers the next Cue dispatch until the current lifecycle has emitted `tool:idle`; StatusBar ignores stale completion timers if a new active run starts.
- commandExecutor emits `tool:loading-model` / `tool:sampling-start` based on WS messages plus backend ComfyUI phase output for model-initialization-sensitive nodes
- StatusBar owns all progress UI logic; blocks don't call StatusBar methods directly (except `progress.update()` for KSampler progress)
- Generation timing saved to item sidecar starts at `tool:sampling-start`; backend receives `generationMs` field in save-generation POST body

---

## Workspaces (cross-cutting event usage)

### MpiGroupHistoryBlock (Block — js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js)
Owns the Group History workspace. Mounts MpiHistoryTools, MpiCanvasViewer (image) or MpiVideoViewer (video), MpiHistoryList, MpiMediaDropOverlay, and wires them via Events.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `radial:will-open` — pre-render hook; calls `refreshGroupHistoryRadial(_opOptions())` so radial mirrors PromptBox availability (live mask check via `viewer.el.hasMask()`)
         `generation:started` `{ id, scope, groupId }` — seeds `_myGenIds` if scope+groupId match; shows generating state on canvas
         `generation:preview` `{ id, url }` — loads preview into canvasViewer if id in `_myGenIds`
         `generation:complete` `{ id, item, group }` — appends history entry, updates canvas/video viewer, clears generating state
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
         MpiMediaDropOverlay onDrop: loops dropped files, uploads each + calls _pb.el.injectMedia() per file (organism handle on Block) (no history card created)
         **Active tool:** block-local `_options` (current MpiToolOptions* instance). NOT in global `state`. `mountOptions(mode)` is the mediator — destroys previous instance, mounts new one into `#right-top-slot`. `prompt` mode toggles `--prompt-active` CSS class (shows PromptBox, hides slot). No channel bus for tool events.
         **Image groups:** mask tool → MpiToolOptionsMask (unified auto+manual panel; no apply button; additive composite). Auto-detect composites onto existing manual paint. B/E hotkeys owned by panel while mounted.
         **Video groups:** MpiVideoViewer mounted instead of MpiCanvasViewer. Tool options in `#right-top-slot` via mediator: crop → MpiToolOptionsCrop, videoUpscale → MpiToolOptionsUpscale, interpolate → MpiToolOptionsInterpolate. PromptBox only if `_hasPromptOps()` true.
         **PromptBox gating:** `_hasPromptOps()` returns true iff active model exposes ≥1 enabled op (not strategy type). Recomputed on `s_selectedModelIdByType` (filtered by `modeKind`), `s_installedModelIds`, `project:changed`.
         **PromptBox model list:** `s_installedModelIds` listener also calls `_pb?.el?.setModelList?(getModelsByType(modeKind).filter(m => m.installed !== false))` — live dropdown refresh on install/uninstall.
