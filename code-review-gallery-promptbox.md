# Refactoring: Gallery / PromptBox / Generation Pipeline

## Goal

Decompose MpiGalleryBlock (823→~350 lines) and MpiGroupHistoryBlock (648→~320 lines) by extracting shared logic into services and utilities. Centralize persistence, eliminate duplicate code, and establish sustainable patterns.

> [!CAUTION]
> **Critical Investigation Findings:**
> - `PromptBoxControls.js` and `MpiModelSettings.js` also write `state.currentProject` via `setModelSettings()`/`setToolSettings()`. These writes must NOT be routed through ProjectService — they are **settings writes**, not **group mutations**. `saveProjectSettings()` handles their persistence via a separate `/update-project-settings` route.
> - `MpiGalleryGrid.js` imports `removeHistoryEntry` from projectModel — it uses this for GC (garbage collection when a media file is missing). This stays as-is since it's a pure data transform, not a persistence operation.
> - `navigation.js` already calls `_currentBlock.destroy?.()` before clearing tool container (L178-181). The `el.destroy()` lifecycle issue in the code review is already handled.
> - `shell.js` L193-200 listens to `models:closed` and calls `PromptBoxService.show()` — this is a shell-level concern that must not conflict with block-level `models:closed` handlers.
> - `MpiGroupHistoryBlock` emits `media:updated` after `_persistGroup()` (L159). This event is used by the dev components page only. The new ProjectService should preserve this emit.

---

## Phase 1: Extract Utilities

**Risk:** Low — pure extraction, zero behavior change  
**Goal:** Remove ~80 lines of duplication by extracting repeated patterns into shared utility files  
**Test:** App behaves identically before and after

---

### [NEW] `js/utils/mediaActions.js`

Create this file with these exact exports:

```javascript
/**
 * mediaActions.js — Shared media file utilities.
 *
 * Extracts repeated media-related operations from MpiGalleryBlock
 * and MpiGroupHistoryBlock into reusable functions.
 */

import { clientLogger } from '../services/clientLogger.js';

/**
 * Extract the absolute path from a /project-file?path=... URL.
 * @param {string} filePath — e.g. "/project-file?path=C%3A%5C...%5Ct2i_001.png"
 * @returns {string|null} The decoded absolute path, or null if not parseable
 */
export function extractAbsPath(filePath) {
    if (!filePath) return null;
    const match = filePath.match(/[?&]path=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Extract just the filename from a filePath URL.
 * @param {string} filePath — e.g. "/project-file?path=C%3A%5CUsers%5C...%5Ct2i_001.png"
 * @returns {string|null}
 */
export function extractFilenameFromPath(filePath) {
    const absPath = extractAbsPath(filePath);
    if (!absPath) return null;
    return absPath.replace(/\\/g, '/').split('/').pop();
}

/**
 * Normalize a filePath to a URL the <img>/<video> tag can load.
 * Already-absolute URLs (http, blob, data) and project-file URLs pass through.
 * Raw Windows paths get wrapped in /project-file?path=....
 * @param {string} filePath
 * @returns {string}
 */
export function resolveMediaUrl(filePath) {
    if (!filePath) return '';
    if (filePath.startsWith('http') || filePath.startsWith('blob:') ||
        filePath.startsWith('data:') || filePath.includes('project-file')) {
        return filePath;
    }
    return `/project-file?path=${encodeURIComponent(filePath.replace(/\\/g, '/'))}`;
}

/**
 * Download media files by creating temporary <a> elements.
 * @param {Object} project — state.currentProject (needs .folderPath)
 * @param {Array<{filePath: string}>} items — array of history items to download
 */
export function downloadMediaFiles(project, items) {
    if (!project?.folderPath) return;
    for (const item of items) {
        const filename = extractFilenameFromPath(item.filePath);
        if (!filename) continue;
        const url = `/project-file?path=${encodeURIComponent(
            `${project.folderPath}/Media/${filename}`.replace(/\\/g, '/')
        )}`;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}

/**
 * Delete media files for the given items from a project.
 * Calls DELETE /project-media/:projectId/:filename for each item.
 * @param {Object} project — state.currentProject
 * @param {Array<{filePath: string}>} items — items whose files to delete
 */
export async function deleteMediaFiles(project, items) {
    if (!project) return;
    for (const item of items) {
        const filename = extractFilenameFromPath(item.filePath);
        if (!filename) continue;
        try {
            await fetch(
                `/project-media/${project.id}/${encodeURIComponent(filename)}?folderPath=${encodeURIComponent(project.folderPath)}`,
                { method: 'DELETE' }
            );
        } catch (err) {
            clientLogger.warn('mediaActions', 'delete file failed:', err);
        }
    }
}
```

