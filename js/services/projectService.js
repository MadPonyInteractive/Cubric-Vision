/**
 * projectService.js — Centralized project persistence service.
 *
 * Absorbs projectManager.js and adds centralized group mutation + persistence methods.
 * Single source of truth for project writes.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { navigate, PAGE_LANDING } from '../router.js';
import { Storage } from '../core/storage.js';
import { reconcileAndHydrate } from '../managers/projectReconciler.js';
import {
    addGroupToProject,
    updateGroupInProject,
    removeGroupFromProject,
    getModelSettings,
    setModelSettings,
    setOpSettings,
    setSharedSettings,
    getToolSettings,
    setToolSettings,
} from '../data/projectModel.js';
import { clientLogger } from './clientLogger.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

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
        const { modelSettings, toolSettings, shared } = state.currentProject;
        const result = await post('/update-project-settings', {
            folderPath: state.currentProject.folderPath,
            updates: { modelSettings, toolSettings, shared },
        });
        if (!result.success) throw new Error(result.error);
    }, 500);
}

// ── Settings event queue ───────────────────────────────────────────────────────

// Per-model queues: Map<modelId, { timer, modelPending, opPending: Map<opName, Object> }>
// `modelPending` accumulates model-wide writes (loras, upscaleModel).
// `opPending` accumulates per-op / shared bucket writes.
const _modelQueues = new Map();

// Per-tool queues: Map<toolKey, { timer: number|null, pending: Object }>
const _toolQueues = new Map();

// Per-mediaType shared queues: Map<'image'|'video', { timer, pending }>
const _sharedQueues = new Map();

const _QUEUE_DEBOUNCE_MS = 300;

// Legacy opName-less model-wide keys emitted by callers that DON'T set `modelWide`
// (the model-settings gear writes loras/upscaleModel this way). scope:'perModel'
// controls no longer need to be listed here — they emit `modelWide: true` and the
// guard on 'settings:model:update' trusts that flag (the control's `scope` is the
// single source of truth). Add a new perModel control? Nothing to do here (MPI-336).
const _MODEL_WIDE_KEYS = new Set([
    'loras', 'upscaleModel',
]);

function _enqueueModelUpdate(modelId, opName, key, value) {
    if (!_modelQueues.has(modelId)) {
        _modelQueues.set(modelId, { timer: null, modelPending: {}, opPending: new Map() });
    }
    const q = _modelQueues.get(modelId);

    if (opName) {
        if (!q.opPending.has(opName)) q.opPending.set(opName, {});
        const bucket = q.opPending.get(opName);
        // Deep-merge object values one level (e.g. ratioSelector sub-keys);
        // replace primitives/arrays.
        bucket[key] = (value && typeof value === 'object' && !Array.isArray(value))
            ? { ...(bucket[key] ?? {}), ...value }
            : value;
    } else {
        q.modelPending[key] = value;
    }

    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
        try {
            if (!state.currentProject) return;
            if (!state.currentProject.modelSettings?.[modelId]) {
                const defaults = getModelSettings(state.currentProject, modelId);
                state.currentProject = {
                    ...state.currentProject,
                    updatedAt: new Date().toISOString(),
                    modelSettings: { ...state.currentProject.modelSettings, [modelId]: defaults },
                };
            }
            for (const [k, v] of Object.entries(q.modelPending)) {
                state.currentProject = setModelSettings(state.currentProject, modelId, { [k]: v });
            }
            for (const [op, updates] of q.opPending) {
                state.currentProject = setOpSettings(state.currentProject, modelId, op, updates);
            }
            q.modelPending = {};
            q.opPending.clear();
            saveProjectSettings();
        } catch (err) {
            clientLogger.error('projectService', 'Failed to flush model queue', err);
            Events.emit('ui:error', { title: 'Save failed', message: 'Failed to save model settings.' });
        }
    }, _QUEUE_DEBOUNCE_MS);
}

function _enqueueToolUpdate(toolKey, key, value) {
    if (!_toolQueues.has(toolKey)) _toolQueues.set(toolKey, { timer: null, pending: {} });
    const q = _toolQueues.get(toolKey);
    q.pending[key] = value;

    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
        try {
            if (!state.currentProject) return;
            if (!state.currentProject.toolSettings?.[toolKey]) {
                const defaults = getToolSettings(state.currentProject, toolKey);
                state.currentProject = {
                    ...state.currentProject,
                    updatedAt: new Date().toISOString(),
                    toolSettings: { ...state.currentProject.toolSettings, [toolKey]: defaults },
                };
            }
            for (const [k, v] of Object.entries(q.pending)) {
                state.currentProject = setToolSettings(state.currentProject, toolKey, { [k]: v });
            }
            q.pending = {};
            saveProjectSettings();
        } catch (err) {
            clientLogger.error('projectService', 'Failed to flush tool queue', err);
            Events.emit('ui:error', { title: 'Save failed', message: 'Failed to save tool settings.' });
        }
    }, _QUEUE_DEBOUNCE_MS);
}

function _enqueueSharedUpdate(mediaType, key, value) {
    if (mediaType !== 'image' && mediaType !== 'video') return;
    if (!_sharedQueues.has(mediaType)) _sharedQueues.set(mediaType, { timer: null, pending: {} });
    const q = _sharedQueues.get(mediaType);

    // Deep-merge object values one level (e.g. ratioSelector sub-keys);
    // replace primitives/arrays.
    q.pending[key] = (value && typeof value === 'object' && !Array.isArray(value))
        ? { ...(q.pending[key] ?? {}), ...value }
        : value;

    clearTimeout(q.timer);
    q.timer = setTimeout(async () => {
        try {
            if (!state.currentProject) return;
            if (!state.currentProject.shared) {
                state.currentProject = {
                    ...state.currentProject,
                    updatedAt: new Date().toISOString(),
                    shared: { image: {}, video: {} },
                };
            }
            for (const [k, v] of Object.entries(q.pending)) {
                state.currentProject = setSharedSettings(state.currentProject, mediaType, { [k]: v });
            }
            q.pending = {};
            saveProjectSettings();
        } catch (err) {
            clientLogger.error('projectService', 'Failed to flush shared queue', err);
            Events.emit('ui:error', { title: 'Save failed', message: 'Failed to save shared settings.' });
        }
    }, _QUEUE_DEBOUNCE_MS);
}

// Store unsubs — service is a permanent singleton, but events.md rule requires it
const _settingsUnsubs = [
    Events.on('settings:model:select', ({ modelId }) => {
        if (!state.currentProject) return;
        if (state.currentProject.modelSettings?.[modelId]) return;
        const defaults = getModelSettings(state.currentProject, modelId);
        state.currentProject = {
            ...state.currentProject,
            updatedAt: new Date().toISOString(),
            modelSettings: { ...state.currentProject.modelSettings, [modelId]: defaults },
        };
        saveProjectSettings();
    }),
    Events.on('settings:tool:select', ({ toolKey }) => {
        if (!state.currentProject) return;
        if (state.currentProject.toolSettings?.[toolKey]) return;
        const defaults = getToolSettings(state.currentProject, toolKey);
        state.currentProject = {
            ...state.currentProject,
            updatedAt: new Date().toISOString(),
            toolSettings: { ...state.currentProject.toolSettings, [toolKey]: defaults },
        };
        saveProjectSettings();
    }),
    Events.on('settings:model:update', ({ modelId, opName, key, value, modelWide }) => {
        // An opName-less write routes to the model bucket when it is a genuine
        // model-wide write: either flagged `modelWide` (any scope:'perModel' control —
        // the control's scope is the source of truth, no allowlist edit needed, MPI-336)
        // or a legacy caller writing a known model-wide key (loras/upscaleModel).
        // Anything else without an opName is a perOp caller that forgot it — a bug.
        if (!opName) {
            if (modelWide || _MODEL_WIDE_KEYS.has(key)) {
                _enqueueModelUpdate(modelId, null, key, value);
            } else {
                clientLogger.warn('projectService', `settings:model:update missing opName for non-model-wide key "${key}"`);
            }
            return;
        }
        _enqueueModelUpdate(modelId, opName, key, value);
    }),
    Events.on('settings:tool:update', ({ toolKey, key, value }) => {
        _enqueueToolUpdate(toolKey, key, value);
    }),
    Events.on('settings:shared:update', ({ mediaType, key, value }) => {
        _enqueueSharedUpdate(mediaType, key, value);
    }),
];
// If service ever needs hot-teardown: _settingsUnsubs.forEach(u => u());

// ── CRUD (same signatures as projectManager.js) ────────────────────────────────

export async function chooseFolder() {
    // Browser dev mode has no native dialog — return null silently.
    if (typeof window.require !== 'function') return null;
    const { ipcRenderer } = window.require('electron');
    const result = await ipcRenderer.invoke('choose-folder');
    return result?.cancelled ? null : (result?.path ?? null);
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
    // MPI-247 memory is per working-session-on-a-project. Opening a different
    // project must not carry a prior project's last op (e.g. i2i) into a fresh
    // Gallery mount with an empty prompt — reset to natural per-model defaults.
    state.s_selectedOpByModel = {};

    const extras = Storage.getExtraProjectPaths();
    const parentDir = reconciled.folderPath.split(/[\\/]/).slice(0, -1).join('/');
    if (!extras.includes(parentDir)) {
        extras.push(parentDir);
        Storage.setExtraProjectPaths(extras);
        // Mirror to the durable Documents registry so it survives reinstall.
        post('/add-project-path', { parentDir }).catch(() => {});
    }
    Storage.setLastProject(reconciled.folderPath);

    Events.emit('project:changed', { project: reconciled });

    // MPI-319: backfill gallery thumbs for pre-existing images (projects made
    // before image thumbs existed). Fire-and-forget — until it lands, cards fall
    // back to full-res. When it returns, patch live items and re-emit so the
    // grid swaps to the cheap thumbs without a reload.
    _backfillImageThumbs(reconciled.folderPath);
}

async function _backfillImageThumbs(folderPath) {
    try {
        const result = await post('/backfill-image-thumbs', { folderPath });
        const thumbs = result?.thumbs;
        if (!result?.success || !thumbs || !Object.keys(thumbs).length) return;
        // Only patch if we're still on the same project (user may have navigated).
        const proj = state.currentProject;
        if (!proj || proj.folderPath !== folderPath) return;

        let changed = false;
        const itemGroups = proj.itemGroups.map((g) => ({
            ...g,
            history: g.history.map((item) => {
                if (item?.id && thumbs[item.id] && !item.thumbPath) {
                    changed = true;
                    return { ...item, thumbPath: thumbs[item.id] };
                }
                return item;
            }),
        }));
        if (!changed) return;
        // Proxy contract: replace the top-level key, never mutate sub-objects.
        state.currentProject = { ...proj, itemGroups };
        // Rebuild the gallery grid from the freshly-patched state (same handler
        // path a new group uses — pure rebuild from state.currentProject).
        Events.emit('project:group-added', {});
    } catch (err) {
        clientLogger.warn('projectService', `image-thumb backfill failed: ${err.message}`);
    }
}

/**
 * Validate a folder as a project and register its parent directory in the
 * extra project paths list, so the next listProjects() surfaces it.
 * Does NOT open the project — the user clicks the new card to open.
 * @param {string} folderPath — absolute path to the project folder
 * @returns {Promise<Object>} the validated project.json contents
 */
