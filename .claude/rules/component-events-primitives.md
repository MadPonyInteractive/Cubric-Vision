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
