# Master Plan: App Versioning, Project Integrity & Developer Tooling

**Status:** Complete — 3 implementation plans written, ready for execution in separate sessions
**Created:** 2026-04-16
**Session goal:** Produce Plan A, Plan B, Plan C as separate, executable plan files

---

## Overview

Three interconnected systems, implemented in order:

| Plan | System | Depends On |
|---|---|---|
| **Plan A** | App Versioning (version constants + operation registry) | Nothing |
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

## Three Plan Files Created

1. `docs/plans/2026-04-16-plan-a-app-versioning.md` ← 3 new files, nothing modified
2. `docs/plans/2026-04-16-plan-b-project-integrity.md` ← core structural change
3. `docs/plans/2026-04-16-plan-c-developer-tooling-preplan.md` ← scaffold only, deferred

Each is a standalone, executable plan with: context, exact file changes, code signatures, implementation steps, and verification.