export async function addProjectByFolder(folderPath) {
    const normalized = folderPath.replace(/\\/g, '/');
    const res = await post('/validate-project', { folderPath: normalized });
    if (!res.success) throw new Error(res.error);

    const parentDir = normalized.split('/').slice(0, -1).join('/');
    const extras = Storage.getExtraProjectPaths();
    if (!extras.includes(parentDir)) {
        extras.push(parentDir);
        Storage.setExtraProjectPaths(extras);
        // Mirror to the durable Documents registry so it survives reinstall.
        post('/add-project-path', { parentDir }).catch(() => {});
    }
    return res.project;
}

export async function updateProject(updates) {
    if (!state.currentProject) return;
    const result = await post('/update-project', {
        folderPath: state.currentProject.folderPath,
        updates,
    });
    if (result.success) {
        // Merge updates into in-memory project. Do NOT replace with result.project
        // because the server response reads project.json from disk where
        // itemGroups[].history is stored as UUID strings, not hydrated objects.
        // Overwriting here would wipe filePath/thumbPath/type from history items,
        // causing empty gallery cards and blank history entries.
        state.currentProject = {
            ...state.currentProject,
            ...updates,
            updatedAt: result.project?.updatedAt ?? state.currentProject.updatedAt,
        };
    }
    return state.currentProject;
}

