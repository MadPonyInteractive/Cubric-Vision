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

/** @returns {GenerationEntry|null} The entry whose ComfyUI prompt_id matches. */
function byPromptId(promptId) {
    if (!promptId) return null;
    for (const entry of _registry.values()) {
        if (entry.promptId === promptId) return entry;
    }
    return null;
}

/**
 * MPI-269 — last-good latent per generation, so a consumer that mounts (or
 * repaints) between preview frames can immediately show the current latent
 * instead of nothing. Keyed by regId; survives frame gaps (e.g. a slow second
 * sampler that emits no previews for tens of seconds). Cleared on `end()`.
 * @type {Map<string, {engine:string, promptId:string, seq:number, url:string}>}
 */
const _lastPreview = new Map();

/** @returns {{engine,promptId,seq,url}|null} The latest latent for this gen. */
function getLastPreview(id) {
    return _lastPreview.get(id) ?? null;
}

// The unified preview bus (MPI-269). One subscription resolves every engine-tagged
// frame to its generation and records the last-good latent. App-lifetime listener
// (module singleton) — no teardown needed.
// eslint-disable-next-line mpi/require-destroy-on-events
Events.on('preview:frame', ({ engine, promptId, seq, url }) => {
    const entry = byPromptId(promptId);
    // Unresolved promptId (frame arrived before the /prompt ack set it) → drop.
    // Do NOT fall back to "the active gen" — that is the cross-gen mis-attribution
    // this whole card exists to kill.
    if (!entry) return;
    _lastPreview.set(entry.id, { engine, promptId, seq, url });
    // MPI-271: keep latestPreviewUrl current for the non-subscriber reads that
    // still poll it (queue-panel thumbnail, group-history rehydrate, gallery-grid
    // card re-mount). The legacy generation:preview emit is gone; this listener is
    // now the sole writer of latestPreviewUrl.
    entry.latestPreviewUrl = url;
    if (entry.placeholderGroup) entry.placeholderGroup.latestPreviewUrl = url;
});

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
        // MPI-211: defer the revoke past this task so the store broadcast can
        // derender the placeholder tile + queue-panel thumbnail (both still hold
        // this blob as an <img> src synchronously). Revoking now makes the
        // browser refetch the dead blob → ERR_FILE_NOT_FOUND console noise.
        const url = entry.latestPreviewUrl;
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    _lastPreview.delete(id); // MPI-269: drop the held latent for this gen
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

export const activeGenerations = { start, get, list, listFor, resetPreview, setPromptId, byPromptId, getLastPreview, setStatus, end, cancel, cancelAll };
