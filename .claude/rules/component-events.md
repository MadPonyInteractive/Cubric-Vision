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

### MpiColorPicker
EMITS:   `change` `{ r: number, g: number, b: number, hex: string }`
LISTENS: `ui:close-all-popups` — closes the portaled picker popup
API:     `el.getRGB()` · `el.setRGB(r, g, b)` · `el.setHex(hex)` · `el.getHex()`
NOTE:    Primitive HSV visual picker with saturation/value square, hue slider, RGB/hex precision inputs, lightweight portaled floating popup, pointer/keyboard support, and MutationObserver cleanup.

### MpiDropdown
EMITS:   `change` `{ value: string, label: string }`
LISTENS: (none — uses document click + MutationObserver for cleanup)

### MpiInput
EMITS:   `input`  `{ value: string|number, originalEvent: Event }`
         `change` `{ value: string|number, originalEvent: Event }`
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
NOTE:    Accepts any image/video OS file drag (multi-file supported). Ignores internal `application/mpi-media` drags.

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

### MpiToast
EMITS:   `close` `{}`
LISTENS: (none)

---

## Compounds

### MpiAutoMaskThumbs
EMITS:   `change` `{ picks: Set<number> }`
LISTENS: (none)

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
         `selection-changed` `{ indices: number[], anchor: number }` — ctrl/shift-click updated selection (`indices` chronological — see API note)
         `selection-exited`  `{}` — selection mode ended (count → 0)
         `delete-selected`   `{ indices: number[] }` — Delete chosen from context menu OR `Delete` hotkey (selection → indices; no selection → `[_selectedIdx]` so active entry is targeted)
         `compare-requested` `{ indices: [number, number] }` — Compare chosen from context menu (exactly 2 selected)
         `combine-requested` `{ indices: number[] }` — Combine chosen from context menu (video group, ≥2 selected, chronological order)
         `add-to-gallery`    `{ index: number }` — Add to gallery chosen from context menu (exactly 1 selected)
         `reuse`             `{ positive: string, negative: string }` — Reuse-prompt icon button on a card clicked. Parent emits `workspace:inject-prompts` so PromptBox restores text. Button hidden on cards without `item.prompt` or `item.negativePrompt`.
LISTENS: (none)
API:     `el.setActiveIndex(idx)` · `el.setGroups(history)` · `el.appendEntry(item)` · `el.removeEntries(indices)` · `el.exitSelectMode()`
         `el.getSelectionOrder()` → `number[]` in chronological click order. Set insertion order alone is fragile across shift-range rebuilds (direction-aware walk in `_rangeSelect` keeps anchor first, target last). First shift-click without prior selection anchors at `_selectedIdx` (the currently-active entry), not at the stale default `_anchor = 0`.
NOTE:    Selection: plain-click single-selects; ctrl/cmd-click first-time seeds anchor+selection from current active entry then toggles clicked; shift-click range-selects. Right-click NEVER enters selection mode — context menu acts on existing selection if right-clicked card is in it, otherwise acts on right-clicked card alone (ephemeral target; `compare-requested`/`combine-requested`/`delete-selected`/`add-to-gallery` indices reflect that single card). Dev-mode gate: if `APP_CONFIG.dev_mode` truthy, skips `e.preventDefault()` on contextmenu so Electron inspect-element works. Selection-order numeric badge (`#N`) renders on each selected card when `_selection.size >= 2`; hidden below.

### MpiHistoryTools
EMITS:   `activate` `{ mode: string }` — any mode change (user click or `setMode`). No `deactivate` event.
LISTENS: (none)
API:     `el.setMode(mode)` — activate programmatically; re-activating current = no-op; emits `activate`
         `el.setDisabled(map)` — bulk update `{ [toolMode]: { disabled: bool, reason?: string } }`; sub-modes accepted
         `el.getActiveMode()` — read current mode
NOTE:    Radio behaviour: re-click active tool = no-op. `mask` is now a flat tool (no group/sub-modes). `disabled` tools render grayed, non-interactive, show `reason` as tooltip.
         Image Transform group contains `crop` and `resize`. Video Transform contains `crop` and `resizeVideo`. Both resize entries route to the same `MpiToolOptionsResize` compound via `TOOL_OPTIONS_REGISTRY`; the compound branches on `props.kind`.

### MpiNumberSelector
EMITS:   `change`       `{ value: string }` — user picked a new value
         `popup_toggle` `{ active: boolean }` — popup opened/closed
