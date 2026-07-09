## Sub-Agent Briefing
> Use this file when you need to know what events a Primitive or Compound component emits or listens to.
> Organism/Block events live in `component-events-organisms.md` and `component-events-blocks.md`.
> Generation lifecycle (commandExecutor, StatusBar, Active Generation Registry) lives in `component-events-lifecycle.md`.

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

### MpiTreePicker
EMITS:   `change` `{ value: string, label: string }`
LISTENS: `ui:close-all-popups` — closes the portalled box (also document click + MutationObserver for portal-node cleanup)
NOTE:    Searchable folder-tree picker (MPI-233) for path-shaped option values; drop-in for MpiDropdown (same `change` contract). Value = full path string. First consumer: LoRA slots in MpiModelSettings.

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
NOTE:    Options accept `string` or `{ label, value, icon?, info?, disabled? }`. Props: `iconOnly` (bool) hides labels and renders icon-only buttons; per-option `info` overrides group `info` for status-bar text. **Emits `select` not `change`** — wiring `change` silently no-ops persistence/injection.

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

### MpiChangelogDialog
EMITS:   `dismiss`     `{ version }` — Done button only. Escape/backdrop hide the modal but do NOT emit dismiss; shell persists the seen version solely on `dismiss`.
LISTENS: (none — internal MpiModal handles `ui:close-all-popups`)
NOTE:    Startup "What's New" overlay. Content set via `el.open({ version, stage, notes })` before `show()`. Reads release notes from `js/data/releaseNotes.js`. Not an updater.

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

### MpiOptionSelector
EMITS:   `change` `{ value: string, def?: object }` — user picked a value (ratio/number/buttons variants)
         `change` `{ qualityTier: 'very_low'\|'low'\|'medium'\|'high'\|'very_high' }` — quality variant only
         `orientation_change` `{ orientation }` — ratio variant orientation toggle
         `popup_toggle` `{ active: boolean }` — popup opened/closed (ratio/number/buttons; quality has no popup)
LISTENS: `ui:close-all-popups` — closes popup if open (ratio/number/buttons)
API:     `el.getValue()` · `el.setValue(v)` · `el.setTriggerIcon(icon)` · `el.setTriggerActive(bool)` · `el.setButtons(buttons)` · `el.getButtons()`
         Ratio variant only: `el.setQualityTier(tier)` — switches the rendered ratio set without going through any popup, picks a fallback label if current ratio is missing from the new set, then emits `change` with the resolved dims.
NOTE:    Four variants — `ratio`: preset ratio picker (renders `.ratio-row` + `.ratio-pick.r-X-Y` Stage selectors inside the popup); `number`: value list used for the PromptBoxControls `batch` entry (nodeTitle `'Batch_Size'`; replaces the retired MpiNumberSelector/MpiBatchSelector); `buttons`: generic button-list popup; `quality`: standalone inline radio row (no popup, no trigger button) used by the `qualityTier` PromptBoxControl for quality-mode models (wan, future ltx). All popup variants share: trigger button, portal popup, outside-click dismiss, viewport clamp, `ui:close-all-popups` self-close.
         Delegated `popupEl` click handlers call `e.stopPropagation()` first — sub-popup interactions never bubble to document-level listeners. Required because handlers rewrite `grid.innerHTML` / `trigger.innerHTML` synchronously; without it, `e.target` detaches mid-bubble and breaks parent popup `closest('.mpi-popup')` exclusion → parent closes incorrectly.
         Quality is no longer a header inside the ratio popup. The standalone `quality` variant emits `change` to its parent PromptBoxControl, which fans out via `Events.emit('ratio:quality-change', { modelId, qualityTier })`; the ratio control filters by `modelId`, then calls its own `el.setQualityTier(tier)` to re-render. Keeps a single source of truth under `modelSettings[modelId].ratioSelector.qualityTier`.

### MpiSlideOver  *(Stage redesign — replaces full-page modal pattern for landing actions)*
EMITS:   `close` `{}` — panel dismissed (close button, outside-click, or `ui:close-all-popups`)
LISTENS: `ui:close-all-popups` — closes
         (module-level) `slide-over:open` `{ title, component }` — mounts a fresh instance into a fresh `<div>`, calls `el.open()`, registers `close` → singleton clear. Opening a second slide-over closes the first.
API:     `el.open()` — append to `document.body`, force reflow, set `aria-expanded="true"` (slide-in)
         `el.close()` — set `aria-expanded="false"`, await transitionend, remove from DOM, emit `close`
NOTE:    Owns chrome only (header with UPPERCASE title + close button, scrollable body, optional footer). Content is supplied via `props.component` — a ComponentFactory blueprint mounted into `.mpi-slide-over__body`. Calls `_contentInstance.el.onOpen?.()` after mount so content can re-init fields. Module-level `let _active = null;` enforces the singleton. Outside-click is registered on `document` with a `setTimeout(..., 0)` so the triggering click does not immediately close. `_doClose` destroys the content instance (MPI-177 — content `el.destroy()` actually runs now; previously every open leaked its timers/subs) and removes the panel node on `transitionend` with a 400ms backstop (throttled windows can skip the transition).

