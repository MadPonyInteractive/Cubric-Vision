# Master Plan: App Versioning, Project Migration & ComfyUI Testing

**Status:** Planning Phase  
**Created:** 2026-04-16  
**Goal:** Design three interconnected systems that enable sustainable model releases, backward compatibility, and automated testing.

---

## 🎯 Executive Summary

Three systems must work together:

1. **App Versioning** — Track app version, ComfyUI version, and operation versions
2. **Project Migration** — Handle old projects gracefully when app updates
3. **ComfyUI Testing** — Validate workflows before release to prevent regressions

**Release cadence:** Monthly/fortnightly (not weekly)  
**ComfyUI strategy:** Bundled per app version; users cannot choose  
**Feature gating:** Eliminated; replaced with time-based tier releases  
**Distribution:** Different builds for Tier 3 → Tier 2 → Public (3-month stagger)

---

## 🏗️ Core Architecture

### Current State

**What exists:**
- `js/state.js` — Global state (currentProject, currentPage, etc.)
- `js/managers/projectManager.js` — CRUD operations for projects
- `project.json` — Project manifest with itemGroups and history
- `.meta/` folder — Per-image metadata files
- `modelSettings` and `toolSettings` — Already stored on project object (partially working)

**What's missing:**
- App versioning system (no version.js or constant)
- Operation registry (no unified list of operations with versions)
- Project schema versioning (no schemaVersion field in project.json)
- Migration system (no migration functions)
- Workflow validation harness (no automated testing)
- ComfyUI version tracking per app release

---

### Shared Infrastructure (All Systems Depend On)

```
js/
├── core/
│   ├── appVersion.js              ← Canonical app version constant
│   ├── operationRegistry.js       ← All operations + metadata + versions
│   └── schemaVersion.js           ← Project schema version constant
│
├── managers/
│   ├── projectManager.js          ← Updated to call migration
│   └── versioningManager.js       ← NEW: Version comparison, compatibility checks
│
├── migrations/
│   └── projectMigrations.js       ← NEW: Migration functions (v1→v2, v2→v3, etc.)
│
├── testing/
│   └── workflowValidator.js       ← NEW: Automated workflow tests
│
└── services/
    └── comfyVersionManager.js     ← NEW: Track ComfyUI version per app release
```

---

## 📌 System 1: App Versioning

### Purpose
Track which app version introduced which operations, models, and ComfyUI version.

### Components

#### 1.1 `js/core/appVersion.js`
```javascript
export const APP_VERSION = '3.0.0';
export const COMFY_VERSION = '0.1.234';  // ComfyUI commit/tag locked for this app version
export const SCHEMA_VERSION = 2;         // Project schema version (for migrations)

export const APP_RELEASE_INFO = {
  version: '3.0.0',
  comfyVersion: '0.1.234',
  releaseDate: '2026-04-16',
  tier3ReleaseDate: '2026-04-16',
  tier2ReleaseDate: '2026-05-16',
  publicReleaseDate: '2026-06-16',
  newOperations: ['t2i_v3.0', 'inpaint_v3.0', 'upscale_v3.1'],
  deprecatedOperations: ['t2i_v2.0', 'inpaint_v2.5'],
};
```

#### 1.2 `js/core/operationRegistry.js`
Maps all operations with metadata and versions:

```javascript
export const OPERATION_REGISTRY = {
  't2i': {
    name: 'Text to Image',
    latestVersion: '3.0',
    versions: {
      '3.0': {
        id: 't2i_v3.0',
        appVersionIntroduced: '3.0.0',
        comfyDependencies: ['ComfyUI/nodes/sampler'],
        params: {
          steps: { type: 'number', min: 1, max: 100, default: 30 },
          cfgScale: { type: 'number', min: 0, max: 20, default: 7.5 },
          denoise: { type: 'number', min: 0, max: 1, default: 0.7 },
          sampler: { type: 'string', default: 'euler' },
        },
        workflowPath: 'workflows/t2i_v3.0.json',
      },
      '2.0': {
        id: 't2i_v2.0',
        appVersionIntroduced: '2.0.0',
        deprecated: true,
        deprecatedInVersion: '3.0.0',
        params: { /* old params */ },
        workflowPath: 'workflows/t2i_v2.0.json',
      },
    },
  },
  'inpaint': { /* similar structure */ },
  'upscale': { /* similar structure */ },
};
```

