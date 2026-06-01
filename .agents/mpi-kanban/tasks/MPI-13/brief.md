# Help page UI improvement  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 342 Legacy column: COMPLETED  ```md ### Help page UI improvement - defaultExpanded: false
    ```md
    Completed 2026-05-25 by claude-opus-4.7. User-verified.

    Each `.mpi-help__shortcut-group` now renders as its own darker card
    (`--surface-2` bg, `--line` border, `--r-2` radius, 0.85rem/1rem padding)
    so hotkey sections are visually separated. Grid gap tightened
    1.5rem → 0.75rem since each section now has its own visible frame.
    Hotkey chip bg switched `--surface-2` → `--surface-1` so chips contrast
    against the new darker group bg.

    Files: js/components/Compounds/LandingPages/MpiHelp/MpiHelp.css
    ``` ``` 