### MpiSettings *(content-only — body of MpiSlideOver)*
EMITS:   (chrome owned by MpiSlideOver; no `close` event. RunPod events moved to MpiRunpodSettings — MPI-177)
LISTENS: `state.promptReuseOptions` / `state.promptReuseSource` via `Events.onState` — sync the Reuse Prompt controls.
API:     `el.onOpen()` — re-runs `_initFields()` with current values from `Storage` / `state`, then forwards to `_runpodInst.el.onOpen()`. Called by `MpiSlideOver.setup()` once per open.
NOTE:    Trigger via `Events.emit('slide-over:open', { title: 'Settings', component: MpiSettings })`. The legacy `el.show()/el.hide()` instance methods have been removed. The entire RunPod Remote Engine section is `MpiRunpodSettings` (mounted once into `#mpiSettingsRunpodMount` in setup). `el.destroy()` cleans reuse subs + extra-folder controls and destroys the RunPod child.

### MpiRunpodSettings *(content section — mounted by MpiSettings; MPI-177 extraction)*
EMITS:   `remote:wait-start`  `{ gpuType, datacenter }` — MPI-110: ask the shell to start an auto-retry wait for an out-of-stock GPU (Connect pressed with `autoRetry` on + GPU not in stock, or a mid-connect snipe). The WAIT LOOP lives in shell.js (`_initGpuWaitBridge`), NOT here, so it survives navigating away from Settings.
         `remote:wait-cancel` `{}` — MPI-110: Cancel pressed while waiting → stop the shell wait (no Pod was created, so no teardown).
LISTENS: `state.remoteWaitGpu` via `Events.onState` — repaints the engine button (waiting…/Cancel) when a shell-owned wait starts/ends. Also drives `_applyEngineStatus`.
API:     `el.onOpen()` — re-runs `_initRunpodSection()`; forwarded by MpiSettings on every panel open.
NOTE:    Verbatim extraction of MpiSettings' RunPod section — DOM ids (`mpiSettingsRunpod*`) and `mpi-settings__runpod-*` classes kept. Owns the 5s engine-status poll + volume disk poll; `el.destroy()` clears both and sets `_connectAbort` (breaks in-flight `_pollEngineReady`; the Pod keeps booting — destroy ≠ Cancel). Auto-retry wait loop owner = shell.js (`_startGpuWait`/`_stopGpuWait`/`_initGpuWaitBridge`); on the GPU freeing it calls `_initRemoteBoot` for the full create→ready→WS flow. App-wide connecting state is surfaced by the connection feed reading the backend `connecting` flag — this panel does not own it.

### MpiHotkeys *(content-only — body of MpiSlideOver)*
EMITS:   (none)
LISTENS: (none)
NOTE:    Static hand-authored HTML. Trigger via `Events.emit('slide-over:open', { title: 'Hotkeys', component: MpiHotkeys })`. Hotkey rows still hand-authored — see `docs/shell.md` and `components.md` for the registry/hotkeys-page pairing rule.

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

### MpiModelManager — the Model Library overlay (Compound — js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js)
EMITS:   (none — the hosted MpiOverlay owns its own `close` + `ui:close-all-popups` handling)
LISTENS: `state:changed` `{ key: 's_installedModelIds' }` — re-renders the tile grid when install state changes
         `remote:connection` `{ connected, phase, vramGb }` — engine switch → re-render + re-sync (drives VRAM table + Pause visibility)
         `download:progress` `{ modelId }` — patches that tile's inline state row in place (+ rebuilds the open detail if it's that model)
         `download:started` `{}` — full grid re-render (started tile shows progress bar; detail footer → Pause/Cancel)
         `download:paused` / `download:resumed` / `download:installing` `{ modelId }` — patch that tile in place
         `download:cancelled` / `download:complete` `{}` — `awaitReSync()` (re-render; install state moved sections)
         `download:uninstalled` `{ modelId, ... }` — emits a `ui:success`/`ui:info` toast summarizing kept/removed
         `download:failed` `{}` — `awaitReSync()`
         `ui:close-all-popups` — closes the detail drawer
API:     `el.open()` — shows the hosted overlay + re-syncs installed state + one-shot hardware fetch (alias: `el.onOpen`)
         `el.close()` — hides the overlay
         `el.destroy()` — tears down subscriptions, tiles, detail toggles, the uninstall dialog, and the hosted overlay
PATTERN: MPI-215 — self-hosts `MpiOverlay(mountTarget:'body')` styled as a dark contact sheet. Lean tiles
         (Map by modelId, patched in place) split into Installed/Available × Image(4:5)/Video(16:9) sub-grids;
         Media/Size/search filters compose. Clicking a tile opens a right-drawer detail panel (absolute child of
         the overlay — stacks above it, reuses MpiSlideOver's CSS chrome, NOT its singleton) carrying description,
         op toggles (MPI-122), arch toggles (MPI-200/209), inline VRAM→RAM table (MPI-168), disk, and
         Install/Update/Uninstall. Detail video autoplays; click → native `requestFullscreen()` (Escape exits FS only).
         Opened via `models:open` (shell mounts once + `el.open()`); also the project-page `Models` nav action + dev gallery.

### MpiNewProject
EMITS:   `create` `{ name: string, location: string|null }`
         `cancel` `{}`
LISTENS: (none — internal MpiModal handles `ui:close-all-popups`)

### MpiAddToProject
EMITS:   `confirm` `{ projectId: string }` — after `onConfirm` prop resolves
         `cancel`  `{}` — Cancel button only (NOT on Escape/hide)
LISTENS: (none — internal MpiModal handles `ui:close-all-popups`)
NOTE:    Compound overlay: MpiModal + MpiDropdown (project picker) + OK/Cancel MpiButtons. `onConfirm(projectId)` prop does the async copy; OK disabled while it runs, modal stays open on reject. Mounted on demand by MpiGalleryBlock's `add-to-project` handler.

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

### MpiStartingComfy
EMITS:   (none)
LISTENS: (none — direct portal, bypasses Overlays queue intentionally)
