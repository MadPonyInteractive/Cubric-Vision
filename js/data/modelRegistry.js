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
import { resolveFullUniverse, canonicalModelId, hasOperationGroups, deriveInstalledOps, detectOtherArchInstall } from './modelConstants/resolveModelDeps.js';
import { remoteEngineClient } from '../services/remoteEngineClient.js';
export { MODELS };
import { UNIVERSAL_WORKFLOWS } from './modelConstants/universal_workflows.js';
// MPI-304 — app-only deps are stat'd in the model sync's payload (one route, one
// pass). One-way import: flowsRegistry never imports modelRegistry.
import { flowDepUniverse, setFlowDepStatus } from './flowsRegistry.js';
// MPI-310 — plugins ride the same check for the same reason. Same one-way import rule.
import { pluginDepUniverse, setPluginDepStatus } from './pluginsRegistry.js';
import { Events } from '../events.js';
import { state } from '../state.js';
import { clientLogger } from '../services/clientLogger.js';

// ── Per-dep status cache (populated by syncModelInstalled) ────────────────────
// Map of modelId → Map of depId → installed: boolean
const _modelDepStatusCache = new Map();

// Baked Pod-image nodes whose stale-image warning has already fired this session,
// so the connect-edge sync (which runs on every connect/disconnect) doesn't spam
// the same "rebuild needed" toast. Keyed by node folder name. (MPI-222)
const _warnedBakedDrift = new Set();

// Volume nodes at the wrong commit (remote engine only). remoteModelsCheck tags
// such deps installed:false + drifted:true; the connect edge re-clones them
// (MPI-230). Baked drift is a separate rebuild-only signal (_warnedBakedDrift
// above), not in here.
//
// MPI-393: this MUST stay dep-level. It used to keep only the owning model id,
// and the heal then re-expanded that id into the model's FULL dep universe —
// which dedupes against the volume for a fully-installed model but silently
// downloads every missing multi-GB weight of a partially-installed one. A
// recreated Pod on a bumped image drifts most volume nodes at once, so the heal
// turned into "install all the models" and filled a 150GB volume in a minute.
// A node re-clone is KB-scale; keep it that way.
let _driftedNodeDeps = []; // [{ modelId, depIds: string[] }]
export function getDriftedNodeDeps() { return _driftedNodeDeps.map(d => ({ ...d, depIds: d.depIds.slice() })); }
export function getDriftedModelIds() { return _driftedNodeDeps.map(d => d.modelId); }

