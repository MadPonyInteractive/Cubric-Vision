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
 * Engine-specific dep ids a model adds for one engine. A model declares its
 * engine-split weights STRUCTURALLY (not via a per-dep `engine` tag) in ONE
 * `engines:` block (MPI-165), each engine carrying its own `extraDeps`:
 *
 *   dependencies: [...shared...]   // both engines (VAE, encoder, LoRAs, nodes)
 *   engines: {
 *     local:  { extraDeps: ['ltx23-transformer-bf16'],                 workflowSuffix: '' },
 *     remote: { extraDeps: ['ltx23-transformer-gguf', 'ComfyUI-GGUF'], workflowSuffix: '_gguf' },
 *   }
 *
 * `engine` selects which list to add:
 *   'local'  → engines.local.extraDeps
 *   'remote' → engines.remote.extraDeps
 *   null/undefined → BOTH (the all-engines union — shared-dep protection MUST see
 *                    the complete universe so a weight another engine needs is
 *                    never deleted).
 *
 * Carrying engine in the model structure (not on the dep) makes the engine-correct
 * set the DEFAULT at the resolution layer, so no consumer can half-wire it — the
 * bug MPI-163 fixes (the status gate forgot to engine-filter the per-dep tag).
 *
 * A model with no `engines:` block has no engine-split weights — returns []
 * for every engine (image / op-keyed models).
 *
 * @param {object} model
 * @param {'local'|'remote'|null} [engine]
 * @returns {string[]}
 */
function engineDepsOf(model, engine = null) {
    if (!model) return [];
    const eng = model.engines;
    if (!eng || typeof eng !== 'object') return [];
    const extra = e => (Array.isArray(eng[e]?.extraDeps) ? eng[e].extraDeps : []);
    if (engine === 'local') return extra('local');
    if (engine === 'remote') return extra('remote');
    return [...extra('local'), ...extra('remote')]; // union for shared-dep protection
}

/**
 * The workflow filename for a model + operation + engine, with the stage-2 and
 * engine suffixes applied in the order the build script (generate_ltx.py) emits:
 * `<base>` → `<base>_stage2` (when stage2) → `<base><engineSuffix>` (e.g. `_gguf`),
 * yielding `..._stage2_gguf.json` for a remote stage-2 run. Returns null when the
 * model declares no workflow for the op (the caller falls back to a universal one).
 *
 * Engine suffix comes from `model.engines[engine].workflowSuffix`. A model with no
 * `engines:` block has no suffix on any engine (its workflow is used verbatim).
 *
 * Pure string derivation — no disk/registry access, so it stays node-testable.
 *
 * @param {object} model
 * @param {string} op
 * @param {'local'|'remote'|null} [engine]
 * @param {{stage2?: boolean}} [opts]
 * @returns {string|null}
 */
export function resolveWorkflowFile(model, op, engine = null, { stage2 = false } = {}) {
    const base = model?.workflows?.[op];
    if (typeof base !== 'string' || base.length === 0) return null;
    let file = base;
    if (stage2) file = file.replace(/\.json$/i, '_stage2.json');
    const suffix = engineSuffixOf(model, engine);
    if (suffix) file = file.replace(/\.json$/i, `${suffix}.json`);
    return file;
}

/**
 * The workflow-filename suffix for a model on one engine, from the `engines:` block.
 * Empty string when none applies (local, or a model with no engine split).
 * @param {object} model
 * @param {'local'|'remote'|null} [engine]
 * @returns {string}
 */
