---
schema: mpi-kanban/project-knowledge-index/v1
profile: .agents/mpi-kanban/project-profile.md
last_refresh: 2026-05-23
---

# Project Knowledge Index

## How To Use

Topic-to-files map. Match the topic closest to the current task and read the listed files first. If no topic matches, read the profile and ask the user for a pointer rather than scanning the repo.

## Topics

### Components & UI

- **Read first:** `docs/components.md`
- **Rules:** `.claude/rules/components.md`, `.claude/rules/dos_and_donts.md`, `.claude/rules/component-mounts.md`, `.claude/rules/component-events.md`, `.claude/rules/component-state.md`
- **Memory:** none

### Events & cross-component communication

- **Read first:** `docs/events.md`
- **Rules:** `.claude/rules/events.md`, `.claude/rules/component-events.md`
- **Memory:** none

### Application state

- **Read first:** `js/state.js`
- **Rules:** `.claude/rules/state.md`, `.claude/rules/component-state.md`
- **Memory:** `project_zero_model_promptbox_gate.md`

### Workspaces & routing

- **Read first:** `docs/workspaces.md`
- **Rules:** `.claude/rules/workspaces.md`
- **Memory:** none

### ComfyUI workflow injection

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_injection.md`, `.claude/rules/component-comfy.md`
- **Memory:** `feedback_comfy_workflows_readonly.md`

### ComfyUI engine / backend / models

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_engine.md`
- **Memory:** `project_comfy_models_path_source.md`, `project_model_type_vs_mediatype.md`

### Downloads

- **Read first:** `docs/comfy.md#download-manager`
- **Rules:** `.claude/rules/downloads.md`
- **Memory:** none

### Project data & integrity

- **Read first:** `docs/project-integrity.md`, `docs/projects.md`, `docs/data.md`
- **Rules:** none
- **Memory:** none

### Versioning & migrations

- **Read first:** `docs/versioning.md`
- **Rules:** none
- **Notes:** APP_VERSION, SCHEMA_VERSION, COMFY_VERSION, operation registry.

### Shell, overlays, hotkeys

- **Read first:** `docs/shell.md`
- **Rules:** none
- **Notes:** all blocking UI via `Overlays.request/release`; hotkeys via `Hotkeys.bind` + `hotkeyRegistry.js`.

### Utilities (DOM, icons, ratios, seed)

- **Read first:** `docs/utils.md`
- **Rules:** `.claude/rules/dos_and_donts.md`
- **Memory:** none

### Stage UI baseline (Redesign)

- **Read first:** `docs/redesign/PORTING.md` (only for new surfaces or phases >10.2)
- **Rules:** `.claude/rules/components.md` § "Stage design baseline", `styles/01_base.css`
- **Notes:** Stage redesign merged at `e9b5eb6`; routine work uses live tokens, not spec.

### Worktrees & engine sharing

- **Read first:** `docs/worktrees.md`
- **Notes:** `.engine-config.json` shares ComfyUI engine across worktrees.

### Debugging runtime issues

- **Read first:** `logs/app.log` (last 50–100 lines via `Read` offset only — never full)
- **Notes:** server crashes, python engine, generation failures.

### Sibling website / docs

- **Read first:** `c:\AI\Mpi\Cubric Studio (Website)\`, `c:\AI\Mpi\Cubric Studio (Docs)\`, design source at `c:\AI\Mpi\CubricStudio_Redesign\`
- **Memory:** `project_website_subdomain_strategy.md`
- **Notes:** separate repos; use absolute paths and `git -C`; CLAUDE.md does NOT auto-load there.

### Cubric Studio user docs (project-local skill)

- **Read first:** `.agents/skills/cubric-user-docs/SKILL.md`

## Cross-cutting

- `CLAUDE.md`, `AGENTS.md`
- `docs/PROJECT.md` — orientation hub
- `.claude/rules/dos_and_donts.md` — universal baseline

## Topic Gaps

- No topic for Playwright desktop testing patterns yet (only command in profile).
- No topic for `dev_configs/` or `engine/` python internals.
