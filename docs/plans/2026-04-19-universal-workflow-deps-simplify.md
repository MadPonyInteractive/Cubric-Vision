# Universal Workflow Deps Simplify — 2026-04-19

## What Changed

Universal workflow dependencies (custom nodes, detection models, upscale models) are now declared once in `dependencies.js` with an `installOnEngine: true` flag, instead of being listed per-workflow in `universal_workflows.js`.

**Before:** `universal_workflows.js` entries listed all their deps in a `dependencies[]` array. `getUniversalWorkflowDepIds()` in `routes/shared.js` had to iterate every workflow and deduplicate. Frontend also had to sync per-UW installed state separately from models.

**After:** `universal_workflows.js` entries contain only `{ workflow: '...' }`. Deps are identified by `installOnEngine: true` in `dependencies.js` — one canonical list. Backend reads this flag directly; no per-workflow extraction needed.

## Why

- Adding a new universal workflow previously required adding dep ids to two places
- The per-UW `installed` tracking in the frontend was unnecessary since these deps are always bundled with engine install
- Engine installs/repairs already install these deps automatically; the per-workflow tracking added complexity without value
- Future universal workflows: add one line to `universal_workflows.js`, done — no dependency management

## Files Changed

| File | Change |
|---|---|
| `js/data/modelConstants/dependencies.js` | Added `installOnEngine: true` to 11 entries (custom nodes, detection models, upscale models) |
| `js/data/modelConstants/universal_workflows.js` | Stripped `dependencies[]` and `installed` from entries; typedef simplified |
| `routes/shared.js` | `getUniversalWorkflowDepIds()` now filters DEPS for `installOnEngine: true` instead of iterating workflows |
| `js/data/modelRegistry.js` | Removed `universalPayload` build and per-UW `installed` patch from `syncModelInstalled()` |
| `.claude/rules/downloads.md` | Updated flow description to reference `installOnEngine` flag |
| `.claude/rules/comfy_engine.md` | Updated engine install flow to reference `installOnEngine` flag |

## Key Design Rule

**To add a new universal workflow:** only add `{ workflow: 'filename.json' }` to `UNIVERSAL_WORKFLOWS` in `universal_workflows.js`. If it needs a new dependency, add the dep to `dependencies.js` with `installOnEngine: true` — it will be included in engine install/repair automatically.

**To add a new engine-level dep** (custom node, detection model, etc. needed by universal workflows): add to `dependencies.js` with `installOnEngine: true`. Do not add it to any per-workflow list.