#### 1.3 Version Compatibility Helper
New file: `js/managers/versioningManager.js`

```javascript
export function isOperationAvailable(operationId, userAppVersion) {
  const op = OPERATION_REGISTRY[operationId];
  if (!op) return false;
  return op.appVersionIntroduced <= userAppVersion;
}

export function getOperationVersion(operationId, targetVersion = null) {
  const op = OPERATION_REGISTRY[operationId];
  const version = targetVersion || op.latestVersion;
  return op.versions[version];
}

export function compareSemVer(v1, v2) {
  // Returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
}
```

---

## 📌 System 2: Project Migration

### Purpose
Handle backward compatibility when projects are opened in newer app versions.

### Components

#### 2.1 Project Schema Version
Add to `project.json`:
```json
{
  "schemaVersion": 2,
  "id": "...",
  "name": "...",
  "itemGroups": [...],
  "modelSettings": {...},
  "toolSettings": {...}
}
```

#### 2.2 `js/migrations/projectMigrations.js`
```javascript
const MIGRATIONS = {
  1: (project) => {
    // v1→v2: Rename 'denoise' to 'denoiseStrength'
    for (const [modelId, settings] of Object.entries(project.modelSettings || {})) {
      if (settings.denoise !== undefined) {
        settings.denoiseStrength = settings.denoise;
        delete settings.denoise;
      }
    }
    project.schemaVersion = 2;
    return project;
  },
  
  2: (project) => {
    // v2→v3: Add new models with defaults
    const defaults = {
      'sdxl-lightning': { guidanceScale: 8, steps: 20 },
    };
    project.modelSettings = { ...project.modelSettings, ...defaults };
    project.schemaVersion = 3;
    return project;
  },
};

export function migrateProject(project) {
  const currentSchemaVersion = SCHEMA_VERSION;
  const projectVersion = project.schemaVersion || 1;
  
  if (projectVersion >= currentSchemaVersion) return project;
  
  for (let v = projectVersion; v < currentSchemaVersion; v++) {
    console.log(`[Migration] "${project.name}": schema v${v} → v${v+1}`);
    if (!MIGRATIONS[v]) throw new Error(`No migration for v${v} → v${v+1}`);
    project = MIGRATIONS[v](project);
  }
  
  return project;
}

export function validateProjectAfterMigration(project) {
  // Ensure all required fields exist
  // Warn if deprecated operations are used
  // Check if deprecated models are referenced
}
```

#### 2.3 Integration in `projectManager.js`
Update `openProject()`:

```javascript
export function openProject(project) {
  // STEP 1: Migrate
  project = migrateProject(project);
  
  // STEP 2: Validate
  validateProjectAfterMigration(project);
  
  // STEP 3: Load into state
  state.currentProject = project;
  Events.emit('project:changed', { project });
  navigate(PAGE_GALLERY);
}
```

#### 2.4 History Item Structure
Image metadata (in `.meta/image_id.json` or in `project.json` history):

```json
{
  "id": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "type": "image",
  "filePath": "Media/t2i_003.png",
  "createdAt": "2026-04-15T23:46:19.340Z",
  
  "operationSnapshot": {
    "id": "t2i",
    "version": "3.0",
    "name": "Text to Image",
    "params": {
      "steps": 30,
      "cfgScale": 7.5,
      "denoise": 0.7,
      "sampler": "euler"
    }
  },
  
  "modelId": "sdxl-realistic",
  "prompt": "an hamster in the snow",
  "negativePrompt": "",
  "seed": -1,
  "pixelDimensions": { "w": 0, "h": 0 }
}
```

