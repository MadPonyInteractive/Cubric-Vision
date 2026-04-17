# Plan C: Developer Tooling — Pre-Plan

**Status:** Pre-plan scaffold — do NOT implement until Plans A + B are shipped
**Created:** 2026-04-16
**Depends on:** Plan A (operationRegistry), Plan B (schemaVersion, migrations)

---

## Context

After Plans A and B are in place, two developer tools are needed to maintain the versioning system sustainably across releases:

1. **Version Bump Tool** — interactive workflow for cutting a new app release: bump version constants, update the operation registry, update model workflow mappings, run tests
2. **Pre-Release Test Runner** — Python scripts that validate all ComfyUI workflows against a live ComfyUI instance before shipping

---

## Tool 1: `/mpi-version-bump` Slash Command

A standalone Python script that autonomously edits `appVersion.js`, `operationRegistry.js`, `commandRegistry.js`, `models.js`, etc. is too brittle and risky — it would require regex/AST parsing of JavaScript, with no review step and no contextual understanding.

**Decision: Version bump = Claude slash command (`/mpi-version-bump`)**

The slash command invokes Claude Code with full tool access. Claude asks the developer questions interactively, reads the relevant files, and makes targeted, reviewed edits using the Edit tool.

**File to create:** `C:/Users/Fabio/.claude/skills/mpi/mpi-version-bump.md`

### Interactive session flow:

```
Claude: What are we bumping? (patch / minor / major)
Fabio: minor

Claude: Current version is 1.0.0 → new version will be 1.1.0. Correct?
Fabio: yes

Claude: Are there any new operations being added in this release?
Fabio: yes — "segment" (image segmentation)

Claude: What file types does "segment" work with? (image / video)
Fabio: image

Claude: Does "segment" require an input image? mask?
Fabio: requires image, no mask

Claude: Which models support "segment"?
Fabio: sdxl-realistic, ill-anime-beauty

Claude: What are the workflow filenames?
Fabio: segment_sdxl_realistic.json, segment_ill_anime_beauty.json

Claude: Any existing operations being deprecated?
Fabio: no

→ Claude then edits:
1. js/core/appVersion.js — bumps APP_VERSION (and COMFY_VERSION if changed)
2. js/core/operationRegistry.js — adds 'segment' entry
3. js/data/commandRegistry.js — adds 'segment' command definition
4. js/data/modelConstants/models.js — adds segment workflow filenames per model
5. Offers to run scripts/pre_release_test.py
6. Summarizes all changes made
```

### Skill file outline (write when Plans A+B are shipped):

```markdown
---
description: Interactive release workflow — bump app version, update operation registry, update model mappings, run pre-release tests.
---

Read js/core/appVersion.js, js/core/operationRegistry.js, js/data/commandRegistry.js,
js/data/modelConstants/models.js, js/data/modelConstants/universal_workflows.js.

Ask the developer:
1. Bump type (patch / minor / major)
2. New operations: name, media type, input requirements, supporting models, workflow filenames
3. Deprecated operations (if any)
4. ComfyUI version change (if any)

Make all targeted edits. Show summary. Offer to run scripts/pre_release_test.py.
```

---

## Tool 2: `scripts/pre_release_test.py`

Python script — reads registry files, submits workflows to ComfyUI with injected parameters, compares output hashes against baselines. Does not edit any code.

### What it does:

1. Reads `operation_registry.json` to get all known operations
2. Reads `js/data/modelConstants/models.js` to get workflow filenames per model/operation
3. **Injects resolution parameter** into all workflows:
   - Image workflows: `--width 288 --height 288` (low quality, fast)
   - Video workflows: `--width 256 --height 144 --num_frames 2` (extreme low quality, ~5 sec)
   - Universal ops: same resolution override applied
