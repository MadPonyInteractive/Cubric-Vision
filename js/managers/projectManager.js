/**
 * projectManager.js — All project CRUD operations.
 * Talks to the server routes added in server.js Stage 1.
 */

import { state } from '../state.js';
import { navigate, PAGE_LANDING, PAGE_GALLERY } from '../router.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function post(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
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
  const extraPaths = JSON.parse(localStorage.getItem('mpi_extra_project_paths') || '[]');
  const result = await post('/list-projects', { extraPaths });
  if (!result.success) throw new Error(result.error);
  return result.projects;
}

/**
 * Load a project into global state and navigate to its last active tool.
 * @param {Object} project - Full project object.
 */
export function openProject(project) {
  state.currentProject = project;

  // modelSettings and toolSettings live on the project object itself
  // and are accessible via state.currentProject.modelSettings / .toolSettings
  // No separate restore step needed.

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