---

### [NEW] `js/utils/modelHelpers.js`

```javascript
/**
 * modelHelpers.js — Model resolution utilities.
 */

import { state } from '../state.js';
import { getModelsByType } from '../data/modelRegistry.js';

/**
 * Resolves the active model for a given mediaType, using persisted selection
 * from state.s_selectedModelId with fallback to first installed model.
 *
 * @param {'image'|'video'} mediaType
 * @returns {{ model: Object|null, modelId: string|null, installedModels: Object[] }}
 */
export function resolveActiveModel(mediaType) {
    const installedModels = getModelsByType(mediaType)
        .filter(m => m.installed !== false);

    let modelId = state.s_selectedModelId
        ? (installedModels.find(m => m.id === state.s_selectedModelId)?.id
            ?? installedModels[0]?.id ?? null)
        : (installedModels[0]?.id ?? null);

    const model = modelId
        ? (installedModels.find(m => m.id === modelId) || installedModels[0] || null)
        : (installedModels[0] || null);

    return { model, modelId, installedModels };
}
```

---

### [NEW] `js/utils/displayHelpers.js`

```javascript
/**
 * displayHelpers.js — Display/formatting utilities.
 */

/**
 * Truncate a card display name to maxLength, adding ellipsis.
 * @param {string} name
 * @param {number} [maxLength=28]
 * @returns {string}
 */
export function truncateCardName(name, maxLength = 28) {
    if (!name) return '';
    return name.length > maxLength ? name.slice(0, maxLength - 1) + '…' : name;
}
```

---

### [MODIFY] `MpiGalleryBlock.js` — Phase 1 Changes

**Instructions — apply these changes ONE AT A TIME in order:**

1. **Add imports** (after existing imports, before the `_hydrateGalleryGroups` function):
   ```javascript
   import { extractFilenameFromPath, downloadMediaFiles, deleteMediaFiles, resolveMediaUrl } from '../../../utils/mediaActions.js';
   import { resolveActiveModel } from '../../../utils/modelHelpers.js';
   import { truncateCardName } from '../../../utils/displayHelpers.js';
   ```

2. **Replace model initialization** (around L384–399). Find the block:
   ```javascript
   const installedImageModels = getModelsByType('image').filter(m => m.installed !== false);
   let activeModelId = state.s_selectedModelId ? ...
   let activeModel = activeModelId ? ...
   if (activeModelId) state.s_selectedModelId = activeModelId;
   ```
   Replace with:
   ```javascript
   const { model: activeModelInit, modelId: activeModelIdInit, installedModels: installedImageModels } = resolveActiveModel('image');
   let activeModelId = activeModelIdInit;
   let activeModel = activeModelInit;
   if (activeModelId) state.s_selectedModelId = activeModelId;
   ```

3. **Replace download handlers**. Find every `selectionBar.on('download', ...)` and `grid.on('download', ...)` block that creates `<a>` elements. Replace the body with:
   ```javascript
   const items = groups.flatMap(g => {
       const sel = getSelectedItem(g);
       return sel ? [sel] : [];
   });
   downloadMediaFiles(state.currentProject, items);
   ```

4. **Replace filename extraction in delete handler** (L342–350). Instead of inline regex + decodeURIComponent, use:
   ```javascript
   const filename = extractFilenameFromPath(fp);
   ```

5. **Replace card name truncation** (L572-574 and L762-764). Replace:
   ```javascript
   displayName.length > 28 ? displayName.slice(0, 27) + '…' : displayName
   ```
   with:
   ```javascript
   truncateCardName(displayName)
   ```

6. **Delete `_generatingCardId` declaration** (L294 — `let _generatingCardId = null;`) and its two assignments (L509, L700). This variable is set but never read.

---

### [MODIFY] `MpiGroupHistoryBlock.js` — Phase 1 Changes

1. **Add imports**:
   ```javascript
   import { extractFilenameFromPath, downloadMediaFiles, deleteMediaFiles, resolveMediaUrl } from '../../../utils/mediaActions.js';
   import { resolveActiveModel } from '../../../utils/modelHelpers.js';
   ```

2. **Delete the `_resolveUrl` function** (L33-38). Replace all calls to `_resolveUrl(...)` with `resolveMediaUrl(...)`.

3. **Replace model initialization** (L102-113). Same pattern as Gallery — use `resolveActiveModel()`.

4. **Replace download handlers** with `downloadMediaFiles()`.

5. **Replace filename extraction in delete handler** with `extractFilenameFromPath()`.

---

### Verification 1

