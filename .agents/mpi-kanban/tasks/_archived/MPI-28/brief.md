# Model Manager slide-over and zero-model gating  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 718 Legacy column: COMPLETED  ```md ### Model Manager slide-over and zero-model gating - tags: [PLAN, models, ux, install]
  - priority: high
  - defaultExpanded: false
    ```md
    Plan file: docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md
    
    Completed 2026-05-22 (code). Phase 6 manual install test deferred to the
    cross-platform portable distribution session — see below.
    
    Shipped:
    - NEW MpiModelManager (Compound, slide-over content) at
    js/components/Compounds/LandingPages/MpiModelManager/. Owns cards,
    refresh, install, pause/resume/cancel, uninstall confirm, all download:*
    subs. el.onOpen() re-syncs; el.destroy() tears down. No overlay.
    - DELETED js/components/Blocks/MpiModelsModal/ (block, 3 files).
    - shell.js: models:open now re-emits slide-over:open{title:'Models',
    component:MpiModelManager}. Removed modal singleton, _modelsModalAutoOpened,
    models:closed + models:all-installed listeners.
    - projectUI.js: added "Models" project-page nav action (first, before
    Settings/Help/About), all via slide-over:open.
    - Phase 3: removed PromptBox global download/model-manager icon. No
    in-workspace model-manager entry point (project-page slide-over only).
    - Phase 5 (option A): dropped models:closed entirely. Gallery mounts
    PromptBox off s_installedModelIds state, not modal close. Zero-model
    gate: empty/new project (itemGroups.length===0) auto-opens Models
    slide-over; project WITH media opens read-only, no PromptBox. History
    always read-only when zero models (re-resolves activeModel on install
    so PromptBox can mount post-install).
    - Dead-event cleanup: removed models:closed + models:all-installed from
    events.js registry; removed the orphaned models:all-installed emit +
    allInstalled block in modelRegistry.js (only consumer was deleted modal).
    - Docs/rules drift: component-events, component-mounts, component-state,
    workspaces rules + docs/workspaces.md + redesign/MAPPING.md updated.
    
    Verification: eslint 0 errors across all touched files; no `npm run build`
    script exists (vanilla ESM — lint is the static gate). Residual
    MpiModelsModal/models:closed/all-installed matches are intentional code
    comments, doc tombstones, and historical docs/plans|archive.
    
    PENDING — Phase 6 manual install session (deferred, coordinate with
    cross-platform portable distribution plan): fresh engine install →
    Models discoverable → zero-model gate/read-only → install/seed one model
    → PromptBox unlocks → generate one image → restart persistence. Distinguish
    download-path vs seeded-file-resync path in final notes.
    ``` ``` 