// MPI-326: last installed/drifted sets we emitted 'models:checked' for. The
// remote connection heartbeat re-checks install-state every ~5s; models:checked
// fans out to op-dropdown + slider rebuilds, so a no-change re-emit was tearing
// down open menus + in-progress slider drags on the remote engine. Gate the emit
// on a real diff so a steady-state re-sync stays silent.
let _lastEmittedInstalledKey = null;
let _lastEmittedDriftedKey = null;

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
        // R31 (MPI-208): resolve against the EFFECTIVE engine so a "Run locally"
        // override checks LOCAL install-state while the app is remote-connected.
        const engine = remoteEngineClient.effectiveEngine();
        const modelPayload = MODELS.map(model => ({
            id: model.id,
            deps: resolveFullUniverse(model, null, engine)
                .map(depId => DEPS[depId]).filter(Boolean)
                .map(dep => ({ id: dep.id, type: dep.type, filename: dep.filename, targetPath: dep.targetPath })),
        }));

        // MPI-304 — app-only deps ride the SAME check. /comfy/models/check is
        // id-agnostic (it takes {id, deps} and stats filenames; it never looks at
        // MODELS), so an `app:<id>` entry passes through unchanged and no second
        // endpoint is needed. Flows have no engine-split weights, so there is no
        // per-engine resolution to do here — the ids are the ids.
        // MPI-607 — `targetPath` MUST ride along in all three projections above and
        // below. It is not decoration: it is the only thing that tells the server the
        // weight lives under the ENGINE (models/chatterbox/…) instead of the models
        // root, and `_localModelsCheck` cannot resolve such a dep without it. Trimming
        // it made every targetPath weight read not-installed forever — a flow that had
        // just downloaded 1GB kept its Install button and its bar stuck at 100%.
        // The server-side branch alone does NOT fix this; the field has to arrive.
        const flowPayload = flowDepUniverse().map(({ id, deps }) => ({
            id,
            deps: deps.map(dep => ({ id: dep.id, type: dep.type, filename: dep.filename, targetPath: dep.targetPath })),
        }));

        // MPI-310 — plugin deps ride it too, same id-agnostic passthrough as flows.
        // Like apps, plugins have no engine-split weights, so the ids are the ids.
        const pluginPayload = pluginDepUniverse().map(({ id, depIds }) => ({
            id,
            deps: depIds.map(depId => DEPS[depId]).filter(Boolean)
                .map(dep => ({ id: dep.id, type: dep.type, filename: dep.filename, targetPath: dep.targetPath })),
        }));

        // R31: when remote-connected but the override forces LOCAL, hit the
        // force-local endpoint (MPI-74) so we stat the local disk, not the Pod.
        const checkPath = (remoteEngineClient.isRemote() && engine === 'local')
            ? '/comfy/models/check-local'
            : '/comfy/models/check';
        const res = await fetch(checkPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ models: modelPayload.concat(flowPayload, pluginPayload) }),
        });

        if (!res.ok) return false;
        const { results, bakedDrift } = await res.json();

        // MPI-222: a baked Pod-image node at the wrong commit can't be volume-healed
        // — the image needs a rebuild. Warn once per node per session (toast, not the
        // error dialog). Volume-node drift is handled silently by the reinstall path.
        if (Array.isArray(bakedDrift)) {
            for (const n of bakedDrift) {
                const key = n && n.filename;
                if (!key || _warnedBakedDrift.has(key)) continue;
                _warnedBakedDrift.add(key);
                Events.emit('ui:warning', { message: `Pod image is stale — rebuild needed (${key})` });
            }
        }

        const drifted = [];
        for (const model of MODELS) {
            if (Object.prototype.hasOwnProperty.call(results, model.id)) {
                model.installed = results[model.id].installed;
                // Cache per-dep status for partial-progress display
                const depMap = new Map();
                const driftedDepIds = [];
                for (const depResult of results[model.id].deps) {
                    if (depResult.id) {
                        depMap.set(depResult.id, {
                            installed: depResult.installed,
                            partialBytes: depResult.partialBytes || 0,
                        });
                    }
                    // MPI-230: a volume node at the wrong commit is tagged drifted by
                    // remoteModelsCheck. Record the DEP so the connect edge re-clones
                    // exactly it — MPI-393: never the model's other deps.
                    if (depResult.drifted && depResult.id) driftedDepIds.push(depResult.id);
                }
                if (driftedDepIds.length) {
                    drifted.push({ modelId: model.id, depIds: [...new Set(driftedDepIds)] });
                }
                _modelDepStatusCache.set(model.id, depMap);
            }
        }
        _driftedNodeDeps = drifted;

        // MPI-304 — hand each flow its dep slice. Keyed by flowDepKey() in the payload,
        // unpacked back to the bare flowId the availability check reads.
        for (const { id, flowId } of flowDepUniverse()) {
            const entry = results[id];
            if (!entry) continue;
            setFlowDepStatus(flowId, new Map((entry.deps || []).map(d => [d.id, d.installed === true])));
        }

        // MPI-310 — same unpack for plugins.
        for (const { id, pluginId } of pluginDepUniverse()) {
            const entry = results[id];
            if (!entry) continue;
            setPluginDepStatus(pluginId, new Map((entry.deps || []).map(d => [d.id, d.installed === true])));
        }

        // Emit installed model IDs for reactive listeners. Use isModelUsable (≥1
        // op installed) not the raw all-deps-present `result.installed`, so a
        // deliberately partial install (e.g. Wan T2V-only) counts — matching the
        // model-manager list + pickers, which already gate on isModelUsable. The
        // dep-status cache was just populated above, so this resolves correctly.
        // MPI-304: the results now also carry `app:<id>` entries — drop them here so
        // an app key can never leak into the installed-MODEL set (which feeds the model
        // pickers and every s_installedModelIds consumer). Explicit, not relying on
        // isModelUsable happening to reject an unknown id.
        const installedModelIds = Object.keys(results)
            .filter(id => !id.startsWith('app:') && !id.startsWith('plugin:') && isModelUsable(id));
        // MPI-326: only fan out when the installed or drifted set actually changed —
        // a redundant re-sync (remote heartbeat) must not rebuild the op UI.
        const _installedKey = installedModelIds.slice().sort().join(',');
        // Keyed on model+dep so a drift that MOVES between deps of the same model
        // still counts as a change.
        const _driftedKey = _driftedNodeDeps
            .map(d => `${d.modelId}:${d.depIds.slice().sort().join('+')}`).sort().join(',');
        if (_installedKey === _lastEmittedInstalledKey && _driftedKey === _lastEmittedDriftedKey) {
            return true; // nothing changed — skip the models:checked fan-out
        }
        _lastEmittedInstalledKey = _installedKey;
        _lastEmittedDriftedKey = _driftedKey;
        Events.emit('models:checked', { installedModelIds, driftedModelIds: getDriftedModelIds() });

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
 * The size-tier letter (H/B/L) for a model, or '' when the letter would not
 * disambiguate anything (MPI-200). Shared by the prompt-box model button and the
 * gallery cards so both read the same tier convention.
 *
 * The letter is a DISAMBIGUATOR, not a spec badge: it earns its place only when
 * two installed models would otherwise render the same label — i.e. another
 * INSTALLED model shares this one's display `name` in a different tier. That is
 * true of LTX 2.3 (high + balanced, both literally named "LTX 2.3") and of
 * nothing else shipped today. `modelFamily` is the wrong gate for it and was the
 * bug: Wan-2.2 groups "Wan 2.2 Smooth" with "Wan 2.2 5B" and MiniMax-H3 groups
 * "MiniMax H3" with "MiniMax H3 Reference" — distinct names, so their letters
 * disambiguated nothing and read as clutter on every gallery card.
 *
 * Install-gated on purpose (2026-08-07): with only one tier of a family on disk
 * there is nothing to tell apart, so a gallery card made by that tier shows a
 * bare name. Uninstalling the sibling drops the letter, which is correct — it
 * only ever existed to separate the two.
 * @param {ModelDef|string|null} modelOrId
 * @returns {'H'|'B'|'L'|''}
 */