- [ ] Open project → Gallery loads, cards display correctly
- [ ] Click a card → Group History loads, canvas displays
- [ ] Download works from both selection bars
- [ ] Models resolve correctly (selected model persists between pages)
- [ ] Delete cards → files removed, grid updates
- [ ] Favourite toggle works and persists

---

## Phase 2: ProjectService — Centralize Persistence

**Risk:** Medium — changes write path for all project group mutations  
**Goal:** Single source of truth for project writes; eliminate runtime hydration; centralize serialization

> [!IMPORTANT]
> **What this phase does NOT change:**
> - `PromptBoxControls.js` continues to write `state.currentProject = setModelSettings(...)` directly. This is a **settings write**, not a group mutation, and uses `saveProjectSettings()` which hits `/update-project-settings` (a different route).
> - `MpiModelSettings.js` continues the same pattern via `_autoSave()`.
> - `projectModel.js` is untouched — it remains the pure data transform layer.
> - `projectReconciler.js` is untouched — it remains the project-load hydration layer.

---

### [NEW] `js/services/projectService.js`

This file absorbs `projectManager.js` and adds centralized group mutation + persistence methods.

**Exact exports (preserve the same function signatures as projectManager.js for backward compatibility):**

```javascript
// ── Re-exported from old projectManager.js (same signatures) ──
export async function chooseFolder()           // returns path or null
export async function createProject(name, folderPath = null)
export async function listProjects()
export async function openProject(project)     // migrate + reconcile + state + events
export async function updateProject(updates)
export function saveProjectSettings()          // debounced settings save
export async function deleteProject(folderPath)

// ── NEW: Centralized group mutation + persistence ──
export function addGroup(group)                // addGroupToProject + persist + emit
export function updateGroup(group)             // updateGroupInProject + persist + emit
export function removeGroup(groupId)           // removeGroupFromProject + persist + emit
export async function persistGroups()          // serialize → UUIDs → POST /update-project
export async function saveGeneration({...})    // POST /project/save-generation
```

**Implementation details for new methods:**

