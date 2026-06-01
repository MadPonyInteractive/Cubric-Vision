# In-app error reporter — stage-aware GitHub Issues routing  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 58 Legacy column: BACKLOG  ```md ### In-app error reporter — stage-aware GitHub Issues routing - tags: [feature, telemetry, bug-tracking]
  - priority: high
  - defaultExpanded: false
    ```md
    Cross-repo work from MPI Discord revamp session (2026-05-29).

    In-app error reporter must auto-route to per-app GitHub Issues with a
    `stage:alpha|beta|release` label derived from the build's stage.
    Discord testing rooms (#alpha-testing for Tier 3, #beta-testing for
    Tier 2+) own the repro conversation; GitHub owns the canonical bug
    record. Stage labels keep finished-release Issues clean of pre-release
    churn.

    Scope:
    - Detect build stage at reporter init (env var / build constant).
    - Add `stage:<x>` + `auto-report` + build-hash labels to created Issues.
    - Include Discord channel deeplink in Issue body when reporter triggers
      mid-tester-session (defer — needs Discord context capture).

    Policy reference (MPI repo):
    - `~/.claude/projects/c--AI-Mpi-MadPony-Identity/memory/cubric-bug-tracking-policy.md`
    - `c:\AI\Mpi\MadPony-Identity\docs\plans\2026-05-26-madpony-discord-revamp.md` §4
      (#alpha-testing / #beta-testing channels)
    ``` ``` 