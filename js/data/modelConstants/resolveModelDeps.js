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
 *     local:  { extraDeps: ['some-local-only-weight'],  workflowSuffix: '' },
 *     remote: { extraDeps: ['some-remote-only-weight'], workflowSuffix: '_remote' },
 *   }
 *
 * (No model uses this today — LTX-2.3's bf16/GGUF split was reverted in MPI-190.
 * The mechanism stays for a future engine-split model.)
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

// ── Generic runtime-variant axes (MPI-200) ────────────────────────────────────
// A model whose deps/workflow vary by a RUNTIME token OTHER than the engine (the
// first case: GPU architecture — Blackwell wants the mxfp8 transformer, Ada/older
// wants fp8_scaled) declares that variance in a `variants:` block. This is the
// SAME structural shape as the `engines:` axis (MPI-165) — one block, one resolver,
// token resolved ONCE per gen and threaded — generalized so future axes (an
// arch-dependent node, a per-card LoRA, anything keyed on a runtime signal) need
// NO new resolver code: declare the axis on the card and the resolver composes it.
//
//   variants: {
//     arch: {                                 // axis key = the token name
//       options: {
//         blackwell: { extraDeps: ['ltx23-transformer-mxfp8'], workflowSuffix: '_mxfp8' },
//         modern:    { extraDeps: ['ltx23-transformer-fp8'],   workflowSuffix: '_fp8'   },
//       },
//     },
//   }
//
// Callers pass a `variantTokens` map, e.g. `{ arch: 'blackwell' }`. Rules mirror
// the engine axis exactly:
//   - a provided token selects that option's extraDeps + suffix;
//   - a MISSING/null token = the union of every option's extraDeps (shared-dep
//     PROTECTION — never delete a weight another variant needs) and NO suffix;
//   - an unknown token value falls through to union/no-suffix (defensive; the
//     app resolves a concrete token per gen, so this only guards bad input).
// A model with no `variants:` block is entirely unaffected — [] deps, '' suffix.

function variantAxesOf(model) {
    const v = model?.variants;
    return v && typeof v === 'object' ? v : null;
}

/**
 * The option tokens declared for a given variant axis (e.g. axis 'arch' →
 * ['blackwell','modern']), in declaration order. Empty array when the model has
 * no such axis. Lets a UI enumerate the OTHER arch variants of a model to detect
 * "installed for a different arch than this GPU" (MPI-207).
 * @param {object} model
 * @param {string} axisKey
 * @returns {string[]}
 */
export function variantAxisTokens(model, axisKey) {
    const opts = variantAxesOf(model)?.[axisKey]?.options;
    return opts && typeof opts === 'object' ? Object.keys(opts) : [];
}

/**
 * The declared `arch`-axis options for a model, each with its display metadata:
 * `{ token, label, size }` in declaration order. `label` is the GPU-family name
 * (e.g. "RTX 50 Series (Blackwell)") and `size` a display hint — both read from
 * the card, so a UI enumerating arch toggles never hardcodes arch names (MPI-209:
 * hundreds of models coming, a future card may add a 3rd tier). Empty array for a
 * model with no `arch` axis. `label` falls back to the token when absent.
 * @param {object} model
 * @returns {Array<{ token: string, label: string, size: string|null }>}
 */
export function archVariantOptions(model) {
    const opts = variantAxesOf(model)?.arch?.options;
    if (!opts || typeof opts !== 'object') return [];
    return Object.entries(opts).map(([token, o]) => ({
        token,
        label: typeof o?.label === 'string' ? o.label : token,
        size: typeof o?.size === 'string' ? o.size : null,
    }));
}

/**
 * Pure core of the MPI-207 "installed for a DIFFERENT arch" detector: given the
 * current arch token and a dep-presence predicate, returns the other arch whose
 * `arch`-axis weight is fully on disk while THIS arch's weight is not — or null
 * when it doesn't apply (no arch axis, current-arch weight present, no other-arch
 * weight present, or unknown current arch). DOM/registry-free so it stays
 * node-testable; the registry wrapper feeds it the live cache + arch. Only the
 * `arch` axis is considered — weights coexist on disk (node axes are out of scope).
 * @param {object} model
 * @param {string|null} curArch  Current machine's arch token (null → returns null).
 * @param {(depId:string)=>boolean} isOn  Dep-presence predicate.
 * @returns {{ otherArch: string, unusedDepIds: string[] }|null}
 */
export function detectOtherArchInstall(model, curArch, isOn) {
    if (!curArch) return null;
    const tokens = variantAxisTokens(model, 'arch');
    if (tokens.length < 2) return null;
    const curDeps = variantDepsOf(model, { arch: curArch });
    if (curDeps.length && curDeps.every(isOn)) return null; // this GPU's weight present
    for (const token of tokens) {
        if (token === curArch) continue;
        const deps = variantDepsOf(model, { arch: token });
        if (deps.length && deps.every(isOn)) return { otherArch: token, unusedDepIds: deps };
    }
    return null;
}

