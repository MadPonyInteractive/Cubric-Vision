/**
 * activeGenerations.js — Session-scoped registry for in-flight generations.
 *
 * Keeps exec handles, preview blob URLs, and placeholder descriptors alive
 * across navigation. Blocks subscribe on mount and unsubscribe on destroy
 * without cancelling the exec.
 *
 * Batch-ready: registry is keyed by uuid; multiple concurrent entries are
 * supported. Today only one generation runs at a time (serialized upstream
 * in comfyController); this layer imposes no cap.
 */

import { Events } from '../events.js';

/**
 * @typedef {Object} GenerationEntry
 * @property {string}      id
 * @property {string}      scope             — 'gallery' | 'groupHistory'
 * @property {string|null} groupId           — groupHistory only
 * @property {string|null} tempId            — gallery only
 * @property {string}      operation
 * @property {string}      modelId
 * @property {string}      status            — 'running' | 'complete' | 'error' | 'cancelled'
 * @property {string|null} latestPreviewUrl
 * @property {Object|null} placeholderGroup  — gallery only
 * @property {string|null} queueJobId
 * @property {Object|null} queueDisplay
 * @property {Object}      exec
 */

/** @type {Map<string, GenerationEntry>} */
const _registry = new Map();

/**
 * Register a new generation. Returns the assigned id.
 *
 * @param {{ scope, groupId, tempId, operation, modelId, placeholderGroup, exec }} opts
 * @returns {{ id: string }}
 */
function start({ id = crypto.randomUUID(), scope, groupId = null, tempId = null, operation, modelId, placeholderGroup = null, extraTempIds = [], extraPlaceholders = [], exec, replaceItemId = null, sourceGroupId = null, queueJobId = null, queueDisplay = null, queueSource = null, isLoop = false }) {
    const entry = { id, scope, groupId, tempId, extraTempIds, extraPlaceholders, operation, modelId, status: 'running', latestPreviewUrl: null, placeholderGroup, exec, promptId: null, replaceItemId, sourceGroupId, queueJobId, queueDisplay, queueSource, isLoop };
    _registry.set(id, entry);
    Events.emit('generation:started', { id, scope, groupId, tempId, operation, placeholderGroup, extraTempIds, extraPlaceholders, replaceItemId, sourceGroupId, queueJobId, queueDisplay, queueSource, isLoop });
    return { id };
}

/** Attach the ComfyUI prompt_id once the /prompt POST ack arrives. */
function setPromptId(id, promptId) {
    const entry = _registry.get(id);
    if (entry) entry.promptId = promptId;
}

/** @returns {GenerationEntry|null} */
function get(id) {
    return _registry.get(id) ?? null;
}

/** @returns {GenerationEntry[]} */
function list() {
    return Array.from(_registry.values());
}

/**
 * Filter by scope. For 'gallery', groupId is ignored.
 * @returns {GenerationEntry[]}
 */
function listFor(scope, groupId) {
    return Array.from(_registry.values()).filter(e => {
        if (e.scope !== scope) return false;
        if (scope === 'groupHistory') return e.groupId === groupId;
        return true;
    });
}

/** Cache latest preview URL and emit event. */
function setPreview(id, url) {
    const entry = _registry.get(id);
    if (!entry) return;
    entry.latestPreviewUrl = url;
    if (entry.placeholderGroup) entry.placeholderGroup.latestPreviewUrl = url;
    Events.emit('generation:preview', { id, url });
}

/** Signal a new preview window (new sampler stage) — the card drops its current
 *  looping clip so stages don't accumulate. MPI-167. */
function resetPreview(id) {
    if (!_registry.has(id)) return;
    Events.emit('generation:preview-reset', { id });
}

/** Update entry status. */
function setStatus(id, status) {
    const entry = _registry.get(id);
    if (entry) entry.status = status;
}

/**
 * Remove entry from registry.
 * @param {string} id
 * @param {{ revokePreview?: boolean }} [opts]
 */
function end(id, { revokePreview = true } = {}) {
    const entry = _registry.get(id);
    if (!entry) return;
    if (revokePreview && entry.latestPreviewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(entry.latestPreviewUrl);
    }
    _registry.delete(id);
}

/** Cancel a specific entry's exec and remove it. */
function cancel(id) {
    const entry = _registry.get(id);
    if (!entry) return;
    const tempId = entry.tempId ?? null;
    const extraTempIds = entry.extraTempIds ?? [];
    entry.exec?.cancel?.();
    entry.status = 'cancelled';
    end(id, { revokePreview: true });
    Events.emit('generation:cancelled', { id, tempId, extraTempIds });
}

/** Cancel all active entries. */
function cancelAll() {
    for (const id of _registry.keys()) cancel(id);
}

export const activeGenerations = { start, get, list, listFor, setPreview, resetPreview, setPromptId, setStatus, end, cancel, cancelAll };
