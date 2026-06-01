# Escape should blur the PromptBox text field  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 569 Legacy column: COMPLETED  ```md ### Escape should blur the PromptBox text field - tags: [promptbox, hotkeys, focus]
  - priority: medium
  - workload: Easy
  - defaultExpanded: false
  - steps:
      - [x] Add Escape blur behavior for the PromptBox input.
      - [x] Verify app hotkeys work again after Escape blurs PromptBox.
    ```md
    Completed 2026-05-25.
    
    Implementation:
    - New hotkey registry entry `promptBox.blur` (escape, allowWhileTyping:true,
    when-gated to textarea inside `.mpi-prompt-box`) so blur composes with
    existing escape handlers (overlay.close, focusMode.exit,
    gallery.selection.exit) instead of bypassing the registry / text-input
    gate.
    - MpiPromptBox binds `Hotkeys.bind('promptBox.blur', () => textareaEl.blur())`
    with unsub via `_unsubs`. Text value untouched.
    - MpiHelp.js: new "Prompt Box" group with ESCAPE row (registry comment
    requires hand-authored help to mirror new bindings).
    
    Files:
    - js/managers/hotkeyRegistry.js
    - js/components/Organisms/MpiPromptBox/MpiPromptBox.js
    - js/components/Compounds/LandingPages/MpiHelp/MpiHelp.js
    
    Verified: user confirmed Escape blurs the PromptBox, prompt text preserved,
    app hotkeys regain focus after blur, no escape-handler regressions
    elsewhere. Lint 0 errors across changed files.
    ``` ``` 