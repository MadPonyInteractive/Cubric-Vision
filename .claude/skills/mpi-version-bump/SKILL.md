---
name: mpi-version-bump
description: Interactive release workflow — bump app version (appVersion.js + package.json + package-lock.json), update operation registry, update model mappings, sync operation_registry.json, generate release notes, run release:check, and offer pre-release tests. Use when cutting a new Cubric Studio release or when the user says "bump the version", "cut a release", "/mpi-version-bump".
user-invocable: true
---
# /mpi-version-bump — Interactive Release Workflow

This skill guides you through a complete release: bumping the app version, updating engine versions, registering new operations, updating all related files, generating release notes, running `npm run release:check`, and optionally running pre-release tests.

Use this skill whenever you're ready to cut a new release of Cubric Studio.

---

## Quick path: patch-only release (most common)

If the release is a **pure patch** — bug fixes and/or small UI changes, with
**no new operations, no ComfyUI engine change, and no project-schema change** —
you only need to edit **five** files. Skip every operation/engine/schema step.

1. `js/core/appVersion.js` — bump `APP_VERSION` (e.g. `0.0.1` → `0.0.2`). Leave `SCHEMA_VERSION` untouched.
2. `package.json` — bump the top-level `"version"` to the same value. **The portable build reads this**; it must match `APP_VERSION`.
3. `package-lock.json` — bump the root `"version"` and `packages[""].version` to the same value.
4. `js/data/releaseNotes.js` — add a new `RELEASE_NOTES['<newVersion>']` entry (runtime changelog overlay source).
5. `docs/releases/YYYY-MM-DD-vX.Y.Z.md` — archival, user-facing markdown notes.

Then run the release gate:

```bash
npm run release:check
```

`APP_VERSION`, `package.json` `version`, and root `package-lock.json` version
metadata MUST be identical. Optionally run the pre-release tests (Step 6) — for
a pure patch with no operation changes the test output hash is unaffected, but
running it confirms nothing else drifted.

For anything beyond a pure patch (new ops, engine bump, schema change), use the
full flow below.

---

## Step 1: Read Current State

I will read the following files to understand the current state:
- `js/core/appVersion.js` — current APP_VERSION, SCHEMA_VERSION
- `package.json` — current `version` (must track APP_VERSION)
- `package-lock.json` — root `version` metadata (must track APP_VERSION)
- `dev_configs/system_dependencies.json` — current COMFY_VERSION
- `js/core/operationRegistry.js` — all registered operations
- `js/data/commandRegistry.js` — UI metadata for all operations
- `js/data/modelConstants/models.js` — model/operation/workflow mappings
- `js/data/modelConstants/universal_workflows.js` — universal operation definitions
- `operation_registry.json` — JSON mirror (should match operationRegistry.js)

---

## Change Impact Matrix

Before asking bump questions, classify the change:

| Change type | Required updates | Bump |
| --- | --- | --- |
| Changelog-only or copy-only release | `appVersion.js`, `package.json`, `package-lock.json`, `releaseNotes.js`, archival markdown | Patch |
| Command control/default text changes without output/API change | Runtime + archival release notes; docs if user-facing | Usually patch |
| Operation parameter semantics changed, removed, or made incompatible | `operationRegistry.js` `latestVersion`, `operation_registry.json`, command/workflow injectors, release notes | Major if incompatible |
| New or deprecated operation | `commandRegistry.js`, `operationRegistry.js`, `operation_registry.json`, model/universal mapping, release notes | Minor for new op |
| Workflow filename or graph changed for compatible operation | `models.js` or `universal_workflows.js` if filenames changed, release notes, workflow validation | Patch unless payloads break |
| New model or model workflow support | `models.js`, dependencies/provisioning docs as needed, release notes | Minor when user-facing |
| ComfyUI engine/provisioning/dependency change | `dev_configs/system_dependencies.json`, provisioning routes/docs, release notes engine section | Minor for engine upgrade |
| Project schema/data-shape change | `SCHEMA_VERSION`, `projectMigrations.js`, project creation defaults, breaking/important release notes | Major |
| Portable build, launcher, updater, artifact naming, or manifest change | `scripts/build-portable.mjs`/portable templates/docs, platform release notes, dry-run/platform validation | Patch unless artifact compatibility breaks |

