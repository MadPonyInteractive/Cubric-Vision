/**
 * toolState.js — Per-project, per-tool state persistence + Project Templates.
 *
 * State API (unchanged):
 *   saveToolState(toolName, data)     — persist partial data for a tool
 *   loadToolState(toolName)           — retrieve saved data for a tool
 *   clearToolState(toolName)          — wipe a tool's saved state
 *
 * Template API (new):
 *   saveTemplate(name)                — snapshot all tool states → POST to backend
 *   loadTemplate(name)                — restore all tool states ← GET from backend
 *   listTemplates()                   — GET template names from backend
 *   deleteTemplate(name)              — DELETE template from backend
 */

import { state } from './state.js';
import { Events } from './events.js';

// ─── localStorage helpers ────────────────────────────────────────────────────

function _lsKey(toolName) {
    const id = state.currentProject?.id || 'global';
    return `mpi_ts_${id}_${toolName}`;
}

/**
 * Persist an object for this tool. Merges with existing data.
 * @param {string} toolName
 * @param {Object} data
 */
export function saveToolState(toolName, data) {
    try {
        const existing = loadToolState(toolName) || {};
        localStorage.setItem(_lsKey(toolName), JSON.stringify({ ...existing, ...data }));
    } catch (e) {
        console.warn('[toolState] save failed:', e);
    }
}

/**
 * Retrieve the saved object for this tool, or null.
 * @param {string} toolName
 * @returns {Object|null}
 */
export function loadToolState(toolName) {
    try {
        const raw = localStorage.getItem(_lsKey(toolName));
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

/**
 * Clear saved state for a specific tool.
 * @param {string} toolName
 */
export function clearToolState(toolName) {
    localStorage.removeItem(_lsKey(toolName));
}

// ─── Template helpers ────────────────────────────────────────────────────────

const TOOL_NAMES = [
    'generator', 'detailer', 'upscaler', 'llm', 'descriptor',
    'translator', 'jsonFormatter', 'promptBuilder', 'compare', 'cropExtract'
];

function _projectId() {
    const id = state.currentProject?.id;
    if (!id) throw new Error('[toolState] No active project');
    return id;
}

/**
 * Save a named template: snapshots all tool states to the server (project.json).
 * @param {string} name — template display name
 * @returns {Promise<void>}
 */
export async function saveTemplate(name) {
    const projectId = _projectId();
    const toolStates = {};
    TOOL_NAMES.forEach(t => {
        const s = loadToolState(t);
        if (s) toolStates[t] = s;
    });
    const res = await fetch(`/project-templates/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, toolStates })
    });
    if (!res.ok) throw new Error(`[toolState] saveTemplate failed: ${res.status}`);
    Events.emit('templates:updated', { projectId });
}

/**
 * Load a named template: restores all tool states from server into localStorage.
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function loadTemplate(name) {
    const projectId = _projectId();
    const res = await fetch(`/project-templates/${projectId}`);
    if (!res.ok) throw new Error(`[toolState] loadTemplate fetch failed: ${res.status}`);
    const { templates } = await res.json();
    const tpl = templates?.[name];
    if (!tpl) throw new Error(`[toolState] Template "${name}" not found`);
    Object.entries(tpl.toolStates || {}).forEach(([tool, data]) => {
        saveToolState(tool, data);
    });
    Events.emit('templates:loaded', { projectId, name });
}

/**
 * List all template names for the active project.
 * @returns {Promise<string[]>}
 */
export async function listTemplates() {
    const projectId = _projectId();
    const res = await fetch(`/project-templates/${projectId}`);
    if (!res.ok) return [];
    const { templates } = await res.json();
    return Object.keys(templates || {});
}

/**
 * Delete a named template from the server.
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function deleteTemplate(name) {
    const projectId = _projectId();
    const res = await fetch(`/project-templates/${projectId}/${encodeURIComponent(name)}`, {
        method: 'DELETE'
    });
    if (!res.ok) throw new Error(`[toolState] deleteTemplate failed: ${res.status}`);
    Events.emit('templates:updated', { projectId });
}