4. For each operation × model combination:
   - Loads the workflow JSON from `comfy_workflows/`
   - **Injects resolution parameters** into sampler/output nodes
   - Submits to local ComfyUI (`http://localhost:8188`)
   - Waits for completion
   - Hashes the output image/video (SHA-256)
   - Compares against `docs/workflows/baselines.json`
5. Reports: PASS / FAIL / NEW (no baseline yet)
6. Prompts developer: save new baselines? (y/n)

### Workflow parameter injection:

All ComfyUI workflows are treated identically — the test suite injects resolution parameters targeting standard node properties:
- Sampler nodes: `steps`, `width`, `height`
- Video output nodes: `num_frames`, `width`, `height`
- Parameters are injected by node index or `_meta.title` match (consistent with app's strategy in `comfy_injection.md`)

**Why this approach:** Validates operation correctness without waiting minutes for full-res video generation. Hashes are deterministic; if output changes, developer sees immediately.

### File structure:

```
scripts/
  pre_release_test.py     ← Main test runner
  comfy_client.py         ← ComfyUI API client: queue, poll, retrieve output
docs/
  workflows/
    baselines.json        ← { "t2i:sdxl-realistic": { hash, appVersion, comfyVersion, date } }
```

### `operation_registry.json` schema (new):

Parallel JSON file kept in sync by the version-bump skill. Pre-release test reads this instead of parsing JS.

```json
{
  "t2i": {
    "latestVersion": "1.0",
    "appVersionIntroduced": "0.0.1"
  },
  "i2i": { ... },
  "upscale": { ... },
  "interpolate": {
    "latestVersion": "1.0",
    "appVersionIntroduced": "0.0.1",
    "universal": true
  },
  "autoMaskImg": { ... }
}
```

**Sync rule:** Every time the version-bump skill edits `operationRegistry.js`, it must also update `operation_registry.json` to match.

---

### `baselines.json` schema:

```json
{
  "t2i:sdxl-realistic": {
    "hash": "sha256:abc123...",
    "appVersion": "1.0.0",
    "comfyVersion": "0.3.7",
    "lastValidated": "2026-04-16T10:30:00Z",
    "resolution": "144p"
  },
  "upscale:sdxl-realistic": { ... },
  "interpolate": {
    "hash": "sha256:def456...",
    "appVersion": "1.0.0",
    "comfyVersion": "0.3.7",
    "lastValidated": "2026-04-16T10:30:00Z",
    "resolution": "144p",
    "universal": true
  }
}
```

**Key field: `resolution`** — documents what resolution was used during baseline generation. Helps developers understand if a baseline needs re-validation after output quality changes.

---

## Tool 3: Docs & Rules Files (Required After Plans A+B Ship)

Once the versioning and project integrity systems are live, create documentation so future agents and developers understand how they work. Add pointers to `CLAUDE.md` so agents load this context automatically.

### Files to create:

**`docs/versioning.md`** — explains the versioning system:
- What `appVersion.js` contains and when to update each constant
- What `operationRegistry.js` is and how it relates to `commandRegistry.js` and `modelRegistry.js`
- How `SCHEMA_VERSION` connects to the migration system
- Release process: what to bump (patch/minor/major) and when

**`docs/project-integrity.md`** — explains the project data system:
- How `project.json` is structured (ID-only history arrays)
- How `.meta/<uuid>.json` files are the source of truth
- What happens on `openProject()`: migration → reconciliation → hydration
- The in-memory vs on-disk distinction (full objects in state, UUID strings on disk)
- How deletion works (app-side vs filesystem-side)
- How uploaded items (no generation metadata) are handled
- **Important:** In-memory state keeps **full item objects** with `filePath`. Only disk persistence uses UUID strings. `_persistGroups()` handles the conversion.

### CLAUDE.md additions (add to the Documentation Lookup section):

```markdown
### App Versioning System
If you need to understand how APP_VERSION, SCHEMA_VERSION, COMFY_VERSION, or the operation registry work:
**->** **READ:** `docs/versioning.md`

### Project Data & Meta File System
If you need to understand how project.json, .meta/ files, project load/reconciliation, or history items work:
**->** **READ:** `docs/project-integrity.md`
```

---

## Implementation Order (When Ready)

Plans A + B are **DONE** (2026-04-17). Ready to proceed.

1. Create `docs/versioning.md`
2. Create `docs/project-integrity.md`
3. Add pointers to `CLAUDE.md`
4. Create `operation_registry.json` (derivative of operationRegistry.js, kept in sync by version-bump skill)
5. Create test fixtures directory: `tests/fixtures/` with sample images + video
6. Write `scripts/comfy_client.py` — ComfyUI API wrapper (queue, poll, retrieve output)
7. Write `scripts/pre_release_test.py` — test runner with resolution injection
8. Create `docs/workflows/baselines.json` (start with `{}`)
9. Run pre_release_test.py against all 13 current operations to populate baselines
10. Write `.claude/skills/mpi/mpi-version-bump.md` skill file

---

## Implementation Notes (from Plan B)

### Key Lesson: In-Memory State = Full Objects, Disk = UUIDs

During Plan B implementation, a critical architectural insight emerged:

- **In memory**: `state.currentProject.itemGroups` keeps **full item objects** (with `filePath`, `prompt`, etc.)
- **On disk**: `project.json` stores only **UUID strings** in history arrays
- **Conversion point**: `_persistGroups()` serializes to UUIDs when writing to disk

**Do NOT** try to hydrate UUIDs to full items on navigation or state change. This creates complex, bug-prone code. Keep full items in memory always.

The only exceptions:
1. On project load: `reconcileAndHydrate()` populates full items from `.meta/` files
2. Edge case in groupHistory: `_hydrateGroupHistory()` handles premature navigation before reconcile completes

### Path Normalization

Windows uses backslashes, client sends forward slashes. Always use `path.normalize()` on incoming folder paths in routes.

### GC for UUID-Based Sidecars

When garbage collecting orphaned sidecars, read the meta file to get the actual `filePath`, don't assume the UUID is the media filename.

---

## Open Questions — RESOLVED

### Q1: How does `pre_release_test.py` read `OPERATION_REGISTRY`?
**Decision: Option A — Maintain parallel `operation_registry.json`**
- The version bump skill always keeps it in sync when edits are made
- Python script reads the JSON (simpler, no Node runtime needed)
- Single source of truth remains `operationRegistry.js`; JSON is derivative

### Q2: Universal operations testing
**Decision: ComfyUI-dependent for all; input fixtures per operation type**
- **interpolate:** Requires a list of images (2+ frames) to interpolate between
  - Test fixture: 2-frame placeholder sequence (very low res, ~16x16)
- **videoUpscale:** Requires a video
  - Test fixture: 1-second 24p video at low res (144p)
- **autoMaskImg:** Requires an image
  - Test fixture: Simple test image (low res, ~256x256)

All three are ComfyUI workflows, so test approach is identical to model operations.

**App-native tools (crop, etc.):**
Not registered in `operationRegistry.js` or `commandRegistry.js` — they don't route through ComfyUI at all. These are client-side canvas operations (e.g., cropping, rotating). **Skip pre-release testing for these** — they're deterministic UI logic, not generation. Test them in the unit test suite instead.

### Q3: Video operations timing
**Decision: Low-resolution injection parameter**
- Instead of skipping videos, add resolution override to all video workflows
- Pre-release test uses **144p or 240p** (extreme low res) instead of default
- Test still validates workflow correctness, just completes in seconds instead of minutes
- Workflow filenames remain unchanged; resolution is an injected parameter (not a separate test workflow)
- When developers run full validation, they can test at full resolution with `--full-quality` flag

**Benefits:**
- Validates all operations in every pre-release run (not skipping)
- Catches integration bugs early (resolution-agnostic)
- Still finishes in reasonable time (~2-3 min for all ops)