**Why operation snapshot?**
- Reproducible: Even if operation definition changes, snapshot preserves exactly what was used
- Auditable: See parameters at time of generation
- Graceful degradation: Old operations can be removed, snapshot still has the data

---

## 📌 System 3: ComfyUI Testing & Validation

### Purpose
Prevent regressions when ComfyUI updates or new operations are added.

### Components

#### 3.1 `js/testing/workflowValidator.js`
```javascript
export class WorkflowValidator {
  constructor(comfyServerUrl = 'http://localhost:8188') {
    this.serverUrl = comfyServerUrl;
  }
  
  async validateOperation(operationId, params = {}) {
    // Load operation workflow
    const opDef = getOperationVersion(operationId);
    const workflow = loadWorkflow(opDef.workflowPath);
    
    // Apply params to workflow
    const prepared = this.prepareWorkflow(workflow, params);
    
    // Queue to ComfyUI
    const jobId = await this.queueWorkflow(prepared);
    
    // Wait for completion
    const result = await this.waitForCompletion(jobId);
    
    // Check for errors
    if (!result.success) {
      return {
        ok: false,
        operationId,
        error: result.error,
      };
    }
    
    // Hash output for regression detection
    const outputHash = this.hashOutput(result.output);
    
    return {
      ok: true,
      operationId,
      outputHash,
      duration: result.duration,
    };
  }
  
  async validateAllOperations() {
    // Test every operation in registry
    const results = [];
    for (const [opId, opDef] of Object.entries(OPERATION_REGISTRY)) {
      console.log(`Testing ${opId}...`);
      const result = await this.validateOperation(opId);
      results.push(result);
    }
    return results;
  }
}
```

#### 3.2 Workflow Baseline Storage
New file: `docs/workflows/baselines.json`

```json
{
  "workflows": {
    "t2i_v3.0": {
      "hash": "abc123def456",
      "appVersion": "3.0.0",
      "comfyVersion": "0.1.234",
      "lastValidated": "2026-04-16T10:30:00Z",
      "params": { "steps": 30, "cfgScale": 7.5 }
    }
  }
}
```

#### 3.3 Pre-Release Testing Script
New file: `scripts/pre-release-test.js`

```javascript
// Run before publishing a new app version
async function preReleaseTest() {
  console.log(`Testing all workflows for app v${APP_VERSION}...`);
  
  const validator = new WorkflowValidator();
  const results = await validator.validateAllOperations();
  
  const failures = results.filter(r => !r.ok);
  if (failures.length > 0) {
    console.error(`❌ ${failures.length} workflows failed:`);
    failures.forEach(f => console.error(`  - ${f.operationId}: ${f.error}`));
    process.exit(1);
  }
  
  console.log(`✅ All workflows passed!`);
  updateBaselines(results);
}
```

---

## 🔗 Integration Points (How Systems Connect)

### Release Process Workflow

```
1. Developer creates new model with new operation
   ↓
2. Add operation to OPERATION_REGISTRY with version 3.1
   ↓
3. Update APP_VERSION to 3.0.1 (or 3.1.0 if major change)
   ↓
4. Run pre-release tests
   └─ Validates workflow against bundled ComfyUI
   └─ Stores baseline hash
   ↓
5. If tests pass:
   a. Build app v3.0.1 with ComfyUI 0.1.234
   b. Distribute to Tier 3 Patreon users
   ↓
6. After time period, increment APP_VERSION, rebuild, distribute to Tier 2
   ↓
7. When public release happens, rebuild with same APP_VERSION, public distribution

If ComfyUI requires update (new model comes out):
   a. Update ComfyUI to 0.1.250
   b. Add migration for any affected operations
   c. Bump SCHEMA_VERSION
   d. Run full test suite
   e. Release as v3.1.0 + ComfyUI 0.1.250
```