export function saveProjectSettings() {
    _debouncedSaveProjectSettings();
}

export function applyPromptReuseSettings({ modelId, mediaType, operation, sharedUpdates = {}, opUpdates = {}, modelUpdates = {} } = {}) {
    if (!state.currentProject || !modelId) return;

    let nextProject = state.currentProject;
    if (Object.keys(modelUpdates).length) {
        nextProject = setModelSettings(nextProject, modelId, modelUpdates);
    }
    if ((mediaType === 'image' || mediaType === 'video') && Object.keys(sharedUpdates).length) {
        nextProject = setSharedSettings(nextProject, mediaType, sharedUpdates);
    }
    if (operation && Object.keys(opUpdates).length) {
        nextProject = setOpSettings(nextProject, modelId, operation, opUpdates);
    }

    if (nextProject !== state.currentProject) {
        state.currentProject = nextProject;
        saveProjectSettings();
    }
}

export async function deleteProject(project, { deleteFiles = true } = {}) {
    const folderPath = project.folderPath;

    if (deleteFiles) {
        const result = await post('/delete-project', { folderPath, expectedId: project.id });
        if (!result.success) throw new Error(result.error);
    }

    // Always remove parent dir from extras registry when present.
    // Works for imported projects; default-root projects (Documents/Cubric Vision/Projects)
    // are not stored in extras, so filtering is a safe no-op for them.
    const parentDir = folderPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    const extras = Storage.getExtraProjectPaths().filter(p => p !== parentDir);
    Storage.setExtraProjectPaths(extras);

    if (state.currentProject?.folderPath === folderPath) {
        state.currentProject = null;
        navigate(PAGE_LANDING);
    }
}

