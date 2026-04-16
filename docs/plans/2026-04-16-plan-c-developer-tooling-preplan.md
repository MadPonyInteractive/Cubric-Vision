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

Python script — reads registry files, submits workflows to ComfyUI, compares output hashes against baselines. Does not edit any code.

### What it does:

1. Reads `js/core/operationRegistry.js` to get all known operations
2. Reads `js/data/modelConstants/models.js` to get workflow filenames per model/operation
3. For each operation × model combination:
   - Loads the workflow JSON from `comfy_workflows/`
   - Submits to local ComfyUI (`http://localhost:8188`)
   - Waits for completion
   - Hashes the output image (SHA-256)
   - Compares against `docs/workflows/baselines.json`
4. Reports: PASS / FAIL / NEW (no baseline yet)
5. Prompts developer: save new baselines? (y/n)

### File structure:

```
scripts/
  pre_release_test.py     ← Main test runner
  comfy_client.py         ← ComfyUI API client: queue, poll, retrieve output
docs/
  workflows/
    baselines.json        ← { "t2i:sdxl-realistic": { hash, appVersion, comfyVersion, date } }
```

### `baselines.json` schema:

```json
{
  "t2i:sdxl-realistic": {
    "hash": "sha256:abc123...",
    "appVersion": "1.0.0",
    "comfyVersion": "0.3.7",
    "lastValidated": "2026-04-16T10:30:00Z"
  },
  "upscale:sdxl-realistic": { ... }
}
```

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

1. Plans A + B are shipped and verified
2. Create `docs/versioning.md`
3. Create `docs/project-integrity.md`
4. Add pointers to `CLAUDE.md`
5. Write `scripts/comfy_client.py` — ComfyUI API wrapper
6. Write `scripts/pre_release_test.py` — test runner
7. Create `docs/workflows/baselines.json` (start with `{}`)
8. Run against all current operations to populate baselines
9. Write `.claude/skills/mpi/mpi-version-bump.md` skill file

---

## Open Questions (Resolve When Plans A+B Are Done)

- How does `pre_release_test.py` read `OPERATION_REGISTRY` without a JS runtime? Options: (a) maintain a parallel `operation_registry.json` that the version bump skill keeps in sync, (b) call a small `node -e` snippet to serialize it, (c) parse the JS file with regex (workable for this flat structure)
- Universal operations (no model) — need test fixtures (a sample image, a prompt). Define per operation type.
- Video operations (`t2v`, `i2v`, `extend`) — generation is much slower. Skip by default, require `--include-video` flag?
