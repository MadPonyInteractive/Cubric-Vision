# App Versioning System

This document explains how Cubric Studio tracks and manages versions of the application, its bundled ComfyUI engine, the project data schema, and individual operations.

---

## The Three Version Constants

Application version constants live in `js/core/appVersion.js`:

```javascript
export const APP_VERSION = '0.0.1';  // Application release version (semver)
export const SCHEMA_VERSION = 1;     // Project data schema version (integer)
```

Engine versions are stored in `dev_configs/system_dependencies.json` and accessed via `routes/platformEngine.js`:

```json
{
  "engine": {
    "name": "ComfyUI Portable",
    "version": "0.18.0"
  }
}
```

### APP_VERSION

- **Purpose:** Identifies the Cubric Studio release. Bumped on every public release.
- **Format:** Semantic versioning (`MAJOR.MINOR.PATCH`).
- **When to bump:**
  - **Patch** (0.0.x → 0.0.y): Bug fixes, no new operations, no schema change.
  - **Minor** (0.x.0 → 0.(x+1).0): New operations added, or ComfyUI engine updated.
  - **Major** (x.0.0 → (x+1).0.0): Breaking changes (schema change, significant architectural shift).
- **Propagates to:** `operationRegistry.js` entries (as `appVersionIntroduced`) and release notes file naming.

### COMFY_VERSION

- **Purpose:** Identifies which ComfyUI portable engine is bundled with this release.
- **Format:** Semantic versioning matching upstream tags (e.g., `0.18.0` for ComfyUI).
- **Where:** Stored in `dev_configs/system_dependencies.json` (single source of truth).
- **When to bump:** Only when the bundled engine is upgraded. Edit `system_dependencies.json`.
- **Access:** `routes/platformEngine.js` reads this value at startup and exports `COMFY_VERSION` for use by `engine.js` and download manager.
- **Validation:** On app boot, `_bootApp()` calls `GET /engine/version-check` which compares installed engine version against `COMFY_VERSION` from `platformEngine.js`. If mismatch, `MpiEngineInstall` prompts the user to upgrade.

### SCHEMA_VERSION

- **Purpose:** Identifies the structure of `project.json`. Incremented when the project data model changes in a breaking way (e.g., history format changes from objects to UUIDs).
- **Format:** Integer (1, 2, 3, ...).
- **When to bump:** Only when `project.json` structure changes in a way that requires code migration.
- **Paired with migration:** Every SCHEMA_VERSION bump must have a corresponding migration function in `js/migrations/projectMigrations.js` (e.g., `migrateV0toV1`, `migrateV1toV2`) that upgrades a project from the old schema to the new one.
- **Validation:** Both `appVersion.js` and `projectMigrations.js` must have the same `SCHEMA_VERSION` constant. If they diverge, projects will fail to load.

### APP_STAGE (derived)

- **Purpose:** Identifies the release channel (`alpha` | `beta` | `release`) shown on the About panel and attached to in-app bug reports as a `stage:<x>` GitHub label.
- **Not a separate source of truth.** Derived purely from `APP_VERSION` so it can never drift. Rule: `0.x.x` → alpha; `X.0.0` → release; `X.Y.0` (Y>0) → beta; `X.Y.Z` (Z>0) → alpha.
- **Where:** `js/core/appStage.js` exports `deriveStage()`, `APP_STAGE`, `APP_STAGE_LABEL`. The error-reporter backend (`routes/system.js` `/github/create-issue`) re-derives stage server-side from the reported version (client stage is advisory only, never trusted) via a **mirrored** `deriveStage()` — keep both in sync if the rule changes.
- **Build hash** (`build:<hash>` issue label) is deferred to MPI-8 portable-build injection; not part of the derived stage.

---

## Operation Registry

The operation registry is split across three files, each serving a different purpose:

### 1. `js/core/operationRegistry.js` — Versioning and deprecation

Source of truth for which operations exist and when they were introduced. Every operation is listed with two fields:

```javascript
export const OPERATION_REGISTRY = {
    t2i: {
        latestVersion: '1.0',
        appVersionIntroduced: '0.0.1',
    },
    // ... 12 other operations
    interpolate: {
        latestVersion: '1.0',
        appVersionIntroduced: '0.0.1',
        // (if deprecated someday) deprecated: true
    },
};
```

**`latestVersion`** — The operation's own API version, independent of `APP_VERSION`. Bumped when operation parameters change in a breaking way (e.g., you remove a parameter or change its meaning). Currently all operations are at `'1.0'`.

