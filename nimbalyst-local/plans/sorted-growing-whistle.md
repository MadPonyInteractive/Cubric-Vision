# Master Plan: App Versioning, Project Integrity & Developer Tooling

**Status:** Complete — 4 implementation plans written, ready for execution in separate sessions
**Created:** 2026-04-16
**Session goal:** Produce Plan A, Plan B, Plan C as separate, executable plan files

---

## Overview

Three interconnected systems, implemented in order:

| Plan | System | Depends On |
|---|---|---|
| **Plan D** | Engine Provisioning (first-run install modal + version upgrade + model safety) | Nothing — implement first |
| **Plan A** | App Versioning (version constants + operation registry) | Plan D (engine must exist) |
| **Plan B** | Project Integrity (schema migration + file reconciliation + `.meta/` as source of truth) | Plan A (SCHEMA_VERSION) |
| **Plan C** | Developer Tooling pre-plan (version bump agent/command + pre-release tests) | Plans A + B complete |

---

## Architectural Decisions Made in Brainstorm

### On `.meta/` and history items (Plan B)

**Decision:** `.meta/<filename>.json` becomes the single source of truth for all generation metadata (prompt, negativePrompt, seed, modelId, operation, createdAt). History items in `project.json` become **lightweight references** storing only: `id`, `type`, `filePath`, `name`, `uploaded`, `pixelDimensions`.

**Why not ID-only arrays:** 9 files across the frontend read history items as full inline objects (`MpiGalleryBlock`, `MpiGroupHistoryBlock`, `MpiGalleryGrid`, `MpiHistoryList`, `MpiCanvasViewer`, `MpiCompareOverlay`, `projectModel.js`, `commandExecutor.js`, `projectUI.js`). Making them ID-only would require a lazy-loading infrastructure and break all of these. Instead: load `.meta/` files on project open, merge into history items in memory, keep the same full-object API in state.

**Decision:** No `operationSnapshot` per history item. Operation params live on the project (`modelSettings`/`toolSettings`). History items store just enough to identify what happened.

### On file reconciliation (Plan B)

