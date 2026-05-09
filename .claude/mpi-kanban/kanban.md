## BACKLOG

### Patreon landing page images

  - tags: [Idea]
  - priority: low
  - defaultExpanded: true
    ```md
    - Use Patreon users images for the landing page on each version.
    ```

### Additive model folders in settings

  - tags: [Idea]
  - priority: low
  - defaultExpanded: true
    ```md
    - Explore adding to settings additive folders for models.
    ```

### Resize tool

  - tags: [feature]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Add resize tool.
    ```

### Trim tool

  - tags: [feature]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Add trim tool + timeline thumbnails.
    ```

### Port redesign to Cubric Studio website

  - tags: [feature, design]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Port new design from `c:\AI\Mpi\CubricStudio_Redesign\` to `c:\AI\Mpi\Cubric Studio (Website)\`.
    - Single-page marketing site. Apply OKLCH tokens, Stage component primitives, mascot/logo recolor per RECOLOR.md.
    - Reference spec: `docs/redesign/PRODUCT.md`, `DESIGN.md`, `c-stage/landing.html`.
    - Separate git repo — commit independently.
    ```

### Port redesign to Cubric Studio documentation site

  - tags: [feature, design]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Port new design from `c:\AI\Mpi\CubricStudio_Redesign\` to `c:\AI\Mpi\Cubric Studio (Docs)\`.
    - Documentation website. Apply OKLCH tokens, Stage component primitives, doc-appropriate type scale.
    - Reference spec: `docs/redesign/PRODUCT.md`, `DESIGN.md`.
    - Separate git repo — commit independently.
    ```

## PLANNING

### Cross-platform portable distribution

  - tags: [PLAN]
  - priority: medium
  - defaultExpanded: true
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
    ```

### Madpony Patreon Revamp (User Action)

  - tags: [PLAN]
  - priority: low
  - workload: Easy
  - defaultExpanded: true
    ```md
    Plan File: docs\plans\2026-04-28-madpony-patreon-revamp.md
    ```

## IMPLEMENTING

### Setup video generation

  - tags: [Implementation completion]
  - priority: high
  - workload: Hard
  - defaultExpanded: false
    ```md
    Video generation hasn't been tested. The outputs from Coffee Y are different from the image outputs. It needs to be tested. Some workflows output several stages that need to be handled. This should be a cooperative session with the dev.
    ```

## COMPLETED

### History delete leaves no selected entry, prompt box missing

  - tags: [bug]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Deleting history entries left no card highlighted and PromptBox hidden.
    Root causes:
    1. `MpiHistoryList.el.removeEntries(indices)` rebuilt cards but never reset `_selectedIdx` — `_applyCardStates` toggled active on stale (now-invalid) idx.
    2. Block called `historyList.el.exitSelectMode()` pre-delete; instance API only cleared `_selection` Set silently — no `selection-exited` emit. Block's `selection-exited` listener (the only place that re-shows PromptBox after multi-select) never fired. PromptBox stayed hidden from the earlier `selection-changed` hide.
    Fix:
    - `removeEntries(indices, newSelectedIdx = 0)` clamps + sets `_selectedIdx`, anchors there, rebuilds.
    - Block delete handler passes `_currentIdx`, resets `_currentSelectionIndices = []`, clears compare, re-shows PromptBox if active mode is prompt.
    Files: js/components/Compounds/MpiHistoryList/MpiHistoryList.js, js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js.
    ```

### Project cards not displaying video

  - tags: [Bug]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Landing rows now render `<video preload=metadata muted loop playsInline>` when the most-recent Media entry is `.mp4`/`.webm`. First frame shows static; row mouseenter plays, mouseleave pauses + rewinds. Mirrors `MpiGalleryGrid._swapThumbToVideo` pattern — no new system.
    
    Server `/list-projects` returns sibling field `recentThumbnailType` ('image'|'video') derived from extension; existing `recentThumbnail` URL kept for back-compat.
    
    Files: routes/projects.js, js/shell/projectUI.js, styles/shell/landing.css.
    ```

### History entry naming + sidecar dimensions inconsistency

  - tags: [bug]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Root causes:
    1. `operation` field on hydrated items contained op key ("upscale"), but fresh in-session items overwrote it with sequenced filename ("upscale_001"). Result: same item displayed differently before vs after project reload.
    2. Operations without ratio control (upscale/detail/edit/change/remove) sent no Width/Height injection params → `pixelDimensions` saved as `{0,0}` in sidecar.
    
    Fix at root:
    - Sidecar gains `displayName` field (filename stem). `operation` keeps op key only. Card label uses `displayName || operation`.
    - save-generation route probes saved file via `sharp.metadata()` when client didn't supply dims, so dims always populated regardless of injection params.
    - History card now shows `WxH · Ns` (dot separator + rounded seconds) when `generationMs` present.
    - generationService, MpiCanvasViewer crop, reconciler synthetic items, projectModel defaults all updated to carry `displayName` + `generationMs`.
    
    Files: routes/projects.js, js/services/generationService.js, js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js, js/components/Compounds/MpiHistoryList/MpiHistoryList.js, js/data/projectModel.js, js/managers/projectReconciler.js.
    
    Pre-release: no schema migration; existing test sidecars stale, user deletes test project.
    ```