const _TIER_LETTER = { low: 'L', balanced: 'B', high: 'H' };

/**
 * The bare letter for a model's tier, with NO disambiguation and NO install gate.
 *
 * `tierLetterFor` below is the one to reach for almost everywhere: it decides FOR
 * you whether the letter earns its place. This one is for a caller that has
 * already decided — the Flow Library's model picker, whose whole job is choosing
 * between candidates BEFORE any of them is installed, so the install gate would
 * hide the letter exactly when it is needed and leave two rows both reading
 * "FLUX.2 Klein" (MPI-567). It exists so there is still only ONE letter map.
 *
 * @param {ModelDef|string|null} modelOrId
 * @returns {'H'|'B'|'L'|''}
 */
export function sizeTierLetter(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    return (model && _TIER_LETTER[model.sizeTier]) || '';
}

/**
 * A model's display name, disambiguated against the SIBLINGS it is being offered
 * beside — the tier letter appended only when one of them shares its name.
 *
 * Written for FLUX.2 Klein, whose 4B and 9B cards were both literally named "FLUX.2
 * Klein" (MPI-567) — a picker listing the pair rendered two identical rows the user
 * could not choose between. That particular clash is GONE: MPI-619 put the size in
 * both names, because they are two models the public knows by name and their LoRAs do
 * not interchange. Others remain (`tests/flow-model-choice.test.cjs` finds a live one
 * rather than hardcoding it, and fails loudly the day none is left).
 *
 * The scope is the caller's own candidate list, not the whole registry: a flow slot
 * offering only 9B has nothing to tell it apart from, and a bare name is right there.
 *
 * `sizeTierLetter`, never `tierLetterFor` — the latter is install-gated, and both
 * callers here (the Library picker choosing what to DOWNLOAD, and the run slide's
 * picker) exist to name a model the user may not have on disk.
 *
 * Two callers by design (MPI-638): the Flow Library drawer and MpiBaseFlow's run
 * slide. Drift between them shows as one surface disambiguating and the other not.
 *
 * @param {string} modelId
 * @param {string[]} siblingIds the ids offered alongside it, this one included
 * @returns {string}
 */
export function disambiguatedName(modelId, siblingIds = []) {
    const name = getModelById(modelId)?.name || modelId;
    const clashes = siblingIds.some(other => other !== modelId
        && (getModelById(other)?.name || other) === name);
    const letter = clashes ? sizeTierLetter(modelId) : '';
    return letter ? `${name} ${letter}` : name;
}

export function tierLetterFor(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model || !model.sizeTier) return '';
    if (!isModelUsable(model)) return '';
    const ambiguous = MODELS.some(other =>
        other.id !== model.id
        && other.name === model.name
        && other.sizeTier !== model.sizeTier
        && isModelUsable(other));
    return ambiguous ? (_TIER_LETTER[model.sizeTier] || '') : '';
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
    const engine = remoteEngineClient.effectiveEngine(); // R31 (MPI-208): follow the "Run locally" override
    return deriveInstalledOps(model, isOn, engine, { arch: remoteEngineClient.archSync(engine) }).fullyInstalled;
}

