# Add missing prompt box parameters for individual operations.  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 698 Legacy column: COMPLETED  ```md ### Add missing prompt box parameters for individual operations. - tags: [feature]
  - priority: high
  - workload: Normal
  - defaultExpanded: false
    ```md
    Completed 2026-05-23. Developer dogfooding covered the remaining checks;
    any later findings will be tracked separately.
    
    2026-05-22: Restructured `modelSettings[modelId]` to nest per-op state
    under `operations.{shared, [opName]}`. PromptBoxControls now declare
    `scope: 'shared' | 'perOp'`. Added `denoise` control to `detail` op
    (default 0.30 via `commands[op].defaults`), independent from `upscale`
    denoise (default 0.20). Adds a clean path for future per-op controls
    without key collisions. Rule files updated (state, component-state,
    component-events, component-comfy, comfy_injection). Memory entry
    added enforcing the workflow-JSON read-only rule.
    ``` ``` 