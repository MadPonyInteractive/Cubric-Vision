# Plan C: Developer Tooling — Implementation Plan

## Context

Plans A and B are done (2026-04-17). Plan C completes the developer tooling layer:
two Python scripts for pre-release workflow validation, a Claude skill for interactive
version bumps, and the documentation that makes all of it discoverable. In addition,
Plans A, B, and D introduced architectural changes that left several docs and rule
files stale — those are updated here too.

The goal: every future release follows a single workflow — `/mpi-version-bump` guides
the developer through the bump, generates a release notes doc, and offers to run the
pre-release test suite automatically.

---

## Confirmed Decisions

- `operation_registry.json` — JSON mirror of `operationRegistry.js`; version-bump skill keeps them in sync; developers never edit the JSON directly
- Pre-release test output — terminal PASS/FAIL report **and** named output files saved to `test-outputs/` (e.g. `t2i_sdxl-realistic_test.png`) for visual inspection
- Test scope — ComfyUI workflow-only now; architected for future full app→ComfyUI round-trip extension
- Release notes — Markdown file at `docs/releases/YYYY-MM-DD-vX.Y.Z.md` with a platform update checklist (website, docs site, GitHub, Patreon/Discord)

## Current Test Matrix (17 cases)

- 4 image models × 3 ops (t2i, upscale, detail) = 12 tests
- 1 video model (wan-22) × 2 ops (t2v, i2v) = 2 tests
- 3 universal ops (interpolate, videoUpscale, autoMaskImg) = 3 tests

## Workflow Filenames (from models.js)

Image: `t2i_<model>.json`, `upscaler_<model>.json`, `detailer_<model>.json`
Video: `Wan22_t2v.json`, `Wan22_i2v.json`
Universal: `video_interpolate.json`, `video_upscale.json`, `img_auto_mask.json`

---

## Implementation Steps

### Phase 1: Documentation (Steps 1–5)
*These have no code dependencies — create them first.*

---

#### Step 1 — Create `docs/versioning.md`

Sections:
1. **The three constants** (`appVersion.js`) — what each is, when to bump each one
2. **Operation registry** (`operationRegistry.js`) — relationship to commandRegistry (UI) and models.js (workflows); the `latestVersion` vs `appVersionIntroduced` distinction; how `operation_registry.json` mirrors it
3. **When to bump what** — patch/minor/major decision table
4. **Release workflow** — point to `/mpi-version-bump` skill
5. **Migration system** — `SCHEMA_VERSION` link to `projectMigrations.js`

---

#### Step 2 — Create `docs/project-integrity.md`

Sections:
1. **Disk vs memory — the core rule** — full item objects in state; UUID strings on disk in `project.json`
2. **`project.json` structure** — with `schemaVersion` field; history arrays are UUID strings
3. **`.meta/<uuid>.json` sidecar files** — path, fields, source of truth; GC reads `filePath` from meta, NOT from UUID filename
4. **`openProject()` flow** — migrate → reconcile/hydrate → state
5. **Deletion and orphan GC** — how broken entries are silently dropped
6. **Uploaded items** — `uploaded: true`, synthetic item construction
7. **Path normalization** — `path.normalize()` on all incoming `folderPath` values in routes

---

#### Step 3 — Update `CLAUDE.md` (three additions to Context Router)

Add after "ComfyUI Engine & Backend":

```
### App Versioning System
→ READ: docs/versioning.md

### Project Data & Meta File System
→ READ: docs/project-integrity.md

### Download System
→ MUST READ: .claude/rules/downloads.md
```

Also add `downloads.md` to the Sub-Agent Rule Injection Map table.

---

#### Step 4 — Update stale subsystem docs

**`docs/projects.md`** — Reflect v1 shape: history arrays are UUID strings; `.meta/` is source of truth; add `schemaVersion` to project shape; point to `docs/project-integrity.md` for detail.

**`docs/data.md`** — Note that `_persistGroups()` handles UUID serialization; add `operationRegistry.js` as third data file; link to `docs/versioning.md`.

**`docs/PROJECT.md`** — Add 3 rows to the Key Subsystems table: Versioning, Project Integrity, Storage Keys.

**`docs/shell.md`** — Add: `_bootApp()` engine version-check phase; `_continueBootAfterEngine()` helper; `MpiEngineInstall` singleton description.

---

#### Step 5 — Update stale rules files

**`.claude/rules/component-mounts.md`** — Add `MpiEngineInstall` as a shell.js singleton. Props: `{ requiredVersion, installedVersion }`. Shown during boot when engine version mismatches.

**`.claude/rules/component-events.md`** — Add `MpiEngineInstall` events:
- Listens: `engine:progress { percent, message }` (SSE forwarded from backend)
- Emits: `engine:upgrade-start`, `engine:upgrade-complete`, `engine:upgrade-error { message }`

