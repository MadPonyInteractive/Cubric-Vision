/**
 * resolveModelDeps.js — Pure dependency resolver for operation-selectable models.
 *
 * A model declares its dependencies in one of two shapes:
 *
 *   Operations-keyed (models with separable operation payloads, e.g. Wan 2.2):
 *     commonDeps: string[]                    // always-required (VAE, encoder, shared nodes)
 *     operations: { <opKey>: { deps: [...] } } // per-operation unique deps
 *
 *   Flat (models whose operations are NOT separably installable, e.g. image models):
 *     dependencies: string[]                  // the whole always-installed set
 *
 * A flat model is treated as `commonDeps = dependencies` with no operations, so
 * downstream code has ONE path. The resolver collapses any model + selection
 * into a stable, deduplicated flat dep-id list BEFORE it enters the download
 * lifecycle — the downloader never learns about operations.
 *
 * This module is intentionally free of browser/DOM/Events imports so it can be
 * unit-tested directly under node (see tests/resolve-model-deps.test.cjs).
 */

// ── Legacy id aliases ─────────────────────────────────────────────────────────
// The RunPod branch briefly split Wan 2.2 into two models. Those ids must resolve
// to the canonical merged model at every lookup/storage boundary. Historical media
// is NOT rewritten — these are runtime aliases only.
export const LEGACY_MODEL_ID_ALIASES = {
    'wan-22-t2v': 'wan-22',
    'wan-22-i2v': 'wan-22',
};

/**
 * Resolve a possibly-legacy model id to its canonical id.
 * Unknown ids pass through unchanged.
 * @param {string} id
 * @returns {string}
 */
export function canonicalModelId(id) {
    return LEGACY_MODEL_ID_ALIASES[id] ?? id;
}

/**
 * Engine-filter a list of dep OBJECTS for the engine a download/status request
 * targets. A dep may carry `engine: 'local' | 'remote'` to mean "only this
 * engine needs this file" (e.g. LTX-2.3 ships a bf16 transformer for local and a
 * Q8 GGUF transformer for the Pod). Untagged deps are shared → kept for both.
 *
 * Drop the OTHER engine's deps: local runs drop `engine:'remote'`, remote runs
 * drop `engine:'local'`. This is applied ONLY at download + install-status
 * boundaries — NOT inside resolveDeps/resolveFullUniverse (those stay
 * engine-agnostic so shared-dep protection still sees the complete universe).
 *
 * @param {Array<{engine?: string}>} deps - dep objects (must carry `.engine` when tagged)
 * @param {boolean} isRemote - true when the request targets a Pod/remote engine
 * @returns {Array} deps with the wrong-engine entries removed (input order preserved)
 */
export function filterDepsByEngine(deps, isRemote) {
    if (!Array.isArray(deps)) return [];
    const drop = isRemote ? 'local' : 'remote';
    return deps.filter(d => !d || d.engine == null || d.engine !== drop);
}

/**
 * The always-required dep ids for a model, regardless of shape.
 * Operations-keyed → `commonDeps`; flat → `dependencies`.
 * @param {object} model
 * @returns {string[]}
 */
function commonOf(model) {
    if (!model) return [];
    if (Array.isArray(model.commonDeps)) return model.commonDeps;
    if (Array.isArray(model.dependencies)) return model.dependencies;
    return [];
}

/**
 * True when a model declares selectable operation dependency groups.
 * @param {object} model
 * @returns {boolean}
 */
export function hasOperationGroups(model) {
    return !!model && !!model.operations
        && Object.keys(model.operations).length > 0;
}

/**
 * Dep ids unique to one operation. Empty for unknown ops or flat models.
 * @param {object} model
 * @param {string} op
 * @returns {string[]}
 */
function opDeps(model, op) {
    const entry = model?.operations?.[op];
    return Array.isArray(entry?.deps) ? entry.deps : [];
}

/**
 * Op ids a given op depends on (e.g. an extend op that needs i2v installed).
 * Empty when none declared. Optional `requiresOps` on the operation entry.
 * @param {object} model
 * @param {string} op
 * @returns {string[]}
 */
function opRequires(model, op) {
    const entry = model?.operations?.[op];
    return Array.isArray(entry?.requiresOps) ? entry.requiresOps : [];
}

/**
 * Expand a selection to include every op it (transitively) requires via
 * `requiresOps`. Only selectable ops survive. Order-independent; the result is a
 * stable, deduped list in registry (selectableOps) order so the resolved dep list
 * and download-job signature don't depend on toggle order.
 * @param {object} model
 * @param {string[]} ops
 * @returns {string[]}
 */
export function expandRequiredOps(model, ops) {
    if (!hasOperationGroups(model)) return [];
    const available = selectableOps(model);
    const availableSet = new Set(available);
    const want = new Set(ops.filter(op => availableSet.has(op)));
    // Transitive closure over requiresOps.
    let changed = true;
    while (changed) {
        changed = false;
        for (const op of [...want]) {
            for (const req of opRequires(model, op)) {
                if (availableSet.has(req) && !want.has(req)) {
                    want.add(req);
                    changed = true;
                }
            }
        }
    }
    return available.filter(op => want.has(op)); // stable registry order
}