```javascript
import { state } from '../state.js';
import { Events } from '../events.js';
import { navigate, PAGE_LANDING } from '../router.js';
import { Storage } from '../core/storage.js';
import { reconcileAndHydrate } from '../managers/projectReconciler.js';
import {
    addGroupToProject,
    updateGroupInProject,
    removeGroupFromProject,
} from '../data/projectModel.js';
import { clientLogger } from './clientLogger.js';

async function post(endpoint, body) {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}

// Global debounce for saveProjectSettings (500ms)
let _saveProjectSettingsTimer = null;
function _debouncedSaveProjectSettings() {
    clearTimeout(_saveProjectSettingsTimer);
    _saveProjectSettingsTimer = setTimeout(async () => {
        if (!state.currentProject) return;
        const { modelSettings, toolSettings } = state.currentProject;
        const result = await post('/update-project-settings', {
            folderPath: state.currentProject.folderPath,
            updates: { modelSettings, toolSettings },
        });
        if (!result.success) throw new Error(result.error);
    }, 500);
}

// ── CRUD (copied from projectManager.js — same signatures) ──────────

export async function chooseFolder() {
    const result = await post('/choose-folder', {});
    return result.cancelled ? null : result.path;
}

export async function createProject(name, folderPath = null) {
    const result = await post('/create-project', { name, folderPath });
    if (!result.success) throw new Error(result.error);
    return result.project;
}

export async function listProjects() {
    const extraPaths = Storage.getExtraProjectPaths();
    const result = await post('/list-projects', { extraPaths });
    if (!result.success) throw new Error(result.error);
    return result.projects;
}

export async function openProject(project) {
    const migratedRes = await fetch('/migrate-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: project.folderPath }),
    });
    const migratedResult = await migratedRes.json();
    if (!migratedResult.success) throw new Error(migratedResult.error);
    const migrated = migratedResult.project;

    const { project: reconciled, wasModified } = await reconcileAndHydrate(migrated);

    if (wasModified) {
        const toSave = {
            ...reconciled,
            itemGroups: reconciled.itemGroups.map(g => ({
                ...g,
                history: g.history.map(item => item.id),
            })),
        };
        await post('/update-project', {
            folderPath: reconciled.folderPath,
            updates: { itemGroups: toSave.itemGroups },
        });
    }

    state.currentProject = reconciled;

    const extras = Storage.getExtraProjectPaths();
    const parentDir = reconciled.folderPath.split(/[\\/]/).slice(0, -1).join('/');
    if (!extras.includes(parentDir)) {
        extras.push(parentDir);
        Storage.setExtraProjectPaths(extras);
    }
    Storage.setLastProject(reconciled.folderPath);

    Events.emit('project:changed', { project: reconciled });
}

export async function updateProject(updates) {
    if (!state.currentProject) return;
    const result = await post('/update-project', {
        folderPath: state.currentProject.folderPath,
        updates,
    });
    if (result.success) state.currentProject = result.project;
    return result.project;
}

export function saveProjectSettings() {
    _debouncedSaveProjectSettings();
}

export async function deleteProject(folderPath) {
    const result = await post('/delete-project', { folderPath });
    if (!result.success) throw new Error(result.error);
    if (state.currentProject?.folderPath === folderPath) {
        state.currentProject = null;
        navigate(PAGE_LANDING);
    }
}

// ── Group mutations (NEW) ────────────────────────────────────────────

/**
 * Add a new group to the current project, persist, and emit.
 * @param {Object} group — Full ItemGroup with hydrated history items
 */
export function addGroup(group) {
    if (!state.currentProject) return;
    state.currentProject = addGroupToProject(state.currentProject, group);
    persistGroups();
    Events.emit('project:group-added', { group });
}

/**
 * Update an existing group in the current project, persist, and emit.
 * @param {Object} group — Full ItemGroup with hydrated history items
 */
export function updateGroup(group) {
    if (!state.currentProject) return;
    state.currentProject = updateGroupInProject(state.currentProject, group);
    persistGroups();
    Events.emit('project:group-updated', { group });
}

/**
 * Remove a group from the current project, persist, and emit.
 * @param {string} groupId
 */
export function removeGroup(groupId) {
    if (!state.currentProject) return;
    state.currentProject = removeGroupFromProject(state.currentProject, groupId);
    persistGroups();
    Events.emit('project:group-removed', { groupId });
}

/**
 * Serialize in-memory groups to UUID-only format and persist to disk.
 * This is THE ONLY place in the app that converts full objects → UUID strings.
 * Does NOT mutate in-memory state.currentProject.
 */
export async function persistGroups() {
    if (!state.currentProject) return;
    const serialized = state.currentProject.itemGroups.map(g => ({
        id:            g.id,
        type:          g.type,
        name:          g.name,
        createdAt:     g.createdAt,
        selectedIndex: g.selectedIndex,
        open:          g.open,
        favourite:     g.favourite,
        history:       g.history.map(item =>
            typeof item === 'string' ? item : item.id
        ),
    }));
    post('/update-project', {
        folderPath: state.currentProject.folderPath,
        updates: { itemGroups: serialized },
    }).catch(err => clientLogger.warn('ProjectService', 'persistGroups failed:', err));
}

/**
 * Save a generation result to the project folder.
 * @returns {{ success: boolean, filePath?: string, filename?: string }}
 */
export async function saveGeneration({ folderPath, comfyViewUrl, itemId, operation, meta, generationMs, pixelDimensions }) {
    const res = await fetch('/project/save-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, comfyViewUrl, itemId, operation, meta, generationMs, pixelDimensions }),
    });
    if (!res.ok) throw new Error(`save-generation returned ${res.status}`);
    return res.json();
}
```

---

### [DELETE] `js/managers/projectManager.js`

After all imports are updated, this file is fully replaced by `projectService.js`.

---

### Update all 5 import sites

These files import from `projectManager.js` and must be updated to import from `projectService.js`:

| File | Current Import | New Import |
|---|---|---|
| `js/shell/projectUI.js` L7 | `from '../managers/projectManager.js'` | `from '../services/projectService.js'` |
| `js/components/Primitives/MpiRadialMenu/MpiRadialMenu.js` L5 | `from '../../../managers/projectManager.js'` | `from '../../../services/projectService.js'` |
| `js/components/Compounds/MpiNewProject/MpiNewProject.js` L6 | `from '../../../managers/projectManager.js'` | `from '../../../services/projectService.js'` |
| `js/components/Compounds/MpiModelSettings/MpiModelSettings.js` L42 | `from '../../../managers/projectManager.js'` | `from '../../../services/projectService.js'` |
| `js/components/Blocks/MpiPromptBox/PromptBoxControls.js` L17 | `from '../../../managers/projectManager.js'` | `from '../../../services/projectService.js'` |

> [!WARNING]
> Each of these files imports specific named exports. Verify that the exact same export names exist in `projectService.js`:
> - projectUI.js: `{ listProjects, createProject, deleteProject, openProject }`
> - MpiRadialMenu.js: `{ updateProject }`
> - MpiNewProject.js: `{ chooseFolder }`
> - MpiModelSettings.js: `{ saveProjectSettings }`
> - PromptBoxControls.js: `{ saveProjectSettings }`

---

### [MODIFY] `MpiGalleryBlock.js` — Phase 2 Changes