### Project Load Flow

```
User opens old project (schemaVersion: 1) in new app (schemaVersion: 3)
   ↓
migrateProject() runs migrations 1→2, 2→3
   ↓
validateProjectAfterMigration() checks:
   - All operations used still exist (or deprecated)
   - All modelSettings are compatible
   ↓
Load into state.currentProject
   ↓
When rendering history:
   - Use operationSnapshot to display what was originally used
   - If operation is deprecated, show warning or "legacy"
```

---

## 🏗️ Implementation Order (Phases)

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create `js/core/appVersion.js` with version constants
- [ ] Create `js/core/operationRegistry.js` (skeleton with existing operations)
- [ ] Add `schemaVersion` field to `project.json`
- [ ] Create `js/migrations/projectMigrations.js` (empty migrations object)
- [ ] Update `projectManager.js` to call `migrateProject()` on load
- [ ] Create `js/managers/versioningManager.js` with version comparison helpers

**Placeholder:** Migrations array is empty; will be populated as schema evolves.

### Phase 2: Testing Infrastructure (Weeks 2-3)
- [ ] Create `js/testing/workflowValidator.js`
- [ ] Create `docs/workflows/baselines.json` (empty)
- [ ] Create `scripts/pre-release-test.js`
- [ ] Test against local ComfyUI instance
- [ ] Populate baselines for all current operations

### Phase 3: Refinement (Weeks 3-4)
- [ ] Refine operation snapshots in history
- [ ] Add validation after migration
- [ ] Document operation parameter schema
- [ ] Create release checklist (pre-release, mid-tier, public)

### Phase 4: Ongoing
- [ ] Add migration functions as schema evolves
- [ ] Update operation registry as new operations are added
- [ ] Run pre-release tests before every release
- [ ] Monitor for ComfyUI compatibility issues

---

## 📋 Placeholders & Future Work

### High Priority (Before First Release)
- [ ] Finalize operation parameter schema (types, defaults, ranges)
- [ ] Build operation→workflow mapping
- [ ] Define what "deprecated operation" means (warn? error? skip?)

### Medium Priority (Can Be V2)
- [ ] Automated regression detection (compare output hashes)
- [ ] Workflow versioning independent of app versioning (if needed)
- [ ] User telemetry: track which operations are used (helps with deprecation)

### Low Priority (Nice to Have)
- [ ] Rollback mechanism (revert app to previous version)
- [ ] A/B testing different workflows for same operation
- [ ] Workflow perf metrics (ComfyUI queue time, memory usage)

---

## 🎯 Key Design Decisions (Made)

✅ **App version = ComfyUI version** (bundled per release)  
✅ **Operations versioned independently** (t2i_v3.0, t2i_v3.1, etc.)  
✅ **Projects use operation snapshots** (full param snapshot, not just ID)  
✅ **No feature gating code** (different builds for different tiers)  
✅ **Schema versioning for projects** (migration system handles upgrades)  
✅ **Automated testing before release** (prevent regressions)  

---

## 📚 References

- **Operation Registry:** Maps all operations with versions and dependencies
- **Version Compatibility:** Helpers to check if operation works in user's app version
- **Project Snapshots:** Complete operation state at time of generation
- **Migration System:** Handles schema upgrades between app versions
- **Testing Harness:** Validates all workflows before release

---

## Next Steps

1. **Sub-agents break this into 3 detailed plans:**
   - Plan A: App Versioning System Implementation
   - Plan B: Project Migration System Implementation
   - Plan C: ComfyUI Testing & Validation Implementation

2. **Each detailed plan should include:**
   - Exact file/class structures
   - API signatures
   - Edge cases & error handling
   - Testing strategy for the plan itself
   - Integration points with other systems

3. **After plans are approved, implementation can proceed in parallel** (they're mostly decoupled once foundation is in place).
