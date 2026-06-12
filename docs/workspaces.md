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
- Header actions: `MpiSettings`, `MpiHotkeys`, `MpiAbout` (in `js/components/Compounds/LandingPages/`).
- Background: animated shader via `js/components/shaderBackground.js`.

## Gallery (`js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`)
Default view when a project opens. Lazy-loaded by `js/shell/navigation.js` on `PAGE_GALLERY`.
- Mounts `MpiGalleryGrid` into the tool container.
- Mounts `MpiPromptBox` Organism directly into `#prompt-box-mount` (`gid('prompt-box-mount')`); keeps handle in `_pb` and destroys before remount / in `el.destroy`.
- `MpiCompareOverlay` and `MpiOkCancel` (delete dialog) are workspace-owned singletons.
- Selection: ctrl/cmd-click toggles card, shift-click range-selects, right-click opens `MpiContextMenu`. No `MpiSelectionBar`.
- Navigates to Group History on card open: `navigate(PAGE_GROUP_HISTORY, { groupId })`.

## Group History (`js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`)
Opened when user clicks a card from gallery. Lazy-loaded by `js/shell/navigation.js` on `PAGE_GROUP_HISTORY`.

**Photoshop-style layout** (`grid-template-columns: 3.5rem 1fr 14rem`):
- `#left-slot` — `MpiHistoryTools` vertical radio toolbar (prompt / crop / mask-group / upscale / interpolate)
- `#centre-slot` — `MpiCanvasViewer` (image) or `MpiVideoViewer` (video)
- `#right-top-slot` — active `MpiToolOptions*` compound (swapped by mediator on tool change)
- `#right-bottom-slot` — `MpiHistoryList` (ctrl/shift/right-click selection, dimensions, context menu)
- `#prompt-box-mount` — shell-level PromptBox (centre-bottom floating); shown/hidden via `mpi-group-history-block--prompt-active` CSS class

**Mediator:** `mountOptions(mode)` destroys the previous `MpiToolOptions*` instance and mounts the new one. `prompt` is special — no compound; toggles `mpi-group-history-block--prompt-active` CSS class (shows PromptBox, hides `#right-top-slot`). Tool options compounds: `MpiToolOptionsCrop`, `MpiToolOptionsMask`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`, `MpiToolOptionsResize`, `MpiToolOptionsPrompt`.

**PromptBox gating:** `_hasPromptOps()` — true iff active model exposes ≥1 enabled prompt op. Recomputed on model/install-state changes. Video groups with prompt-capable models get PromptBox too.

## Shell-level singletons (always present)
Mounted once in `js/shell.js`, independent of active workspace:
- `MpiErrorDialog` — shown on `ui:error` event
- `MpiStartingComfy` — shown on `comfy:starting` / `comfy:ready` events
- `MpiSlideOver` — hosts slide-over content components (`MpiSettings`, `MpiHotkeys`, `MpiAbout`, `MpiModelManager`); opened via `slide-over:open { title, component }`. `models:open` is re-emitted by shell as `slide-over:open { title: 'Models', component: MpiModelManager }`.
- `#prompt-box-mount` slot — declared in `index.html`; Blocks (Gallery, History) mount `MpiPromptBox` Organism directly into it. Slot persists across workspace switches; each Block destroys its prior `_pb` handle before remount and in `el.destroy`.

**Zero-model gate:** When a new/empty project opens with no installed models, Gallery auto-emits `models:open`, opening the Models slide-over. A project that already has media opens read-only with no PromptBox until ≥1 model is installed. PromptBox mounts once `s_installedModelIds` is non-empty (keyed off `state:changed`, not a `models:closed` event).

**Landing page nav actions:** `Models · Settings · Hotkeys · About` — all open via `slide-over:open`. `Models` is first in list.

## Routing
- `js/router.js` defines `PAGE_LANDING`, `PAGE_GALLERY`, `PAGE_GROUP_HISTORY`.
- `js/shell/navigation.js` handles page transitions: `handleNavigation(page, params)`.
- `shell.js` registers `onNavigate()` → calls `handleNavigation()`.
- Never use `window.location` — always go through `navigate()` / `back()` from `router.js`.
