/**
 * projectManager.js — All project CRUD operations.
 * Talks to the server routes added in server.js Stage 1.
 */

import { state } from '../state.js';
import { Events } from '../events.js';
import { navigate, PAGE_LANDING, PAGE_GALLERY } from '../router.js';
import { Storage } from '../core/storage.js';
import { reconcileAndHydrate } from './projectReconciler.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function post(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Debounce timer for project settings saves (prevents rapid-fire I/O from sliders, mouse wheel, etc.)
let _saveSettingsTimeout = null;
function _debouncedSaveProjectSettings() {
  clearTimeout(_saveSettingsTimeout);
  _saveSettingsTimeout = setTimeout(async () => {
    if (!state.currentProject) return;
    const { modelSettings, toolSettings } = state.currentProject;
    await updateProject({ modelSettings, toolSettings });
  }, 500);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Open the OS folder-picker dialog.
 * Returns the chosen path string, or null if cancelled.
 */
export async function chooseFolder() {
  const result = await post('/choose-folder', {});
  return result.cancelled ? null : result.path;
}

/**
 * Create a new project on disk.
 * @param {string} name       - Project display name.
 * @param {string|null} folderPath - Absolute path chosen by user; null = use default.
 */
export async function createProject(name, folderPath = null) {
  const result = await post('/create-project', { name, folderPath });
  if (!result.success) throw new Error(result.error);
  return result.project;
}

/**
 * Fetch all projects from disk (most-recent first).
 */
export async function listProjects() {
  const extraPaths = Storage.getExtraProjectPaths();
  const result = await post('/list-projects', { extraPaths });
  if (!result.success) throw new Error(result.error);
  return result.projects;
}

/**
 * Load a project into global state.
 * Runs server-side migration then client-side reconciliation before
 * setting state. Callers must await and then navigate to gallery.
 *
 * @param {Object} project - Full project object (from project list or create result).
 */
export async function openProject(project) {
  // 1. Run server-side migration (schema upgrade + legacy inline → ID conversion)
  const migratedRes = await fetch('/migrate-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: project.folderPath }),
  });
  const migratedResult = await migratedRes.json();
  if (!migratedResult.success) throw new Error(migratedResult.error);
  const migrated = migratedResult.project;

  // 2. Reconcile: load .meta/ files, drop broken entries, hydrate full objects
  const { project: reconciled, wasModified } = await reconcileAndHydrate(migrated);

  // 3. Persist if reconciliation removed entries (slim down to UUID arrays on disk)
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

  // 4. Load into state
  state.currentProject = reconciled;

  // 5. Track parent dir and last opened project
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
 * Update arbitrary fields on a project.
 * @param {Object} updates - Key/value pairs to merge into project.json.
 */
export async function updateProject(updates) {
  if (!state.currentProject) return;
  const result = await post('/update-project', {
    folderPath: state.currentProject.folderPath,
    updates,
  });
  if (result.success) state.currentProject = result.project;
  return result.project;
}

/**
 * Persist modelSettings and toolSettings for the current project to disk.
 * Debounced: waits 500ms of inactivity before writing to disk.
 * Call this whenever settings change (LoRA strength, ratio, orientation, etc.).
 * Rapid changes (e.g., mouse wheel on sliders) are coalesced into a single save.
 */
export function saveProjectSettings() {
  _debouncedSaveProjectSettings();
}

/**
 * Delete a project folder from disk and return to the landing page.
 * @param {string} folderPath
 */
export async function deleteProject(folderPath) {
  const result = await post('/delete-project', { folderPath });
  if (!result.success) throw new Error(result.error);
  if (state.currentProject?.folderPath === folderPath) {
    state.currentProject = null;
    navigate(PAGE_LANDING);
  }
}