LISTENS: `ui:close-all-popups` — closes popup if open
API:     `instance.el.getValue()` → current string · `instance.el.setValue(string)` → imperatively set + re-render
NOTE:    Generic replacement for MpiBatchSelector. Props: `values: string[]`, `value`, `icon`, `popupTitle`, `info`. Portals popup to body manually (MpiPopup.template() used as raw HTML, no setup() runs). Used by PromptBoxControls `batch` entry.

### MpiOptionSelector
EMITS:   `change` `{ value: string, def?: object }` — user picked a value (ratio/number/buttons variants)
         `change` `{ qualityTier: 'very_low'\|'low'\|'medium'\|'high'\|'very_high' }` — quality variant only
         `orientation_change` `{ orientation }` — ratio variant orientation toggle
         `popup_toggle` `{ active: boolean }` — popup opened/closed (ratio/number/buttons; quality has no popup)
LISTENS: `ui:close-all-popups` — closes popup if open (ratio/number/buttons)
API:     `el.getValue()` · `el.setValue(v)` · `el.setTriggerIcon(icon)` · `el.setTriggerActive(bool)` · `el.setButtons(buttons)` · `el.getButtons()`
         Ratio variant only: `el.setQualityTier(tier)` — switches the rendered ratio set without going through any popup, picks a fallback label if current ratio is missing from the new set, then emits `change` with the resolved dims.
NOTE:    Four variants — `ratio`: preset ratio picker (renders `.ratio-row` + `.ratio-pick.r-X-Y` Stage selectors inside the popup); `number`: value list (replaces MpiNumberSelector inline); `buttons`: generic button-list popup; `quality`: standalone inline radio row (no popup, no trigger button) used by the `qualityTier` PromptBoxControl for quality-mode models (wan, future ltx). All popup variants share: trigger button, portal popup, outside-click dismiss, viewport clamp, `ui:close-all-popups` self-close.
         Delegated `popupEl` click handlers call `e.stopPropagation()` first — sub-popup interactions never bubble to document-level listeners. Required because handlers rewrite `grid.innerHTML` / `trigger.innerHTML` synchronously; without it, `e.target` detaches mid-bubble and breaks parent popup `closest('.mpi-popup')` exclusion → parent closes incorrectly.
         Quality is no longer a header inside the ratio popup. The standalone `quality` variant emits `change` to its parent PromptBoxControl, which fans out via `Events.emit('ratio:quality-change', { modelId, qualityTier })`; the ratio control filters by `modelId`, then calls its own `el.setQualityTier(tier)` to re-render. Keeps a single source of truth under `modelSettings[modelId].ratioSelector.qualityTier`.

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
         `settings:model:update` `{ modelId, key, value }` — loras + upscaleModel on _autoSave (no `opName`: projectService routes to the model-wide bucket)
         `settings:tool:update`  `{ toolKey, key, value }` — upscaleModel on _autoSave
LISTENS: (none — reads `state.currentProject`, `state.upscaleModels`, `state.availableLoras`)
         `ui:error` emitted on save failure via `Events.emit`

### MpiModelManager (Compound — js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js)
EMITS:   (none — does NOT emit `models:closed`; slide-over host emits its own close signal)
LISTENS: `state:changed` `{ key: 's_installedModelIds' }` — re-renders card list when install state changes
         `download:progress` `{ modelId, progress, speed, downloadedBytes, totalBytes }` — patches single card in place
         `download:started` `{ modelId }` — sets card to 'downloading' state
         `download:paused` `{ modelId }` — sets card to 'paused' state
         `download:resumed` `{ modelId }` — sets card to 'downloading' state
         `download:installing` `{ modelId }` — sets card to 'installing' state
         `download:cancelled` `{ modelId }` — sets card to 'cancelled' state
         `download:complete` `{ modelId }` — calls awaitReSync() to fetch new install state
         `download:failed` `{ modelId }` — calls `awaitReSync()` to re-render list (no `ui:error` emitted)
API:     `el.onOpen()` — called by MpiSlideOver on every open; re-syncs installed state
         `el.destroy()` — cleans up all subscriptions
PATTERN: Cards stored in Map by modelId for in-place updates; state polling replaced with event-driven updates
         Opened via `models:open` → shell re-emits `slide-over:open { title: 'Models', component: MpiModelManager }`
         Also accessible from the project-page `Models` nav action (first in list before Settings · Help · About)

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
         Persists as `project.shared[mediaType].batch` via `settings:shared:update` with `mediaType: 'image' | 'video'`.
         Injects workflow param `Batch_Size` (ComfyUI node title "Batch_Size", MpiInt.inputs.int).
         N outputs → N cards in gallery; N placeholders shown from generation start.