/**
 * Extra dep ids from every declared variant axis for a given token map.
 * A provided token picks one option; a missing token unions all options
 * (shared-dep protection). Deterministic: axes and options in declaration order.
 * @param {object} model
 * @param {Record<string,string|null>} [variantTokens]
 * @returns {string[]}
 */
export function variantDepsOf(model, variantTokens = {}) {
    const axes = variantAxesOf(model);
    if (!axes) return [];
    const ids = [];
    for (const [axisKey, axis] of Object.entries(axes)) {
        const options = axis?.options;
        if (!options || typeof options !== 'object') continue;
        const token = variantTokens ? variantTokens[axisKey] : null;
        const chosen = (token != null && options[token]) ? [token] : Object.keys(options);
        for (const optKey of chosen) {
            const extra = options[optKey]?.extraDeps;
            if (Array.isArray(extra)) ids.push(...extra);
        }
    }
    return ids;
}

/**
 * Concatenated workflow-filename suffix from every declared variant axis, in
 * declaration order. Only a resolved (present) token contributes a suffix; a
 * missing/unknown token contributes nothing (the union case never suffixes — it
 * is for dep-universe protection, not for picking a concrete workflow file).
 * @param {object} model
 * @param {Record<string,string|null>} [variantTokens]
 * @returns {string}
 */
function variantSuffixOf(model, variantTokens = {}) {
    const axes = variantAxesOf(model);
    if (!axes) return '';
    let suffix = '';
    for (const [axisKey, axis] of Object.entries(axes)) {
        const token = variantTokens ? variantTokens[axisKey] : null;
        const opt = token != null ? axis?.options?.[token] : null;
        if (opt && typeof opt.workflowSuffix === 'string') suffix += opt.workflowSuffix;
    }
    return suffix;
}

/**
 * The workflow filename for a model + operation + engine, with the stage-2 and
 * engine suffixes applied in the order the build script (generate_ltx.py) emits:
 * `<base>` → `<base>_stage2` (when stage2) → `<base><engineSuffix>` (e.g. `_remote`),
 * yielding `..._stage2_remote.json` for a remote stage-2 run. Returns null when the
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
export function resolveWorkflowFile(model, op, engine = null, { stage2 = false, variantTokens = {} } = {}) {
    const base = model?.workflows?.[op];
    if (typeof base !== 'string' || base.length === 0) return null;
    let file = base;
    // Order MUST match generate_ltx.py's output: base → variant suffix(es) →
    // _stage2 → engine suffix, e.g. ltx_t2v + _mxfp8 + _stage2 (+ _remote).
    const vSuffix = variantSuffixOf(model, variantTokens);
    if (vSuffix) file = file.replace(/\.json$/i, `${vSuffix}.json`);
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
export function resolveDeps(model, selectedOps = null, depExists = null, engine = null, variantTokens = {}) {
    if (!model) return [];
    const common = commonOf(model);
    const engineDeps = engineDepsOf(model, engine);
    const variantDeps = variantDepsOf(model, variantTokens);

    if (!hasOperationGroups(model)) {
        const flat = dedupeStable([...common, ...engineDeps, ...variantDeps]);
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
    ids.push(...variantDeps);

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
export function resolveFullUniverse(model, depExists = null, engine = null, variantTokens = {}) {
    return resolveDeps(model, hasOperationGroups(model) ? selectableOps(model) : null, depExists, engine, variantTokens);
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
export function deriveInstalledOps(model, depStatus, engine = null, variantTokens = {}) {
    if (!model) return { installedOps: [], fullyInstalled: false };
    const allComplete = ids => ids.every(id => depStatus(id) === true);

    // Engine-split weights for THIS engine AND the current runtime-variant weights
    // (e.g. THIS GPU's arch transformer) are part of the always-required set: a flat
    // balanced LTX is only usable when its current-engine, current-arch transformer
    // is on disk. Pass the CONCRETE token (not the union) so the gate requires the
    // one weight this machine actually runs — mirrors the engine gate (MPI-163).
    const commonComplete = allComplete(commonOf(model))
        && allComplete(engineDepsOf(model, engine))
        && allComplete(variantDepsOf(model, variantTokens));

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
    const { stage2 = false, op = null, depExists = null, isNode = null, variantTokens = {} } = opts;
    const depIds = resolveDeps(model, selectedOps, depExists, engine, variantTokens);
    const workflowFile = op ? resolveWorkflowFile(model, op, engine, { stage2, variantTokens }) : null;
    const nodeIds = isNode ? depIds.filter(isNode) : null;
    return { depIds, workflowFile, nodeIds };
}