1. **Update imports:**
   - Remove: `import { ... } from '../../../data/projectModel.js'` — specifically remove `addGroupToProject`, `removeGroupFromProject`, `updateGroupInProject` from the import. KEEP `createImageItem`, `createVideoItem`, `createItemGroup`, `appendToHistory`, `getSelectedItem`, `removeHistoryEntry`.
   - Add: `import { addGroup, updateGroup, removeGroup, persistGroups, saveGeneration } from '../../../services/projectService.js';`

2. **Delete the entire `_hydrateGalleryGroups` function** (L45-82, outside the setup function).

3. **Delete the initial hydration block** (L97-104 inside setup, the `if (folderPath && groups.some(...))` block). Just use `groups` directly.

4. **Delete the `state:changed` → `currentProject` hydration listener** (L114-129). Replace with nothing — hydration is no longer needed at runtime.

5. **Delete the `_persistGroups` function** (L144-171).

6. **Replace all group mutation + persist calls:**

   | Old Code | New Code |
   |---|---|
   | `state.currentProject = updateGroupInProject(state.currentProject, group); _persistGroups();` | `updateGroup(group);` |
   | `state.currentProject = removeGroupFromProject(state.currentProject, groupId); _persistGroups();` | `removeGroup(groupId);` |
   | `state.currentProject = addGroupToProject(state.currentProject, finalGroup); _persistGroups();` | `addGroup(finalGroup);` |

   Locations in MpiGalleryBlock:
   - L176-177: `gc-group` handler → `updateGroup(group);`
   - L181-182: `gc-remove` handler → `removeGroup(groupId);`
   - L186-187: `favourite` handler → `updateGroup(group);`
   - L358-361: delete handler → replace `let updated = project; for (const group of g) updated = removeGroupFromProject(updated, group.id); state.currentProject = updated; _persistGroups();` with:
     ```javascript
     for (const group of g) removeGroup(group.id);
     ```
   - L460-461: media:imported → `addGroup(finalGroup);`
   - L592-593: run onComplete (first handler) → `addGroup(group);`
   - L783-784: run onComplete (second handler) → `addGroup(group);`

7. **Replace `save-generation` fetch** (3 locations: L544-568, L734-758, and in media:imported if applicable) with:
   ```javascript
   const data = await saveGeneration({
       folderPath: state.currentProject.folderPath,
       comfyViewUrl: urls[0],
       itemId,
       operation,
       meta: { prompt: positive, negativePrompt: negative, modelId: activeModel.id },
       generationMs: elapsedMs,
       pixelDimensions: { w: 0, h: 0 },
   });
   if (data.success) {
       filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
       displayName = data.filename.replace(/\.[^.]+$/, '');
   }
   ```
   Wrap in try/catch with the same fallback pattern.

---

### [MODIFY] `MpiGroupHistoryBlock.js` — Phase 2 Changes

1. **Update imports:**
   - Remove `updateGroupInProject` from the `projectModel.js` import.
   - Add: `import { updateGroup, persistGroups, saveGeneration } from '../../../services/projectService.js';`

2. **Delete `_hydrateGroupHistory` function** (L44-69).

3. **Delete hydration call** in setup (around L240-249 where it calls `_hydrateGroupHistory`).

4. **Replace `_persistGroup` function** (L156-180) with:
   ```javascript
   function _persistGroup() {
       if (!state.currentProject) return;
       updateGroup(_group);
       Events.emit('media:updated', { projectId: state.currentProject.id });
   }
   ```
   Note: We keep the `media:updated` emit because it's used downstream.

5. **Replace `save-generation` fetch** (L372-393) with `saveGeneration({...})` from projectService.

---

### [MODIFY] `docs/events.md` — Add new events to canonical map

Add to the event map table:
```
| `project:group-added`   | Group added to current project { group }        |
| `project:group-updated` | Group updated in current project { group }       |
| `project:group-removed` | Group removed from current project { groupId }   |
```

---

### Verification 2

- [ ] Open project → Gallery loads (NO hydration fetch calls in Network tab)
- [ ] Run generation in Gallery → card appears + persists to disk
- [ ] Navigate to Group History → entry loads correctly
- [ ] Run generation in Group History → new entry appends + persists
- [ ] GC (garbage collect) a group from gallery → removal persists
- [ ] Favourite a group → favourite persists
- [ ] Delete items → files deleted, history updated
- [ ] Drop media into PromptBox → imported card appears in gallery
- [ ] Reload page (F5) → all persisted data intact
- [ ] Model Settings → LoRA/upscale changes save correctly (these bypass ProjectService)
- [ ] Ratio selector changes persist (PromptBoxControls path)

---

## Phase 3: Generation Service — Extract Run Lifecycle

