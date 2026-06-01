# Mascot + logo + lettering recolor ported across all surfaces  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 1062 Legacy column: COMPLETED  ```md ### Mascot + logo + lettering recolor ported across all surfaces - tags: [design, brand, assets]
  - priority: medium
  - defaultExpanded: false
    ```md
    Recolored PNGs (Photoshop pass per docs/redesign/RECOLOR.md) landed in app
    media/assets/ and synced to siblings. App is canonical source.
    
    Synced files (hash-verified):
    - CubricStudio_Redesign/assets/: 6 files (Lettering, comfy_robot_engine*, logo)
    + CubricStudio_Redesign/logo.png (root copy).
    - Cubric Studio (Website)/assets/: logo.png + comfy_robot_engine{,_arms,_hi,_ho}.png.
    - Cubric Studio (Docs)/assets/: logo.png + renamed mascots:
    comfy_robot_engine      -> mascot_idle
    comfy_robot_engine_arms -> mascot_success
    comfy_robot_engine_hi   -> mascot_happy
    comfy_robot_engine_ho   -> mascot_surprised
    
    Lettering.png not referenced by Website/Docs HTML — skipped there.
    
    Follow-up: Website + Docs are separate git repos; commit + push from each.
    Website push still gated on app-downloadable per project_website_push_gate.md.
    ``` ``` 