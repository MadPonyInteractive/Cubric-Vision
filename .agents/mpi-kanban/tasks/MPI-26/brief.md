# Cubric hub readiness before portable distribution  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 672 Legacy column: COMPLETED  ```md ### Cubric hub readiness before portable distribution - tags: [PLAN, hub, integration, release]
  - priority: high
  - defaultExpanded: false
    ```md
    Completed planning 2026-05-23.
    
    Plan file: docs/plans/2026-05-23-cubric-hub-readiness-before-portable-distribution.md
    
    Outcome: Cubric Vision portable distribution can proceed without live
    connector runtime integration, as long as the portable build preserves
    `resources/cubric/connector-manifest.json` and defines/verifies the future
    `resources/cubric/update-manifest.json` connector fields. Hub/broker
    packages do not need to be bundled into the first Vision portable artifact
    unless a connector-dependent feature is promoted.
    
    Pre-portable gates now live in the child plan:
    - preserve connector manifest in staged artifacts
    - rename portable artifacts/launchers from CubricStudio_* to CubricVision_*
    - generate update-manifest connector fields from the staged manifest
    - add a build smoke assertion for connector metadata
    - defer hub repo git/workspace/tooling to Stage 3+ unless live connector
    features are promoted
    ``` ``` 