function engineSuffixOf(model, engine) {
    const eng = model?.engines;
    if (!eng || typeof eng !== 'object') return '';
    const s = eng[engine]?.workflowSuffix;
    return typeof s === 'string' ? s : '';
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
 * The `engine` param selects the engine-split weights from the `engines:` block:
 * 'local' adds `engines.local.extraDeps`, 'remote' adds `engines.remote.extraDeps`,
 * null/undefined adds BOTH (the union — what shared-dep protection needs). Every
 * consumer passes its engine and gets the engine-correct set at the resolution
 * layer, so no consumer can half-wire it.
 *
 * @param {object} model
 * @param {string[]|null} [selectedOps] - null/undefined = all selectable ops.
 * @param {(depId:string)=>boolean} [depExists] - optional validator (e.g. id => !!DEPS[id]).
 * @param {'local'|'remote'|null} [engine] - null = union of both engine sets.
 * @returns {string[]} stable, deduplicated dep ids.
 */
export function resolveDeps(model, selectedOps = null, depExists = null, engine = null) {
    if (!model) return [];
    const common = commonOf(model);
    const engineDeps = engineDepsOf(model, engine);

    if (!hasOperationGroups(model)) {
        const flat = dedupeStable([...common, ...engineDeps]);
        if (depExists) {
            for (const id of flat) {
                if (!depExists(id)) {
                    throw new Error(`resolveDeps: model "${model.id}" references unknown dep "${id}"`);
                }
            }
        }
        return flat;
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
    ids.push(...engineDeps);

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
 * The complete dependency universe for a model: common + every selectable op +
 * the engine-split weights. This is what whole-model uninstall and install-status
 * checks must resolve so no operation payload is orphaned regardless of selection.
 *
 * `engine` (MPI-163): 'local'/'remote' resolves the engine-correct universe (what
 * the status gate / download / install must use); null = the all-engines UNION,
 * which is what cross-model shared-dep PROTECTION needs (never delete a weight
 * another engine still needs).
 * @param {object} model
 * @param {(depId:string)=>boolean} [depExists]
 * @param {'local'|'remote'|null} [engine] - null = union of both engine sets.
 * @returns {string[]}
 */
export function resolveFullUniverse(model, depExists = null, engine = null) {
    return resolveDeps(model, hasOperationGroups(model) ? selectableOps(model) : null, depExists, engine);
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
 * `engine`: the engine-split weights (`engines[engine].extraDeps`) count toward
 * "common complete" for the CURRENT engine only. Without this the status gate
 * either ignored the transformer or demanded the WRONG engine's transformer — the
 * bug (MPI-163): on a Pod the gate required the bf16 weight that is legitimately
 * absent, so the prompt box never showed. Pass the engine the status came from
 * (remote on a Pod, local otherwise).
 *
 * @param {object} model
 * @param {(depId:string)=>boolean} depStatus
 * @param {'local'|'remote'|null} [engine] - engine whose split weights to require.
 * @returns {{ installedOps: string[], fullyInstalled: boolean }}
 */
export function deriveInstalledOps(model, depStatus, engine = null) {
    if (!model) return { installedOps: [], fullyInstalled: false };
    const allComplete = ids => ids.every(id => depStatus(id) === true);

    // Engine-split weights for THIS engine are part of the always-required set:
    // a flat LTX is only usable when its current-engine transformer is on disk.
    const commonComplete = allComplete(commonOf(model))
        && allComplete(engineDepsOf(model, engine));

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

/**
 * One-call resolution of everything a generation needs for a model + selection +
 * engine (MPI-165): the dep id list, the workflow filename, and (optionally) the
 * custom-node subset. Thin façade over `resolveDeps` + `resolveWorkflowFile` so a
 * consumer threads ONE resolved engine string instead of re-deriving each axis.
 *
 * The OPERATION axis (selectedOps → opDeps) and the ENGINE axis (engine →
 * extraDeps + workflowSuffix) compose by UNION inside `resolveDeps`: op deps and
 * engine extraDeps are both appended, then deduped. A model may have neither, one,
 * or both axes — they never collide.
 *
 * `nodeIds` is the `type:'custom_nodes'` subset of `depIds`, filtered by the
 * supplied `isNode` predicate (kept browser/DOM-free — the caller passes
 * `id => DEPS[id]?.type === 'custom_nodes'`). Null when no predicate is given.
 *
 * @param {object} model
 * @param {string[]|null} selectedOps - null = all selectable ops.
 * @param {'local'|'remote'|null} engine
 * @param {{stage2?: boolean, op?: string, depExists?: (id:string)=>boolean, isNode?: (id:string)=>boolean}} [opts]
 * @returns {{ depIds: string[], workflowFile: string|null, nodeIds: string[]|null }}
 */
export function resolve(model, selectedOps = null, engine = null, opts = {}) {
    const { stage2 = false, op = null, depExists = null, isNode = null } = opts;
    const depIds = resolveDeps(model, selectedOps, depExists, engine);
    const workflowFile = op ? resolveWorkflowFile(model, op, engine, { stage2 }) : null;
    const nodeIds = isNode ? depIds.filter(isNode) : null;
    return { depIds, workflowFile, nodeIds };
}
