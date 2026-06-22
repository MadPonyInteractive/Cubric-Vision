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

// ── Runner ──────────────────────────────────────────────────────────────────

const tests = {
    testCanonicalize,
    testShapeDetection,
    testFlatUnchanged,
    testWanResolution,
    testDedupeStable,
    testUnknownOpsAndDeps,
    testDeriveInstalledOps,
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
