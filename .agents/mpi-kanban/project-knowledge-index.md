---
schema: mpi-kanban/project-knowledge-index/v1
profile: .agents/mpi-kanban/project-profile.md
last_refresh: 2026-07-02
last_refresh_notes: memory pointers pruned to the consolidated ~/.claude memory set (33 actual files); removed ~55 stale references that no longer exist in the memory dir.
---

# Project Knowledge Index

## How To Use

Topic-to-files map. Match the topic closest to the current task and read the listed files first. If no topic matches, read the profile and ask the user for a pointer rather than scanning the repo.

**Memory layering:** the authoritative "how the system works" lives in `docs/` and `.claude/rules/`. The `**Memory:**` files below are companions — they capture the *why a fix exists*, breadcrumbs, gotchas, and process feedback that don't belong in the docs. Read the doc/rule first, then the memory for the war-story context.

## Topics

### Components & UI

- **Read first:** `.claude/rules/components.md`
- **Rules:** `.claude/rules/dos_and_donts.md`, `.claude/rules/component-mounts.md`, `.claude/rules/component-events.md`, `.claude/rules/component-state.md`
- **Memory:** none (topic files consolidated into docs/)

### Events & cross-component communication

- **Read first:** `docs/events.md`
- **Rules:** `.claude/rules/events.md`, `.claude/rules/component-events.md`
- **Memory:** none

### Application state

- **Read first:** `js/state.js`
- **Rules:** `.claude/rules/state.md`, `.claude/rules/component-state.md`
- **Memory:** none (topic files consolidated into docs/)

### Workspaces & routing

- **Read first:** `docs/workspaces.md`
- **Rules:** `.claude/rules/workspaces.md`
- **Memory:** none

### ComfyUI workflow injection

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_injection.md`, `.claude/rules/component-comfy.md`
- **Memory:** `feedback_comfy_node_naming_law.md`

### ComfyUI engine / backend / models

- **Read first:** `docs/comfy.md`
- **Rules:** `.claude/rules/comfy_engine.md`
- **Memory:** none (topic files consolidated into docs/)

### Downloads

- **Read first:** `docs/comfy.md#download-manager`
- **Rules:** `.claude/rules/downloads.md`
- **Memory:** none (topic files consolidated into docs/)

### Project data & integrity

- **Read first:** `docs/project-integrity.md`, `docs/data.md`
- **Rules:** none
- **Memory:** none (topic files consolidated into docs/)

### Versioning & migrations

- **Read first:** `docs/versioning.md`
- **Rules:** `.claude/rules/versioning.md`
- **Memory:** none (topic files consolidated into docs/)
- **Notes:** APP_VERSION, SCHEMA_VERSION, COMFY_VERSION, operation registry, release-health gate. APP_STAGE + dev_mode are DERIVED (never hand-set) — see docs/versioning.md.

### RunPod / remote engine

- **Read first:** `docs/runpod-remote-engine.md`
- **Rules:** `.claude/rules/comfy_engine.md` (engine routing), `.claude/rules/comfy_injection.md` (remote upload path)
- **Memory:** `project_reconnect_deletes_warm_pod.md`, `project_stale_pod_reconnect_toast.md`
- **Notes:** second-provider (Vast.ai) evaluation PARKED → `docs/vast-ai-research/` (MPI-344).

### Pod image / mpi-ci

- **Read first:** `docs/runpod-remote-engine.md` (image/volume/secrets), the private `mpi-ci` repo
- **Memory:** none (topic files consolidated into docs/)
- **Notes:** image builds are USER-authorized; live Pod ops stay USER-only. Runtime edits (`wrapper.py`/`start.sh`) are R2-floated on TWO channels (MPI-340): `./publish-runtime.sh dev` → test on a dev Pod → `./publish-runtime.sh promote`. `stable` is what released users boot — never the day-to-day verb. Dev image tags bump `POD_IMAGE_VERSION_DEV`/`_CPU_DEV`, never the stable pins. Builds carry two guards (MPI-341): a node-import smoke test (grep for `IMPORT FAILED` — a baked node that stops importing fails the BUILD) and `ENV PIP_CONSTRAINT` pinning the cu130 trio; detail in `docs/builder/02-image-and-rebuild.md`.

