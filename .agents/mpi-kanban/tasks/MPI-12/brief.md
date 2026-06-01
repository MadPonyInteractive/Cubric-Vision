# History Workspace Load Time  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 311 Legacy column: COMPLETED  ```md ### History Workspace Load Time - defaultExpanded: false
    ```md
    Completed 2026-05-25 by claude-opus-4.7. User-verified.

    Root cause: opening a 4K/8K image group required Image() decode +
    canvas buffer allocation + resetView. Centre slot stayed blank for
    seconds. Spinner element already mounted on MpiCanvasViewer but was
    only toggled by `setGenerating` (generation flow). Same stall on
    history-entry switches and tool swaps (prompt ↔ crop/mask
    canvas remount).

    Fix: split spinner control into two independent flags OR'd onto the
    same `.mpi-canvas-viewer__spinner--visible` class:
      • `_isGenerating` — driven by existing `el.setGenerating`
      • `_isLoading`    — new, driven by internal `_setLoadingSpinner`

    Wrapped `loadEntry`, `swapToPreview`, `swapToCanvas` with
    `_setLoadingSpinner(true/false)` via try/finally. Initial load,
    history-entry click, and tool swap now show spinner during decode/
    remount. Subsequent swaps to already-decoded entries paint instantly
    (no spinner needed — browser caches the image).

    Video viewer skipped — no spinner mount exists; revisit if 4K video
    stall is confirmed.

    Files: js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js
    Memory: project_canvas_viewer_spinner_flags.md
    ``` ``` 