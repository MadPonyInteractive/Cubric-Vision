'use strict';

// Contract tests for routes/install/reconciler.js (MPI-276 Phase 3, G11).
// Run: node tests/install-reconciler.test.cjs

const assert = require('node:assert/strict');
const { createInstallStore } = require('../routes/install/installStore.js');
const { createReconciler, ORPHAN_MS } = require('../routes/install/reconciler.js');

// ── Harness ─────────────────────────────────────────────────────────────────────

function makeRig(installedTruth = new Map()) {
    let clock = 1000;
    const events = [];
    const store = createInstallStore({
        broadcast: (event, data) => events.push({ event, data }),
        logger: { info() {}, warn() {}, error() {} },
        now: () => clock,
    });
    // Mutable truth map the reconciler queries; tests flip entries then re-run.
    const truth = new Map(installedTruth);
    const rec = createReconciler({
        store,
        checkInstalled: async () => truth,
        now: () => clock,
        logger: { info() {}, warn() {}, error() {} },
    });
    return {
        store, rec, events, truth,
        tick: (ms) => { clock += ms; },
        now: () => clock,
        snapshots: () => events.filter(e => e.event === 'download:snapshot'),
    };
}

function register(store, modelId, deps, engine = 'local') {
    const job = store.registerModelJob({ modelId, engine, deps });
    store.transitionModel(modelId, 'downloading', 'test start');
    return job;
}

let passed = 0;
async function test(name, fn) {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
}