// ── Group mutations (NEW) ────────────────────────────────────────────────────

// Serialize all project mutations through a single in-flight chain. Without
// this, concurrent addGroup/removeGroup/updateGroup calls (e.g. Queue mode
// firing parallel completions) read stale state.currentProject snapshots and
// the last-write-wins behavior loses or resurrects groups.
let _mutationChain = Promise.resolve();
function _enqueueMutation(fn) {
    const next = _mutationChain.then(fn, fn);
    _mutationChain = next.catch(() => {}); // chain must not break on error
    return next;
}

/**
 * Add a new group to the current project, persist, and emit.
 * @param {Object} group — Full ItemGroup with hydrated history items
 */
export async function addGroup(group) {
    return _enqueueMutation(async () => {
        if (!state.currentProject) return;
        state.currentProject = addGroupToProject(state.currentProject, group);
        await persistGroups();
        Events.emit('project:group-added', { group });
    });
}

/**
 * Update an existing group in the current project, persist, and emit.
 * @param {Object} group — Full ItemGroup with hydrated history items
 */
export async function updateGroup(group) {
    return _enqueueMutation(async () => {
        if (!state.currentProject) return;
        state.currentProject = updateGroupInProject(state.currentProject, group);
        await persistGroups();
        Events.emit('project:group-updated', { group });
    });
}

/**
 * Remove a group from the current project, persist, and emit.
 * @param {string} groupId
 */
