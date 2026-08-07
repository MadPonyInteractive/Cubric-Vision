---
schema: mpi-kanban/project-knowledge-index/v1
profile: .agents/mpi-kanban/project-profile.md
last_refresh: 2026-08-04
last_refresh_notes: Five memory pointers deleted in the 2026-07-29 prune (MPI-399) replaced with the docs that absorbed them. Downloads retargeted at its own doc. Six topics added for docs that were never indexed (gallery, model library, apps, playbooks, workflow authoring, dev/testing/media).
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

### Canvas tools (mask / paint / composite / crop)

- **Read first:** `docs/masking-tools.md` (the tool taxonomy, THE PREVIEW CONTRACT, Add/Subtract, the PromptBox contract) — the frame every canvas tool mounts into
- **Per family:** `docs/masking.md` (layer model) · `docs/masking-sam3.md` (click-point + text detect) · `docs/masking-shapes.md` (the shape gizmo, two mounts) · `docs/masking-adjust.md` (grow/shrink/edge band on **both** layers — the outline tool — plus Fill Holes) · `docs/painting.md` (the RGBA paint layer, the shared brush dab) · `docs/composite.md` (two front ends, the scratch cut, cover-fit on both ends) · `docs/crop.md`
- **Any code that MUTATES a mask or paint layer:** `docs/masking-undo.md` FIRST — an unwired mutation is a silent hole in Ctrl+Z
- **Rules:** `.claude/rules/component-mounts.md`, `.claude/rules/component-events-organisms.md`, `.claude/rules/component-state.md` (all three carry the mask/paint/shape/composite families)
- **Memory:** `tools/sharp.md` (server-side blend: the mask-through-alpha recipe and its three silent traps — read before touching `services/imageComposite.js`)
- **Note:** the MPI-424 umbrella (425 → 382 → 368 → 375 → 373) built this family and closed 2026-08-04. Its thesis — *a new destination is a ROW in a table, never a new engine* — is what `brushDab.js`, `MpiMaskStrip.DESTINATIONS` and the `MOUNTS` tables encode. Follow the pattern before adding a branch.

### Op & model selection