**`appVersionIntroduced`** — The `APP_VERSION` in which this operation was first added. Used by the migration system to validate that a project requesting this operation can only be loaded by an app version that supports it.

**`deprecated`**** (optional)** — If present and true, the operation is no longer available in the UI, but history items using it can still be viewed (backward compatibility).

### 2. `js/data/commandRegistry.js` — UI metadata

Defines how each operation appears in the UI: label, media type, input requirements, component controls, etc. This file does **not** know about versions — it only defines the current UI surface.

### 3. `js/data/modelConstants/models.js` — Workflow file paths

Maps each operation to the ComfyUI workflow JSON filename it uses. Example: `t2i` operation on the `sdxl-realistic` model uses the workflow file `t2i_sdxl_realistic.json`.

---

## The JSON Mirror: `operation_registry.json`

A Python pre-release test suite needs to know which operations exist and their workflow filenames, but it cannot import ES modules. The solution is `operation_registry.json` — a JSON file at the repo root that mirrors `operationRegistry.js`.

```json
{
  "t2i": {
    "latestVersion": "1.0",
    "appVersionIntroduced": "0.0.1"
  },
  "interpolate": {
    "latestVersion": "1.0",
    "appVersionIntroduced": "0.0.1",
    "universal": true
  }
}
```

**Synchronization rule:** Every time you add, remove, or deprecate an operation (via the `/mpi-version-bump` skill), both `operationRegistry.js` **and** `operation_registry.json` must be updated together. The version-bump skill handles this automatically.

**Important:** Do NOT edit `operation_registry.json` by hand. Use the `/mpi-version-bump` skill or the version-bump skill will eventually fall out of sync.

---

## When to Bump What

Use the `/mpi-version-bump` slash command to guide the bump process interactively. Here's the decision matrix:

| Change | Bump | Rationale |
| --- | --- | --- |
| Bug fixes only, no new features | `patch` | No API or data shape changes |
| New operations added | `minor` | New user-facing capability |
| ComfyUI engine upgraded | `minor` | New models/features may be available |
| Schema change (project.json structure changes) | `major` | Breaking change; all existing projects need migration |
| Breaking change to operation parameters | `major` | Backward incompatibility |

---

## Release Workflow & Adding Operations

Both flows are owned by the `/mpi-version-bump` slash command — it interactively handles bump type, new ops, ComfyUI version change, schema migrations, syncs `operation_registry.json`, generates release notes under `docs/releases/`, and offers pre-release tests. Do NOT edit `appVersion.js` / `operationRegistry.js` / `operation_registry.json` by hand; the skill keeps them in sync. See `.claude/skills/mpi-version-bump.md`.

---

## Migration System

When `project.json` structure changes, bump `SCHEMA_VERSION` in `js/core/appVersion.js` AND add a `migrateV<n>toV<n+1>` entry to `MIGRATIONS` map in `js/migrations/projectMigrations.js`. The `SCHEMA_VERSION` constant must match in both files. `/mpi-version-bump` with "schema changing? yes" creates the stub. On project open, `openProject()` runs all pending migrations sequentially before reconciliation/hydration. See `docs/project-integrity.md` § "The `openProject()` Flow" for the load sequence.

---

## Checking Operation Support

Use `js/managers/versioningManager.js` to check if an operation is available in a given app version:

```javascript
import { isOperationAvailableIn, getOperationsIntroducedIn } from './versioningManager.js';

// Check if a specific operation exists in a specific app version
const hasTtv = isOperationAvailableIn('t2v', '0.0.1');  // true

// Get all operations introduced in a specific version
const newOps = getOperationsIntroducedIn('0.1.0');  // ['myNewOp', ...]
```

These helpers compare `APP_VERSION` against each operation's `appVersionIntroduced` field from `operationRegistry.js`.

---

## References

- `js/core/appVersion.js` — APP_VERSION and SCHEMA_VERSION constants
- `dev_configs/system_dependencies.json` — engine version (single source of truth)
- `routes/platformEngine.js` — reads system_dependencies.json and exports COMFY_VERSION
- `js/core/operationRegistry.js` — operation registry
- `js/managers/versioningManager.js` — version queries
- `js/migrations/projectMigrations.js` — schema migration functions
- `.claude/skills/mpi-version-bump.md` — the interactive version-bump skill (use this for releases)
- `docs/releases/` — archived release notes per version