Always run `npm run release:check` after edits and before builds, tags, pushes,
pre-release generation tests, or publication.

---

## Step 2: Ask Questions Interactively

I will ask you the following questions:

### Q1: Bump Type?
Choose: **patch** / **minor** / **major**

- **patch** (e.g., 0.0.1 → 0.0.2): Bug fixes, no new features, no schema change
- **minor** (e.g., 0.0.1 → 0.1.0): New operations added OR ComfyUI engine updated
- **major** (e.g., 0.1.0 → 1.0.0): Breaking changes (schema change, significant architecture change)

### Q2: ComfyUI Engine Version Changing?
Current ComfyUI version: **X.Y.Z** (read from `dev_configs/system_dependencies.json`)

If yes, provide new version (e.g., `0.19.0`). If no, press Enter to keep current.

### Q3: New Operations Being Added?
List each new operation. For each:
- **Key**: snake_case identifier (e.g., `my_new_op`)
- **Label**: Display name (e.g., `My New Operation`)
- **Media Type**: `image` or `video`
- **Requires Images**: Number (0, 1, 2, ...) — does it need input images?
- **Requires Mask**: `y` or `n`
- **Prompt Required**: `y` or `n`
- **Universal**: `y` or `n` — is it model-agnostic, or model-tied?
- **If universal**: none of the fields below
- **If model-tied**:
  - **Supporting Models**: comma-separated model IDs (e.g., `sdxl-realistic,ill-anime-beauty`)
  - **Workflow Filenames**: one per model (e.g., `my_new_op_sdxl_realistic.json, my_new_op_ill_anime_beauty.json`)

Example:
```
New operation key: segment
Label: Image Segmentation
Media type: image
Requires images: 1
Requires mask: n
Prompt required: n
Universal: y
```

Or:
```
New operation key: upscale_2x
Label: 2x Upscale
Media type: image
Requires images: 1
Requires mask: n
Prompt required: n
Universal: n
Supporting models: sdxl-realistic,ill-anime-beauty
Workflow filenames: upscale_2x_sdxl_realistic.json, upscale_2x_ill_anime_beauty.json
```

### Q4: Operations Being Deprecated?
List operation keys to mark as deprecated (e.g., `old_op_v1, legacy_filter`), or press Enter for none.

**Important:** Deprecation does NOT remove operations — it marks them so the UI hides them but projects using them can still load.

### Q5: Project Schema Version Changing?
`y` or `n`

If yes, the app's `SCHEMA_VERSION` will increment (from 1 to 2, etc.) and you'll need to implement a migration in `js/migrations/projectMigrations.js`. I will create a stub for you.

### Q6: Notable Changelog Items?
Free-text description of what changed. Examples:
- "Added image segmentation operation"
- "Upgraded ComfyUI to support new video models"
- "Bug fixes in the gallery grid rendering"
- "Performance improvements in project load"

Press Enter to skip if no additional notes.

---

## Step 3: Compute and Confirm New Version

I will calculate the new version based on your bump type and confirm it with you:

```
Current version: 0.0.1
Bump type: minor
New version: 0.1.0

Is this correct? [y/n]
```

Answer `n` to re-do the questions, `y` to continue.

---

## Step 4: Make Targeted Edits

**In this exact order** (so if anything fails, state is consistent):

### 4a. Edit `js/core/appVersion.js`

- Bump `APP_VERSION` to the new version
- If schema version changing, increment `SCHEMA_VERSION`
- **Do NOT edit engine versions** — those are in `system_dependencies.json`

### 4b. Edit `package.json`

- Bump the top-level `"version"` field to the **same** new version as `APP_VERSION`.
- This is what the portable build (`scripts/build-portable.mjs`) and Electron read. If it drifts from `APP_VERSION`, the build artifact and in-app version disagree.
- Do not run `npm install` or touch other fields.

### 4c. Edit `package-lock.json`

- Bump the root `"version"` field and `packages[""].version` to the **same** new version as `APP_VERSION`.
- Do not run `npm install` solely for this metadata change.