- **Read first:** `docs/op-model-selection.md` (op strip's two mounts, absent-vs-dim gating, op memory, media transitions, model picker, bar order)
- **Also:** `docs/component-contracts.md` (PromptBox op memory, MpiRadioGroup `aria-disabled`, MpiTileSheet, MpiModelSettings), `docs/generation-lifecycle.md` (what happens after the pick)
- **Memory:** none (lives in docs/)

### Gallery

- **Read first:** `docs/gallery.md` (cards, thumbnails, selection, drag-drop, hover media)
- **Rules:** `.claude/rules/component-mounts.md`, `.claude/rules/component-events.md`
- **Memory:** none

### Media playback

- **Read first:** `docs/video-player.md` (the player component and its controls)
- **Also:** `docs/preview-bus.md` (how a preview frame reaches whatever is showing it)
- **Memory:** none

### Model Library

- **Read first:** `docs/model-library.md` (install-state display, tile patching, featured)
- **Also:** `docs/download-manager.md` (what the tiles are actually reporting)
- **Memory:** none

### Flows (Flow Library)

- **Read first:** `docs/flows.md` (the dev-gated outcome flows and how a descriptor becomes one)
- **Playbook:** `docs/playbooks/add-flow/` — enforced by the `/mpi-add-flow` skill
- **Memory:** none

### Adding a model or a Flow

- **Read first:** `docs/playbooks/add-model/` (README hub + `01`–`06`) — every known trap; enforced by `/mpi-add-model`. Models are NOT version-bumped.
- **For a Flow instead:** `docs/playbooks/add-flow/` (README hub + `01`–`05`), enforced by `/mpi-add-flow`
- **Notes:** a handoff or a `docs/models/<model>/` doc ASSUMES the playbook — read both. `node scripts/compile-node-deps.mjs` is mandatory when a new custom node declares requirements.

### Bumping the ComfyUI engine / smoke-testing models

- **Read first:** `docs/playbooks/bump-engine/` (README hub + `01-smoke-run.md`) — enforced by `/mpi-bump-engine`
- **Notes:** NOT `/mpi-bump-local-comfy`, which is the standalone `G:\ComfyUi` BENCH only and never touches `dev_configs/node_lock.json`. One pin, TWO engines (Windows portable + Pod image) — both must be proven. Smoke-only is valid with no bump (after a node bump or a new model): `node scripts/smoke-workflows.mjs --plan` first, it spends nothing. `npm run release:check` REFUSES a bumped engine with no `dev_configs/smoke-evidence.json` (MPI-465/467).

### Workflow authoring

- **Read first:** `docs/workflow-authoring/README.md` (injectable nodes, controls, MpiNodes, tier selectors) — append what you learn there
- **Memory:** `tool_litegraph_to_api_converter.md` (browser→API conversion + batch sync), `tool_comfy_schema_gate_before_workflow_sync.md` (probe `/object_info` FIRST; 8188 = hand-maintained bench, 48188 = the app's engine)

### Events & cross-component communication

- **Read first:** `docs/events.md`
- **Rules:** `.claude/rules/events.md`, `.claude/rules/component-events.md`
- **Memory:** none

### Toasts & notifications

- **Read first:** `docs/toasts.md` (full call-site map, sound model, `ui:*`/`StatusBar.notify`/`notificationService`)
- **Also:** `docs/generation-lifecycle.md` § "Completion notifications COALESCE"
- **Memory:** `feedback_error_dialog_vs_toast.md`, `feedback_no_toast_user_stop.md`
- **Note:** the coalesce / burst-chime / dual-path memories were deleted in the 2026-07-29 prune (MPI-399) after each claim was verified into `docs/toasts.md`. Read the doc.

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

- **Read first:** `docs/download-manager.md` (resumable downloads, IPC/SSE events, the EXCLUSIVE-vs-shared dependency model)
- **Rules:** `.claude/rules/downloads.md`
- **Memory:** `tool_read_download_state_without_console.md` — the download system is drivable from the shell in BOTH directions (status/active GETs, install/uninstall POSTs), so a download bug does not need the app open
- **Also:** `docs/models-path.md` (where weights land and how the path is resolved)

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
- **Also:** `docs/runpod-troubleshooting.md` (symptom-first triage for a Pod that will not connect, stalls, or loses its volume)
- **Memory:** none — the reconnect-deletes-warm-pod and stale-reconnect-toast files were deleted in the 2026-07-29 prune (MPI-399); both behaviours are in `docs/runpod-remote-engine.md`
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

- **Read first:** `docs/DEVELOPMENT.md` § Tests, then `playwright.desktop.config.js` and `tests/desktop/`
- **Rules:** `CLAUDE.md` desktop automation section
- **Notes:** `npm run test:desktop` launches Electron through Playwright with isolated `CUBRIC_E2E_USER_DATA`; keep tests focused unless downloads/generation are explicitly required. The node suite is `node --test "tests/*.test.cjs"` with the glob QUOTED — the directory form dies on Node v24.

### Debugging runtime issues

- **Read first:** `docs/DEVELOPMENT.md` § Reading `logs/app.log` — filter by `[category]`, never read the file whole
- **Notes:** server crashes, python engine, generation failures. **Any Electron run, dev included, logs to `%APPDATA%\Cubric Vision\logs\app.log`** (MPI-418). The repo's own `logs/` only collects processes started without `APP_USER_DATA` — i.e. test harnesses — so reading it while chasing a live app bug shows you nothing.

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

## Board archive layout

Two archives exist and they are not duplicates:

- `.agents/mpi-kanban/tasks/_archived/<id>/` — **current.** Where `mpi-archive` puts a
  finished card's whole workspace. 302 cards as of 2026-08-04.
- `docs/archive/mpi-kanban/` — **older**, from before the JSON board: 99 task folders plus
  `plans/`, `handoffs/`, `investigations/`, and (since 2026-08-04) `legacy/`, the retired
  Markdown board snapshots.

Look in the first; fall back to the second for anything older than the 2026-06-01 migration.
Neither is read for current work — a card's real record is its commit and its subsystem doc.

## Topic Gaps

- `docs/README.md` is the authoritative doc map; this index is the task-to-topic layer over
  it. When they disagree, `docs/README.md` wins and this file is the one that drifted.
