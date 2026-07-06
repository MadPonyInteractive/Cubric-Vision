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
import { resolveFullUniverse, canonicalModelId, hasOperationGroups, deriveInstalledOps } from './modelConstants/resolveModelDeps.js';
import { remoteEngineClient } from '../services/remoteEngineClient.js';
export { MODELS };
import { UNIVERSAL_WORKFLOWS } from './modelConstants/universal_workflows.js';
import { Events } from '../events.js';
import { state } from '../state.js';
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
            const { comfyDir, comfyRepoRel } = await res.json();
            // comfyRepoRel is the ComfyUI repo root relative to engine/ and already
            // encodes the per-platform layout (Windows nests /ComfyUI; Linux/mac
            // do not). Fall back to the legacy Windows shape for older servers.
            const repoRel = comfyRepoRel || `${comfyDir}/ComfyUI`;
            _paths.models = `engine/${repoRel}/models`;
            _paths.customNodes = `engine/${repoRel}/custom_nodes`;
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
    // MPI-200: warm the local-arch cache so the sync gates (isModelUsable /
    // isOperationInstalled) have a concrete arch token when they run. Fire-and-forget
    // — one gpu-info fetch, cached for the session.
    remoteEngineClient.warmLocalArch();
    try {
        // Build payload for model-tied workflows
        // Resolve the FULL dep universe (commonDeps + every selectable op) so the
        // server stats the complete set and partial state is computed against
        // everything — flat models resolve to their plain dependency list.
        // Resolve for the CURRENT engine so the status check only stats deps the
        // engine actually installs. Without this, a model with engine-split weights
        // (e.g. LTX-2.3 bf16-local / GGUF-remote) shows a false "not installed"
        // because the other engine's transformer file is legitimately absent. The
        // resolver adds engines[engine].extraDeps; shared deps are always in.
        // (MPI-163 — engine-aware resolution, replaces the old post-filter)
        const engine = remoteEngineClient.isRemote() ? 'remote' : 'local';
        const modelPayload = MODELS.map(model => ({
            id: model.id,
            deps: resolveFullUniverse(model, null, engine)
                .map(depId => DEPS[depId]).filter(Boolean)
                .map(dep => ({ id: dep.id, type: dep.type, filename: dep.filename })),
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
                    if (depResult.id) {
                        depMap.set(depResult.id, {
                            installed: depResult.installed,
                            partialBytes: depResult.partialBytes || 0,
                        });
                    }
                }
                _modelDepStatusCache.set(model.id, depMap);
            }
        }

        // Emit installed model IDs for reactive listeners. Use isModelUsable (≥1
        // op installed) not the raw all-deps-present `result.installed`, so a
        // deliberately partial install (e.g. Wan T2V-only) counts — matching the
        // model-manager list + pickers, which already gate on isModelUsable. The
        // dep-status cache was just populated above, so this resolves correctly.
        const installedModelIds = Object.keys(results).filter(id => isModelUsable(id));
        Events.emit('models:checked', { installedModelIds });

        return true;
    } catch (err) {
        clientLogger.error('modelRegistry', 'syncModelInstalled failed:', err);
        return false;
    }
}

/**
 * Re-syncs installed model state on demand (e.g., when the Models slide-over opens).
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
 * Returns a model by id. Legacy split ids (wan-22-t2v / wan-22-i2v) canonicalize
 * to the merged wan-22 entry so historical media/sidecars/localStorage resolve.
 * @param {string} id
 * @returns {ModelDef|null}
 */
export function getModelById(id) {
    const canonical = canonicalModelId(id);
    return MODELS.find(m => m.id === canonical) ?? null;
}

/**
 * The size-tier letter (H/B/L) for a model, or '' when the model has no tier
 * family (MPI-200). Shared by the model dropdown, prompt-box button, and gallery
 * cards so all three read the same tier convention. A model shows its letter only
 * when it belongs to a `modelFamily` (i.e. tier siblings exist) — a lone model
 * with no family gets no letter (no clutter). Unlike the live dropdown (which
 * gates on 2+ INSTALLED tiers), this is install-independent: a gallery asset made
 * by a specific tier should always show which tier made it.
 * @param {ModelDef|string|null} modelOrId
 * @returns {'H'|'B'|'L'|''}
 */
