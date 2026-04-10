# State Architecture Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip legacy dead state from `state.js`, introduce a clean two-track per-project settings structure (`modelSettings` + `toolSettings`), and wire save/restore through `projectModel.js` and `projectManager.js`.

**Architecture:** State is split into two persisted tracks stored on the project object: `modelSettings` (keyed by model id — holds user LoRA slots and upscale model per model) and `toolSettings` (keyed by tool command key — holds upscale model for universal tools like `videoUpscale`). Both are saved to `project.json` and restored when a project is opened. Global `state.js` only holds ephemeral runtime values; nothing tool- or model-specific lives there permanently.

**Tech Stack:** Vanilla JS ES modules, no bundler. Proxy-based reactive state (`js/state.js`). Project persistence via Node.js backend routes (`/update-project`). No framework.

---

## Pre-work: Understand what's live

Before touching any file, these are the confirmed facts from auditing the codebase:

**Keep in `state.js`:**
- `currentProject`, `currentPage`, `currentParams`, `previousPage`, `previousParams` — core routing
- `comfyRootPath` — used by comfyController
- `g_selectedModel` — used by `js/shell/navigation.js` and `js/workspaces/gallery.js`
- `g_abortControllers` — used by legacy `llmService.js` (LLM re-implementation pending)
- `currentLoadedModel` — used by `llmService.js`
- `allComfyWorkflows` — used by `comfyController.js` (optional registry lookup, but keep for now)
- `upscaleModels` — will hold the runtime list of available upscale filenames (part of new design)

**Remove from `state.js` (dead/legacy):**
- All `g_*` except `g_selectedModel` and `g_abortControllers`
- `generatorPrompt`, `generatorSeed` — old generator tool
- `toolModelIds`, `descriptorImages`, `activeSubPage` — old tool system (`activeSubPage` written but never read)
- `pendingImageUrl` — old tool system (never read outside state.js)
- `defaultComfySettings`, `toolComfySettings`, `getToolComfySettings()` — replaced by new structure
- `detailerInputImage`, `detailerInputMask`, `detailerMaskMode`, `detailerSelectedMasks`, `detailerDetectionMode` — old detailer tool
- `upscalerInputImage`, `upscalerAutoGrid`, `upscalerGridH`, `upscalerGridV`, `upscalerCreative` — old upscaler tool
- `downloadingWorkflows` — old download system
- `runningComfyTool`, `runningLlmTool` — old tool tracking

**Add to `state.js`:**
- `availableLoras: []` — runtime list of LoRA filenames fetched from ComfyUI backend

**New two-track structure on the Project object (`project.json`):**
```javascript
// modelSettings: persisted per model, per project
project.modelSettings = {
    'sdxl-realistic': {
        loras: [
            { name: null, strengthModel: 1.0, strengthClip: 1.0 },
            { name: null, strengthModel: 1.0, strengthClip: 1.0 },
            { name: null, strengthModel: 1.0, strengthClip: 1.0 },
            { name: null, strengthModel: 1.0, strengthClip: 1.0 },
            { name: null, strengthModel: 1.0, strengthClip: 1.0 },
            { name: null, strengthModel: 1.0, strengthClip: 1.0 },
        ],
        upscaleModel: null, // null = use model's defaultUpscale from models.js
    }
}

// toolSettings: persisted per universal tool, per project
project.toolSettings = {
    'videoUpscale': {
        upscaleModel: null,
    }
}
```

**New field on each model in `models.js`:**
```javascript
defaultUpscale: '4x-NMKD-Siax', // dep id — used when modelSettings has no upscaleModel for this model
```

---

## File Map

| File | Action | Responsibility |
|:---|:---|:---|
| `js/state.js` | Modify | Strip dead keys, add `availableLoras: []`, keep confirmed-live keys |
| `js/data/projectModel.js` | Modify | Add `modelSettings` + `toolSettings` to `Project` typedef and `createProject()` |
| `js/managers/projectManager.js` | Modify | Replace old save/restore logic with two-track structure |
| `js/data/modelConstants/models.js` | Modify | Add `defaultUpscale` field to each image model entry |

