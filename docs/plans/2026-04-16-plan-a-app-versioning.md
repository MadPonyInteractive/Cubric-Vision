# Plan A: App Versioning System

**Status:** Ready for implementation
**Created:** 2026-04-16
**Depends on:** Plan D (engine must be installed and version file established first)
**Required by:** Plan B (needs SCHEMA_VERSION), Plan C (needs OPERATION_REGISTRY), Plan D (routes/engine.js imports COMFY_VERSION once this exists)

---

## Context

The app has no canonical version constants. `APP_VERSION`, `COMFY_VERSION`, and `SCHEMA_VERSION` are undefined everywhere — there is no single file to update when cutting a release. Similarly, operations (`t2i`, `upscale`, etc.) are defined across three separate files (`commandRegistry.js` for UI metadata, `models.js` for workflow filenames, `universal_workflows.js` for universal ops) with no unified registry that tracks versioning or which app version introduced each operation.

This plan creates that foundation: three new files in `js/core/` and `js/managers/` that become the canonical source of truth for versioning. No existing files are modified except to add imports where needed in Plan B.

---

## Critical Files to Read Before Implementing

| File | Why |
| --- | --- |
| `js/data/commandRegistry.js` | Source of all operation keys — cross-check OPERATION_REGISTRY |
| `js/data/modelConstants/models.js` | Shows which ops are model-tied |
| `js/data/modelConstants/universal_workflows.js` | Shows which ops are universal |

---

## Step 1: Create `js/core/appVersion.js`

New file. No imports needed. Single source of truth for all release version constants.

```javascript
// js/core/appVersion.js

/** Semantic version of the MpiAiSuite application. Bump on every release. */
export const APP_VERSION = '0.0.1';

/** ComfyUI commit/tag bundled with this app version. Never changes mid-release. */
export const COMFY_VERSION = '0.18.0';

/**
 * Project schema version (integer). Increment whenever project.json structure changes
 * in a way that requires migration (field renames, additions, restructuring).
 * Plan B migration runner reads this constant.
 */
export const SCHEMA_VERSION = 1;
```

**Notes:**
- `COMFY_VERSION` should be set to whatever ComfyUI version is currently bundled. Confirm actual value before implementing.
- `SCHEMA_VERSION = 1` is the baseline — existing projects with no `schemaVersion` field will be treated as `v0` and migrated to `v1` (which is a no-op bump — see Plan B).

---

## Step 2: Create `js/core/operationRegistry.js`

New file. Adds versioning metadata on top of existing `commandRegistry.js` (which handles UI) and `modelRegistry.js` (which handles workflow resolution). Does NOT replace either.

**All 13 current operations from ****`commandRegistry.js`**** must appear here.**

```javascript
// js/core/operationRegistry.js

/**
 * Operation registry — versioning layer on top of commandRegistry.js.
 *
 * commandRegistry.js  → UI metadata (labels, input requirements, components)
 * modelRegistry.js    → workflow file resolution per model
 * operationRegistry.js → versioning, deprecation, app version introduced
 *
 * When adding a new operation: add it to commandRegistry.js first, then add
 * an entry here with the current APP_VERSION as appVersionIntroduced.
 */
export const OPERATION_REGISTRY = {
  // Image operations
  t2i:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  i2i:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  upscale:      { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  edit:         { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  detail:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  change:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  remove:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  // Video operations
  t2v:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  i2v:          { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  extend:       { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  // Universal operations (not model-tied)
  interpolate:  { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  videoUpscale: { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
  autoMaskImg:  { latestVersion: '1.0', appVersionIntroduced: '0.0.1' },
};

/**
 * Returns the registry entry for an operation, or null if not found.
 * Use this to check if an operation key is valid/known.
 */
export function getOperationMeta(operationId) {
  return OPERATION_REGISTRY[operationId] ?? null;
}

/**
 * Returns true if the operation key exists in the registry.
 * Use in validation (e.g., when loading a history item with an unknown operation key).
 */
export function isOperationKnown(operationId) {
  return operationId in OPERATION_REGISTRY;
}
```

**Future shape (do not implement now — for reference):**
When an operation is updated, the entry will grow:
```javascript
t2i: {
  latestVersion: '1.1',
  appVersionIntroduced: '1.0.0',
  versions: {
    '1.0': { appVersionIntroduced: '1.0.0' },
    '1.1': { appVersionIntroduced: '1.2.0', deprecated: false },
  }
}
```

---

## Step 3: Create `js/managers/versioningManager.js`

New file. Semver utilities + operation compatibility helpers. Used by Plan B migration runner and Plan C version bump tooling.

```javascript
// js/managers/versioningManager.js

import { OPERATION_REGISTRY } from '../core/operationRegistry.js';

/**
 * Compare two semver strings.
 * Returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2.
 * Handles standard 'MAJOR.MINOR.PATCH' format only.
 */
export function compareSemVer(v1, v2) {
  const parse = (v) => v.split('.').map(Number);
  const [a1, a2, a3] = parse(v1);
  const [b1, b2, b3] = parse(v2);
  if (a1 !== b1) return a1 < b1 ? -1 : 1;
  if (a2 !== b2) return a2 < b2 ? -1 : 1;
  if (a3 !== b3) return a3 < b3 ? -1 : 1;
  return 0;
}

/**
 * Returns true if the operation was available in the given app version.
 * Used when validating projects opened in older app versions (future use).
 */
export function isOperationAvailableIn(operationId, appVersion) {
  const meta = OPERATION_REGISTRY[operationId];
  if (!meta) return false;
  return compareSemVer(meta.appVersionIntroduced, appVersion) <= 0;
}

/**
 * Returns all operations that were introduced in a specific app version.
 * Used by the version bump script to list what's new in a release.
 */
export function getOperationsIntroducedIn(appVersion) {
  return Object.entries(OPERATION_REGISTRY)
    .filter(([, meta]) => meta.appVersionIntroduced === appVersion)
    .map(([id]) => id);
}
```

---

## Implementation Steps

- [ ] Confirm `COMFY_VERSION` matches the `version` field in `dev_configs/system_dependencies.json` (set by Plan D) — they must be identical
- [ ] Create `js/core/appVersion.js` with confirmed COMFY_VERSION
- [ ] Create `js/core/operationRegistry.js` — verify operation keys against `commandRegistry.js` (must match exactly)
- [ ] Create `js/managers/versioningManager.js`
- [ ] Cross-check: every key in `commandRegistry.js` (non-stub operations) must appear in `OPERATION_REGISTRY`
- [ ] Update `routes/engine.js` (Plan D file) — replace `config.engine.version` read from `system_dependencies.json` with import of `COMFY_VERSION` from `js/core/appVersion.js`. The JSON field remains for the Python pre-release test script (Plan C) which can't import ES modules.

---

## Verification

```javascript
// In browser console after app loads:
import { APP_VERSION, SCHEMA_VERSION } from './js/core/appVersion.js';
import { isOperationKnown, getOperationMeta } from './js/core/operationRegistry.js';
import { compareSemVer } from './js/managers/versioningManager.js';

// Should all pass:
console.assert(APP_VERSION === '0.0.1');
console.assert(SCHEMA_VERSION === 1);
console.assert(isOperationKnown('t2i') === true);
console.assert(isOperationKnown('fakeOp') === false);
console.assert(getOperationMeta('upscale').latestVersion === '1.0');
console.assert(compareSemVer('1.0.0', '2.0.0') === -1);
console.assert(compareSemVer('2.0.0', '1.9.9') === 1);
console.assert(compareSemVer('1.0.0', '1.0.0') === 0);
```

No existing functionality is changed — this plan adds three new files only.