/**
 * Whether a SPECIFIC operation of a model is installed (commonDeps + that op's
 * deps complete). Use this — not `model.installed` — to gate per-operation
 * actions (e.g. finishing a T2V preview when only T2V is installed and I2V is
 * not). The server's `model.installed` is all-ops-present, so it wrongly blocks
 * a partial install for an op it CAN actually run. (MPI-122 / MPI-157 follow-up)
 *
 * Flat models: no op groups → the model must be usable AND still declare the op.
 * Op-keyed models: true when `op` is in the derived installedOps set.
 *
 * The supportedOps half is MPI-453's guarantee surviving the flatten of the last
 * op-keyed model. That bug was a legacy history item naming an op whose weights
 * were not on disk; the op-keyed branch caught it because the op was absent from
 * `installedOps`. On a flat model the op axis is not consulted at all, so a
 * DEPRECATED op (wan-22's `t2v_ms`, whose graph is deleted) would answer "yes"
 * and dispatch a generation against a workflow file that does not exist. Callers
 * pass a model op here (preview Continue/Finish, the remembered-op re-check),
 * never a universal one.
 *
 * @param {ModelDef|string} modelOrId
 * @param {string} op
 * @returns {boolean}
 */
export function isOperationInstalled(modelOrId, op) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model) return false;
    if (!op) return isModelUsable(model);
    if (!(model.supportedOps || []).includes(op)) return false;
    if (!hasOperationGroups(model)) return isModelUsable(model);
    const depStatus = getModelDepStatus(model.id);
    if (!depStatus) return model.installed === true; // no cache yet → trust server flag
    const isOn = id => {
        const s = depStatus.get(id);
        return s === true || s?.installed === true;
    };
    const engine = remoteEngineClient.effectiveEngine(); // R31 (MPI-208): follow the "Run locally" override
    return deriveInstalledOps(model, isOn, engine, { arch: remoteEngineClient.archSync(engine) }).installedOps.includes(op);
}

/**
 * The `installedOps` value to hand `getAvailableCommands`, or null when the
 * question does not apply — a model with no per-op deps, or a dep-status cache
 * that has not landed yet. NULL IS LOAD-BEARING: it means "unknown", and
 * getAvailableCommands then falls back to the static `supportedOps`. Returning
 * `[]` there would hide every op instead (MPI-122's contract).
 *
 * @param {ModelDef|string|null} modelOrId
 * @returns {string[]|null}
 */
export function installedOpsForContext(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model?.operations) return null;
    if (!getModelDepStatus(model.id)) return null;
    return (model.supportedOps || []).filter(op => isOperationInstalled(model, op));
}

/**
 * The model's first INSTALLED operation — what a fallback must land on.
 *
 * MPI-453: seeding an op from `supportedOps[0]` picks a static list entry the
 * user may never have installed — Wan 2.2 was the worked example, opening on
 * `t2v_ms` with only the i2v weights on disk (that case died with MPI-470's
 * t2v deprecation; the hazard returns with the next multi-op model) — and the
 * op strip, which DOES filter by installed ops,
 * then renders a selection it never offered. Dispatching it hands ComfyUI a
 * graph whose weights are absent. Falls back to `supportedOps[0]` when nothing
 * is known to be installed, so an unknown dep-status cache changes nothing.
 *
 * @param {ModelDef|string|null} modelOrId
 * @returns {string|null}
 */
export function firstInstalledOp(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    const ops = model?.supportedOps;
    if (!Array.isArray(ops) || !ops.length) return null;
    return ops.find(op => isOperationInstalled(model, op)) ?? ops[0];
}

/**
 * Detects the MPI-207 "installed for a DIFFERENT GPU arch" state: the current
 * machine's arch-variant weight is NOT on disk, but exactly one OTHER arch's
 * variant weight IS. This is what lets the Models panel show "Install for your
 * GPU" (you have this model, just not the weight this GPU runs) instead of a
 * bare "never installed", and surface the now-unused other-arch weight for
 * opt-in removal.
 *
 * Returns null when it does not apply: the model has no `arch` variant axis, the
 * current arch's weight IS present, no other-arch weight is present, the
 * current arch is unknown (null token → nothing to compare against), or the
 * dep-status cache has not been populated yet.
 *
 * Pure read over the existing `_modelDepStatusCache` + `variantDepsOf` — no
 * server call. Only the `arch` axis is considered (weights coexist on disk;
 * node axes are single-version-pinned and out of scope — see the card).
 *
 * @param {ModelDef|string} modelOrId
 * @returns {{ otherArch: string, unusedDepIds: string[] }|null}
 */
export function installedForOtherArch(modelOrId) {
    const model = typeof modelOrId === 'string' ? getModelById(modelOrId) : modelOrId;
    if (!model) return null;
    const depStatus = getModelDepStatus(model.id);
    if (!depStatus) return null; // no cache yet
    const engine = remoteEngineClient.effectiveEngine(); // R31 (MPI-208): follow the "Run locally" override
    const curArch = remoteEngineClient.archSync(engine);
    const isOn = id => {
        const s = depStatus.get(id);
        return s === true || s?.installed === true;
    };
    return detectOtherArchInstall(model, curArch, isOn);
}