---

## Task 1: Add `defaultUpscale` to each model in `models.js`

**Files:**
- Modify: `js/data/modelConstants/models.js`

- [ ] **Step 1: Add `defaultUpscale` to each model entry**

Open `js/data/modelConstants/models.js`. Add `defaultUpscale` to each image model. The value is the dep id from `dependencies.js`. Video models do not have an upscale operation so skip them.

```javascript
// sdxl-realistic
{
    id: 'sdxl-realistic',
    name: 'SDXL Realistic',
    mediaType: 'image',
    installed: false,
    image: 'Lustify7.png',
    type: 'sdxl',
    defaultUpscale: '4x-NMKD-Siax',   // ← add this
    supportedOps: ['t2i', 'upscale', 'detail'],
    // ... rest unchanged
}

// ill-anime-beauty
{
    id: 'ill-anime-beauty',
    defaultUpscale: '4x-AnimeSharp',   // ← add this (anime model benefits from anime upscaler)
    // ... rest unchanged
}

// ill-anime
{
    id: 'ill-anime',
    defaultUpscale: '4x-AnimeSharp',   // ← add this
    // ... rest unchanged
}

// pony-mix
{
    id: 'pony-mix',
    defaultUpscale: '4x-AnimeSharp',   // ← add this
    // ... rest unchanged
}

// wan-22 — no defaultUpscale (video model, no image upscale op)
```

- [ ] **Step 2: Verify the file looks correct**

Open `js/data/modelConstants/models.js` and confirm each image model has `defaultUpscale` and the video model does not.

- [ ] **Step 3: Commit**

```bash
git add js/data/modelConstants/models.js
git commit -m "feat: add defaultUpscale field to image models in registry"
```

---

## Task 2: Update `projectModel.js` — add two-track settings to Project shape

**Files:**
- Modify: `js/data/projectModel.js`

- [ ] **Step 1: Update the `Project` typedef**

Find the `@typedef {Object} Project` block and add the two new fields:

```javascript
/**
 * @typedef {Object} Project
 * @property {string}      id
 * @property {string}      name
 * @property {string}      folderPath
 * @property {string}      createdAt
 * @property {string}      updatedAt
 * @property {string|null} thumbnail
 * @property {ItemGroup[]} itemGroups
 * @property {boolean}     tutorialSeen
 * @property {Object}      modelSettings  - Per-model user selections: { [modelId]: { loras, upscaleModel } }
 * @property {Object}      toolSettings   - Per-tool user selections: { [toolKey]: { upscaleModel } }
 */
```

- [ ] **Step 2: Update `createProject()` factory to include defaults**

Find `createProject()` and add `modelSettings` and `toolSettings` with empty object defaults:

```javascript
export function createProject(name, folderPath) {
    return {
        id:            generateId(),
        name,
        folderPath,
        createdAt:     new Date().toISOString(),
        updatedAt:     new Date().toISOString(),
        thumbnail:     null,
        itemGroups:    [],
        tutorialSeen:  false,
        modelSettings: {},
        toolSettings:  {},
    };
}
```

- [ ] **Step 3: Commit**

```bash
git add js/data/projectModel.js
git commit -m "feat: add modelSettings and toolSettings to Project shape"
```

---

## Task 3: Update `projectManager.js` — save/restore two-track settings

**Files:**
- Modify: `js/managers/projectManager.js`

- [ ] **Step 1: Update `openProject()` to restore two-track settings**

Find the `openProject()` function. Replace the entire `toolComfySettings` / `comfySettings` restore block with the new two-track restore. The full updated function:

```javascript
export function openProject(project) {
    state.currentProject = project;

    // Store the folder path so future sessions can find it
    const extras = JSON.parse(localStorage.getItem('mpi_extra_project_paths') || '[]');
    const parentDir = project.folderPath.split(/[\\/]/).slice(0, -1).join('/');
    if (!extras.includes(parentDir)) {
        extras.push(parentDir);
        localStorage.setItem('mpi_extra_project_paths', JSON.stringify(extras));
    }
    localStorage.setItem('mpi_last_project', project.folderPath);
    document.dispatchEvent(new CustomEvent('project:changed', { detail: { project } }));
    navigate(PAGE_GALLERY);
}
```

