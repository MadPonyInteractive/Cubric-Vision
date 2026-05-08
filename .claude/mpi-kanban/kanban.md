## BACKLOG

### Electron elements still gain focus.

  - tags: [bug]
  - priority: high
  - defaultExpanded: true
    ```md
    - Electron elements still gain focus. 
    - For example the slider in the gallery, when it's moved with the mouse, the plus and minus keys stop working to change the scale of the gallery.
    ```

### History workspace multi-select prompt box bug

  - tags: [bug]
  - priority: high
  - defaultExpanded: true
    ```md
    - On the History workspace, multi-selecting and then just selecting one entry doesn't bring the prompt box back in prompt box mode.
    ```

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

### Mask persistence for layered masks

  - tags: [PLAN]
  - priority: high
  - defaultExpanded: true
    ```md
    Plan file: docs/plans/2026-04-29-layered-mask-persistence.md

    Steps:
    - [x] 1. Layered MaskManager + MpiCanvas API surface
    - [x] 2. Backend IPC route + main.js session lifecycle
    - [ ] 3. Frontend maskTempStore service
    - [ ] 4. Viewer wiring: swap, mode entry, getCurrentMaskDataURL, loadEntry
    - [ ] 5. Auto-mask per-pick masks + executor protocol change
    - [ ] 6. Empty-detection toast
    - [ ] 7. clearMask + history-entry switch + tool teardown purge
    ```

## COMPLETED