**`.claude/rules/comfy_engine.md`** — Add "Engine Version Tracking" section from Plan D: version source of truth (`COMFY_VERSION` in `appVersion.js`), model path strategy (`engine/mpi_models/`), upgrade migration flow, SSE events namespace.

**`.claude/rules/component-state.md`** — Verify/update any raw localStorage references that should now use `Storage.set()` from `js/core/storage.js`. Check whether engine version state is tracked in state.js or localStorage and document it.

---

### Phase 2: JSON Mirror (Step 6)

#### Step 6 — Create `operation_registry.json`

**File:** `C:\AI\Mpi\MpiAiSuite\operation_registry.json`

Mirror of `operationRegistry.js`. Add `"universal": true` for the 3 universal ops (matching commandRegistry.js).

```json
{
  "t2i":          { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "i2i":          { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "upscale":      { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "edit":         { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "detail":       { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "change":       { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "remove":       { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "t2v":          { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "i2v":          { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "extend":       { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1" },
  "interpolate":  { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1", "universal": true },
  "videoUpscale": { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1", "universal": true },
  "autoMaskImg":  { "latestVersion": "1.0", "appVersionIntroduced": "0.0.1", "universal": true }
}
```

Include a `// NOTE` comment (as a top-level `_comment` key) explaining: "Do not edit manually — maintained by /mpi-version-bump skill. Source of truth: operationRegistry.js."

Pre-release test validates count parity between this file and operationRegistry.js at startup.

---

### Phase 3: Test Fixtures (Step 7)

#### Step 7 — Create `tests/fixtures/`

```
tests/fixtures/
  README.md                   — documents each fixture's purpose and size constraints
  image_288x288.png           — solid-color PNG with slight variation so hash isn't trivial
  mask_288x288.png            — solid white PNG at same dimensions (for mask-required ops)
  frames/
    frame_001.png             — 32x32 placeholder for interpolate input frame 1
    frame_002.png             — 32x32 placeholder for interpolate input frame 2
  video_144p.mp4              — 1-second, 256x144, 24fps, minimal bitrate
```

Binary files committed to git. Size budget: PNG < 50KB each, MP4 < 200KB.

`test-outputs/` is generated at runtime → add to `.gitignore`.

**Fixtures reuse per operation:**
- `image_288x288.png` → i2i, edit, detail, change, remove, autoMaskImg, i2v
- `mask_288x288.png` → detail, change, remove (mask-required ops)
- `frames/` → interpolate
- `video_144p.mp4` → videoUpscale, extend (video input ops)
- No fixture → t2i, upscale, t2v (no input required)

---

### Phase 4: Python Test Infrastructure (Steps 8–9)

#### Step 8 — Create `scripts/comfy_client.py`

Thin synchronous wrapper around the ComfyUI HTTP API. **Stdlib only** (no `requests`), matching the pattern of `computeDepHashes.py`.

```python
class ComfyClient:
    def __init__(self, host='127.0.0.1', port=8188)
    def is_alive(self) -> bool            # GET /system_stats
    def queue_prompt(self, workflow) -> str  # POST /prompt → prompt_id
    def poll_until_done(self, prompt_id, timeout_s=300) -> dict  # polls GET /history/<id>
    def get_outputs(self, history_entry) -> list[dict]  # extracts image/video output info
    def download_output(self, output_info, dest_path) -> str  # GET /view → saved file

class ComfyClientError(Exception): pass
```

All methods raise `ComfyClientError` on failures — never swallow errors.

---

#### Step 9 — Create `scripts/pre_release_test.py`

**CLI:**
```
python scripts/pre_release_test.py                  # all tests, low res
python scripts/pre_release_test.py --full-quality   # skip resolution injection
python scripts/pre_release_test.py --op t2i         # filter by operation
python scripts/pre_release_test.py --model sdxl-realistic  # filter by model
python scripts/pre_release_test.py --save-baselines # save NEW results after run
python scripts/pre_release_test.py --host 127.0.0.1 --port 8188
```

**Constants:**
```python
LOW_RES_IMAGE = { 'width': 288, 'height': 288 }
LOW_RES_VIDEO = { 'width': 256, 'height': 144, 'num_frames': 2 }
# NO hardcoded workflow map — all data read from modelConstants/ files
```

**Source-of-truth files (modelConstants/):**

All model/workflow data is read from existing JS files in `js/data/modelConstants/`. No workflow filenames are hardcoded in the Python script. Adding a new model or universal workflow only requires updating the JS files — the test script picks it up automatically.

