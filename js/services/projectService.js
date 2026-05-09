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
        const { modelSettings, toolSettings } = state.currentProject;
        const result = await post('/update-project-settings', {
            folderPath: state.currentProject.folderPath,
            updates: { modelSettings, toolSettings },
        });
        if (!result.success) throw new Error(result.error);
    }, 500);
}

// ── Settings event queue ───────────────────────────────────────────────────────

// Per-model queues: Map<modelId, { timer: number|null, pending: Object }>
const _modelQueues = new Map();

// Per-tool queues: Map<toolKey, { timer: number|null, pending: Object }>
const _toolQueues = new Map();

const _QUEUE_DEBOUNCE_MS = 300;

function _enqueueModelUpdate(modelId, key, value) {
    if (!_modelQueues.has(modelId)) _modelQueues.set(modelId, { timer: null, pending: {} });
    const q = _modelQueues.get(modelId);

    // Deep-merge ratioSelector sub-keys; replace everything else
    q.pending[key] = (key === 'ratioSelector')
        ? { ...(q.pending[key] ?? {}), ...value }
        : value;

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
            for (const [k, v] of Object.entries(q.pending)) {
                state.currentProject = setModelSettings(state.currentProject, modelId, { [k]: v });
            }
            q.pending = {};
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
    Events.on('settings:model:update', ({ modelId, key, value }) => {
        _enqueueModelUpdate(modelId, key, value);
    }),
    Events.on('settings:tool:update', ({ toolKey, key, value }) => {
        _enqueueToolUpdate(toolKey, key, value);
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

    const extras = Storage.getExtraProjectPaths();
    const parentDir = reconciled.folderPath.split(/[\\/]/).slice(0, -1).join('/');
    if (!extras.includes(parentDir)) {
        extras.push(parentDir);
        Storage.setExtraProjectPaths(extras);
    }
    Storage.setLastProject(reconciled.folderPath);

    Events.emit('project:changed', { project: reconciled });
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

export async function deleteProject(project, { deleteFiles = true } = {}) {
    const folderPath = project.folderPath;

    if (deleteFiles) {
        const result = await post('/delete-project', { folderPath, expectedId: project.id });
        if (!result.success) throw new Error(result.error);
    }

    // Always remove parent dir from extras registry when present.
    // Works for imported projects; default-root projects (Documents/Cubric Studio/Projects)
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

/**
 * Add a new group to the current project, persist, and emit.
 * @param {Object} group — Full ItemGroup with hydrated history items
 */
export async function addGroup(group) {
    if (!state.currentProject) return;
    state.currentProject = addGroupToProject(state.currentProject, group);
    await persistGroups();
    Events.emit('project:group-added', { group });
}

/**
 * Update an existing group in the current project, persist, and emit.
 * @param {Object} group — Full ItemGroup with hydrated history items
 */
export async function updateGroup(group) {
    if (!state.currentProject) return;
    state.currentProject = updateGroupInProject(state.currentProject, group);
    await persistGroups();
    Events.emit('project:group-updated', { group });
}

/**
 * Remove a group from the current project, persist, and emit.
 * @param {string} groupId
 */
export async function removeGroup(groupId) {
    if (!state.currentProject) return;
    state.currentProject = removeGroupFromProject(state.currentProject, groupId);
    await persistGroups();
    Events.emit('project:group-removed', { groupId });
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
        history:       g.history.map(item =>
            typeof item === 'string' ? item : item.id
        ),
    }));
    return post('/update-project', {
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