export async function removeGroup(groupId) {
    return _enqueueMutation(async () => {
        if (!state.currentProject) return;
        state.currentProject = removeGroupFromProject(state.currentProject, groupId);
        await persistGroups();
        Events.emit('project:group-removed', { groupId });
    });
}

/**
 * Serialize in-memory groups to UUID-only format and persist to disk.
 * THE ONLY place that converts full objects → UUID strings.
 * Does NOT mutate in-memory state.currentProject.
 */
export async function persistGroups() {
    if (!state.currentProject) return;
    const serialized = state.currentProject.itemGroups.map(g => ({
        id:            g.id,
        type:          g.type,
        name:          g.name,
        createdAt:      g.createdAt,
        selectedIndex: g.selectedIndex,
        open:          g.open,
        favourite:     g.favourite,
        customName:    g.customName ?? null,
        history:       g.history.map(item =>
            typeof item === 'string' ? item : item.id
        ),
    }));
    // MPI-226: a swallowed failure here caused silent save-loss — the in-memory
    // group survived but project.json never persisted, so on reload the stale
    // project.json + memory-only ghost ids fired load-meta 404s. Retry a few
    // times (covers transient FS/EBUSY on the server's atomic-write queue), and
    // only surface a ui:warning toast if every attempt fails. Check result.success
    // too: the route returns { success:false } on a handled error, which the old
    // `.catch`-only path treated as success.
    const folderPath = state.currentProject.folderPath;
    const body = { folderPath, updates: { itemGroups: serialized } };
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const result = await post('/update-project', body);
            if (result?.success !== false) return result;
            clientLogger.warn('ProjectService', `persistGroups attempt ${attempt} rejected:`, result?.error);
        } catch (err) {
            clientLogger.warn('ProjectService', `persistGroups attempt ${attempt} failed:`, err);
        }
        if (attempt < 4) await new Promise(r => setTimeout(r, attempt * 200));
    }
    Events.emit('ui:warning', {
        message: 'Could not save the project to disk — recent results may be lost on reload. Check disk space, then regenerate or re-open the project.',
    });
}

/**
 * Save a generation result to the project folder.
 * @returns {{ success: boolean, filePath?: string, filename?: string }}
 */
export async function saveGeneration({ folderPath, comfyViewUrl, audioViewUrl, itemId, operation, meta, generationMs, pixelDimensions, mediaType, stage, frozenParams, loraSnapshot, previewAssets, replaceItemId, appId, appInputs }) {
    const res = await fetch('/project/save-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath, comfyViewUrl, audioViewUrl, itemId, operation, meta, generationMs, pixelDimensions, mediaType, stage, frozenParams, loraSnapshot, previewAssets, replaceItemId, appId, appInputs }),
    });
    if (!res.ok) throw new Error(`save-generation returned ${res.status}`);
    return res.json();
}

/**
 * Validate that a preview item's support assets (project latent + any required
 * snapshots) still exist on disk. Used by the gallery to gate Continue/Finish:
 *
 *   canFastPath      — latent present, fast stage-2 path is available.
 *   canColdFallback  — latent missing but frozenParams + snapshots present;
 *                      stage-1 can be rerun to rebuild the latent.
 *   blocked          — neither path is possible; preview must be deleted.
 *
 * @param {string} itemId
 * @returns {Promise<object|null>}  validation report, or null if no project.
 */
export async function validatePreviewAssets(itemId) {
    if (!state.currentProject?.folderPath || !itemId) return null;
    const projectId = state.currentProject.id || 'unknown';
    const url = `/project-media/${encodeURIComponent(projectId)}/validate-preview-assets`
              + `?folderPath=${encodeURIComponent(state.currentProject.folderPath)}`
              + `&itemId=${encodeURIComponent(itemId)}`;
    try {
        const res = await fetch(url);
        if (!res.ok) {
            clientLogger.warn('projectService', 'validate-preview-assets returned', res.status);
            return null;
        }
        return await res.json();
    } catch (err) {
        clientLogger.error('projectService', 'validate-preview-assets failed', err);
        return null;
    }
}