### 4d. Edit `dev_configs/system_dependencies.json`

If ComfyUI version changed:
- Update `engine.version` to the new ComfyUI version

This is the **single source of truth** for the engine version. `routes/platformEngine.js` reads from this file.

### 4e. Edit `js/core/operationRegistry.js`

For each new operation:
- Add entry: `opKey: { latestVersion: '1.0', appVersionIntroduced: '<newVersion>' }`

For each deprecated operation:
- Add field: `deprecated: true` (do NOT remove the entry)

### 4f. Edit `js/data/commandRegistry.js`

For each new operation, add a CommandDef:

```javascript
myNewOp: {
    label: 'My New Operation',
    mediaType: 'image',  // or 'video'
    requiresImages: 1,   // or 0, 2, etc.
    requiresMask: false,
    promptRequired: false,
    universal: true,     // or omit if model-tied
    components: [],
},
```

### 4g. Edit `js/data/modelConstants/models.js`

For each model that supports a new operation:
- Add the operation key to the model's `supportedOps[]` array
- Add the operation key and workflow filename to the model's `workflows{}` object

Example:
```javascript
supportedOps: ['t2i', 'upscale', 'myNewOp'],
workflows: {
    t2i: 't2i_sdxl_realistic.json',
    upscale: 'upscaler_sdxl_realistic.json',
    myNewOp: 'my_new_op_sdxl_realistic.json',
},
```

### 4h. Edit `js/data/modelConstants/universal_workflows.js`

For each new universal operation, add entry:

```javascript
myNewOp: {
    workflow: 'my_new_op.json',
    dependencies: ['dep1', 'dep2'],  // or []
},
```

### 4i. Edit `operation_registry.json`

Add/update entries to match `operationRegistry.js` exactly. Add `universal: true` for universal ops. Mark deprecated ops with `deprecated: true`.

### 4j. If Schema Changed: Edit `js/migrations/projectMigrations.js`

I will add a migration stub:

```javascript
function migrateVXtoVY(projectJson) {
    // TODO: Implement migration from schema X to Y
    return projectJson;
}

export const MIGRATIONS = {
    Y: migrateVXtoVY,
    // ... existing migrations
};
```

You fill in the actual migration logic. Remember `SCHEMA_VERSION` must match in
both `appVersion.js` and `projectMigrations.js`.

---

## Step 5: Generate Release Notes

Release notes live in **two** places that must stay aligned:

1. **Runtime source — `js/data/releaseNotes.js`** (consumed by the in-app changelog
   overlay, `MpiChangelogDialog`, shown once per `APP_VERSION` at startup). Add an
   entry to `RELEASE_NOTES` keyed by the new `APP_VERSION`:

   ```javascript
   '<newVersion>': {
       version: '<newVersion>',
       whatIsNew:        [ /* headline features from Q3 + Q6 */ ],
       fixes:            [ /* bug fixes */ ],
       breakingChanges:  [ /* from Q5 if schema changed, else [] */ ],
       importantChanges: [ /* notable non-breaking changes, else [] */ ],
       engineNotes:      [ /* from Q2 if ComfyUI version changed, else [] */ ],
   },
   ```

   Keep sections as empty arrays when not relevant — the overlay hides empty
   sections. Do NOT add any network/update-check behavior here (that is MPI-8 /
   portable-distribution scope; the changelog overlay only describes the already-
   running version).

2. **Archival markdown — `docs/releases/YYYY-MM-DD-vX.Y.Z.md`** (user-facing docs,
   not read by the app).

I will create `docs/releases/YYYY-MM-DD-vX.Y.Z.md` with:

```markdown
# Cubric Studio vX.Y.Z — YYYY-MM-DD

## Changelog

<summary from Q6>

### Changes
- <changelog items>

### New Operations
- **op_key** (Op Label): media type, input requirements
(or "None")

### Breaking Changes
<list from Q5 if schema changed, otherwise "None">

### ComfyUI Engine
ComfyUI version unchanged (X.Y.Z) | Updated to X.Y.Z

---

## Platform Update Checklist

After publishing this release, update all parallel platforms:

- [ ] **Landing Page**: Update version badge, feature list if new ops added
- [ ] **Documentation Website**: Update operation list, changelog page
- [ ] **GitHub Releases**: Create release with tag vX.Y.Z, attach portable artifacts (gated per repo-distribution rules), write release notes
- [ ] **Patreon**: Post update announcement with changelog highlights
- [ ] **Discord**: Post in #updates channel with release highlights and download link
```