**Risk:** Medium — changes execution flow but not data  
**Goal:** Extract the duplicated generation lifecycle from both blocks into one service

> [!IMPORTANT]
> **What the generation service owns:**
> - `runCommand()` call (from commandExecutor)
> - Preview, progress, complete, error, cancel handling
> - `save-generation` POST (via ProjectService)
> - `createImageItem` / `createVideoItem`
> - `tool:running` / `tool:idle` / `tool:cancelled` event emissions
> - `PromptBoxService.component?.setGenerating()` state
>
> **What the generation service does NOT own:**
> - Grid UI updates (placeholder card, preview card) — provided via callbacks
> - Canvas viewer updates — provided via callbacks
> - Selection mode / bar state — remains in blocks
> - Mask data — passed in as parameter

---

### [NEW] `js/services/generationService.js`

```javascript
/**
 * generationService.js — Generation lifecycle manager.
 *
 * Encapsulates the full "run generation → save result → update project" flow.
 * Both MpiGalleryBlock and MpiGroupHistoryBlock call startGeneration()
 * and provide UI callbacks for their specific rendering needs.
 */

import { runCommand } from './commandExecutor.js';
import { saveGeneration, addGroup, updateGroup } from './projectService.js';
import { createImageItem, createVideoItem, createItemGroup, appendToHistory } from '../data/projectModel.js';
import { PromptBoxService } from '../shell/promptBoxService.js';
import { StatusBar } from '../shell/statusBar.js';
import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from './clientLogger.js';
import { truncateCardName } from '../utils/displayHelpers.js';

/**
 * @typedef {Object} GenerationConfig
 * @property {string}   operation
 * @property {Object}   model           — full model object (from modelRegistry)
 * @property {string}   positive
 * @property {string}   negative
 * @property {Array}    mediaItems
 * @property {string}   [maskDataUrl]
 * @property {Object}   [injectionParams]
 */

/**
 * @typedef {Object} GenerationCallbacks
 * @property {function(string):void}  [onPreview]   — called with preview URL
 * @property {function({item, group}):void} [onComplete]  — called with final item and group
 * @property {function():void}        [onError]     — called on failure
 * @property {function():void}        [onCancel]    — called on cancel/empty result
 */

/**
 * Start a generation, manage the lifecycle, and persist results.
 *
 * For Gallery: creates a new group with the generated item.
 * For GroupHistory: appends the generated item to an existing group.
 *
 * @param {GenerationConfig} config
 * @param {GenerationCallbacks} callbacks
 * @param {{ existingGroup?: Object }} [opts] — if existingGroup is provided, appends to it instead of creating new
 * @returns {{ cancel: function }}
 */
export function startGeneration(config, callbacks = {}, opts = {}) {
    const { operation, model, positive, negative, mediaItems = [], maskDataUrl, injectionParams = {} } = config;
    const generationStartTime = Date.now();
    const itemId = crypto.randomUUID();
    const isVideo = model.mediaType === 'video';

    Events.emit('tool:running', { tool: 'groupHistory', type: operation });

    const exec = runCommand({
        operation,
        modelId: model.id,
        positive,
        negative,
        mediaItems,
        maskDataUrl,
        injectionParams,
    });

    exec.onPreview = (url) => callbacks.onPreview?.(url);

    exec.onProgress = (value) => StatusBar.progress.update(value);

    exec.onComplete = async (urls) => {
        PromptBoxService.component?.setGenerating(false);

        if (!urls.length) {
            clientLogger.warn('generationService', 'Generation completed but no output returned.');
            Events.emit('tool:cancelled', { tool: 'groupHistory' });
            callbacks.onCancel?.();
            return;
        }

        let filePath = urls[0];
        let displayName = operation;

        // Save to project folder
        if (state.currentProject?.folderPath) {
            try {
                const elapsedMs = Date.now() - generationStartTime;
                const data = await saveGeneration({
                    folderPath: state.currentProject.folderPath,
                    comfyViewUrl: urls[0],
                    itemId,
                    operation,
                    meta: { prompt: positive, negativePrompt: negative, modelId: model.id },
                    generationMs: elapsedMs,
                    pixelDimensions: injectionParams.Width
                        ? { w: injectionParams.Width, h: injectionParams.Height }
                        : { w: 0, h: 0 },
                });
                if (data.success) {
                    filePath = `/project-file?path=${encodeURIComponent(data.filePath)}`;
                    displayName = data.filename.replace(/\.[^.]+$/, '');
                }
            } catch (err) {
                clientLogger.warn('generationService', 'save-generation failed, using comfy URL:', err);
            }
        }

        displayName = truncateCardName(displayName);

        // Create full item object
        const item = isVideo
            ? createVideoItem({ id: itemId, filePath, operation: displayName, prompt: positive, negativePrompt: negative, modelId: model.id })
            : createImageItem({ id: itemId, filePath, operation: displayName, prompt: positive, negativePrompt: negative, modelId: model.id });

        // Project mutation
        if (opts.existingGroup) {
            // GroupHistory mode — append to existing group
            const updatedGroup = appendToHistory(opts.existingGroup, item);
            updateGroup(updatedGroup);
            callbacks.onComplete?.({ item, group: updatedGroup });
        } else {
            // Gallery mode — create new group
            const group = createItemGroup(model.mediaType, { name: displayName });
            const finalGroup = appendToHistory(group, item);
            addGroup(finalGroup);
            callbacks.onComplete?.({ item, group: finalGroup });
        }

        Events.emit('tool:idle', { tool: 'groupHistory', type: operation });
    };

    exec.onError = (err) => {
        PromptBoxService.component?.setGenerating(false);
        Events.emit('tool:cancelled', { tool: 'groupHistory' });
        callbacks.onError?.();
    };

    return { cancel: () => exec.cancel() };
}
```