- `models.js` → `MODELS` array → model `id`, `mediaType`, `supportedOps[]`, `workflows{}`
- `universal_workflows.js` → `UNIVERSAL_WORKFLOWS` object → op key → `workflow` filename
- `operation_registry.json` → op count validation

**Parsing strategy** (same brace-depth approach as `computeDepHashes.py`):
1. Parse `models.js`: extract `MODELS = [...]` block → for each model, extract `id`, `mediaType`, `supportedOps[]`, `workflows{}`
2. Parse `universal_workflows.js`: extract `UNIVERSAL_WORKFLOWS = {...}` block → for each key, extract `workflow` filename
3. Validation: compare parsed op count (model ops + universal ops) against `operation_registry.json` count; abort with clear error if diverged

**Resolution injection (`inject_test_resolution`):**

Match by `_meta.title` (case-insensitive, same as app strategy). Two-pass approach:
1. Look for `"Width"` / `"Height"` titled nodes → inject there
2. Fallback: look for `"EmptyLatentImage"` class nodes → inject `inputs.width`, `inputs.height` directly
3. For video nodes: match `"Frames"`, `"Num_Frames"` titled nodes or `num_frames` in latent video nodes
4. Log a warning per workflow if sampler/latent nodes had their dimensions skipped

**Fixture injection (`inject_fixture_inputs`):**

Match node titles: `Input_Image`, `Input_Video`, `Input_Mask`. Load fixture file path and inject via ComfyUI upload endpoint before queuing. Special case: `interpolate` injects `frame_001.png` + `frame_002.png` as a 2-image batch.

**Output naming:**
```
test-outputs/<op>_<modelId>_test.<ext>
test-outputs/interpolate_universal_test.mp4
test-outputs/autoMaskImg_universal_test.png
```

**Terminal report:**
```
=== MpiAiSuite Pre-Release Test ===
App Version: 0.0.1 | ComfyUI: 0.18.0
Resolution: 288x288 (image) / 256x144x2f (video)

[  1/17] t2i:sdxl-realistic ............. PASS (3.2s)
...
[ 17/17] autoMaskImg:universal ........... NEW  (2.1s)  ← no baseline

RESULTS: 16 PASS | 0 FAIL | 1 NEW
Output files: test-outputs/
```

**Baseline entry:**
```json
{
  "t2i:sdxl-realistic": {
    "hash": "sha256:abc123...",
    "appVersion": "0.0.1",
    "comfyVersion": "0.18.0",
    "lastValidated": "2026-04-17T10:30:00Z",
    "resolution": "288x288"
  }
}
```

Never auto-overwrite FAIL baselines. On NEW results, ask once at end of run: `Save new baselines? [y/N]`.

**Module structure:**
1. Constants + imports
2. `parse_models_js()` → model/op/workflow matrix dict
3. `build_test_matrix(registry, models)` → list of `TestCase` namedtuples
4. `inject_test_resolution(workflow, media_type, full_quality)` → modified dict
5. `inject_fixture_inputs(workflow, op, client)` → uploads fixtures, patches workflow
6. `run_test(case, client, args)` → runs one test, returns `TestResult`
7. `compare_baseline(result, baselines)` → PASS / FAIL / NEW
8. `save_baselines(new_results, baselines, app_version, comfy_version)` → writes JSON
9. `main()` → arg parsing, orchestration, report

---

### Phase 5: Support Files (Steps 10–11)

#### Step 10 — Create `docs/workflows/baselines.json`

Initial content: `{}` — populated on first run when developer answers `y`.

Create `docs/workflows/` directory if it doesn't exist.

#### Step 11 — Create `docs/releases/` directory

Create `docs/releases/README.md` explaining the naming convention (`YYYY-MM-DD-vX.Y.Z.md`) and that files are generated by `/mpi-version-bump`.

---

### Phase 6: Version Bump Skill (Step 12)

#### Step 12 — Create `C:/Users/Fabio/.claude/skills/mpi/mpi-version-bump.md`

**Skill description:** Interactive release workflow — bump app version, update operation registry, update model mappings, sync operation_registry.json, generate release notes, run pre-release tests.

**Step-by-step flow Claude follows:**

**1. Read current state**
Read: `appVersion.js`, `operationRegistry.js`, `commandRegistry.js`, `models.js`, `universal_workflows.js`, `operation_registry.json`

**2. Ask questions interactively**
```
Q1: Bump type? (patch / minor / major)
Q2: ComfyUI version changing? (current: X.Y.Z)
Q3: New operations? → for each: key, label, mediaType, requiresImages,
    requiresMask, promptRequired, universal, supporting models, workflow filenames
Q4: Deprecated operations? (keys to mark, NOT remove)
Q5: Schema version changing? (requires new migration stub)
Q6: Notable changelog items? (free text)
```

Compute and confirm new version before making any edits.

