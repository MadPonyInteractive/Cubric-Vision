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

// ── CRUD (same signatures as projectManager.js) ────────────────────────────────

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
