---
rules_dir: .claude/rules
critical_snapshot_file: CLAUDE.md
critical_snapshot_anchor: critical-rules-snapshot-applies-to-all-agents-always-no-file-read-required
rules:
  - name: kanban
    file: kanban.md
  - name: dos_and_donts
    file: dos_and_donts.md
  - name: components
    file: components.md
  - name: events
    file: events.md
  - name: state
    file: state.md
  - name: workspaces
    file: workspaces.md
  - name: downloads
    file: downloads.md
  - name: versioning
    file: versioning.md
  - name: comfy_engine
    file: comfy_engine.md
  - name: comfy_injection
    file: comfy_injection.md
  - name: component-mounts
    file: component-mounts.md
  - name: component-events
    file: component-events.md
  - name: component-state
    file: component-state.md
  - name: component-comfy
    file: component-comfy.md
  - name: component-events-primitives
    file: component-events-primitives.md
  - name: component-events-blocks
    file: component-events-blocks.md
  - name: component-events-organisms
    file: component-events-organisms.md
  - name: component-events-lifecycle
    file: component-events-lifecycle.md
bundles:
  - name: frontend-worker
    rules: [kanban, dos_and_donts, components, events, state]
  - name: comfy-worker
    rules: [kanban, dos_and_donts, comfy_engine, comfy_injection]
  - name: component-maps
    rules: [component-mounts, component-events, component-state, component-comfy]
---

# mpi-brief-rule config

Config for `/mpi-brief-rule <name>` — CLAUDE.md § Sub-Agent Dispatch step 1.
Without this file `loadConfig()` returns `null` and the MANDATORY briefing step
emits "No mpi-kanban config found" and stops for every rule name. It was missing
until 2026-08-08, so every sub-agent dispatched before that date started with no
briefing at all.

`kanban` is first in every bundle on purpose: it carries § File claims and the
ban on `git checkout --` / `git restore` / `git stash` / `git reset --hard` /
`git clean` on a shared tree.

Rules with no `## Sub-Agent Briefing` section, so deliberately unlisted:
`README.md` (index), `comfy_injection_multistage.md`, `git.md` (its content is
carried by the kanban briefing).