### Build / release / distribution

- **Read first:** `docs/releases/portable-distribution-contract.md`
- **Memory:** none (topic files consolidated into docs/)

### macOS

- **Read first:** `docs/releases/portable-distribution-contract.md` (mac section)
- **Memory:** none (topic files consolidated into docs/)

### Release ops / versioning skills

- **Read first:** `mpi-release` skill (+ its `references/`) and `mpi-version-bump`
- **Memory:** `project_release_model_github_only.md`
- **Notes:** GitHub-only release model (2026-07-21). One master branch, bump the version digit (2nd=features, 3rd=fixes, 1st=breaking), publish a public GitHub Release with full builds + update bundles. `mpi-release` is the one release flow (replaced mpi-merge-branches/mpi-apply-patch/mpi-release-public). No Patreon tiers, no Cloudflare pre-release links. R2 still hosts model weights only.

### Cross-project / product

- **Read first:** `docs/PROJECT.md`
- **Memory:** `project_product_scope.md`, `project_cubric_studio_agent_vision.md`, `project_connector_ownership_split.md`, `project_hub_scalable_foundation.md`, `project_madpony_identity_folder.md`
- **Notes:** Vision = image/video only; audio + prompt-gen are sibling Cubric apps.

### Conventions / gotchas

- **Read first:** `CLAUDE.md` § "Critical Rules Snapshot"
- **Memory:** `feedback_shared_tree_commit_hygiene.md`, `feedback_no_toast_user_stop.md`, `feedback_error_dialog_vs_toast.md`

### Shell, overlays, hotkeys

- **Read first:** `docs/shell.md`
- **Rules:** none
- **Memory:** none (topic files consolidated into docs/)
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
- **Memory:** none (topic files consolidated into docs/)
- **Notes:** `.engine-config.json` shares ComfyUI engine across worktrees. Single `master` line — no integration branches (release model = bump on master, publish a GitHub Release).

### Desktop and browser testing

- **Read first:** `playwright.desktop.config.js`, `tests/desktop/`
- **Rules:** `CLAUDE.md` desktop automation section
- **Notes:** `npm run test:desktop` launches Electron through Playwright with isolated `CUBRIC_E2E_USER_DATA`; keep tests focused unless downloads/generation are explicitly required.

### Debugging runtime issues

- **Read first:** `logs/app.log` (last 50–100 lines via `Read` offset only — never full)
- **Notes:** server crashes, python engine, generation failures.

### Sibling website / docs

- **Read first:** `c:\AI\Mpi\Cubric Studio (Website)\`, `c:\AI\Mpi\Cubric Studio (Docs)\`, design source at `c:\AI\Mpi\CubricStudio_Redesign\`
- **Memory:** `project_website_subdomain_strategy.md`, `tool_website_image_converter.md`
- **Notes:** separate repos; use absolute paths and `git -C`; CLAUDE.md does NOT auto-load there.

### Cubric Studio user docs (sibling Docs repo)

- **Read first:** `c:\AI\Mpi\Cubric Studio (Docs)\.agents\skills\cubric-user-docs\SKILL.md`
- **Notes:** docs-only work should open `c:\AI\Mpi\Cubric Studio (Docs)\` directly and use its local MPI board.

### Dev configs & engine internals

- **Read first:** `dev_configs/app_config.js`, `dev_configs/system_dependencies.json`
- **Memory:** none (topic files consolidated into docs/)
- **Notes:** `engine/ComfyUI_windows_portable/` is the portable runtime; `engine/mpi_models/` holds MPI-bundled model assets. Treat both as runtime artifacts — do not commit engine binaries.

## Cross-cutting

- `CLAUDE.md`, `AGENTS.md`
- `docs/PROJECT.md` — orientation hub
- `.claude/rules/dos_and_donts.md` — universal baseline
- **Memory:** `project_product_scope.md` (Vision = image/video only; audio + prompt-gen are sibling apps)

## Topic Gaps

- None tracked.