### MpiStartingComfy
EMITS:   (none)
LISTENS: (none — direct portal, bypasses Overlays queue intentionally)

---

## Organisms

### MpiVideoSurface (Compound — js/components/Compounds/MpiVideoSurface/)
EMITS:   `play`           `{ time: number }`
         `pause`          `{ time: number }`
         `ended`          `{ time: number }`
         `timeupdate`     `{ time: number, duration: number }`
         `loadedmetadata` `{ duration: number }`
         `volumechange`   `{ volume: number, muted: boolean }`
LISTENS: (none — driven externally via instance API)
NOTE:    Bare `<video>` surface + click-to-toggle (skipped on `[data-no-toggle]` ancestors). Owns no transport UI; MpiVideoControlBar drives via `attachSurface(instance)`. Preserves loop-disable/seeked-restore + frame-step wrap-on-loop semantics. `frameStep(dir, range?)` operates in integer frame space and accepts `{ rangeIn, rangeOut, loop }`; out timestamp is inclusive (`round(hi*fps)` is the last visible frame).

### MpiVideoControlBar (Compound — js/components/Compounds/MpiVideoControlBar/)
EMITS:   `loop-change`  `{ loop: boolean }`
         `range-change` `{ in: number, out: number }` — forwarded from embedded MpiTrimBar (only fires when `showTrim` is true)
LISTENS: surface events `play/pause/timeupdate/loadedmetadata/volumechange` (via `attachSurface(instance)`)
HOTKEYS: binds `video.playPause/frame.back/frame.forward/volume.up/volume.down/loop` on `attachSurface`; trim hotkeys `video.trim.in/out/clear` bound only when `showTrim` is true. Unbinds on `detachSurface`/`destroy`.
PROPS:   `fps` (default 24), `showTrim` (default true). When `showTrim: false`, MpiTrimBar is not mounted; `setRange`/`setRangeQuiet`/`setPendingTrim` no-op; `getRange()`/`getValue()` return `null`.
NOTE:    Single horizontal row layout `[left buttons + time] [trim flex:1] [right buttons]`. Mounted full-width by the parent Block (NOT by the viewer). Wired to a surface via `attachSurface(surfaceInstance)`. On every surface `loadedmetadata` resets range to `[0, duration]` UNLESS `setPendingTrim(in, out)` was called first (one-shot). Loop intent is tracked internally; when active range is a strict subset of the clip, native `video.loop` is forced off and the loop is emulated via `timeupdate` (`seek(_in)` at `_out` if loop on; `_pause()` otherwise). Range-loop branch gates on `!video.paused` so frame-step is not re-routed.

### MpiTrimBar (Compound — js/components/Compounds/MpiTrimBar/)
EMITS:   `seek`         `{ time: number }` — playhead committed (drag end / track click)
         `seek-preview` `{ time: number }` — playhead value during drag (throttled ~50ms; playhead role only)
         `in-change`    `{ time: number }` — in handle committed
         `out-change`   `{ time: number }` — out handle committed
         `range-change` `{ in: number, out: number }` — fired alongside in/out commits
LISTENS: (none — pure pointer drag state)
NOTE:    Two-handle trim seek bar. Pointer drag coalesces on RAF; commits on `pointerup`. Frame-snap via `Math.round(t*fps)/fps`. Constraints: `0 ≤ in+frame ≤ out ≤ duration`; playhead clamped to `[in, out]`. `seek-preview` enables live-scrub on the host video without re-firing on every RAF tick.

### MpiVideoViewer (Organism — js/components/Organisms/MpiVideoViewer/)
EMITS:   `play`, `pause`, `ended`, `timeupdate` — forwarded from MpiVideoSurface
         `change`        `{ volume, muted }` — forwarded from surface `volumechange`
         `loadedmetadata` `{ duration }` — forwarded from surface
         `crop-change`   `{ rect: { x, y, w, h } }` — crop rect updated (normalized 0–1)
GLOBAL EMITS (via Events.emit):
         `video-viewer:context-menu` `{ x, y }` — right-click on viewer (native menu suppressed). Consumed by MpiGroupHistoryBlock for "Set as start/end frame" context menu.
