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

### Project page issues

  - tags: [Bug, Feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: true
    ```md
    - Change Project Page Projects Delete Behavior
    To delete a project currently in the project page, there is a trash icon that appears when moving the project. We would like to change this to be able to delete the project on a right click instead. This should use our current context custom menu. 
    -  The open folder buttons do not seem to be wired and are throwing an error on the projects page. 
    
    Error occurred in handler for 'dialog:openFolder': Error: No handler registered for 'dialog:openFolder'
        at Session.<anonymous> (node:electron/js2c/browser_init:2:116575)
        at Session.emit (node:events:508:28)
    [2026-05-09T03:22:05.806Z] [ERROR] [projectUI] openFolder failed ÔÇö Error: Error invoking remote method 'dialog:openFolder': Error: No handler registered for 'dialog:openFolder'
        at IpcRenderer.invoke (node:electron/js2c/renderer_init:2:9840)
        at async _openFolder (http://127.0.0.1:3000/js/shell/projectUI.js:81:22)
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