**3. Make targeted edits (in order)**
a. `js/core/appVersion.js` — bump APP_VERSION; optionally COMFY_VERSION, SCHEMA_VERSION
b. `js/core/operationRegistry.js` — add new ops with `appVersionIntroduced: '<newVer>'`
c. `js/data/commandRegistry.js` — add CommandDef for each new op
d. `js/data/modelConstants/models.js` — add op to `supportedOps[]` and `workflows{}` per model (non-universal ops only)
d2. `js/data/modelConstants/universal_workflows.js` — add entry for new universal ops: `{ workflow: 'filename.json', dependencies: [] }`
e. `operation_registry.json` — sync to match operationRegistry.js; mark deprecated ops with `"deprecated": true`
f. If schema changed: add migration stub in `js/migrations/projectMigrations.js`

**4. Generate release notes**

Write `docs/releases/YYYY-MM-DD-vA.B.C.md`:

```markdown
# MpiAiSuite vA.B.C — YYYY-MM-DD

## Changelog
<summary line>

### Changes
- <from Q6>

### New Operations
- **op_key** (Label): mediaType, input requirements
(or "None")

### Breaking Changes
(or "None")

### ComfyUI Engine
ComfyUI version unchanged (X.Y.Z) | Updated to X.Y.Z

---

## Platform Update Checklist
- [ ] Landing Page — update version badge, feature list if new ops
- [ ] Documentation Website — update operation list, changelog page
- [ ] GitHub Releases — create tag vA.B.C, attach installer, write release notes
- [ ] Patreon — post update announcement
- [ ] Discord — post in #updates with highlights and download link
```

**5. Offer to run tests**

Print a summary of all changes, then ask: `Run scripts/pre_release_test.py now? (y/n)`

**6. Print final summary**

Files edited | New version | New ops | Release notes path | Test result

---

## Key Risks

1. **models.js regex parsing** — If `models.js` structure ever changes significantly, the regex parser in `pre_release_test.py` can break. Mitigate: validate parsed model count and log parsable ops on startup. Abort clearly if parse fails.

2. **Resolution injection misses** — SDXL workflows use linked dimension inputs rather than `"Width"`/`"Height"` titled nodes. The two-pass injection (title match → EmptyLatentImage fallback) handles this, but must be verified against each workflow type on first run.

3. **Universal workflow fixture injection** — `video_interpolate.json` (RIFE VFI) uses a multi-frame images input, not a simple `Input_Image` node. Read the workflow node titles before implementing inject_fixture_inputs. May need a special `interpolate` case.

4. **Binary fixtures in git** — Keep PNG/MP4 fixtures small. Add `test-outputs/` to `.gitignore` before first run.

5. **operation_registry.json drift** — Pre-release test validates count parity on startup. If counts diverge, abort with a clear message directing the developer to run the version-bump skill.

---

## Critical Files

| File | Role |
|---|---|
| `js/core/operationRegistry.js` | Source of truth for JSON mirror |
| `js/data/modelConstants/models.js` | Parsed by pre_release_test.py for model/op/workflow matrix |
| `js/data/modelConstants/universal_workflows.js` | Parsed by pre_release_test.py for universal op workflow filenames |
| `scripts/computeDepHashes.py` | Pattern reference for stdlib-only JS parsing with brace-depth scanning |
| `js/core/appVersion.js` | Version constants read/written by version-bump skill |
| `js/data/commandRegistry.js` | Edited by version-bump skill when new ops are added |
| `js/migrations/projectMigrations.js` | Edited by version-bump skill when schema changes |
| `comfy_workflows/*.json` | 17 workflow files validated by pre_release_test.py |
| `.claude/rules/downloads.md` | Needs CLAUDE.md routing entry added |
| `docs/plans/2026-04-16-plan-b-project-integrity.md` | Source of truth for project-integrity.md content |
| `docs/plans/2026-04-16-plan-d-engine-provisioning.md` | Source of truth for comfy_engine.md and shell.md updates |

---

## Verification

1. After Steps 1–5: Ask another agent (cold context) to answer "how do I add a new operation?" — it should route to `docs/versioning.md` via CLAUDE.md without needing to read plan files.
2. After Step 6: Verify `operation_registry.json` count matches `OPERATION_REGISTRY` key count in `operationRegistry.js` (should be 13).
3. After Steps 8–9: Run `python scripts/pre_release_test.py --op t2i --model sdxl-realistic` against a live ComfyUI instance. Expect a NEW result, named output `test-outputs/t2i_sdxl-realistic_test.png`, and prompt to save baseline.
4. After Step 12: Run `/mpi-version-bump`, do a dry-run patch bump with no new ops, confirm all files are edited correctly and `docs/releases/` gets a new file.
