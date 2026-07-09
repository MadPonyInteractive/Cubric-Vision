'use strict';

// Contract tests for the pure operation-selectable dependency resolver.
// Run: node tests/resolve-model-deps.test.cjs
// No framework — matches the other tests/*.test.cjs in this repo.

const assert = require('assert');
const {
    canonicalModelId,
    LEGACY_MODEL_ID_ALIASES,
    hasOperationGroups,
    selectableOps,
    dedupeStable,
    resolveDeps,
    resolveFullUniverse,
    deriveInstalledOps,
    expandRequiredOps,
    dependentsOfOp,
    resolveWorkflowFile,
    resolve,
    variantAxisTokens,
    archVariantOptions,
    detectOtherArchInstall,
} = require('../js/data/modelConstants/resolveModelDeps.js');

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Flat image model (no operations) — must behave exactly as before.
const FLAT = {
    id: 'sdxl-realistic',
    supportedOps: ['t2i', 'upscale', 'detail'],
    dependencies: ['sdxl-realistic', '4x-NMKD-Siax', 'ComfyUI-MpiNodes', 'ComfyUI-UltimateSDUpscale'],
};

// Operations-keyed Wan model in the new shape.
const WAN = {
    id: 'wan-22',
    supportedOps: ['t2v_ms', 'i2v_ms'],
    commonDeps: ['wan_2.1_vae', 'umt5_xxl_fp8_e4m3fn_scaled', 'ComfyUI-MpiNodes', 'ComfyUI-VideoHelperSuite', 'comfyui-kjnodes'],
    operations: {
        t2v_ms: { deps: ['wan-22-t2v-high', 'wan-22-t2v-low'] },
        i2v_ms: { deps: ['wan-22-i2v-high', 'wan-22-i2v-low', 'ComfyUI-PainterI2Vadvanced'] },
    },
};

const WAN_COMMON = WAN.commonDeps;
const WAN_T2V = WAN.operations.t2v_ms.deps;
const WAN_I2V = WAN.operations.i2v_ms.deps;
const WAN_UNIVERSE = [...WAN_COMMON, ...WAN_T2V, ...WAN_I2V];

// Op-keyed model with an op that REQUIRES another op (forward-looking shape).
// `extend` needs `i2v_ms` installed; selecting extend must pull i2v's deps too.
const REQ = {
    id: 'req-model',
    supportedOps: ['t2v_ms', 'i2v_ms', 'extend'],
    commonDeps: ['cdep'],
    operations: {
        t2v_ms: { deps: ['t2v-w'] },
        i2v_ms: { deps: ['i2v-w'] },
        extend: { deps: ['extend-w'], requiresOps: ['i2v_ms'] },
    },
};

// Flat model with engine-split weights via the consolidated `engines:` block
// (MPI-163/MPI-165). Mirrors LTX-2.3: bf16 transformer local-only (no workflow
// suffix), GGUF transformer + GGUF node Pod-only (_gguf suffix).
const SPLIT = {
    id: 'ltx-like',
    supportedOps: ['t2v_ms', 'i2v_ms'],
    dependencies: ['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo'],
    workflows: { t2v_ms: 'LTX_t2v.json', i2v_ms: 'LTX_i2v.json' },
    engines: {
        local:  { extraDeps: ['tx-bf16'],                  workflowSuffix: '' },
        remote: { extraDeps: ['tx-gguf', 'ComfyUI-GGUF'],  workflowSuffix: '_gguf' },
    },
};
// Alias kept so the workflow-filename test reads clearly.
const SPLIT_ENGINES = SPLIT;

