# Video upscale should finish cleanly instead of sticking at 100%  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 449 Legacy column: COMPLETED  ```md ### Video upscale should finish cleanly instead of sticking at 100% - tags: [video, universal-workflows, status]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
  - steps:
      - [x] Verify whether video upscale completes in ComfyUI outside the app flow.
      - [x] Fix app-side completion/import/status cleanup for video upscale.
      - [x] Verify Video Workspace upscale completes through the app.
    ```md
    Completed 2026-05-25 by claude-opus-4.7. User-verified.
    
    Root cause: `progressAggregator.onProgressState` blanket-marked every
    node of kind `imageUpscale` or `vhs` as finished as soon as ANY other
    node entered the `running` state. For `video_upscale.json` this hit all
    three weighted nodes (`VHS_LoadVideoPath`, `ImageUpscaleWithModel`,
    `VHS_VideoCombine`) on the first `progress_state` snapshot, flipping
    aggregate percent to 1.0 before the upscale actually ran. Monotonic
    `_advance` then locked the status bar at 100%, while ComfyUI was still
    executing — making the workflow look stuck.
    
    Fix: removed the kind-based blanket auto-finish. Now only nodes that
    previously reported `fraction > 0` AND are absent from the current
    snapshot get auto-finished (preserves the legacy-Comfy fallback where
    finished nodes drop from progress_state). Explicit
    pending/running/finished states from ComfyUI take precedence.
    
    File: js/services/progressAggregator.js (~lines 164-179).
    
    Original problem framing assumed completion/import was broken; actual
    bug was purely progress reporting. App was waiting correctly, but the
    100% display caused the user to manually cancel runs they thought were
    stuck.
    ``` ``` 