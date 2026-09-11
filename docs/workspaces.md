# Workspaces

Three primary workspaces + one hidden dev area.

## Flow

```
Landing → Gallery → Group History
```

## Landing (`#page-landing` DOM element)
Handles project selection and creation. Entry point when no project is open.
- UI logic lives in `js/shell/projectUI.js` — no separate workspace class.
- **The project list rows are HAND-BUILT divs, NOT `MpiProjectCard`.** `loadProjectGrid()` →
  `_buildProjectRow()` creates `.mpi-landing__pl-row` elements directly. `MpiProjectCard` is
  imported in `projectUI.js` and never instantiated — **editing that component does nothing to
  the Landing list** (MPI-286 started by looking at it; wrong file). Any row change goes in
  `_buildProjectRow` + `styles/shell/landing.css` (`.mpi-landing__pl-*`).
- Thumbnails load through a **cap-3 concurrency queue** (`_runThumbQueue(loaders, 3, signal)`),
  newest-first (the server sorts `updatedAt` desc). Each row shows a per-thumb `.spinner`
  (`--loading`) swapped for media on load and is **open-locked** while loading
  (`.mpi-landing__pl-row--loading` → click early-returns) until its thumb resolves. Video
  hover-play + `preload='metadata'` were dropped — `metadata` forced every video header up front,
  defeating the queue; rows now show a static first frame via `preload='auto'` + `loadeddata`.
  The goal was **felt**-faster, not actually-faster.
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

**Mediator:** `mountOptions(mode)` destroys the previous `MpiToolOptions*` instance and mounts the new one. `prompt` is special — no compound; toggles `mpi-group-history-block--prompt-active` CSS class (shows PromptBox, hides `#right-top-slot`). Tool options compounds: `MpiToolOptionsCrop`, `MpiToolOptionsMaskDetect`, `MpiToolOptionsMaskPoints`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`, `MpiToolOptionsResize`, `MpiToolOptionsPrompt`.

**PromptBox gating:** `_hasPromptOps()` — true iff active model exposes ≥1 enabled prompt op. Recomputed on model/install-state changes. Video groups with prompt-capable models get PromptBox too.

**Media contract — IMAGE groups (MPI-721).** The media strip IS the slot order, and nothing a run consumes is off-screen.
- The **active entry is an ordinary numbered chip**, pinned: no remove pill, still reorderable. `_setCurrentIdx()` is the ONE place the selection moves and it re-points the chip through `_syncEntryChip()` → `promptBox.el.setPinnedMedia()`. A new site that writes `_currentIdx` directly is a stale chip.
- Reference media arrives through the **`+` card** at the head of the strip (`stageMedia: true` → `MpiMediaPicker`), or by dropping onto the PromptBox itself. **Order is meaning:** `_withAssignedRoles` fills the op's slots by strip position, so chip 1 is an edit's base — but on `control` it is the depth/pose map and the subject sits behind it. Reorder to choose.
- `mediaItems` is passed to the dispatch **as-is**. No prepend, no discard — prepending the entry would double it. This supersedes MPI-351's clear-at-mount + discard-at-run workaround, and does it structurally: that bug was an INVISIBLE chip owning `Input_Image`, and there are no invisible chips here.
- **Nothing persists.** `workspaceKey: 'history'` writes no `state.promptMedia` slot and restores none; the entry is rebuilt on every mount, references are per-edit.
- `_baseCtx.imageCount` has no `Math.max(1, …)` floor — the entry is counted as a chip. The initial `{ imageCount: 1 }` stays: it is the bootstrap that unlocks the op list before any PromptBox exists.

**The two drop zones are separate, and deliberately so.** `MpiMediaDropOverlay` (`inset: 0` on the *block root*) takes the full-area OS-file drop and fills the **Place** slot (MPI-454). The PromptBox stages a **chip** — `#prompt-box-mount` is shell-level (`index.html`), *outside* the block root, so the full-area overlay never covers it. Video groups keep the chip path on both (start/end frames).

**VIDEO groups are not this.** Their source clip is never a chip: frames come from `MpiToolOptionsPrompt`'s dedicated start/end slots, the strip stays CSS-hidden, and `_generationFromPromptPayload` still resolves the current item in code. The two branches are split on purpose — do not collapse them.

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