// MPI-165: the case the user flagged — a model that is BOTH op-keyed AND
// engine-split. The two axes are orthogonal and must UNION: Painter is OP-only
// (i2v), pod-node is ENGINE-only (remote). Proves engineDepsOf composes with the
// operation axis (the latent bug the plan calls out).
const OP_X_ENGINE = {
    id: 'both-axes',
    supportedOps: ['t2v_ms', 'i2v_ms'],
    commonDeps: ['vae', 'encoder'],
    operations: {
        t2v_ms: { deps: ['t2v-high', 't2v-low'] },
        i2v_ms: { deps: ['i2v-high', 'i2v-low', 'ComfyUI-PainterI2Vadvanced'] }, // Painter = OP-only
    },
    engines: {
        local:  { extraDeps: [],                workflowSuffix: '' },
        remote: { extraDeps: ['some-pod-node'], workflowSuffix: '_gguf' },        // pod-node = ENGINE-only
    },
};

// MPI-200: generic runtime-variant axis. LTX-2.3 balanced tier — the transformer
// weight AND the workflow file vary by GPU arch (Blackwell → mxfp8, Ada/older →
// fp8_scaled). Declared as a `variants:` block; same structural shape as engines.
const VARIANT = {
    id: 'ltx-balanced-like',
    supportedOps: ['t2v_ms', 'i2v_ms'],
    dependencies: ['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo'],
    workflows: { t2v_ms: 'LTX_t2v.json', i2v_ms: 'LTX_i2v.json' },
    variants: {
        arch: {
            options: {
                blackwell: { extraDeps: ['tx-mxfp8'], workflowSuffix: '_mxfp8' },
                modern:    { extraDeps: ['tx-fp8'],   workflowSuffix: '_fp8'   },
            },
        },
    },
};

// depStatus helper: a Set of installed dep ids → predicate.
const statusFrom = (installed) => (id) => installed.has(id);

// ── Tests ───────────────────────────────────────────────────────────────────

function testCanonicalize() {
    assert.strictEqual(canonicalModelId('wan-22-t2v'), 'wan-22');
    assert.strictEqual(canonicalModelId('wan-22-i2v'), 'wan-22');
    assert.strictEqual(canonicalModelId('wan-22'), 'wan-22');           // already canonical
    assert.strictEqual(canonicalModelId('sdxl-realistic'), 'sdxl-realistic'); // unknown passes through
    assert.deepStrictEqual(Object.keys(LEGACY_MODEL_ID_ALIASES).sort(), ['wan-22-i2v', 'wan-22-t2v']);
}

function testShapeDetection() {
    assert.strictEqual(hasOperationGroups(FLAT), false);
    assert.strictEqual(hasOperationGroups(WAN), true);
    assert.strictEqual(hasOperationGroups(null), false);
    assert.deepStrictEqual(selectableOps(FLAT), []);
    assert.deepStrictEqual(selectableOps(WAN).sort(), ['i2v_ms', 't2v_ms']);
    // An op in `operations` but not in supportedOps is NOT selectable.
    const orphan = { id: 'x', supportedOps: ['t2v_ms'], commonDeps: [], operations: { t2v_ms: { deps: [] }, ghost: { deps: ['g'] } } };
    assert.deepStrictEqual(selectableOps(orphan), ['t2v_ms']);
}

function testFlatUnchanged() {
    // Flat model: every call returns the full set verbatim, regardless of selectedOps.
    assert.deepStrictEqual(resolveDeps(FLAT), FLAT.dependencies);
    assert.deepStrictEqual(resolveDeps(FLAT, ['t2i']), FLAT.dependencies);
    assert.deepStrictEqual(resolveDeps(FLAT, []), FLAT.dependencies);
    assert.deepStrictEqual(resolveFullUniverse(FLAT), FLAT.dependencies);
}

function testWanResolution() {
    // Default (null) = all selectable ops = full union.
    assert.deepStrictEqual(resolveDeps(WAN), WAN_UNIVERSE);
    // T2V only.
    assert.deepStrictEqual(resolveDeps(WAN, ['t2v_ms']), [...WAN_COMMON, ...WAN_T2V]);
    // I2V only.
    assert.deepStrictEqual(resolveDeps(WAN, ['i2v_ms']), [...WAN_COMMON, ...WAN_I2V]);
    // Both explicitly.
    assert.deepStrictEqual(resolveDeps(WAN, ['t2v_ms', 'i2v_ms']), WAN_UNIVERSE);
    // Full universe == both ops.
    assert.deepStrictEqual(resolveFullUniverse(WAN), WAN_UNIVERSE);
    // Empty selection = common only.
    assert.deepStrictEqual(resolveDeps(WAN, []), WAN_COMMON);
}