LISTENS: (none — tool bars are owned by MpiGroupHistoryBlock, not viewer)
API:     `attachControlBar(instance)` / `detachControlBar()` — wire an external MpiVideoControlBar; viewer internally calls `instance.el.attachSurface(viewerSurfaceInstance)`. Control bar lifetime is owned externally; `viewer.destroy()` only `detachSurface()` on the bar.
         `getSurfaceInstance()` — returns MpiVideoSurface instance.
         `loadVideo(url, meta)` — `meta.fps`/`meta.frameCount`/`meta.trim` proxied to the attached control bar; `meta.trim = { in, out }` propagates as `setPendingTrim` (one-shot, applied on next `loadedmetadata`).
         `getSourceElement()` — underlying `HTMLVideoElement` for external tools (resize/snapshot).
         `setRangeQuiet(in, out)`, `getRange()` — proxy to attached control bar.
NOTE:    Viewer no longer forwards `loop-change`/`range-change` — block listens directly on the control bar instance. Viewer owns display + crop overlay + chip strip state only.

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
         `getSourceElement()` — returns the underlying `HTMLImageElement` so external tools (e.g. resize) can sample the source for thumbnail extraction. Read-only, never reassign.

### MpiToolOptionsMask (Organism — js/components/Organisms/MpiToolOptionsMask/)
EMITS:   (none)
LISTENS: (none — Hotkeys.bind 'mask.brush.toolbar'/'mask.eraser.toolbar' while mounted; unbound in destroy)
NOTE:    Unified auto+manual mask panel. No apply button. Mask is canvas-resident; PromptBox drives ops. Auto picks composite onto manual paint via `compositeMaskDataURL`. destroy() calls `evaluateMask()` then `exitMode()`.

### MpiToolOptionsResize (Organism — js/components/Organisms/MpiToolOptionsResize/)
EMITS:   `apply` `{ params: { width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, flip, rotation } }` — full-resolution params; payload is intentionally minimal. The block always re-runs the workflow at full resolution via `startGeneration`; there is no fast-path / preview-URL reuse.
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:tool:update` `{ toolKey: 'resize', key, value }` — debounced per-control persistence to `project.toolSettings.resize`
LISTENS: (none — read-only access to viewer via `viewer.el.getSourceElement()`)
API:     `el.setCurrentItem(item)` — re-target active history item without remount; cancels in-flight preview, re-extracts the thumbnail from the new source (uses `awaitNextLoad: true` for video so the next `loadeddata` is awaited rather than sampling a stale frame), then schedules a fresh preview. Block calls this from `historyList.on('entry-selected')` AND from `generation:complete` for `resize`/`resizeVideo` items.
         `el.getParams()` — read current params.
NOTE:    Preview is **thumbnail-based**, NOT canvas-resident. The compound extracts a 512px-longest-edge PNG thumbnail from the source via `js/utils/thumbnail.js` (`extractThumbnail`, `waitForVideoFrame`) and runs the **image** `resize` workflow on the thumbnail with proportionally-scaled `width`/`height`/`divisible_by`. Result paints into an inline `<img>` slot inside the panel between the Transform section and the Apply button — the viewer canvas/video stays untouched and interactive. This is true for both `kind: 'image'` and `kind: 'video'` (video grabs the first frame). Preview submits via `runCommand({ ..., previewOnly: true, suppressLifecycleEvents: true })` so StatusBar lifecycle signals (`tool:sampling-start` / `tool:loading-model`) are not emitted — there is no `tool:running`/`tool:idle` pair wrapping a tool-panel preview. Apply emits `{ params }` and the block routes to `startGeneration` (`resize` op for image, `resizeVideo` for video). Apply is **append-only** — never replaces the source. Block treats both ops as tool-only transforms via `_setBusy` (no mascot) — see component-events.md MpiGroupHistoryBlock entry. Setup fires an initial `schedulePreview()` so the user sees the tool's effect without touching a control. The panel uses `MpiColorPicker` for `pad_color`. Width/Height are NEVER auto-seeded from the source; the user owns dimensions (defaults `1024x1024` from `DEFAULTS`, persisted thereafter).

### MpiToolOptionsPrompt (Organism — js/components/Organisms/MpiToolOptionsPrompt/)
EMITS:   (none on local bus — buttons emit on global Events bus)
GLOBAL EMITS (via Events.emit):
         `prompt-box-tools:extend`     `{}` — Extend button click. Listened to by MpiGroupHistoryBlock only.
         `prompt-box-tools:create-new` `{}` — Create new button click. Listened to by MpiGroupHistoryBlock only.
LISTENS: PromptBox `media-change` — re-renders thumb slots from `promptBox.el.getMediaByRole(role)` for `startFrame` / `endFrame`.
NOTE:    Video-history-only toolbar. Mount gate: `isVideo && activeModel.supportedOps.some(op => op.startsWith('i2v'))` — NOT `_hasPromptOps()` (capacity-based gate would hide the toolbar before user can inject the frame that unblocks it; block force-mounts PromptBox in this branch). Mounted into `#right-top-slot`; `__right-top` visibility under `--prompt-active` is `:empty`-scoped, so the slot becomes visible when this organism mounts a child. Thumb sizing CSS-only (`max-height` + `object-fit: contain`). Single listener for both prompt-box-tools events lives in MpiGroupHistoryBlock — do NOT pre-wire them anywhere else.

