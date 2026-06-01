# Clean up ComfyUI terminal output classification  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 602 Legacy column: COMPLETED  ```md ### Clean up ComfyUI terminal output classification - tags: [comfy, logging, terminal]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Normalize ComfyUI terminal/log output severity labels.
      - [x] Verify normal ComfyUI output no longer appears as errors.
    ```md
    Completed 2026-05-25.
    
    Fixed duplicated/false severity in app logs. Electron now preserves
    structured server log severity/category instead of wrapping child stderr as
    `[ERROR] [server]`. ComfyUI routine stderr/status lines such as `got prompt`
    now classify as info; explicit Warning lines remain warn and real
    error/traceback/failure lines remain error.
    
    Files: main.js, routes/comfy.js
    Checks: node --check main.js; node --check routes/comfy.js; npm run lint
    (0 errors, existing warnings only).
    Verified by user 2026-05-25.
    ``` ``` 