function testDedupeStable() {
    // Common deps are not duplicated when both ops are selected.
    const out = resolveDeps(WAN, ['t2v_ms', 'i2v_ms']);
    assert.strictEqual(new Set(out).size, out.length, 'no duplicates');
    // Selection order does not change output order (common first, then op order as listed).
    assert.deepStrictEqual(resolveDeps(WAN, ['i2v_ms', 't2v_ms']), resolveDeps(WAN, ['t2v_ms', 'i2v_ms']));
    // dedupeStable keeps first-seen order.
    assert.deepStrictEqual(dedupeStable(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
}

function testUnknownOpsAndDeps() {
    // Unknown / non-selectable ops are ignored, not errors.
    assert.deepStrictEqual(resolveDeps(WAN, ['nope']), WAN_COMMON);
    assert.deepStrictEqual(resolveDeps(WAN, ['t2v_ms', 'nope']), [...WAN_COMMON, ...WAN_T2V]);
    // Unknown DEP id fails deterministically when a validator is supplied.
    const known = new Set(WAN_UNIVERSE);
    const depExists = id => known.has(id);
    assert.doesNotThrow(() => resolveDeps(WAN, null, depExists));
    const broken = { id: 'broken', supportedOps: ['t2v_ms'], commonDeps: ['vae'], operations: { t2v_ms: { deps: ['ghost-weight'] } } };
    assert.throws(() => resolveDeps(broken, null, id => id === 'vae'), /unknown dep "ghost-weight"/);
}

function testDeriveInstalledOps() {
    // Nothing installed.
    let r = deriveInstalledOps(WAN, statusFrom(new Set()));
    assert.deepStrictEqual(r, { installedOps: [], fullyInstalled: false });

    // Common only → no op complete → not installed (not a partial failure, just empty).
    r = deriveInstalledOps(WAN, statusFrom(new Set(WAN_COMMON)));
    assert.deepStrictEqual(r, { installedOps: [], fullyInstalled: false });

    // Common + T2V → T2V-only install is installed and exposes ONLY t2v_ms.
    r = deriveInstalledOps(WAN, statusFrom(new Set([...WAN_COMMON, ...WAN_T2V])));
    assert.deepStrictEqual(r, { installedOps: ['t2v_ms'], fullyInstalled: true });

    // Common + I2V → I2V-only, exposes ONLY i2v_ms.
    r = deriveInstalledOps(WAN, statusFrom(new Set([...WAN_COMMON, ...WAN_I2V])));
    assert.deepStrictEqual(r, { installedOps: ['i2v_ms'], fullyInstalled: true });

    // Full install → both ops.
    r = deriveInstalledOps(WAN, statusFrom(new Set(WAN_UNIVERSE)));
    assert.deepStrictEqual(r.installedOps.sort(), ['i2v_ms', 't2v_ms']);
    assert.strictEqual(r.fullyInstalled, true);

    // Op deps present but common missing → not installed (common gates everything).
    r = deriveInstalledOps(WAN, statusFrom(new Set(WAN_T2V)));
    assert.deepStrictEqual(r, { installedOps: [], fullyInstalled: false });

    // Flat model: all deps present → all supportedOps installed.
    r = deriveInstalledOps(FLAT, statusFrom(new Set(FLAT.dependencies)));
    assert.deepStrictEqual(r.installedOps.sort(), ['detail', 't2i', 'upscale']);
    assert.strictEqual(r.fullyInstalled, true);
    // Flat model: one dep missing → not installed.
    r = deriveInstalledOps(FLAT, statusFrom(new Set(['sdxl-realistic'])));
    assert.deepStrictEqual(r, { installedOps: [], fullyInstalled: false });
}

// ── Integration: resolve against the REAL registry ───────────────────────────
// Catches authoring drift the resolver throws on — a model referencing a dep id
// that doesn't exist in dependencies.js (MPI-122 reshape regression guard).
function testRealRegistryIntegrity() {
    const { MODELS } = require('../js/data/modelConstants/models.js');
    const { DEPS } = require('../js/data/modelConstants/dependencies.js');
    const exists = id => !!DEPS[id];

    // Every model's FULL universe resolves without throwing, and every resolved
    // dep id is a real entry in DEPS.
    for (const model of MODELS) {
        const universe = resolveFullUniverse(model, exists); // throws on unknown dep
        assert.ok(universe.length > 0, `${model.id} resolves to no deps`);
        for (const id of universe) {
            assert.ok(exists(id), `${model.id} references missing dep "${id}"`);
        }
    }

    // wan-22 is the merged, op-keyed model — both ops selectable, split ids gone.
    const wan = MODELS.find(m => m.id === 'wan-22');
    assert.ok(wan, 'wan-22 model is missing from the registry');
    assert.ok(hasOperationGroups(wan), 'wan-22 must be operation-keyed');
    assert.deepStrictEqual(selectableOps(wan).sort(), ['i2v_ms', 't2v_ms']);
    assert.ok(!MODELS.some(m => m.id === 'wan-22-t2v' || m.id === 'wan-22-i2v'),
        'split wan ids must not exist as models');

    // T2V-only selection excludes the I2V-only node; full universe includes it.
    const t2vOnly = resolveDeps(wan, ['t2v_ms'], exists);
    assert.ok(!t2vOnly.includes('ComfyUI-PainterI2Vadvanced'),
        'T2V-only install must not pull the I2V-only node');
    assert.ok(resolveFullUniverse(wan).includes('ComfyUI-PainterI2Vadvanced'),
        'full universe must include the I2V-only node');
}

// requiresOps: selecting a dependent op pulls in its prerequisite op's deps, and
// an op only reads installed when its prerequisites are also on disk.
function testRequiresOps() {
    // Selecting `extend` expands to include i2v_ms → both their deps resolve.
    assert.deepStrictEqual(expandRequiredOps(REQ, ['extend']).sort(), ['extend', 'i2v_ms']);
    const r = resolveDeps(REQ, ['extend']);
    assert.ok(r.includes('extend-w') && r.includes('i2v-w') && r.includes('cdep'),
        'extend must pull i2v + common deps');
    assert.ok(!r.includes('t2v-w'), 'extend must not pull unrelated t2v');

    // dependentsOfOp: removing i2v_ms must cascade-off extend.
    assert.deepStrictEqual(dependentsOfOp(REQ, 'i2v_ms'), ['extend']);
    assert.deepStrictEqual(dependentsOfOp(REQ, 't2v_ms'), []);

    // deriveInstalledOps: extend's own dep present but i2v missing → extend NOT installed.
    const noI2V = deriveInstalledOps(REQ, statusFrom(new Set(['cdep', 'extend-w'])));
    assert.ok(!noI2V.installedOps.includes('extend'),
        'extend cannot be installed without its required i2v_ms');
    // All present → extend installed.
    const all = deriveInstalledOps(REQ, statusFrom(new Set(['cdep', 'extend-w', 'i2v-w'])));
    assert.ok(all.installedOps.includes('extend') && all.installedOps.includes('i2v_ms'),
        'extend installed once i2v + own deps present');
}

// Engine-aware resolution (MPI-163): localDeps/remoteDeps add to the engine-correct
// set at resolution time; null engine = the union (shared-dep protection).
function testEngineResolution() {
    // Resolver adds the right engine's weights; shared deps always present.
    assert.deepStrictEqual(
        resolveDeps(SPLIT, null, null, 'local'),
        ['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo', 'tx-bf16'],
        'local = shared + localDeps, no remote weights');
    assert.deepStrictEqual(
        resolveDeps(SPLIT, null, null, 'remote'),
        ['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo', 'tx-gguf', 'ComfyUI-GGUF'],
        'remote = shared + remoteDeps (incl the Pod-only GGUF node), no bf16');
    // null engine = union (what cross-model shared-dep protection sees).
    assert.deepStrictEqual(
        resolveFullUniverse(SPLIT).sort(),
        ['ComfyUI-GGUF', 'ComfyUI-LTXVideo', 'shared-clip', 'shared-vae', 'tx-bf16', 'tx-gguf'].sort(),
        'null engine unions both engine sets');
    // A local install must never pull the remote weights and vice-versa.
    assert.ok(!resolveDeps(SPLIT, null, null, 'local').includes('tx-gguf'),
        'local install must not include the GGUF transformer');
    assert.ok(!resolveDeps(SPLIT, null, null, 'local').includes('ComfyUI-GGUF'),
        'local install must not include the Pod-only GGUF node');
    assert.ok(!resolveDeps(SPLIT, null, null, 'remote').includes('tx-bf16'),
        'remote install must not include the bf16 transformer');

    // deriveInstalledOps is engine-correct: a Pod with only the GGUF transformer
    // reads INSTALLED (the bug — it used to demand the absent bf16); a local box
    // with only bf16 reads installed; the WRONG engine's weight does NOT satisfy.
    const podStatus = statusFrom(new Set(['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo', 'tx-gguf', 'ComfyUI-GGUF']));
    const localStatus = statusFrom(new Set(['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo', 'tx-bf16']));
    assert.strictEqual(deriveInstalledOps(SPLIT, podStatus, 'remote').fullyInstalled, true,
        'Pod with GGUF transformer present is fully installed (the MPI-163 fix)');
    assert.strictEqual(deriveInstalledOps(SPLIT, localStatus, 'local').fullyInstalled, true,
        'local with bf16 present is fully installed');
    assert.strictEqual(deriveInstalledOps(SPLIT, podStatus, 'local').fullyInstalled, false,
        'GGUF-only volume is NOT a usable LOCAL install (bf16 absent)');
    assert.strictEqual(deriveInstalledOps(SPLIT, localStatus, 'remote').fullyInstalled, false,
        'bf16-only volume is NOT a usable REMOTE install (GGUF absent)');

    // Real registry (MPI-190): the LTX-2.3 engine split was REVERTED — bf16 runs
    // on BOTH engines, no GGUF weight or node. Both universes are identical.
    const { MODELS } = require('../js/data/modelConstants/models.js');
    const ltx = MODELS.find(m => m.id && m.id.startsWith('ltx'));
    if (ltx) {
        const local = resolveFullUniverse(ltx, null, 'local');
        const remote = resolveFullUniverse(ltx, null, 'remote');
        assert.ok(local.includes('ltx23-transformer-bf16') && !local.includes('ltx23-transformer-gguf'),
            'LTX local universe has bf16, not GGUF');
        assert.ok(remote.includes('ltx23-transformer-bf16') && !remote.includes('ltx23-transformer-gguf'),
            'LTX remote universe has bf16 too (split reverted), not GGUF');
        assert.ok(!local.includes('ComfyUI-GGUF') && !remote.includes('ComfyUI-GGUF'),
            'neither engine includes the retired Pod-only GGUF node');
    }
}

// MPI-165: workflow filename derivation — engine suffix + stage2 in the
// build-script order (..._stage2_gguf.json), driven by engines[engine].workflowSuffix.
function testWorkflowFileResolution() {
    assert.strictEqual(resolveWorkflowFile(SPLIT_ENGINES, 't2v_ms', 'local'), 'LTX_t2v.json');
    assert.strictEqual(resolveWorkflowFile(SPLIT_ENGINES, 't2v_ms', 'remote'), 'LTX_t2v_gguf.json');
    assert.strictEqual(resolveWorkflowFile(SPLIT_ENGINES, 't2v_ms', 'remote', { stage2: true }), 'LTX_t2v_stage2_gguf.json');
    assert.strictEqual(resolveWorkflowFile(SPLIT_ENGINES, 't2v_ms', 'local', { stage2: true }), 'LTX_t2v_stage2.json');
    // i2v sibling + unknown op + a model with no engines: block (no suffix anywhere).
    assert.strictEqual(resolveWorkflowFile(SPLIT_ENGINES, 'i2v_ms', 'remote'), 'LTX_i2v_gguf.json');
    assert.strictEqual(resolveWorkflowFile(SPLIT_ENGINES, 'nope', 'remote'), null);
    const noSplit = { id: 'ns', workflows: { t2v_ms: 'IMG_t2i.json' } };
    assert.strictEqual(resolveWorkflowFile(noSplit, 't2v_ms', 'remote'), 'IMG_t2i.json', 'no engines: block → no suffix');

    // Real LTX-2.3 registry entry (MPI-190): no engines: block → same bf16 file
    // on both engines, no _gguf suffix.
    const { MODELS } = require('../js/data/modelConstants/models.js');
    const ltx = MODELS.find(m => m.id && m.id.startsWith('ltx'));
    if (ltx) {
        assert.strictEqual(resolveWorkflowFile(ltx, 't2v_ms', 'local'), 'LTX_t2v.json');
        assert.strictEqual(resolveWorkflowFile(ltx, 't2v_ms', 'remote'), 'LTX_t2v.json');
        assert.strictEqual(resolveWorkflowFile(ltx, 't2v_ms', 'remote', { stage2: true }), 'LTX_t2v_stage2.json');
    }
}

// MPI-165 Phase B: the operation axis and engine axis are orthogonal and UNION.
// Asserts the exact four (op × engine) combinations from the plan's worked example.
function testOpAndEngineCompose() {
    const COMMON = ['vae', 'encoder'];
    const T2V = ['t2v-high', 't2v-low'];
    const I2V = ['i2v-high', 'i2v-low', 'ComfyUI-PainterI2Vadvanced'];

    // i2v + remote = common ∪ i2v (incl Painter) ∪ engine extraDep (pod-node).
    assert.deepStrictEqual(
        resolveDeps(OP_X_ENGINE, ['i2v_ms'], null, 'remote'),
        [...COMMON, ...I2V, 'some-pod-node'],
        'i2v×remote unions the OP-only Painter and the ENGINE-only pod-node');
    // t2v + remote = NO Painter (t2v), pod-node present.
    assert.deepStrictEqual(
        resolveDeps(OP_X_ENGINE, ['t2v_ms'], null, 'remote'),
        [...COMMON, ...T2V, 'some-pod-node'],
        't2v×remote has the pod-node but not the i2v-only Painter');
    // i2v + local = Painter present (op axis), NO pod-node (engine axis empty local).
    assert.deepStrictEqual(
        resolveDeps(OP_X_ENGINE, ['i2v_ms'], null, 'local'),
        [...COMMON, ...I2V],
        'i2v×local keeps Painter, drops the remote-only pod-node');
    // t2v + local = neither Painter nor pod-node.
    assert.deepStrictEqual(
        resolveDeps(OP_X_ENGINE, ['t2v_ms'], null, 'local'),
        [...COMMON, ...T2V],
        't2v×local has neither axis extra');

    // null engine = union of both engine sets (shared-dep protection), here just pod-node.
    assert.ok(resolveDeps(OP_X_ENGINE, ['i2v_ms'], null, null).includes('some-pod-node'),
        'null engine unions the pod-node for protection');

    // The one-call resolve(): deps + workflow + node subset compose in one shot.
    const isNode = id => id === 'ComfyUI-PainterI2Vadvanced' || id === 'some-pod-node';
    const r = resolve(OP_X_ENGINE, ['i2v_ms'], 'remote', { op: 'i2v_ms', isNode });
    assert.deepStrictEqual(r.depIds, [...COMMON, ...I2V, 'some-pod-node']);
    assert.strictEqual(r.workflowFile, null, 'no workflows: block on this fixture → null filename');
    assert.deepStrictEqual(r.nodeIds, ['ComfyUI-PainterI2Vadvanced', 'some-pod-node'],
        'nodeIds is the custom-node subset across BOTH axes');
    // resolve() on the engines: LTX yields a real workflow filename.
    const r2 = resolve(SPLIT_ENGINES, null, 'remote', { op: 't2v_ms', stage2: true });
    assert.strictEqual(r2.workflowFile, 'LTX_t2v_stage2_gguf.json');
    assert.strictEqual(r2.nodeIds, null, 'no isNode predicate → nodeIds null');
}

// MPI-200: the generic runtime-variant axis. A concrete token selects one option's
// deps + suffix; a missing token unions all options' deps (shared-dep protection)
// and adds NO suffix; a model with no variants: block is unaffected.
function testVariantAxis() {
    // Concrete token → that arch's single weight, that arch's suffix.
    assert.deepStrictEqual(
        resolveDeps(VARIANT, null, null, null, { arch: 'blackwell' }).filter(id => id.startsWith('tx-')),
        ['tx-mxfp8'], 'blackwell token → mxfp8 weight only');
    assert.deepStrictEqual(
        resolveDeps(VARIANT, null, null, null, { arch: 'modern' }).filter(id => id.startsWith('tx-')),
        ['tx-fp8'], 'modern token → fp8 weight only');

    // Missing token → UNION of every option's deps (shared-dep protection), no suffix.
    const union = resolveDeps(VARIANT, null, null, null, {}).filter(id => id.startsWith('tx-'));
    assert.deepStrictEqual(union.sort(), ['tx-fp8', 'tx-mxfp8'], 'no token → union of all arch weights');
    // resolveFullUniverse with no token = the protection universe (both weights).
    assert.ok(resolveFullUniverse(VARIANT).includes('tx-mxfp8'));
    assert.ok(resolveFullUniverse(VARIANT).includes('tx-fp8'));

    // Workflow filename: base → variant suffix → _stage2 (build-script order).
    assert.strictEqual(
        resolveWorkflowFile(VARIANT, 't2v_ms', null, { variantTokens: { arch: 'blackwell' } }),
        'LTX_t2v_mxfp8.json', 'variant suffix on stage-1');
    assert.strictEqual(
        resolveWorkflowFile(VARIANT, 't2v_ms', null, { stage2: true, variantTokens: { arch: 'modern' } }),
        'LTX_t2v_fp8_stage2.json', 'variant suffix BEFORE _stage2 — matches generate_ltx.py');
    // No token → no suffix (verbatim base).
    assert.strictEqual(
        resolveWorkflowFile(VARIANT, 't2v_ms', null, {}), 'LTX_t2v.json', 'no token → no variant suffix');

    // Status gate: balanced card only "installed" when THIS arch's weight is on disk.
    const withMx = statusFrom(new Set(['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo', 'tx-mxfp8']));
    assert.strictEqual(
        deriveInstalledOps(VARIANT, withMx, null, { arch: 'blackwell' }).fullyInstalled,
        true, 'blackwell installed when mxfp8 present');
    assert.strictEqual(
        deriveInstalledOps(VARIANT, withMx, null, { arch: 'modern' }).fullyInstalled,
        false, 'modern NOT installed — fp8 weight absent even though mxfp8 is on disk');

    // A model with no variants: block is entirely unaffected (no deps, no suffix).
    assert.deepStrictEqual(resolveDeps(FLAT, null, null, null, { arch: 'blackwell' }), resolveDeps(FLAT, null, null, null, {}),
        'no variants: block → variantTokens is a no-op on deps');
    assert.strictEqual(resolveWorkflowFile(SPLIT, 't2v_ms', 'local', { variantTokens: { arch: 'blackwell' } }),
        'LTX_t2v.json', 'no variants: block → variantTokens is a no-op on workflow file');

    // Compose with the ENGINE axis: variant suffix then _stage2 then engine suffix.
    const BOTH = { ...VARIANT, engines: { local: { extraDeps: ['loc'], workflowSuffix: '' }, remote: { extraDeps: ['rem'], workflowSuffix: '_remote' } } };
    assert.strictEqual(
        resolveWorkflowFile(BOTH, 't2v_ms', 'remote', { stage2: true, variantTokens: { arch: 'blackwell' } }),
        'LTX_t2v_mxfp8_stage2_remote.json', 'arch + stage2 + engine compose in order');
    const bothDeps = resolveDeps(BOTH, null, null, 'remote', { arch: 'modern' });
    assert.ok(bothDeps.includes('tx-fp8') && bothDeps.includes('rem') && !bothDeps.includes('loc'),
        'engine + variant deps union, engine-correct');
}

function testOtherArchDetect() {
    // Axis-token enumeration for the panel's "other arch" walk.
    assert.deepStrictEqual(variantAxisTokens(VARIANT, 'arch').sort(), ['blackwell', 'modern']);
    assert.deepStrictEqual(variantAxisTokens(FLAT, 'arch'), [], 'no variants block → no axis tokens');

    const base = ['shared-vae', 'shared-clip', 'ComfyUI-LTXVideo'];
    const on = set => statusFrom(new Set(set));

    // On a modern GPU with only the blackwell weight on disk → "installed for other
    // arch", offering the mxfp8 weight for reclaim.
    assert.deepStrictEqual(
        detectOtherArchInstall(VARIANT, 'modern', on([...base, 'tx-mxfp8'])),
        { otherArch: 'blackwell', unusedDepIds: ['tx-mxfp8'] },
        'modern GPU + blackwell weight on disk → other-arch install');

    // This GPU's weight IS present → not an other-arch case (even if the other is too).
    assert.strictEqual(
        detectOtherArchInstall(VARIANT, 'modern', on([...base, 'tx-fp8'])), null,
        'current-arch weight present → null');
    assert.strictEqual(
        detectOtherArchInstall(VARIANT, 'modern', on([...base, 'tx-fp8', 'tx-mxfp8'])), null,
        'both weights present → current arch wins → null');

    // No arch weight at all → genuinely uninstalled, not other-arch.
    assert.strictEqual(detectOtherArchInstall(VARIANT, 'modern', on(base)), null,
        'no arch weight on disk → null (bare uninstalled)');

    // Unknown current arch (null token) → cannot compare → null.
    assert.strictEqual(detectOtherArchInstall(VARIANT, null, on([...base, 'tx-mxfp8'])), null,
        'unknown current arch → null');

    // A non-variant model is never an other-arch case.
    assert.strictEqual(detectOtherArchInstall(FLAT, 'modern', on([])), null,
        'no arch axis → null');

    // Panel arch-toggle metadata (MPI-209): both tokens with labels; label falls
    // back to the token when the card omits it (the VARIANT fixture has none).
    assert.deepStrictEqual(
        archVariantOptions(VARIANT),
        [
            { token: 'blackwell', label: 'blackwell', size: null },
            { token: 'modern', label: 'modern', size: null },
        ],
        'arch options carry token+label(fallback)+size');
    assert.deepStrictEqual(archVariantOptions(FLAT), [], 'no arch axis → no options');
}

// ── Runner ──────────────────────────────────────────────────────────────────

const tests = {
    testCanonicalize,
    testShapeDetection,
    testFlatUnchanged,
    testWanResolution,
    testDedupeStable,
    testUnknownOpsAndDeps,
    testDeriveInstalledOps,
    testRequiresOps,
    testRealRegistryIntegrity,
    testEngineResolution,
    testWorkflowFileResolution,
    testOpAndEngineCompose,
    testVariantAxis,
    testOtherArchDetect,
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
    try {
        fn();
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`FAIL  ${name}\n      ${err.message}`);
    }
}

if (failed) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log(`\nAll ${Object.keys(tests).length} resolver contract tests passed.`);
