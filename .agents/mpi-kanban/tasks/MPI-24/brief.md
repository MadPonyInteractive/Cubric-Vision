# Queue panel should stay open when canceling queued jobs  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 626 Legacy column: COMPLETED  ```md ### Queue panel should stay open when canceling queued jobs - tags: [queue, ui]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Fix queued-job cancel behavior so it does not dismiss the Queue panel.
      - [x] Verify Queue panel only closes from its explicit close control.
    ```md
    Completed 2026-05-25.
    
    Root cause: MpiSlideOver outside-click handler used `el.contains(e.target)`.
    Queue panel cancel rerendered the list synchronously via `replaceChildren()`,
    detaching the cancel button before the click bubbled to the document handler.
    `el.contains(detachedButton)` returned false, triggering false outside-close.
    
    Fix: MpiSlideOver.js _onDocClick now skips detached targets
    (`e.target?.isConnected` guard). Applies to any slide-over whose content
    swaps DOM on an internal action (Models uninstall, etc.).
    
    Files: js/components/Compounds/MpiSlideOver/MpiSlideOver.js
    Lint: clean.
    Verified by user 2026-05-25.
    ``` ``` 