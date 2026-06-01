# Cross-platform portable distribution  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 181 Legacy column: PLANNING  ```md ### Cross-platform portable distribution - tags: [PLAN]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
    Sequencing lock 2026-05-21: start after current app implementation work and
    hub readiness. After portable distribution is ready and tested, handle
    website/Patreon/social/docs release surfaces before public release.
    
    Install + model verification (run AFTER this implementation):
    The "Model Manager slide-over and zero-model gating" plan defers its
    Phase 6 manual install/model session here to avoid a duplicate
    large-download test pass. Once portable distribution is implemented, run
    one combined fresh-install session:
    1. clean portable app/user-data/engine state
    2. first launch + engine install/repair
    3. project page → confirm Models discoverable
    4. empty/new project zero-model → Models slide-over auto-opens;
    existing-media project zero-model → read-only, no PromptBox
    5. install one model (or seed model files + UI refresh/resync)
    6. confirm first installed model unlocks PromptBox/generation
    7. generate one image
    8. restart → installed-model detection persists
    Note in final results whether the real download path or the seeded-file
    resync path was exercised.
    Source: docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md Phase 6.
    ``` ``` 