---

### [MODIFY] `MpiGalleryBlock.js` — Phase 3 Changes

1. **Add import:** `import { startGeneration } from '../../../services/generationService.js';`
2. **Remove imports** that are now in generationService: `runCommand`, `createImageItem`, `createVideoItem`, `createItemGroup`, `appendToHistory`, `StatusBar` (if no longer used directly).
3. **Extract `_wirePromptBox(promptBox)`** — move all `.on(...)` registrations into a single function. Call it from both the initial mount and the `models:closed` remount.
4. **Replace the `run` handler body** with:
   ```javascript
   promptBox.on('run', ({ operation, positive, negative, mediaItems, injectionParams = {} }) => {
       if (!activeModel) return;
       // Create placeholder card for grid
       const tempId = crypto.randomUUID();
       const placeholderGroup = { id: tempId, type: activeModel.mediaType, name: 'Generating...', history: [], selectedIndex: 0, width: injectionParams.Width || 1024, height: injectionParams.Height || 1024, isGenerating: true };
       const currentGroups = state.currentProject?.itemGroups || [];
       grid.el.setGroups([placeholderGroup, ...currentGroups]);

       const handle = startGeneration(
           { operation, model: activeModel, positive, negative, mediaItems, injectionParams },
           {
               onPreview: (url) => grid.el.setCardPreview?.(tempId, url),
               onComplete: ({ item, group }) => {
                   grid.el.removeCard(tempId);
                   grid.el.setGroups([group, ...currentGroups]);
               },
               onCancel: () => {
                   grid.el.removeCard(tempId);
                   grid.el.setGroups(currentGroups);
               },
               onError: () => {
                   grid.el.removeCard(tempId);
                   grid.el.setGroups(currentGroups);
               },
           }
       );
   });
   ```
5. **Delete the ENTIRE duplicate `models:closed` run handler** (L680-806). The `_wirePromptBox` extraction above means both initial mount and remount share the same handler.

---

### [MODIFY] `MpiGroupHistoryBlock.js` — Phase 3 Changes

1. **Add import:** `import { startGeneration } from '../../../services/generationService.js';`
2. **Remove imports:** `runCommand`, `StatusBar` (if no longer used directly).
3. **Replace `_runGenerate` function** with:
   ```javascript
   function _runGenerate({ operation, positive, negative, mediaItems = [], maskDataUrl = null, injectionParams = {} }) {
       if (!activeModel) return;
       canvasViewer.el.setGenerating(true);

       // Always inject current selected history entry as input
       const currentItem = _group.history[_currentIdx];
       const hasDroppedImage = mediaItems.some(m => m.mediaType === 'image');
       const resolvedMedia = (!hasDroppedImage && currentItem?.filePath)
           ? [{ url: resolveMediaUrl(currentItem.filePath), mediaType: 'image', source: 'history' }, ...mediaItems]
           : mediaItems;

       _activeExec = startGeneration(
           { operation, model: activeModel, positive, negative, mediaItems: resolvedMedia, maskDataUrl, injectionParams },
           {
               onPreview: async (url) => {
                   canvasViewer.el.setGenerating(false);
                   canvasViewer.el.isComparisonMode = false;
                   if (url?.startsWith('blob:')) canvasViewer.el.setMaskHidden(true);
                   try { await canvasViewer.el.loadEntry({ filePath: url }, _currentIdx); } catch (_) {}
               },
               onComplete: ({ item, group }) => {
                   _activeExec = null;
                   canvasViewer.el.setGenerating(false);
                   canvasViewer.el.exitMode?.();
                   _canvasHasMask = false;
                   _refreshOpOptions();
                   _group = group;
                   _currentIdx = _group.selectedIndex;
                   historyList.el.appendEntry(item);
                   canvasViewer.el.loadEntry(item, _currentIdx);
                   canvasViewer.el.setMaskHidden(false);
               },
               onCancel: () => {
                   _activeExec = null;
                   canvasViewer.el.setGenerating(false);
               },
               onError: () => {
                   _activeExec = null;
                   canvasViewer.el.setGenerating(false);
               },
           },
           { existingGroup: _group }
       );
   }
   ```

