## BACKLOG

### Full screen OS bar not hidden

  - tags: [bug]
  - priority: medium
  - defaultExpanded: true
    ```md
    - Full screen does not remove the custom top OS bar.
    ```

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

### Status bar not updating correctly

  - priority: medium
  - workload: Normal
  - defaultExpanded: true
    ```md
    Status bar displays generating before the actual generation process starts while the model is still loading.
    ```

### Pop-up menu in the prompt box

  - tags: [issue]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    The prompt box has an issue right now. When we open up the pop-up menu to change models and ratio, for example, and other tools opening the sub-pop-up menus in it and making a selection closes all the pop-up menus, the user might have not finished with the sub-pop-up menu, and it becomes frustrating.
    For example, opening the pop-up menu and then opening the ratio menu and selecting from portrait to landscape closes all menus. It shouldn't.
    ```

### Toast too low.

  - tags: [issue]
  - priority: medium
  - workload: Normal
  - defaultExpanded: false
    ```md
    The Toast currently appears at the bottom right of the screen, but when the prompt box is present, the Toast appears on top of the buttons of the prompt box. It would be nice for the Toast to appear above him, so we need to move it up a little bit.
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

## COMPLETED

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