### Toast too low.

  - tags: [issue]
  - priority: medium
  - workload: Normal
  - defaultExpanded: true
    ```md
    Toast base positioning now uses CSS variables and raises the stack only when a visible PromptBox is mounted, keeping normal toast placement unchanged elsewhere.
    File: js/components/Primitives/MpiToast/MpiToast.css.
    ```

### When applying a crop, the crop box goes away.

  - tags: [Bug]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    - Let's make sure that the crop box stays until another tool is selected or a selection is made. 
    - Let's use this kanban entry also to update the looks of the crop box, as the handles still do not match the mock-up design. You may ask the user for a visual of how it should look.
    ```

### Status bar not updating correctly

  - tags: [issue]
  - priority: medium
  - workload: Normal
  - defaultExpanded: true
    ```md
    Fixed status bar timing so model initialization does not start elapsed generation time.
    Backend bridges ComfyUI terminal phase lines (`Model Initializing ...`, `Model Initialization complete!`) over `/comfy/events/stream`.
    commandExecutor starts `tool:sampling-start` on model-init-complete, preview, or real sampler progress; UltimateSDUpscale remains heuristic because it reports useful latent/progress late.
    Files: routes/comfy.js, js/services/commandExecutor.js, js/services/progressAggregator.js, js/services/generationService.js, docs/shell.md, .claude/rules/component-events.md, .claude/rules/comfy_engine.md.
    ```

### Pop-up menu in the prompt box

  - tags: [issue]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Settings popup closed when sub-popup (ratio orient toggle, ratio item, batch number) clicked.
    Cause: sub-popup click handlers in MpiOptionSelector rewrote `grid.innerHTML` / `trigger.innerHTML` synchronously, detaching `e.target` before parent (PromptBox settings) document-level outside-click listener ran on bubble. Parent's `e.target.closest('.mpi-popup')` exclusion walked detached node → null → parent treated as outside-click → closed.
    Fix at root: `e.stopPropagation()` at the top of every click/change handler on `popupEl` in MpiOptionSelector (ratio, number, buttons variants + speed radio). Sub-popup interactions never reach document-level listeners; mutation is irrelevant to parent.
    File: js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js.
    ```

### Full screen OS bar not hidden

  - tags: [bug]
  - priority: medium
  - defaultExpanded: true
    ```md
    F11/native fullscreen now hides the custom titlebar and collapses the shell's titlebar offset via `body.window-fullscreen`.
    Files: main.js, js/shell/windowControls.js, styles/shell/titlebar.css, tests/desktop/fullscreen-titlebar.spec.js.
    ```

### Project page issues

  - tags: [Bug, Feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Fix 1 (delete UX): row trash button removed; right-click on a project row opens MpiContextMenu with "Delete project" → MpiOkCancel confirm flow.
    Fix 2 (open folder IPC): `_openFolder` was invoking missing `dialog:openFolder`; switched to existing `choose-folder` handler in main.js.
    Fix 3 (default root location): projects no longer created inside app install dir. New default root = `<Documents>/Cubric Studio/Projects` via `app.getPath('documents')` (cross-platform Win/Mac/Linux). Implemented as `getProjectsRoot()` getter in routes/shared.js; main.js passes `APP_DOCUMENTS` env to server. Default-root projects skip the "Also delete files" checkbox in confirm dialog (always purge, since the folder is app-managed). `isDefaultRoot` flag added to /list-projects response. .gitignore `projects/` removed.
    Files: main.js, routes/shared.js, routes/projects.js, js/shell/projectUI.js, js/services/projectService.js, styles/shell/landing.css, .gitignore, docs/PROJECT.md.
    ```

### History workspace multi-select prompt box bug

  - tags: [bug]
  - priority: high
  - defaultExpanded: false
    ```md
    No-modifier card click after multi-select cleared selection but never emitted `selection-exited`, so PromptBox stayed hidden.
    Fix: MpiHistoryList _makeCard — emit `selection-exited` when collapsing from multi to single.
    ```

### Electron elements still gain focus.

  - tags: [bug]
  - priority: high
  - defaultExpanded: true
    ```md
    - Electron elements still gain focus. 
    - For example the slider in the gallery, when it's moved with the mouse, the plus and minus keys stop working to change the scale of the gallery.
    ```

### History page, right panel, not scrollable.

  - tags: [issue, bug]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    Tool panel (right-top) + history list (right-bottom) now scroll as one column.
    Fix: MpiGroupHistoryBlock.css — right column flex+overflow-y:auto, top row flex:0 0 auto, bottom row no own scroller.
    ```

### Mask persistence for layered masks

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: false
    ```md
    Plan file: docs/plans/2026-04-29-layered-mask-persistence.md
    
    Steps:
    - [x] 1. Layered MaskManager + MpiCanvas API surface
    - [x] 2. Backend IPC route + main.js session lifecycle
    - [x] 3. Frontend maskTempStore service
    - [x] 4. Viewer wiring: swap, mode entry, getCurrentMaskDataURL, loadEntry
    - [x] 5. Auto-mask per-pick masks + executor protocol change
    - [x] 6. Empty-detection toast
    - [x] 7. clearMask + history-entry switch + tool teardown purge
    ```

