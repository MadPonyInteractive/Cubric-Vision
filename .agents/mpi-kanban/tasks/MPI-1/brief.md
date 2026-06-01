# GitHub Discussions — feature request canonical surface  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 3 Legacy column: BACKLOG  ```md ### GitHub Discussions — feature request canonical surface - tags: [feature, github, community, workflow]
  - priority: high
  - defaultExpanded: false
    ```md
    Cross-repo work from MPI Discord revamp session (2026-05-29).

    Enable + configure GitHub Discussions on cubric-vision repo as the
    canonical channel for feature requests. Discord = doorway, GitHub =
    durable record. Tier-weighted triage via labels.

    **Setup checklist (one-time per Cubric app repo):**
    - [ ] Enable Discussions (Settings → Features → Discussions ✓)
    - [ ] Create categories: `Feature Request` (votable), `Idea`, `Q&A`, `Announcements`
    - [ ] Create labels: `tier:pro` (priority sort), `early-access-voted`,
          `roadmap:planned` (mirrors Trello card), `roadmap:shipped`
    - [ ] Pin "How to request features" Discussion explaining tier-weighted
          flow (Public/Supporter → low weight, Early Access → vote weight,
          Pro → priority weight)
    - [ ] Link to Trello board (https://trello.com/b/wg1r5aYz/cubric-vision)
          from pinned Discussion — Trello = roadmap source-of-truth

    **Per-feature-request workflow (recurring, Fabio operates):**
    1. Tester posts in Discord #feedback / #beta-testing / #alpha-testing
    2. Fabio acknowledges in thread
    3. If worth tracking: open GitHub Discussion (or ask tester to), cross-link
       Discord ↔ GitHub
    4. Apply tier label (`tier:pro` / `early-access-voted`)
    5. When promoted to roadmap: add `roadmap:planned` + create Trello card +
       cross-link back to Discussion
    6. When shipped: close Discussion + `roadmap:shipped`

    **Triage cadence (weekly + per-release):**
    - Sort Discussions by Pro-label first, then Early Access vote, then 👍 count
    - Pick top N → Trello → ship

    **Future automation flag:** this workflow is a strong candidate for the
    MPI cross-surface orchestration layer (Hermes/custom). Once that ships,
    auto-route Discord posts → GitHub Discussions, auto-apply tier labels
    by checking poster's Discord role, auto-create Trello cards on
    `roadmap:planned`. See MPI memory:
    `cubric-feature-request-workflow-automation.md`

    Policy references (MPI repo):
    - `~/.claude/projects/c--AI-Mpi-MadPony-Identity/memory/cubric-feature-request-policy.md`
    - `c:\AI\Mpi\MadPony-Identity\docs\plans\2026-05-26-madpony-discord-revamp.md` §4
      (#feedback / #beta-testing / #alpha-testing channel topics)
    - `c:\AI\Mpi\MadPony-Identity\docs\plans\2026-04-28-madpony-patreon-revamp.md`
      (tier benefits — tighten "priority on feature requests" copy)

    Repeat setup checklist per Cubric app repo as they spin up (Cubric Audio,
    Cubric Prompt, Cubric Video).
    ``` ``` 