**Decision:** On every `openProject()`, the system reconciles history vs. disk:
- History item present, media file + meta file present → OK
- History item present, media file missing (user deleted from filesystem) → silently remove history entry + meta file
- History item present, meta file missing, media file present → remove history entry (we can't recover the metadata)
- Item present in Media/ folder but not in any history → ignore (may be from another group or import)

**Decision:** Silent cleanup — no notification to user. If they delete files from the filesystem, they accept the consequences.

### On the version bump tool (Plan C)

**Decision:** NOT a standalone Python script — too risky for autonomous code edits. Instead: a **Claude slash command** (`/mpi-version-bump`) that interactively asks questions and uses full Claude Code tool access to make targeted, reviewed edits. Python scripts are used only for the pre-release test runner (non-code-editing tasks).

---

## What Agents Found: Critical Files Per Plan

### Plan A touches:
- `js/core/appVersion.js` ← NEW
- `js/core/operationRegistry.js` ← NEW
- `js/managers/versioningManager.js` ← NEW
- `js/data/commandRegistry.js` ← read to populate operation list (do not modify)
- `js/data/modelConstants/models.js` ← read to cross-check operations (do not modify)

### Plan B touches:
- `js/managers/projectManager.js` ← openProject() gets migration + reconciliation hooks
- `js/migrations/projectMigrations.js` ← NEW
- `js/managers/projectReconciler.js` ← NEW
- `js/data/projectModel.js` ← slim down MediaItem type, add schemaVersion to createProject()
- `routes/projects.js` ← /create-project adds schemaVersion; /save-generation updated meta write; /project-media delete route already handles meta deletion (verified)
- `routes/projects.js` ← add new `/reconcile-project` or extend `/get-project` to load .meta files
- `.meta/<filename>.json` files ← schema expands to be full source of truth

### Plan C touches (pre-plan only):
- `scripts/pre_release_test.py` ← NEW Python script
- `docs/workflows/baselines.json` ← NEW baseline hash store
- `.claude/skills/mpi/mpi-version-bump.md` ← NEW skill file for slash command

---

## State & Event Risk Map (Do Not Break)

| What | Where | Risk |
|---|---|---|
| `state.currentProject` written only in `projectManager.js` | Lines 58, 86, 108 | Migration/reconciliation must run before this write |
| `project:changed` event | Emitted at line 72 of projectManager.js | Must still emit after migration |
| `localStorage` keys: `mpi_last_project`, `mpi_extra_project_paths` | projectManager.js 47,65,69,71 | Must not change key names |
| `itemGroups` consumed by `MpiGalleryBlock` 12+ times | Blocks/MpiGalleryBlock | History items must remain full objects in state |
| `group.history[idx]` direct access | MpiGalleryGrid, MpiGroupHistoryBlock, MpiHistoryList | Cannot break index-based access |
| `item.filePath`, `.operation`, `.prompt`, `.modelId` | 6 components read these directly | Fields must exist on in-memory items after project load |
| `/update-project` called by MpiGalleryBlock + MpiGroupHistoryBlock | Shallow merge route | Must not change route contract |
| `DELETE /project-media` already deletes .meta sidecar | routes/projects.js:242-262 | Reuse this — do not duplicate deletion logic |

---

## Plan Files (execution order)

1. `docs/plans/2026-04-16-plan-d-engine-provisioning.md` ← implement FIRST
2. `docs/plans/2026-04-16-plan-a-app-versioning.md` ← 3 new files, nothing modified
3. `docs/plans/2026-04-16-plan-b-project-integrity.md` ← core structural change
4. `docs/plans/2026-04-16-plan-c-developer-tooling-preplan.md` ← scaffold only, deferred

Each is a standalone, executable plan with: context, exact file changes, code signatures, implementation steps, and verification.

---

## Plan D: Engine Provisioning & Version Upgrade — Design Notes

### What exists today

- `routes/engine.js` — `GET /engine/status` and `POST /engine/download` fully functional (download 7z, extract, patch bat file, configure TAESD). Not called by any frontend code.
- `dev_configs/system_dependencies.json` — holds ComfyUI download URL and filename. Updated by version bump skill.
- `extra_model_paths.yaml` — written by `POST /comfy/set-path`. When present, ComfyUI reads it on startup via `--extra-model-paths-config`. All model download/check routes already respect it.
- Custom nodes always live inside `ComfyUI/custom_nodes/` — this is a ComfyUI constraint, cannot be changed.
- **No frontend calls `/engine/status` or `/engine/download`** — routes are orphaned.
- **No first-run detection** — if engine is missing, ComfyUI start fails with 500 error.

### Key architectural decision: models live outside ComfyUI from day one

Default first install sets models root to `engine/mpi_models/` (outside `ComfyUI_windows_portable/`). This writes `extra_model_paths.yaml` pointing there. Benefits:
- Engine can be wiped and reinstalled at any time without touching models
- Users who already set a custom path are already safe
- Users on default internal path get migrated on first upgrade (models moved to `engine/mpi_models/`)

### Engine upgrade flow (when COMFY_VERSION changes)

**Detect mismatch on startup:**
- After engine install, write `engine/.mpi_engine_version` containing the installed COMFY_VERSION string
- On app startup, compare `engine/.mpi_engine_version` against `COMFY_VERSION` from `appVersion.js`
- If mismatch → trigger upgrade flow

**Upgrade steps:**
1. If user has no custom models root: move `engine/ComfyUI_windows_portable/ComfyUI/models/` → `engine/mpi_models/` and write `extra_model_paths.yaml` (one-time migration to safe layout)
2. If user already has custom root: nothing to move — models are already safe
3. Wipe `engine/ComfyUI_windows_portable/` (preserve `engine/mpi_models/` and `engine/.mpi_engine_version`)
4. Run `POST /engine/download` — downloads and extracts new ComfyUI version
5. Re-write `extra_model_paths.yaml` pointing to models root
6. Reinstall all custom nodes (DEPS entries with `type: 'custom_nodes'`) — already fully supported by downloadManager.js
7. Write new version string to `engine/.mpi_engine_version`

### First-run / onboarding flow

- On app startup (`shell.js` `_bootApp`), call `GET /engine/status`
- If engine missing → show install UI (block app, show download progress)
- After install → set `engine/mpi_models/` as models root → start ComfyUI
- If engine present but version mismatch → show upgrade UI → run upgrade steps above

### What Plan D will cover

- New route: `POST /engine/set-version` — writes `engine/.mpi_engine_version`
- New route: `POST /engine/upgrade` — orchestrates move-models → wipe → download → configure → reinstall nodes
- Update `shell.js` `_bootApp` — add engine status check before ComfyUI start
- New UI: engine install/upgrade workspace or blocking modal (show download progress via SSE)
- Update `POST /engine/download` — after successful install, write version file and set `engine/mpi_models/` as default models root
- Update `routes/comfy.js` `POST /comfy/start` — check version file mismatch, return structured error that triggers upgrade UI instead of generic failure

### Files Plan D will touch

- `routes/engine.js` ← add upgrade route, version file write after download
- `routes/comfy.js` ← add version mismatch detection on start
- `routes/shared.js` ← add `getMpiEngineVersion()` helper
- `js/shell.js` ← add engine status check to `_bootApp()`
- New UI component for install/upgrade progress
- `dev_configs/system_dependencies.json` ← updated by version bump skill when COMFY_VERSION changes