### concatProgress (service — js/services/concatProgress.js)
EMITS (Events bus, keyed by `jobId`):
         `concat:progress` `{ jobId: string, ratio: number }` — 0..1 progress from ffmpeg `time=` stderr lines
         `concat:done`     `{ jobId: string, item: HistoryItem }` — concat finished, sidecar written
         `concat:error`    `{ jobId: string, error: string }` — first-line truncated (full stderr stays in logs/app.log)
LISTENS: own SSE channel `/concat/events/stream` (separate from `/comfy/events/stream`); single EventSource opened eagerly on module import.
API:     `trackConcatJob({ jobId, label })` → Promise. Bridges to `StatusBar.progress.start/update/complete/cancel`; resolves on `concat:done`, rejects on `concat:error`. Multiple in-flight jobs de-multiplexed by `jobId`.

---

## Blocks

### MpiGalleryGrid
EMITS:   `open-group`      `{ group: ItemGroup }`
         `compare`         `{ groups: [ItemGroup, ItemGroup] }`
         `delete`          `{ groups: ItemGroup[] }` — context menu OR `Delete` hotkey while in selection mode (grid auto-exits selection after emit)
         `download`        `{ groups: ItemGroup[] }`
         `gc-group`        `{ group: ItemGroup }`
         `gc-remove`       `{ groupId: string }`
         `favourite`       `{ group: ItemGroup, favourite: boolean }`
         `reuse`           `{ positive: string, negative: string }`
         `select`          `{ group: ItemGroup, selected: boolean }`
         `media-missing`   `{ group: ItemGroup, itemId: string }`
         `combine`         `{ groups: ItemGroup[] }` — Combine chosen from context menu (≥2 selected, all `type === 'video'`; click-order via Set insertion)
         `selection-start` `{}` — selection mode activated (hide PromptBox)
         `selection-end`   `{}` — selection mode exited (show PromptBox)
         `preview:continue`     `{ group: ItemGroup, item: MediaItem }` — Continue button on preview-stage card. Block runs `validatePreviewAssets(item.id)` first. Fast path: enqueue stage-2 with `isStage2: true` and NO `replaceItemId` (final lands as a NEW gallery card; preview stays). Cold fallback: enqueue stage-1 rerun (`previewOnly: true`, `replaceItemId: item.id`) to rebuild the latent in place; then on `gallery:item-updated` auto-enqueue the stage-2 branch. Blocked: toast + no-op. Gated by `commandAllowsBranchingContinue(item.operation)` — button is hidden when the op disallows branching.
         `preview:finish`       `{ group: ItemGroup, item: MediaItem }` — Finish button on preview-stage card. Block runs `validatePreviewAssets(item.id)` first. Fast path: enqueue stage-2 with `isStage2: true` AND `replaceItemId: item.id` (preview becomes final video). Cold fallback: enqueue the full base `_ms` workflow with `previewOnly: false` AND `replaceItemId: item.id` — single submission, stage-1+stage-2 fused, no `isStage2` swap, no `LoadLatent` override. Blocked: toast + no-op.
         `preview:pop-continue` `{ group: ItemGroup, item: MediaItem }` — Cancel button on a queued Finish card; Block calls `removeCueJob` keyed on `replaceItemId` to drop the matching pending job and revert the card to preview state. Branching Continue jobs are not popped via this event — they are removed by clearing the Cue queue or letting them complete.

         **Preview-stage delete:** there is no dedicated Discard button. Preview cards are removed via the normal multi-select Delete flow. The backend `DELETE /project-media/:id/:filename?itemId=...` route reads the sidecar before unlinking and, when `stage === 'preview'`, also drops `<projectMedia>/.latents/<itemId>.latent` plus any `<projectMedia>/.preview-assets/<itemId>/` snapshot folder.

         **Preview-stage selection:** Preview cards participate in normal selection (shift / ctrl-click) just like any other gallery card. Right-click opens the context menu without entering selection mode. Only the bare-click "open into history" action is suppressed because previews stay on the gallery surface.