---

### Verification 3

- [ ] Gallery: run generation → placeholder shows → preview appears → final card renders → persists
- [ ] Gallery: cancel mid-generation → placeholder removed, grid restored
- [ ] Group History: run generation → preview appears in canvas → new entry appends to history
- [ ] Group History: cancel → canvas restored, no entry added
- [ ] Generation error → ui:error shown, state cleaned up
- [ ] StatusBar progress works (blue bar, percentage, "Generating..." / "Loading model..." labels)
- [ ] Media import (drag-drop to PromptBox) still creates card in gallery

---

## Phase 4: Re-extract MpiGroupCard

**Risk:** Low — pure extraction from MpiGalleryGrid  
**Goal:** Move `_makeCard()` into a proper Compound; grid becomes a layout engine

> [!IMPORTANT]
> This is the largest phase in terms of file count but the lowest risk because it's a pure move — no logic changes.
> The card's CSS is currently in `MpiGalleryGrid.css` — it needs to be split into a separate file.

### [NEW] `js/components/Compounds/MpiGroupCard/MpiGroupCard.js`
### [NEW] `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`

Extract `_makeCard()` (L134-328 of MpiGalleryGrid.js) into this component. The component receives props (`group`, `selectionMode`, `cardWidth`) and emits events.

Card emits: `open`, `select`, `favourite`, `reuse`, `media-missing`

Grid becomes a **pure layout engine**: receives groups, computes justified rows, mounts cards, forwards events.

### [MODIFY] `MpiGalleryGrid.js`

Replace `_makeCard()` calls with `MpiGroupCard.mount()`. Grid shrinks from ~568 to ~350 lines.

### [MODIFY] `js/shell/preloadStyles.js`

Add `'js/components/Compounds/MpiGroupCard/MpiGroupCard.css'` to the preload list.

### Verification 4

- [ ] Gallery grid looks identical
- [ ] Card hover, selection, favouriting, drag all work
- [ ] Size slider resizes cards
- [ ] Filter/sort tabs work

---

## Phase 5: Event Flow Cleanup

**Risk:** Low — removing redundancy

### Changes

1. **MpiPromptBox.js** — Remove internal `workspace:set-operation` listener (L368) and `workspace:inject-prompts` listener (L369). Blocks handle these via PromptBoxService. The PromptBox should not subscribe to global events that blocks already relay to it.

2. **Both blocks** — Replace `Events.on('state:changed', ({ key }) => { if (key === 'xxx') ... })` with `Events.onState('xxx', handler)` where it exists.

3. **Update documentation:**
   - `docs/events.md` — add new project events
   - `.claude/rules/component-events.md` — update MpiGalleryBlock and MpiGroupHistoryBlock sections
   - `.claude/rules/component-state.md` — blocks no longer write `state.currentProject` for group mutations (ProjectService does)
   - `docs/projects.md` — mention ProjectService
   - `docs/shell.md` — mention ProjectService replacing projectManager

### Verification 5

- [ ] Full app flow works end-to-end
- [ ] No duplicate event handlers firing (check by logging in Events.js)
- [ ] Navigation back/forth: no errors in console
- [ ] Radial menu operation switching still works

---

## Execution Summary

| Phase | New Files | Modified | Deleted | Lines Removed (est.) |
|---|---|---|---|---|
| 1 | 3 utilities | 2 blocks | 0 | ~80 |
| 2 | 1 service | 2 blocks + 5 imports + 1 doc | 1 (projectManager.js) | ~200 |
| 3 | 1 service | 2 blocks | 0 | ~250 |
| 4 | 2 (card component) | 1 grid + 1 preload | 0 | ~190 (moved) |
| 5 | 0 | ~6 files | 0 | ~20 |
| **Total** | **7** | **~14** | **1** | **~740** |

**Final line counts (estimated):**
- MpiGalleryBlock.js: **823 → ~350 lines**
- MpiGroupHistoryBlock.js: **648 → ~320 lines**
- MpiGalleryGrid.js: **568 → ~350 lines**
