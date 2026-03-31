/**
 * toolState.js — Lightweight per-project, per-tool state persistence.
 *
 * Saves and restores arbitrary serialisable data to localStorage,
 * keyed by projectId + toolName.  Each tool is responsible for calling
 * saveToolState() whenever something changes and loadToolState() on mount.
 */

import { state } from './state.js';

function _key(toolName) {
    const id = state.currentProject?.id || 'global';
    return `mpi_ts_${id}_${toolName}`;
}

/**
 * Persist an object for this tool.  Merges with any existing data
 * so partial saves don't wipe unrelated fields.
 */
export function saveToolState(toolName, data) {
    try {
        const existing = loadToolState(toolName) || {};
        localStorage.setItem(_key(toolName), JSON.stringify({ ...existing, ...data }));
    } catch (e) {
        console.warn('[toolState] save failed:', e);
    }
}

/**
 * Retrieve the saved object for this tool (or null if nothing saved yet).
 */
export function loadToolState(toolName) {
    try {
        const raw = localStorage.getItem(_key(toolName));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

/**
 * Clear saved state for a specific tool (e.g. on Start Over / project switch).
 */
export function clearToolState(toolName) {
    localStorage.removeItem(_key(toolName));
}