LISTENS: (none — internal MpiButton tab events handled internally)
API:     `el.setStage2Count(groupId, n)` — write the small `xN` badge on a preview card reflecting how many branching Continue jobs are queued/running.
         `el.setPreviewAssetsWarning(groupId, state)` — write the warning badge on a preview card. `state` is `null` for clear; `{ mode: 'fallback', missing? }` renders an amber "Cold" badge (latent missing, stage-1 will rerun); `{ mode: 'blocked', missing? }` renders a red "Missing" badge and hides the Continue/Finish action row via a card CSS modifier. State Map is re-applied inside `_rerenderJustified` so debounced rebuilds don't drop badges.
         `el.getSelectionOrder()` → `string[]` — selected group ids in click order via Set iteration. Used by Combine handler in MpiGalleryBlock to sequence concat inputs chronologically.
         Card API: `cardEl.setSelectionBadge(n)` — numeric `#N` badge top-center when `_selectedIds.size >= 2`; `0` clears. Re-applied in `_syncCardSelectedState` (every selection mutation) AND in the initial-state branch of `_makeCard` so debounced `_rerenderJustified` keyed-reuse paths stay consistent.
NOTE:    Tab buttons (order/filter) write directly to `state.gallerySort`; active-state sync via `_syncTabActive()` on `state:changed`. Card selection: ctrl/cmd-click toggles, shift-click range-selects, right-click opens `MpiContextMenu`. Preview cards participate in selection like any other card; "open into history" suppressed. No `MpiSelectionBar` or `MpiCheckbox`.

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
         `settings:model:update` `{ modelId, opName, key, value }` — from PromptBoxControls. `opName` resolved from each control's `scope`: `'shared'` (ratio/orientation/quality, batch, previewStage, duration, motionIntensity) or the active op key (denoise, useGrid, upscaleFactor). Never includes generation mode.
LISTENS: `workspace:inject-prompts` `{ positive, negative }` — sets textarea values
         `promptbox:generation-end` — clears generating state
         `state:changed` — updates Cue button label on `generationQueueCount` change; re-renders Cue/Loop label on `loopArmed` change
         Hotkeys `generation.run` (Ctrl+Enter) cue, `generation.stop` (Ctrl+Alt+Enter) stop, `generation.loop` (Ctrl+L) toggle `state.loopArmed` — all bound in setup
         (NOT `workspace:set-operation` — parent block validates op + calls `el.setOperation()`)
API:     `el.getRunPayload()` returns the current live run payload. Loop re-fire reads it via `getNextGeneration` callback so prompt/model/control changes apply to the next iteration.
         `el.setModel(model)` / `el.setModelList(list)` auto-pick `activeOperation` for current media context (image/video counts) and emit `operation-change` when the picked op differs. Block-side `model-change` listeners must NOT force-reset op to `model.supportedOps[0]` — only override when current op is unsupported by the new model.
         `el.injectMedia({ url, mediaType, role? })` adds one item to the strip (overflow evicts oldest of same type). Optional `role` ('startFrame' | 'endFrame') is honored by `_withAssignedRoles` so role-tagged chips map to their slot regardless of insertion order. Bulk callers should query `el.remainingCapacity(mediaType)` first and inject only that many — exceeding capacity silently evicts earlier items, which is rarely what bulk drops want.
         `el.getMediaByRole(role)` returns the chip currently tagged with that role, or `null`.
         `el.removeMediaByRole(role)` drops the role-tagged chip from `_media`.
         `el.swapMediaRoles(roleA, roleB)` swaps role tags on existing chips (no re-upload).
         `el.updateContext({ historyMode })` flips the `mpi-prompt-box--history-mode` root modifier (CSS hides the media strip; chips still exist) and propagates `historyMode: true` through generation payloads.