---

## Step 6: Run Release Gate, Then Offer Pre-Release Tests

I will print a summary of all changes made:
- Files edited
- New version
- New operations added
- Release notes written to `docs/releases/`

Then I run:

```bash
npm run release:check
```

If it fails, I stop and fix the release drift before building, tagging, pushing,
or running pre-release generation tests.

Then ask:
```
Release gate passed. Would you like to run scripts/pre_release_test.py now? [y/n]
```

If **yes**, I run the test suite and surface the results. If tests FAIL, you can re-run them or skip.
If **no**, testing is skipped.

---

## Step 7: Print Final Summary

After all edits and tests:

```
=== Release vX.Y.Z Complete ===

Files edited:
- js/core/appVersion.js
- package.json
- package-lock.json
- dev_configs/system_dependencies.json
- js/core/operationRegistry.js
- js/data/commandRegistry.js
- js/data/modelConstants/models.js
- operation_registry.json
- js/data/releaseNotes.js
- docs/releases/YYYY-MM-DD-vX.Y.Z.md

New operations: 2 (myNewOp, anotherOp)
Deprecated: 0
Release notes: docs/releases/2026-04-17-v0.1.0.md
Test result: PASS (17 tests)
```

---

## What Happens Next

1. **Commit the changes** using `/commit` or your preferred git workflow
2. **Tag the release** with the new version: `git tag -a vX.Y.Z -m 'Release vX.Y.Z'`
3. **Update external platforms** using the checklist in the release notes:
  - Landing page website
  - Documentation site
  - GitHub releases page (attach installer)
  - Patreon announcement
  - Discord #updates channel
4. **Push to GitHub**: `git push && git push origin vX.Y.Z`

---

## Troubleshooting

**Q: I made a mistake during the bump. Can I undo it?**
A: Yes, the skill edits files atomically in order. If something fails, check the error message and re-run the skill. You can also manually edit the files and re-run `/mpi-version-bump` with the correct values.

**Q: The pre-release tests failed. Should I still release?**
A: No, FAIL means the test output hash changed unexpectedly. Investigate why, fix the issue, update the baselines if the change is intentional, then re-run.

**Q: `APP_VERSION`, `package.json`, and `package-lock.json` disagree after a bump — which wins?**
A: None wins automatically. They must be identical. `package.json` drives the portable build artifact name/Electron version; `APP_VERSION` drives in-app version, release-note lookup, and derived stage; root `package-lock.json` metadata tracks package identity. Fix all three to the same value, then run `npm run release:check` before building.

**Q: How do I add a new model?**
A: Add the model to `js/data/modelConstants/models.js` with its `id`, `supportedOps`, and workflow filenames. The version-bump skill doesn't touch models — that's a separate step. Rerun `/mpi-version-bump` if model additions happen in the same release.

**Q: I added a universal operation but forgot to add workflows. What do I do?**
A: Add the `workflow` filename to `js/data/modelConstants/universal_workflows.js` and re-run the pre-release test. The test will fail if the workflow file is missing.

**Q: Where does engine version get read?**
A: `dev_configs/system_dependencies.json` is the single source of truth for the engine version. `routes/platformEngine.js` reads this file at startup and exports `COMFY_VERSION` for use by the rest of the app.

---

## See Also

- `docs/versioning.md` — versioning system explained
- `dev_configs/system_dependencies.json` — engine version (single source of truth)
- `routes/platformEngine.js` — reads system_dependencies.json and exports version constants
- `docs/releases/` — all past release notes
- `scripts/pre_release_test.py` — pre-release test suite
- `operation_registry.json` — JSON mirror of operation registry
- `js/core/operationRegistry.js` — source of truth for operations
- `js/migrations/projectMigrations.js` — schema migration functions
