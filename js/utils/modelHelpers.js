/**
 * modelHelpers.js — Model resolution utilities.
 *
 * Selection is partitioned by mediaType (image | video) in
 * `state.s_selectedModelIdByType`. Workspaces read/write only the slot for
 * their own mediaType — picking a video model never coerces the image slot
 * and vice versa.
 */

import { state } from '../state.js';
import { getModelsByType, isModelUsable } from '../data/modelRegistry.js';
import { canonicalModelId } from '../data/modelConstants/resolveModelDeps.js';

/**
 * Read the persisted model id for a given mediaType. Legacy split ids
 * (wan-22-t2v / wan-22-i2v) canonicalize to the merged wan-22 so a selection
 * persisted in the split era still resolves to a real model. (MPI-122)
 * @param {'image'|'video'} mediaType
 * @returns {string|null}
 */
export function getSelectedModelId(mediaType) {
    const id = state.s_selectedModelIdByType?.[mediaType] ?? null;
    return id ? canonicalModelId(id) : null;
}

/**
 * Write the selected model id for a mediaType. Uses top-level replace pattern
 * so the Proxy fires `state:changed` (sub-object mutation is shallow).
 *
 * `opts.markAsLast` (default true) updates `s_lastSelectedMediaType` — this
 * marker tells Gallery (mediaType-agnostic workspace) which slot to restore
 * on mount. Typed workspaces (History image/video groups) must pass `false`:
 * their selection is bound to the group's type, not a user expression of
 * "preferred default mode," so they must not clobber the marker that Gallery
 * relies on for restore.
 *
 * @param {'image'|'video'} mediaType
 * @param {string|null} modelId
 * @param {{ markAsLast?: boolean }} [opts]
 */
export function setSelectedModelId(mediaType, modelId, opts = {}) {
    const { markAsLast = true } = opts;
    const current = state.s_selectedModelIdByType || { image: null, video: null };
    if (current[mediaType] !== modelId) {
        state.s_selectedModelIdByType = { ...current, [mediaType]: modelId };
    }
    if (markAsLast && state.s_lastSelectedMediaType !== mediaType) {
        state.s_lastSelectedMediaType = mediaType;
    }
}

/**
 * Resolves the active model for a given mediaType, using the persisted
 * per-mediaType selection with fallback to first installed model of that type.
 *
 * Caller is responsible for any write-back — this helper only reads.
 *
 * @param {'image'|'video'} mediaType
 * @returns {{ model: Object|null, modelId: string|null, installedModels: Object[] }}
 */
export function resolveActiveModel(mediaType) {
    const installedModels = getModelsByType(mediaType)
        .filter(isModelUsable);

    const persisted = getSelectedModelId(mediaType);
    const modelId = persisted
        ? (installedModels.find(m => m.id === persisted)?.id
            ?? installedModels[0]?.id ?? null)
        : (installedModels[0]?.id ?? null);

    const model = modelId
        ? (installedModels.find(m => m.id === modelId) || installedModels[0] || null)
        : (installedModels[0] || null);

    return { model, modelId, installedModels };
}