/**
 * Selectable ops that (transitively) require `op` — i.e. dependents that must be
 * deselected/uninstalled when `op` is removed. Used by the UI cascade-off.
 * @param {object} model
 * @param {string} op
 * @returns {string[]}
 */
export function dependentsOfOp(model, op) {
    if (!hasOperationGroups(model)) return [];
    return selectableOps(model).filter(other =>
        other !== op && expandRequiredOps(model, [other]).includes(op));
}

/**
 * Operations a model can offer as selectors. Only ops that appear in BOTH
 * supportedOps and operations are selectable; everything else is always-on.
 * @param {object} model
 * @returns {string[]}
 */
export function selectableOps(model) {
    if (!hasOperationGroups(model)) return [];
    const supported = new Set(model.supportedOps || []);
    return Object.keys(model.operations).filter(op => supported.has(op));
}

/**
 * Deduplicate while preserving first-seen order. Stable across calls so jobs,
 * progress, and status comparisons line up regardless of selection order.
 * @param {string[]} ids
 * @returns {string[]}
 */
export function dedupeStable(ids) {
    const seen = new Set();
    const out = [];
    for (const id of ids) {
        if (!seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    return out;
}

/**
 * Resolve the dependency id list for a model given a set of selected operations.
 *
 * - Flat models (no operations): always returns the full dep set verbatim.
 * - Operation-keyed models: `commonDeps` + the deps of each selected, selectable
 *   op. `selectedOps` defaults to all selectable ops (a fresh full install).
 *   Non-selectable / unknown ops in `selectedOps` are ignored (they have no group).
 *
 * Throws if any resolved dep id fails `depExists` — a registry authoring error
 * that must fail deterministically rather than silently dropping a required file.
 *
 * @param {object} model
 * @param {string[]|null} [selectedOps] - null/undefined = all selectable ops.
 * @param {(depId:string)=>boolean} [depExists] - optional validator (e.g. id => !!DEPS[id]).
 * @returns {string[]} stable, deduplicated dep ids.
 */
export function resolveDeps(model, selectedOps = null, depExists = null) {
    if (!model) return [];
    const common = commonOf(model);

    if (!hasOperationGroups(model)) {
        return dedupeStable(common);
    }

    // Iterate in registry (selectableOps) order, not the caller's selection order,
    // so the resolved list is identical regardless of toggle/click order — a stable
    // download-job signature.
    const available = selectableOps(model);
    // Expand the selection to pull in any op required via `requiresOps` (an op
    // can't install without the ops it depends on). null = all selectable ops.
    const wanted = (selectedOps == null)
        ? available
        : expandRequiredOps(model, selectedOps);

    const ids = [...common];
    for (const op of wanted) {
        ids.push(...opDeps(model, op));
    }

    if (depExists) {
        for (const id of ids) {
            if (!depExists(id)) {
                throw new Error(`resolveDeps: model "${model.id}" references unknown dep "${id}"`);
            }
        }
    }
    return dedupeStable(ids);
}

/**
 * The complete dependency universe for a model: common + every selectable op.
 * This is what whole-model uninstall and install-status checks must resolve so
 * no operation payload is orphaned regardless of what the user selected.
 * @param {object} model
 * @param {(depId:string)=>boolean} [depExists]
 * @returns {string[]}
 */
export function resolveFullUniverse(model, depExists = null) {
    return resolveDeps(model, hasOperationGroups(model) ? selectableOps(model) : null, depExists);
}

/**
 * Derive which operations are installed from per-dep disk/Pod status.
 *
 * `depStatus` answers depId → installed:boolean. An operation is installed when
 * `commonDeps` AND that op's own deps are all complete. A flat model exposes all
 * supportedOps when its single dep set is complete.
 *
 * A selectable model is `fullyInstalled` when common deps + at least one operation
 * are complete. Omitted operations are NOT partial failures.
 *
 * @param {object} model
 * @param {(depId:string)=>boolean} depStatus
 * @returns {{ installedOps: string[], fullyInstalled: boolean }}
 */
export function deriveInstalledOps(model, depStatus) {
    if (!model) return { installedOps: [], fullyInstalled: false };
    const allComplete = ids => ids.every(id => depStatus(id) === true);

    const commonComplete = allComplete(commonOf(model));

    if (!hasOperationGroups(model)) {
        return {
            installedOps: commonComplete ? [...(model.supportedOps || [])] : [],
            fullyInstalled: commonComplete,
        };
    }

    // First pass: ops whose common + own deps are all on disk.
    const depComplete = commonComplete
        ? new Set(selectableOps(model).filter(op => allComplete(opDeps(model, op))))
        : new Set();

    // Second pass: an op only counts as installed if every op it requires is also
    // installed — a dependent op is unusable without its prerequisites on disk.
    const installedOps = selectableOps(model).filter(op =>
        depComplete.has(op) && opRequires(model, op).every(req => depComplete.has(req)));

    return { installedOps, fullyInstalled: installedOps.length > 0 };
}
