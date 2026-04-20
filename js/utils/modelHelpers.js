/**
 * modelHelpers.js — Model resolution utilities.
 */

import { state } from '../state.js';
import { getModelsByType } from '../data/modelRegistry.js';

/**
 * Resolves the active model for a given mediaType, using persisted selection
 * from state.s_selectedModelId with fallback to first installed model.
 *
 * @param {'image'|'video'} mediaType
 * @returns {{ model: Object|null, modelId: string|null, installedModels: Object[] }}
 */
export function resolveActiveModel(mediaType) {
    const installedModels = getModelsByType(mediaType)
        .filter(m => m.installed !== false);

    let modelId = state.s_selectedModelId
        ? (installedModels.find(m => m.id === state.s_selectedModelId)?.id
            ?? installedModels[0]?.id ?? null)
        : (installedModels[0]?.id ?? null);

    const model = modelId
        ? (installedModels.find(m => m.id === modelId) || installedModels[0] || null)
        : (installedModels[0] || null);

    return { model, modelId, installedModels };
}
