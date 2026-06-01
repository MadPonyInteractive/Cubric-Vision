# PromptBox text field should auto-contract as text is deleted  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 491 Legacy column: COMPLETED  ```md ### PromptBox text field should auto-contract as text is deleted - tags: [promptbox, ui]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Fix PromptBox text-area sizing so height follows current content.
      - [x] Verify PromptBox text-area auto-contract behavior.
    ```md
    Completed 2026-05-25 by claude-opus-4.7-c. User-verified.
    
    Root cause: live textarea `scrollHeight` was caching the previous expanded
    layout. Setting `style.height = '0px'` (or `'auto'`) before measuring did
    not collapse the layout box — likely interaction between CSS `min-height:
    32px` and the grid parent's `align-items: end`. Result: after delete,
    `scrollHeight` reported the stale expanded height, so the textarea
    refused to contract.
    
    Fix: hidden mirror textarea probe (`_heightProbe`) appended to body with
    `height:0;min-height:0;max-height:none;overflow:hidden`. On each
    `updateHeight()` call, copy current value + font/padding/lineHeight/
    boxSizing/letterSpacing into the probe, set its width to the live
    textarea's `clientWidth`, then read the probe's `scrollHeight` as the
    ground-truth content height. Apply `Math.min(Math.max(sh, 32), 224)`
    clamp to the live textarea. Probe removed on `destroy` via `_unsubs`.
    
    File: js/components/Organisms/MpiPromptBox/MpiPromptBox.js (~line 546).
    ``` ``` 