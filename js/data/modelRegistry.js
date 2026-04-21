/**
 * modelRegistry.js — Source of truth for all generative models.
 *
 * Each model declares:
 *   - Which media type it produces (image / video)
 *   - Which operations it supports (must match keys in commandRegistry.js)
 *   - Which ComfyUI workflow file handles each operation
 *   - All dependencies (checkpoints, loras, custom nodes, etc.) needed to run
 *
 * The `installed` flag is resolved at runtime by the server checking disk.
 * Do not hardcode it as true here.
 *
 * Adding a new model: add an entry to MODELS, add its workflow .json files
 * to the workflows folder. Nothing else needs changing.
 */

'use strict';

import { DEPS } from './modelConstants/dependencies.js';
import { MODELS } from './modelConstants/models.js';
export { MODELS };
import { UNIVERSAL_WORKFLOWS } from './modelConstants/universal_workflows.js';
import { Events } from '../events.js';
import { clientLogger } from '../services/clientLogger.js';

// ── Per-dep status cache (populated by syncModelInstalled) ────────────────────
// Map of modelId → Map of depId → installed: boolean
const _modelDepStatusCache = new Map();

// ── Path Config ───────────────────────────────────────────────────────────────
// Initialized asynchronously via initPaths() — defaults to Windows portable until server reports.

let _paths = {
    models: 'engine/ComfyUI_windows_portable/ComfyUI/models',
    customNodes: 'engine/ComfyUI_windows_portable/ComfyUI/custom_nodes',
    workflows: 'comfy_workflows',
};

export const PATHS = _paths;

/**
 * Initialize platform-specific paths from the server.
 * Called on app startup before any path-dependent operations.
 */
export async function initPaths() {
    try {
        const res = await fetch('/system/platform-config');
        if (res.ok) {
            const { comfyDir } = await res.json();
            _paths.models = `engine/${comfyDir}/ComfyUI/models`;
            _paths.customNodes = `engine/${comfyDir}/ComfyUI/custom_nodes`;
        }
    } catch (err) {
        clientLogger.warn('modelRegistry', 'Failed to fetch platform config, using defaults:', err);
    }
}

// ── Runtime Installed Sync ────────────────────────────────────────────────────

/**
 * Fetches disk-presence status for all models from the server and patches
 * the `installed` flag on each entry in MODELS in-place.
 *
 * Sends pre-resolved dep filenames so the server only needs to stat paths —
 * modelRegistry.js remains the single source of truth for all model data.
 *
 * NOTE: MODELS[].installed is intentionally module-level (not in state proxy) because
 * components read directly from the MODELS reference. The authoritative reactive signal
 * is the 'models:checked' event emitted on the Events bus — components subscribe to this
 * to know when install state changes, rather than watching state.s_installedModelIds.
 * This pattern avoids duplicating model data across both MODELS and state.
 *
 * @returns {Promise<boolean>} true if the sync succeeded
 */
export async function syncModelInstalled() {
    try {
        // Build payload for model-tied workflows
        const modelPayload = MODELS.map(model => ({
            id: model.id,
            deps: model.dependencies.map(depId => {
                const dep = DEPS[depId];
                return dep ? { id: depId, type: dep.type, filename: dep.filename } : null;
            }).filter(Boolean),
        }));

        const res = await fetch('/comfy/models/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models: modelPayload }),
        });

        if (!res.ok) return false;
        const { results } = await res.json();

        for (const model of MODELS) {
            if (Object.prototype.hasOwnProperty.call(results, model.id)) {
                model.installed = results[model.id].installed;
                // Cache per-dep status for partial-progress display
                const depMap = new Map();
                for (const depResult of results[model.id].deps) {
                    if (depResult.id) depMap.set(depResult.id, depResult.installed);
                }
                _modelDepStatusCache.set(model.id, depMap);
            }
        }

        // Emit installed model IDs for reactive listeners
        const installedModelIds = Object.entries(results)
            .filter(([, result]) => result.installed)
            .map(([id]) => id);
        Events.emit('models:checked', { installedModelIds });

        // Auto-close model manager if all image models are now installed
        const allImageInstalled = MODELS
            .filter(m => m.mediaType === 'image')
            .every(m => m.installed === true);
        if (allImageInstalled) Events.emit('models:all-installed');

        return true;
    } catch (err) {
        clientLogger.error('modelRegistry', 'syncModelInstalled failed:', err);
        return false;
    }
}

/**
 * Re-syncs installed model state on demand (e.g., when MpiModelsModal opens).
 * Rebuilds the payload from current MODELS + DEPS, POSTs to /comfy/models/check,
 * patches MODELS[].installed in-place, and emits 'models:checked'.
 *
 * @returns {Promise<boolean>} true if the sync succeeded
 */
export async function reSyncInstalledModels() {
    return syncModelInstalled();
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Returns all models for a given media type.
 * @param {'image'|'video'} mediaType
 * @returns {ModelDef[]}
 */
export function getModelsByType(mediaType) {
    return MODELS.filter(m => m.mediaType === mediaType);
}

/**
 * Returns a model by id.
 * @param {string} id
 * @returns {ModelDef|null}
 */
export function getModelById(id) {
    return MODELS.find(m => m.id === id) ?? null;
}

/**
 * Returns the workflow filename for a model+operation pair.
 * Returns null if the operation is not yet implemented for this model.
 * @param {string} modelId
 * @param {string} operation
 * @returns {string|null}
 */
export function getWorkflowFile(modelId, operation) {
    const model = getModelById(modelId);
    return model?.workflows?.[operation] ?? null;
}

/**
 * Returns the workflow filename for a universal (non-model-tied) operation.
 * Returns null if the key does not exist in UNIVERSAL_WORKFLOWS.
 * @param {string} key - Command key (must have universal: true in commandRegistry)
 * @returns {string|null}
 */
export function getUniversalWorkflow(key) {
    return UNIVERSAL_WORKFLOWS[key]?.workflow ?? null;
}

/**
 * Resolves a dependency id to its full definition.
 * @param {string} depId
 * @returns {Object|null}
 */
export function resolveDep(depId) {
    return DEPS[depId] ?? null;
}

/**
 * Returns all resolved dependencies for a model.
 * @param {string} modelId
 * @returns {Object[]}
 */
export function getModelDependencies(modelId) {
    const model = getModelById(modelId);
    if (!model) return [];
    return model.dependencies.map(id => DEPS[id]).filter(Boolean);
}

/**
 * Returns a Map of depId → installed for a given model, based on the last
 * /comfy/models/check response. Used to show partial progress on installed cards.
 * @param {string} modelId
 * @returns {Map<string, boolean>|null}
 */
export function getModelDepStatus(modelId) {
    return _modelDepStatusCache.get(modelId) ?? null;
}
