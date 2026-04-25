# Workspaces

Three primary workspaces + one hidden dev area.

## Flow

```
Landing → Gallery → Group History
```

## Landing (`#page-landing` DOM element)
Handles project selection and creation. Entry point when no project is open.
- UI logic lives in `js/shell/projectUI.js` — no separate workspace class.
- Renders `MpiProjectCard` instances via `loadProjectGrid()`.
- New Project dialog: `MpiNewProject` compound.
- Header actions: `MpiSettings`, `MpiHelp`, `MpiAbout` (in `js/components/Compounds/LandingPages/`).
- Background: animated shader via `js/components/shaderBackground.js`.

## Gallery (`js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`)
Default view when a project opens. Lazy-loaded by `js/shell/navigation.js` on `PAGE_GALLERY`.
- Mounts `MpiGalleryGrid` into the tool container.
- Drives the **shell-level PromptBox** via `PromptBoxService.mount()` — does NOT mount `MpiPromptBox` directly.
- `MpiCompareOverlay` and `MpiOkCancel` (delete dialog) are workspace-owned singletons.
- Selection: ctrl/cmd-click toggles card, shift-click range-selects, right-click opens `MpiContextMenu`. No `MpiSelectionBar`.
- Select mode uses `grid.on('selection-start/end')` to show/hide shell PromptBox.
- Navigates to Group History on card open: `navigate(PAGE_GROUP_HISTORY, { groupId })`.

## Group History (`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`)
Opened when user clicks a card from gallery. Lazy-loaded by `js/shell/navigation.js` on `PAGE_GROUP_HISTORY`.

**Photoshop-style layout** (`grid-template-columns: 3.5rem 1fr 14rem`):
- `#left-slot` — `MpiHistoryTools` vertical radio toolbar (prompt / crop / mask-group / upscale / interpolate)
- `#centre-slot` — `MpiCanvasViewer` (image) or `MpiVideoViewer` (video)
- `#right-top-slot` — active `MpiToolOptions*` compound (swapped by mediator on tool change)
- `#right-bottom-slot` — `MpiHistoryList` (ctrl/shift/right-click selection, dimensions, context menu)
- `#prompt-box-mount` — shell-level PromptBox (centre-bottom floating); shown/hidden via `mpi-group-history-block--prompt-active` CSS class

**Mediator:** `mountOptions(mode)` destroys the previous `MpiToolOptions*` instance and mounts the new one. `prompt` is special — no compound; toggles CSS class + calls `PromptBoxService.show/hide`. Tool options compounds: `MpiToolOptionsCrop`, `MpiToolOptionsManualMask`, `MpiToolOptionsAutoMask`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`.

**PromptBox gating:** `_hasPromptOps()` — true iff active model exposes ≥1 enabled prompt op. Recomputed on model/install-state changes. Video groups with prompt-capable models get PromptBox too.

## Shell-level singletons (always present)
Mounted once in `js/shell.js`, independent of active workspace:
- `MpiErrorDialog` — shown on `ui:error` event
- `MpiStartingComfy` — shown on `comfy:starting` / `comfy:ready` events
- `MpiModelsModal` — shown on `models:open` event (zero installed models or explicit open)
- `MpiPromptBox` container — at `#prompt-box-mount`, managed by `PromptBoxService`

## Routing
- `js/router.js` defines `PAGE_LANDING`, `PAGE_GALLERY`, `PAGE_GROUP_HISTORY`.
- `js/shell/navigation.js` handles page transitions: `handleNavigation(page, params)`.
- `shell.js` registers `onNavigate()` → calls `handleNavigation()`.
- Never use `window.location` — always go through `navigate()` / `back()` from `router.js`.