(async () => {
    // ── missed-terminal heal (MPI-254/255 shape) ─────────────────────────────────
    await test('all-bytes-in dep with missed terminal SSE settles to complete', async () => {
        const { store, rec } = makeRig();
        register(store, 'ill-anime', [
            { depId: 'base', type: 'model', totalBytes: 1000, downloadedBytes: 1000 },
        ]);
        store.transitionDep('base', 'downloading', 'test');
        // bytes all in but status stuck at downloading (lost models:install-complete)
        assert.equal(store.depJob('base').status, 'downloading');
        await rec.reconcileOnce();
        assert.equal(store.depJob('base').status, 'complete');
    });

    await test('truth-installed dep settles even without full byte count', async () => {
        const { store, rec, truth } = makeRig();
        // two deps; only 'weight' is truth-installed so the model does NOT fully
        // settle+prune, letting us observe the settled dep directly.
        register(store, 'm', [
            { depId: 'weight', type: 'model', totalBytes: 0, downloadedBytes: 0 },
            { depId: 'other', type: 'model', totalBytes: 500, downloadedBytes: 100 },
        ]);
        store.transitionDep('weight', 'downloading', 'test');
        store.transitionDep('other', 'downloading', 'test');
        truth.set('weight', true); // volume says it's there
        await rec.reconcileOnce();
        assert.equal(store.depJob('weight').status, 'complete');
        assert.equal(store.depJob('other').status, 'downloading'); // not settled
    });

    // ── model rolls to done when all weight deps complete ─────────────────────────
    await test('model settles to done once all non-node deps complete', async () => {
        const { store, rec } = makeRig();
        register(store, 'm', [
            { depId: 'a', type: 'model', totalBytes: 500, downloadedBytes: 500 },
            { depId: 'b', type: 'model', totalBytes: 500, downloadedBytes: 500 },
        ]);
        store.transitionDep('a', 'downloading', 't');
        store.transitionDep('b', 'downloading', 't');
        await rec.reconcileOnce();
        assert.equal(store.modelJob('m').status, 'done');
    });

    await test('model with a still-pending custom_node does NOT roll to done', async () => {
        const { store, rec } = makeRig();
        register(store, 'm', [
            { depId: 'w', type: 'model', totalBytes: 500, downloadedBytes: 500 },
            { depId: 'node', type: 'custom_nodes' },
        ]);
        store.transitionDep('w', 'downloading', 't');
        await rec.reconcileOnce();
        // weight settled, but node pending → model stays downloading (adapter owns nodes)
        assert.equal(store.depJob('w').status, 'complete');
        assert.equal(store.modelJob('m').status, 'downloading');
    });

    // ── orphan fail (research/01 §3-C live-evidence shape) ────────────────────────
    await test('orphan job with no activity and no disk truth fails after grace', async () => {
        const { store, rec, tick } = makeRig();
        const job = register(store, 'ghost', [{ depId: 'x', type: 'model', totalBytes: 1000, downloadedBytes: 0 }]);
        store.transitionDep('x', 'queued', 't'); // stuck queued, never any bytes
        job.registeredAt = 1000;                  // host stamps this at register
        tick(ORPHAN_MS + 1);
        await rec.reconcileOnce();
        assert.equal(store.modelJob('ghost').status, 'failed');
    });

    await test('fresh job within grace window is NOT failed', async () => {
        const { store, rec, tick } = makeRig();
        const job = register(store, 'fresh', [{ depId: 'x', type: 'model', totalBytes: 1000, downloadedBytes: 0 }]);
        job.registeredAt = 1000;
        tick(ORPHAN_MS - 5000); // still inside grace
        await rec.reconcileOnce();
        assert.equal(store.modelJob('fresh').status, 'downloading');
    });

    await test('job making byte progress is never failed even if stale-ish', async () => {
        const { store, rec, tick } = makeRig();
        const job = register(store, 'slow', [{ depId: 'x', type: 'model', totalBytes: 10_000, downloadedBytes: 200 }]);
        job.registeredAt = 1000;
        tick(ORPHAN_MS + 10_000);
        await rec.reconcileOnce();
        assert.equal(store.modelJob('slow').status, 'downloading'); // has progress → not orphan
    });

    // ── never resurrect terminal jobs (invariant #3) ─────────────────────────────
    await test('terminal (cancelled) job is never resurrected by reconcile', async () => {
        const { store, rec, truth } = makeRig();
        register(store, 'c', [{ depId: 'x', type: 'model', totalBytes: 100, downloadedBytes: 100 }]);
        store.transitionModel('c', 'cancelled', 'user');
        truth.set('x', true); // even if disk now shows it — do not un-cancel
        await rec.reconcileOnce();
        // model is terminal; either still cancelled or pruned, but NEVER done/downloading
        const j = store.modelJob('c');
        if (j) assert.equal(j.status, 'cancelled');
    });

    // ── prune on confirmed install ────────────────────────────────────────────────
    await test('done job with all deps installed-on-disk is pruned immediately', async () => {
        const { store, rec, truth } = makeRig();
        register(store, 'p', [{ depId: 'x', type: 'model', totalBytes: 100, downloadedBytes: 100 }]);
        truth.set('x', true);
        await rec.reconcileOnce();       // settles dep → model done → confirmed → pruned
        assert.equal(store.modelJob('p'), undefined);
    });

    // ── snapshot version strictly increases on mutation ──────────────────────────
    await test('snapshot broadcast fires and version increases when a pass mutates', async () => {
        const { store, rec, snapshots } = makeRig();
        register(store, 'v', [{ depId: 'x', type: 'model', totalBytes: 100, downloadedBytes: 100 }]);
        store.transitionDep('x', 'downloading', 't');
        const before = store.version();
        await rec.reconcileOnce();
        assert.ok(store.version() > before, 'version bumped');
        assert.ok(snapshots().length >= 1, 'snapshot broadcast');
    });

    await test('idle pass (no active jobs) does not broadcast', async () => {
        const { store, rec, snapshots } = makeRig();
        // no jobs registered
        const r = await rec.reconcileOnce();
        assert.deepEqual(r, { settled: [], failed: [], pruned: [] });
        assert.equal(snapshots().length, 0);
        void store;
    });

    await test('checkInstalled throwing skips the pass without mutating', async () => {
        let clock = 1000;
        const store = createInstallStore({ broadcast() {}, logger: { info() {}, warn() {}, error() {} }, now: () => clock });
        store.registerModelJob({ modelId: 'e', engine: 'local', deps: [{ depId: 'x', type: 'model', totalBytes: 100, downloadedBytes: 100 }] });
        store.transitionModel('e', 'downloading', 't');
        store.transitionDep('x', 'downloading', 't');
        const rec = createReconciler({
            store,
            checkInstalled: async () => { throw new Error('wrapper down'); },
            now: () => clock,
            logger: { info() {}, warn() {}, error() {} },
        });
        const before = store.version();
        const r = await rec.reconcileOnce();
        assert.deepEqual(r, { settled: [], failed: [], pruned: [] });
        assert.equal(store.version(), before); // no mutation
    });

    console.log(`\n${passed} passed`);
})().catch(err => { console.error(err); process.exit(1); });