GESTURE: Cue button — tap = enqueue 1 job. Hold ≥700ms = arm loop (color sweep fills button left→right; suppresses trailing click). Tap while armed = disarm. Hold while armed = no-op.
REMOUNT: On fresh mount, `_renderRunCluster` reconciles `isGenerating` against BOTH `state.generationQueueCount` AND `activeGenerations.list()` running entries. Long-running jobs (e.g. video) can outlive the Cue queue depth, so depth=0 alone does NOT mean idle — without the `activeGenerations` check, Stop/Clear would mount disabled when a workspace remount happens mid-flight (e.g. returning to Gallery from History while video still rendering). Parent block must also call `_pb.el.setGenerating(true)` post-mount when block-owned busy state (continue / queued-continue / stage2 branches) is non-empty, since PromptBox can't see those flags itself.

### MpiGalleryBlock (Block — js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js)
Owns the Gallery workspace. Mounts MpiGalleryGrid, MpiMediaDropOverlay, and handles generation lifecycle. No MpiSelectionBar.
LISTENS: `workspace:set-operation` `{ operation: string }` — syncs PromptBox operation
         `state:changed` (`s_installedModelIds`) — mounts/unmounts PromptBox based on installed model count; emits `models:open` if no image models (zero-model gate)
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
         `grid.on('combine')` handler: POSTs `/combine-videos { folderPath, itemIds, jobId }` (item ids derived from each group's `getSelectedItem`); awaits `trackConcatJob`; on success creates fresh video group via `createVideoItem` + `createItemGroup` + `addGroup`, then snapshots pre-add `currentGroups` and calls `grid.el.setGroups([populated, ...currentGroups])` so the new card appears immediately (keyed reuse preserves existing cards' DOM/state). Errors truncated to first line / 160 chars via `ui:error`. Full ffmpeg stderr stays in `logs/app.log`.
