# Remove local LLM / LLaMA runtime before release  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 766 Legacy column: COMPLETED  ```md ### Remove local LLM / LLaMA runtime before release - tags: [PLAN, cleanup, release]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed 2026-05-21.
    
    Plan file: docs/plans/2026-05-21-remove-local-llm-llama-runtime.md
    
    Shipped via 3 parallel workers (backend/frontend/packaging-docs) + main-agent
    sweep + Phase 2 cleanup + Phase 3 audit:
    - Backend: deleted routes/llm.js + dev_configs/llm_models.json. Stripped
    llama from server.js, routes/shared.js, routes/platformEngine.js,
    routes/engine.js, dev_configs/system_dependencies.json.
    - Frontend: deleted js/services/llmService.js. Removed Ollama URL field
    from MpiSettings, OLLAMA_URL storage key + get/setOllamaUrl helpers,
    g_abortControllers + currentLoadedModel state. memoryOps.js keeps
    /comfy/unload (F5/Ctrl+F5 intact).
    - Packaging/docs: electron-builder.yml exclusions added
    (!llama_engine/**, !llama_models/**, !.engine-config.json),
    .engine-config.json llama keys stripped (enginePath kept),
    .husky/post-checkout no longer writes llamaPath/llamaModelsPath,
    docs/PROJECT.md + worktrees.md + versioning.md scrubbed of LLAMA_VERSION
    and llamaServer references.
    - Sweep: removed dead stopLlamaServer import in routes/comfy.js, swapped
    'llm' JSDoc example in routes/logger.js to 'comfy', stripped Q3 +
    version-bump steps from .claude/skills/mpi-version-bump.md.
    - Rule edits (with user approval): .claude/rules/comfy_engine.md,
    component-state.md, component-mounts.md scrubbed of LLaMA/Ollama drift.
    - Physical: deleted llama_engine/ (545 MB) + llama_models/ (7.2 GB).
    .gitignore defensive entries kept.
    - Dependency hygiene: npm audit fix resolved 4 vulns (1 high axios,
    3 moderate brace-expansion/follow-redirects/uuid). 0 vulnerabilities now.
    
    Verification: lint 0 errors (29 pre-existing warnings unchanged), server
    boots clean on :3000, /engine/status + /comfy/status return Comfy-only
    responses, /llm/* returns 404 (route gone). UI run + smoke:app deferred
    to user discretion.
    
    Residual references are intentional: packaging exclusions, .gitignore
    defensive entries, historical docs/plans/**, false-positive substrings
    (installedAllModels, MpiModelsModal, fullMessage, shellMarginTop).
    ``` ``` 