Note: `modelSettings` and `toolSettings` are already on the project object loaded from disk (or empty `{}` for new projects via `createProject()`). They live on `state.currentProject` directly — no separate state key needed. Consumers read from `state.currentProject.modelSettings[modelId]` etc.

- [ ] **Step 2: Verify no other references to `toolComfySettings` or `comfySettings` remain**

Run this search — expect zero results outside of `state.js` (which we'll clean next):

```bash
grep -r "toolComfySettings\|comfySettings\|getToolComfySettings\|defaultComfySettings" js/ --include="*.js" -l
```

Expected output: only `js/state.js` and `js/managers/projectManager.js` (which we just cleaned).

- [ ] **Step 3: Commit**

```bash
git add js/managers/projectManager.js
git commit -m "feat: replace toolComfySettings restore with two-track modelSettings/toolSettings"
```

---

## Task 4: Clean up `state.js` — strip dead keys, add new ones

**Files:**
- Modify: `js/state.js`

- [ ] **Step 1: Replace `_state` with the clean version**

Replace the entire `_state` object and the `getToolComfySettings` export with the following:

```javascript
import { Events } from './events.js';

// Global runtime state. Per-project persistent settings live on state.currentProject
// (modelSettings, toolSettings) — not here.
const _state = {
    // ── Core routing ──────────────────────────────────────────────────────────
    currentProject: null,       // Active Project object (from project.json)
    currentPage: 'landing',     // 'landing' | 'gallery' | 'groupHistory'
    currentParams: {},          // Extra router params
    previousPage: null,
    previousParams: {},

    // ── ComfyUI engine ────────────────────────────────────────────────────────
    comfyRootPath: null,        // Custom path to an external ComfyUI installation
    allComfyWorkflows: [],      // Workflow registry used by comfyController for id→file lookup

    // ── Runtime asset lists (populated at startup / on demand) ────────────────
    upscaleModels: [],          // Available upscale model filenames from ComfyUI backend
    availableLoras: [],         // Available LoRA filenames from ComfyUI backend

    // ── Legacy — keep until LLM re-implementation ─────────────────────────────
    g_selectedModel: null,      // Used by navigation.js and gallery.js
    g_abortControllers: {},     // Used by llmService.js
    currentLoadedModel: null,   // Used by llmService.js
};

/**
 * Singleton state object wrapped in a Proxy to automatically emit 'state:changed'
 * events when any property is mutated.
 */
export const state = new Proxy(_state, {
    set(target, key, value) {
        target[key] = value;
        Events.emit('state:changed', { key, value });
        return true;
    },
    get(target, key) {
        return target[key];
    }
});
```

- [ ] **Step 2: Verify the app still loads without errors**

Open the app in the browser / Electron. Navigate to the landing page. Open a project. Check the browser console for any `undefined` or `Cannot read properties of undefined` errors related to state keys.

- [ ] **Step 3: Commit**

```bash
git add js/state.js
git commit -m "refactor: strip legacy state keys, add availableLoras, clean state.js"
```

---

## Task 5: Add helper functions for two-track settings

**Files:**
- Modify: `js/data/projectModel.js`

These helpers are the canonical way to read and write model/tool settings. All future components must use them — never access `state.currentProject.modelSettings` directly.

- [ ] **Step 1: Add helper functions at the bottom of `projectModel.js`**

```javascript
// ── Two-Track Settings Helpers ────────────────────────────────────────────────

const _defaultLoraSlots = () => Array.from({ length: 6 }, () => ({
    name: null,
    strengthModel: 1.0,
    strengthClip: 1.0,
}));

/**
 * Returns the model settings for a given modelId on the current project.
 * Creates a default slot if none exists yet.
 * @param {Project} project
 * @param {string} modelId
 * @returns {{ loras: Array, upscaleModel: string|null }}
 */
export function getModelSettings(project, modelId) {
    if (!project.modelSettings[modelId]) {
        project.modelSettings[modelId] = {
            loras: _defaultLoraSlots(),
            upscaleModel: null,
        };
    }
    return project.modelSettings[modelId];
}

/**
 * Returns a new project with updated model settings for the given modelId.
 * Does not mutate the original.
 * @param {Project} project
 * @param {string} modelId
 * @param {{ loras?: Array, upscaleModel?: string|null }} updates
 * @returns {Project}
 */
export function setModelSettings(project, modelId, updates) {
    const current = getModelSettings(project, modelId);
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        modelSettings: {
            ...project.modelSettings,
            [modelId]: { ...current, ...updates },
        },
    };
}

/**
 * Returns the tool settings for a given toolKey on the current project.
 * Creates a default slot if none exists yet.
 * @param {Project} project
 * @param {string} toolKey  - Command key, e.g. 'videoUpscale'
 * @returns {{ upscaleModel: string|null }}
 */
export function getToolSettings(project, toolKey) {
    if (!project.toolSettings[toolKey]) {
        project.toolSettings[toolKey] = { upscaleModel: null };
    }
    return project.toolSettings[toolKey];
}

/**
 * Returns a new project with updated tool settings for the given toolKey.
 * Does not mutate the original.
 * @param {Project} project
 * @param {string} toolKey
 * @param {{ upscaleModel?: string|null }} updates
 * @returns {Project}
 */
export function setToolSettings(project, toolKey, updates) {
    const current = getToolSettings(project, toolKey);
    return {
        ...project,
        updatedAt: new Date().toISOString(),
        toolSettings: {
            ...project.toolSettings,
            [toolKey]: { ...current, ...updates },
        },
    };
}
```

- [ ] **Step 2: Verify the helpers are exported correctly**

Check the top of `projectModel.js` — confirm the new exports don't conflict with any existing names.

- [ ] **Step 3: Commit**

```bash
git add js/data/projectModel.js
git commit -m "feat: add getModelSettings/setModelSettings/getToolSettings/setToolSettings helpers"
```

---

## Task 6: Persist settings changes back to disk

**Files:**
- Modify: `js/managers/projectManager.js`

Settings changes (LoRA selections, upscale model choices) need to be saved back to `project.json` whenever the user changes them. This task adds a dedicated helper for that.

- [ ] **Step 1: Add `saveProjectSettings()` to `projectManager.js`**

Add this function after `updateProject()`:

```javascript
/**
 * Persist modelSettings and toolSettings for the current project to disk.
 * Call this whenever the user changes LoRA or upscale model selections.
 */
export async function saveProjectSettings() {
    if (!state.currentProject) return;
    const { modelSettings, toolSettings } = state.currentProject;
    await updateProject({ modelSettings, toolSettings });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/managers/projectManager.js
git commit -m "feat: add saveProjectSettings helper to persist two-track settings"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|:---|:---|
| Strip dead `g_*` keys from state.js | Task 4 |
| Strip old tool-specific flat keys (detailer*, upscaler*, etc.) | Task 4 |
| Strip `defaultComfySettings`, `toolComfySettings`, `getToolComfySettings` | Task 4 |
| Add `availableLoras` to state | Task 4 |
| Add `modelSettings` + `toolSettings` to Project typedef | Task 2 |
| Add defaults in `createProject()` | Task 2 |
| Replace old save/restore logic in `projectManager.js` | Task 3 |
| Add `defaultUpscale` to models | Task 1 |
| Helper functions for reading/writing settings | Task 5 |
| Persist settings changes to disk | Task 6 |

**Placeholder scan:** No TBDs, no "implement later", all steps contain actual code.

**Type consistency:** `getModelSettings` / `setModelSettings` / `getToolSettings` / `setToolSettings` — names are consistent across Tasks 5 and 6. `saveProjectSettings` in Task 6 calls `updateProject` which is already defined in `projectManager.js`. `state.currentProject.modelSettings` shape matches what `createProject()` initialises in Task 2.