NOTE:    Reads `state.s_selectedModelIdByType` (via `resolveActiveModel('image')`), `state.currentProject`; writes selected model via `setSelectedModelId(model.mediaType, id)` (in `js/utils/modelHelpers.js`), `state.currentProject`. NEVER writes at mount time.
         On mount: rehydrates from `activeGenerations.listFor('gallery', null)` — placeholder card shown immediately with cached preview. After PromptBox mount, also calls `_refreshPbGenerating()` so Stop/Clear buttons restore enabled state when remounting mid-flight (e.g. returning from History while a gallery-scoped job is still running). `_refreshPbGenerating` busy predicate = `_continuingGroupIds.size > 0 || _queuedContinueGroupIds.size > 0 || stage2Total > 0 || activeGenerations.listFor('gallery', null).some(e => e.status === 'running')`.
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
- Listens to `tool:idle` → calls `complete('Generation finished')` (fires success toast) for all groupHistory ops, including `resize` / `resizeVideo`. The earlier resize-specific silent gate was removed; the block emits no bespoke toast and StatusBar owns the only completion signal.
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
         `generation:started` `{ id, scope, groupId, operation }` — seeds `_myGenIds` if scope+groupId match. Branches on `operation`: tool-only transforms (`resize`/`resizeVideo`) call `_setBusy(true)` (no mascot); everything else calls `_setGenerating(true)` (mascot + spinner). `operation` is added to the `generation:started` payload by `activeGenerations.start` so listeners can route without inspecting the registry.
         `generation:preview` `{ id, url }` — loads preview into canvasViewer if id in `_myGenIds`
         `generation:complete` `{ id, item, group }` — appends history entry, updates canvas/video viewer, clears generating state. **Snapshot `_wasReplace = _group.history?.some(entry => entry.id === item.id)` BEFORE reassigning `_group = group`** — `group` is the post-append snapshot so `.some(...)` would always be true and route every completion to `replaceEntry` (which silently bails for new ids not yet in the list). Mascot animation is gated on `item.operation` — `resize`/`resizeVideo` (tool transforms) skip the mascot. Resize tool stays mounted across Apply: after `loadVideo`/`loadEntry` the block calls `_options?.el?.setCurrentItem?.(item)` so the compound re-extracts the source thumbnail and refreshes the inline preview on the new entry. There is no canvas-mode re-enter step (the Phase 3 `enterResizeMode`/`exitResizeMode` viewer API is gone).
         `generation:error` `{ id }` — clears generating state
         `generation:cancelled` `{ id }` — clears generating state
         `controlBar.range-change` (component-local on MpiVideoControlBar instance, video groups only) `{ in, out }` — debounced 250ms; POSTs `/project-media/:projectId/update-meta` with `{ itemId, updates: { trim } }` (or `{ trim: null }` at full clip). Mirrors `item.trim` in memory for sidecar parity. Block-owned `MpiVideoControlBar` mount lives in `#controls-slot`; subscribed via `videoControlBar.on('range-change', ...)`, NOT via the viewer.
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
         Resize tool → MpiToolOptionsResize. Live-previews through Comfy on a 512px thumbnail extracted from the source via `viewer.el.getSourceElement()` (HTMLImageElement for image, HTMLVideoElement for video — first frame). Apply appends a new history entry, preserving the source item.
         imageUpscale tool → MpiToolOptionsUpscale (shared with video, `kind:'image'`). Emits `apply { factor, model }`; Block builds `{ Upscale_Factor, Upscale_Using_Model:!!model, Upscale_Model? }` and submits via `_runImageTool` (image universal workflow `image_upscale.json`). Persists `toolSettings.imageUpscale` via `settings:tool:update`.
         **Video groups:** MpiVideoViewer mounted instead of MpiCanvasViewer. Tool options in `#right-top-slot` via mediator: crop → MpiToolOptionsCrop, resizeVideo → MpiToolOptionsResize, videoUpscale → MpiToolOptionsUpscale (`kind:'video'`), interpolate → MpiToolOptionsInterpolate, prompt → MpiToolOptionsPrompt (video + i2v-capable model only). PromptBox only if `_hasPromptOps()` true — bypassed in video-history workspace when the active video model exposes any `i2v*` op so the toolbar can mount before frames are injected. Block force-mounts PromptBox + passes `historyMode: true` via `updateContext` so the media strip is hidden and `Preview_Only` is forced `false` for any `_ms` op.
         **Video-history extras:**
         - Listens for `video-viewer:context-menu { x, y }` (right-click on video). Opens `MpiContextMenu` with `Set as start frame` / `Set as end frame` items (disabled when no installed model exposes `i2v*`). Click handler snapshots the frame via `viewer.el.captureSnapshot()`, uploads via shared upload helper, auto-switches the selected video model to an i2v-capable installed model when current lacks i2v, then calls `_pb.el.injectMedia({ url, mediaType: 'image', role })` and `mountOptions('prompt')`.
         - Listens for `prompt-box-tools:create-new` (Events bus) → runs `_runGenerate(getRunPayload, historyMode:true)`. Standard I2V save; lands as new history entry.
         - Listens for `prompt-box-tools:extend` (Events bus) → same submit path with `extend:true` and `sourceItemId:<currentItem.id>` plumbed into `config.extend` / `config.sourceItemId`. `generationService.startGeneration` runs the I2V, POSTs `/extend-video` after save-generation, awaits `trackConcatJob`, then DELETEs the intermediate sidecar via `/project-media/<projectId>/<filename>?folderPath=...&itemId=...` and swaps `builtItems[0]` to the extended item (carries `extendedFrom`). Concat failure path: short single-line `ui:error` toast, intermediate stays as regular history entry — no work lost.
         - Listens for `combine-requested { indices }` from MpiHistoryList → `_runCombine(itemIds)` POSTs `/combine-videos`, appends to current video group.
         - Listens for `add-to-gallery { index }` from MpiHistoryList → `_addItemToGallery(item, mediaType)` refetches source blob, re-uploads via shared `uploadMediaFile`, creates fresh gallery group via `createItemGroup` + `addGroup`. Toast "Added to gallery".
         - Single video-history mount at a time — do NOT pre-wire `prompt-box-tools:extend` / `prompt-box-tools:create-new` listeners outside this block.
         - `_applyPreview` short-circuits for `isVideo`. Latent previews are PNGs that can't load into `<video>`; viewer stays on the previously-loaded video so the user can queue parallel ops. Mascot + StatusBar still drive feedback.
         **PromptBox gating:** `_shouldShowPromptBox() = _hasPromptOps() || _modelHasFrameOps()` drives mount + show + tool-button enable. `_hasPromptOps()` returns true iff active model exposes ≥1 enabled op. `_modelHasFrameOps()` returns true iff any `supportedOps` starts with `i2v` or `v2v` — keeps PromptBox visible BEFORE chips land so external drag-drop can stage a start/end-frame. Recomputed on `s_selectedModelIdByType` (filtered by `modeKind`), `s_installedModelIds`, `project:changed`.
         **PromptBox model list:** `s_installedModelIds` listener also calls `_pb?.el?.setModelList?(getModelsByType(modeKind).filter(m => m.installed !== false))` — live dropdown refresh on install/uninstall.