const _TIER_LETTER = { low: 'L', balanced: 'B', high: 'H' };
export function tierLetterFor(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model || !model.modelFamily) return '';
    return _TIER_LETTER[model.sizeTier] || '';
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
 * Returns all resolved dependencies for a model (full universe: commonDeps +
 * every selectable operation). Flat models resolve to their plain dep list.
 * @param {string} modelId
 * @returns {Object[]}
 */
export function getModelDependencies(modelId) {
    const model = getModelById(modelId);
    if (!model) return [];
    return resolveFullUniverse(model).map(id => DEPS[id]).filter(Boolean);
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

/**
 * Whether a model is USABLE for generation (should appear in model pickers).
 *
 * Flat models: usable when `installed !== false` (the server's all-deps-present
 * flag) — unchanged behaviour.
 *
 * Operation-keyed models (e.g. Wan 2.2): usable when AT LEAST ONE operation is
 * installed (commonDeps + that op's deps complete), derived from the per-dep
 * status cache. The server's `model.installed` flag is all-deps-present, which is
 * FALSE for a deliberately partial (e.g. T2V-only) install — so it must NOT gate
 * op-keyed models, or a usable Wan vanishes from the dropdown. (MPI-122)
 *
 * @param {ModelDef|string} modelOrId
 * @returns {boolean}
 */
export function isModelUsable(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model) return false;
    // Flat models: the engine-split weights (engines[].extraDeps) make the bare
    // server `installed` flag (all-deps-present, engine-agnostic) wrong on a Pod —
    // so flat models with engine deps ALSO go through deriveInstalledOps below.
    // Plain flat models (no engine deps) keep the cheap `installed` path. (MPI-163,
    // MPI-165: reads the engines: block, not the deleted localDeps/remoteDeps)
    const hasEngineDeps = !!(model.engines?.local?.extraDeps?.length
        || model.engines?.remote?.extraDeps?.length);
    // MPI-200: a flat balanced model has arch-VARIANT deps (not engine deps) that
    // are equally invisible to the engine-agnostic server `installed` flag — route
    // it through deriveInstalledOps too so the CURRENT arch's weight is required.
    const hasVariantDeps = !!model.variants && Object.keys(model.variants).length > 0;
    if (!hasOperationGroups(model) && !hasEngineDeps && !hasVariantDeps) return model.installed !== false;
    const depStatus = getModelDepStatus(model.id);
    if (!depStatus) return model.installed === true; // no cache yet → trust server flag
    const isOn = id => {
        const s = depStatus.get(id);
        return s === true || s?.installed === true;
    };
    const engine = remoteEngineClient.isRemote() ? 'remote' : 'local';
    return deriveInstalledOps(model, isOn, engine, { arch: remoteEngineClient.archSync(engine) }).fullyInstalled;
}

/**
 * Whether a SPECIFIC operation of a model is installed (commonDeps + that op's
 * deps complete). Use this — not `model.installed` — to gate per-operation
 * actions (e.g. finishing a T2V preview when only T2V is installed and I2V is
 * not). The server's `model.installed` is all-ops-present, so it wrongly blocks
 * a partial install for an op it CAN actually run. (MPI-122 / MPI-157 follow-up)
 *
 * Flat models: no op groups → fall back to `isModelUsable`.
 * Op-keyed models: true when `op` is in the derived installedOps set.
 *
 * @param {ModelDef|string} modelOrId
 * @param {string} op
 * @returns {boolean}
 */
export function isOperationInstalled(modelOrId, op) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model) return false;
    if (!op || !hasOperationGroups(model)) return isModelUsable(model);
    const depStatus = getModelDepStatus(model.id);
    if (!depStatus) return model.installed === true; // no cache yet → trust server flag
    const isOn = id => {
        const s = depStatus.get(id);
        return s === true || s?.installed === true;
    };
    const engine = remoteEngineClient.isRemote() ? 'remote' : 'local';
    return deriveInstalledOps(model, isOn, engine, { arch: remoteEngineClient.archSync(engine) }).installedOps.includes(op);
}
