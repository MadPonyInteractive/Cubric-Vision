---
schema: mpi-kanban/project-knowledge-index/v1
profile: .agents/mpi-kanban/project-profile.md
last_refresh: 2026-06-01
last_refresh_notes: refresh pass — removed 3 dead memory pointers (zero_model_promptbox_gate, comfy_workflows_readonly, model_type_vs_mediatype); wired 11 existing memory files into matching topics
---

# Project Knowledge Index

## How To Use

Topic-to-files map. Match the topic closest to the current task and read the listed files first. If no topic matches, read the profile and ask the user for a pointer rather than scanning the repo.

## Topics

### Components & UI

- **Read first:** `.claude/rules/components.md`
- **Rules:** `.claude/rules/dos_and_donts.md`, `.claude/rules/component-mounts.md`, `.claude/rules/component-events.md`, `.claude/rules/component-state.md`
- **Memory:** `project_canvas_viewer_spinner_flags.md`, `project_queue_panel_render_diff.md`, `project_gallery_card_chrome.md`, `project_gallery_slider_sizing.md`, `project_gallery_video_thumb_pattern.md`, `project_mpi_radio_emits_select.md`

### Events & cross-component communication

- **Read first:** `docs/events.md`
- **Rules:** `.claude/rules/events.md`, `.claude/rules/component-events.md`
- **Memory:** none

### Application state

- **Read first:** `js/state.js`
- **Rules:** `.claude/rules/state.md`, `.claude/rules/component-state.md`
- **Memory:** `project_reuse_prompt_recall.md`

### Workspaces & routing

- **Read first:** `docs/workspaces.md`
- **Rules:** `.claude/rules/workspaces.md`
- **Memory:** none

### ComfyUI workflow injection

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_injection.md`, `.claude/rules/component-comfy.md`
- **Memory:** `project_reuse_prompt_recall.md`, `project_cue_queue_contract.md`

### ComfyUI engine / backend / models

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_engine.md`
- **Memory:** `project_comfy_models_path_source.md`, `project_comfy_cache_dedupe.md`

### Downloads

- **Read first:** `docs/comfy.md#download-manager`
- **Rules:** `.claude/rules/downloads.md`
- **Memory:** none

### Project data & integrity

- **Read first:** `docs/project-integrity.md`, `docs/data.md`
- **Rules:** none
- **Memory:** `project_reuse_prompt_recall.md`, `project_remove_history_entry_guard.md`, `project_video_trim_frame_semantics.md`

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
- **Supplemental:** `docs/redesign/MAPPING.md` (legacy-to-Stage file/class mapping)
- **Rules:** `.claude/rules/components.md` § "Stage design baseline", `styles/01_base.css`
- **Notes:** Stage redesign merged at `e9b5eb6`; routine work uses live tokens, not spec.

### Worktrees & engine sharing

- **Read first:** `docs/worktrees.md`
- **Notes:** `.engine-config.json` shares ComfyUI engine across worktrees.

### Desktop and browser testing

- **Read first:** `playwright.desktop.config.js`, `tests/desktop/`
- **Rules:** `CLAUDE.md` desktop automation section
- **Notes:** `npm run test:desktop` launches Electron through Playwright with isolated `CUBRIC_E2E_USER_DATA`; keep tests focused unless downloads/generation are explicitly required.

### Debugging runtime issues

- **Read first:** `logs/app.log` (last 50–100 lines via `Read` offset only — never full)
- **Notes:** server crashes, python engine, generation failures.

### Sibling website / docs

- **Read first:** `c:\AI\Mpi\Cubric Studio (Website)\`, `c:\AI\Mpi\Cubric Studio (Docs)\`, design source at `c:\AI\Mpi\CubricStudio_Redesign\`
- **Memory:** `project_website_subdomain_strategy.md`
- **Notes:** separate repos; use absolute paths and `git -C`; CLAUDE.md does NOT auto-load there.

### Cubric Studio user docs (project-local skill)

- **Read first:** `.agents/skills/cubric-user-docs/SKILL.md`

### Dev configs & engine internals

- **Read first:** `dev_configs/app_config.js`, `dev_configs/system_dependencies.json`
- **Notes:** `engine/ComfyUI_windows_portable/` is the portable runtime; `engine/mpi_models/` holds MPI-bundled model assets. Treat both as runtime artifacts — do not commit engine binaries.

## Cross-cutting

- `CLAUDE.md`, `AGENTS.md`
- `docs/PROJECT.md` — orientation hub
- `.claude/rules/dos_and_donts.md` — universal baseline
- **Memory:** `project_product_scope.md` (Vision = image/video only; audio + prompt-gen are sibling apps)

## Topic Gaps

- None tracked.
