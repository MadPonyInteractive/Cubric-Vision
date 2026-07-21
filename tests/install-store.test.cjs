'use strict';

// Contract tests for routes/install/installStore.js (MPI-276 Phase 1, G7/G9/G10).
// Run: node tests/install-store.test.cjs

const assert = require('node:assert/strict');
const {
    createInstallStore,
    MODEL_STATES,
    DEP_STATES,
    DONE_TTL_MS,
    FAILED_TTL_MS,
} = require('../routes/install/installStore.js');

// ── Fake clock + capture harness ────────────────────────────────────────────────

function makeStore() {
    let clock = 1000;
    const events = [];
    const warnings = [];
    const store = createInstallStore({
        broadcast: (event, data) => events.push({ event, data }),
        logger: { info() {}, warn: (_c, m) => warnings.push(m), error() {} },
        now: () => clock,
    });
    return { store, events, warnings, tick: (ms) => { clock += ms; }, setClock: (v) => { clock = v; } };
}

function registerBasic(store, modelId = 'ill-anime', engine = 'local') {
    return store.registerModelJob({
        modelId,
        engine,
        deps: [
            { depId: 'base.safetensors', type: 'model', size: '6.9 GB', seedBytes: 6.9 * 1024 ** 3 },
            { depId: 'vae.safetensors', type: 'model', size: '300 MB', seedBytes: 300 * 1024 ** 2 },
        ],
    });
}

let passed = 0;
function test(name, fn) {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
}

// ── Registration ─────────────────────────────────────────────────────────────

test('registerModelJob creates model + dep jobs, queued', () => {
    const { store } = makeStore();
    const job = registerBasic(store);
    assert.equal(job.status, MODEL_STATES.QUEUED);
    assert.equal(job.deps.length, 2);
    assert.equal(store.modelJob('ill-anime').status, MODEL_STATES.QUEUED);
    assert.equal(store.depJob('base.safetensors').status, DEP_STATES.QUEUED);
    assert.equal(store.depJob('base.safetensors').modelId, 'ill-anime');
});

test('already-installed dep registers complete + credited at full size', () => {
    const { store } = makeStore();
    store.registerModelJob({
        modelId: 'm', engine: 'local',
        deps: [{ depId: 'd', type: 'model', size: '1 GB', seedBytes: 1024 ** 3, alreadyInstalled: true }],
    });
    const d = store.depJob('d');
    assert.equal(d.status, DEP_STATES.COMPLETE);
    assert.equal(d.downloadedBytes, 1024 ** 3);
    assert.equal(d.totalBytes, 1024 ** 3);
});

test('syncProgress mirrors model + dep bytes and bumps version (4c)', () => {
    const { store } = makeStore();
    registerBasic(store);
    const v0 = store.version();
    const ok = store.syncProgress('ill-anime', {
        progress: 0.5, totalBytes: 100, downloadedBytes: 50, speed: '10 MB/s',
        deps: [{ id: 'base.safetensors', downloadedBytes: 40, totalBytes: 80 }],
    });
    assert.equal(ok, true);
    const j = store.modelJob('ill-anime');
    assert.equal(j.progress, 0.5);
    assert.equal(j.downloadedBytes, 50);
    assert.equal(j.speed, '10 MB/s');
    assert.equal(store.depJob('base.safetensors').downloadedBytes, 40);
    assert.equal(store.depJob('base.safetensors').totalBytes, 80);
    assert.ok(store.version() > v0, 'version bumped so a snapshot broadcast carries fresh numbers');
    // reflected in snapshot
    assert.equal(store.snapshot().jobs.find(x => x.id === 'ill-anime').progress, 0.5);
});

test('syncProgress on an unknown model is a no-op returning false', () => {
    const { store } = makeStore();
    assert.equal(store.syncProgress('nope', { progress: 1 }), false);
});

test('installCustomNodes flag set when a node dep present', () => {
    const { store } = makeStore();
    const job = store.registerModelJob({
        modelId: 'm', engine: 'local',
        deps: [{ depId: 'n', type: 'custom_nodes', size: '15 MB' }],
    });
    assert.equal(job.installCustomNodes, true);
});

// ── Legal transitions (G7) ─────────────────────────────────────────────────────

test('model walks queued→downloading→verifying→installing→done', () => {
    const { store } = makeStore();
    registerBasic(store);
    for (const to of [MODEL_STATES.DOWNLOADING, MODEL_STATES.VERIFYING, MODEL_STATES.INSTALLING, MODEL_STATES.DONE]) {
        assert.equal(store.transitionModel('ill-anime', to, 'test'), true, `→ ${to}`);
        assert.equal(store.modelJob('ill-anime').status, to);
    }
});

test('model may skip forward queued→installing (nodes-only)', () => {
    const { store } = makeStore();
    store.registerModelJob({ modelId: 'm', engine: 'local', deps: [{ depId: 'n', type: 'custom_nodes' }] });
    assert.equal(store.transitionModel('m', MODEL_STATES.INSTALLING, 'nodes-only'), true);
});

test('dep walks queued→downloading→verifying→complete', () => {
    const { store } = makeStore();
    registerBasic(store);
    for (const to of [DEP_STATES.DOWNLOADING, DEP_STATES.VERIFYING, DEP_STATES.COMPLETE]) {
        assert.equal(store.transitionDep('base.safetensors', to, 'test'), true, `→ ${to}`);
    }
});

test('dep may skip queued→complete (already on disk mid-run)', () => {
    const { store } = makeStore();
    registerBasic(store);
    assert.equal(store.transitionDep('vae.safetensors', DEP_STATES.COMPLETE, 'on-disk'), true);
});

// ── Illegal transitions REJECTED (MPI-208 medicine) ──────────────────────────────

test('cancelled→done is illegal and rejected', () => {
    const { store, warnings } = makeStore();
    registerBasic(store);
    assert.equal(store.transitionModel('ill-anime', MODEL_STATES.CANCELLED, 'user'), true);
    const v = store.version();
    assert.equal(store.transitionModel('ill-anime', MODEL_STATES.DONE, 'illegal'), false);
    assert.equal(store.modelJob('ill-anime').status, MODEL_STATES.CANCELLED, 'stays cancelled');
    assert.equal(store.version(), v, 'rejected move does not bump version');
    assert.ok(warnings.some(w => /Illegal transition/.test(w)), 'logged');
});

test('done is terminal — no move out', () => {
    const { store } = makeStore();
    registerBasic(store);
    store.transitionModel('ill-anime', MODEL_STATES.DONE, 't');
    assert.equal(store.transitionModel('ill-anime', MODEL_STATES.DOWNLOADING, 'resurrect'), false);
});

test('dep complete is terminal — no resurrection', () => {
    const { store } = makeStore();
    registerBasic(store);
    store.transitionDep('base.safetensors', DEP_STATES.COMPLETE, 't');
    assert.equal(store.transitionDep('base.safetensors', DEP_STATES.DOWNLOADING, 'resurrect'), false);
});

test('backward move verifying→downloading rejected', () => {
    const { store } = makeStore();
    registerBasic(store);
    store.transitionModel('ill-anime', MODEL_STATES.VERIFYING, 't');
    assert.equal(store.transitionModel('ill-anime', MODEL_STATES.DOWNLOADING, 'back'), false);
});

test('transition on unknown job is a rejected no-op', () => {
    const { store } = makeStore();
    assert.equal(store.transitionModel('ghost', MODEL_STATES.DONE, 't'), false);
    assert.equal(store.transitionDep('ghost', DEP_STATES.COMPLETE, 't'), false);
});

// ── Version monotonicity (G9) ───────────────────────────────────────────────────

test('version bumps on every real mutation, not on no-ops', () => {
    const { store } = makeStore();
    const v0 = store.version();
    registerBasic(store);
    const v1 = store.version();
    assert.ok(v1 > v0, 'register bumps');
    store.transitionModel('ill-anime', MODEL_STATES.DOWNLOADING, 't');
    const v2 = store.version();
    assert.ok(v2 > v1, 'transition bumps');
    // idempotent same-state transition = no bump
    store.transitionModel('ill-anime', MODEL_STATES.DOWNLOADING, 't');
    assert.equal(store.version(), v2, 'same-state no bump');
});

test('snapshot version tracks store version and jobs shape', () => {
    const { store } = makeStore();
    registerBasic(store);
    const snap = store.snapshot();
    assert.equal(snap.version, store.version());
    assert.equal(snap.jobs.length, 1);
    assert.equal(snap.jobs[0].deps.length, 2);
    assert.ok('status' in snap.jobs[0]);
});

test('broadcastSnapshot emits download:snapshot', () => {
    const { store, events } = makeStore();
    registerBasic(store);
    store.broadcastSnapshot();
    const snaps = events.filter(e => e.event === 'download:snapshot');
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].data.version, store.version());
});

// ── hasActiveJobs / activeModelsForDep (refCount replacement, G5) ────────────────

test('hasActiveJobs true while non-terminal, false when all terminal', () => {
    const { store } = makeStore();
    registerBasic(store);
    assert.equal(store.hasActiveJobs(), true);
    store.transitionModel('ill-anime', MODEL_STATES.DONE, 't');
    assert.equal(store.hasActiveJobs(), false);
});

test('activeModelsForDep lists only live models owning the dep', () => {
    const { store } = makeStore();
    // two models share a dep
    store.registerModelJob({ modelId: 'A', engine: 'local', deps: [{ depId: 'shared', type: 'model', size: '1 GB' }] });
    store.registerModelJob({ modelId: 'B', engine: 'local', deps: [{ depId: 'shared', type: 'model', size: '1 GB' }] });
    assert.deepEqual(store.activeModelsForDep('shared').sort(), ['A', 'B']);
    store.transitionModel('A', MODEL_STATES.CANCELLED, 't');
    assert.deepEqual(store.activeModelsForDep('shared'), ['B'], 'terminal A drops out');
});

// ── Prune (G10) ────────────────────────────────────────────────────────────────

test('done job survives until resync confirms, then prunes', () => {
    const { store, setClock } = makeStore();
    registerBasic(store);
    setClock(1000);
    store.transitionModel('ill-anime', MODEL_STATES.DONE, 't');
    // no confirm, no TTL yet → survives
    assert.deepEqual(store.pruneTerminal(new Set()), []);
    assert.ok(store.modelJob('ill-anime'), 'still present (no-Install-flash, MPI-241)');
    // resync confirms → prunes
    assert.deepEqual(store.pruneTerminal(new Set(['ill-anime'])), ['ill-anime']);
    assert.equal(store.modelJob('ill-anime'), undefined);
});

test('done job prunes on DONE_TTL belt even without confirm', () => {
    const { store, setClock, tick } = makeStore();
    registerBasic(store);
    setClock(1000);
    store.transitionModel('ill-anime', MODEL_STATES.DONE, 't');
    tick(DONE_TTL_MS - 1);
    assert.deepEqual(store.pruneTerminal(new Set()), [], 'not yet');
    tick(2);
    assert.deepEqual(store.pruneTerminal(new Set()), ['ill-anime'], 'TTL belt fires');
});

test('failed job prunes on FAILED_TTL', () => {
    const { store, setClock, tick } = makeStore();
    registerBasic(store);
    setClock(1000);
    store.transitionModel('ill-anime', MODEL_STATES.FAILED, 't');
    tick(FAILED_TTL_MS - 1);
    assert.deepEqual(store.pruneTerminal(new Set()), []);
    tick(2);
    assert.deepEqual(store.pruneTerminal(new Set()), ['ill-anime']);
});

test('pruning a model drops orphan deps but keeps shared ones', () => {
    const { store, setClock } = makeStore();
    store.registerModelJob({ modelId: 'A', engine: 'local', deps: [
        { depId: 'shared', type: 'model', size: '1 GB' },
        { depId: 'onlyA', type: 'model', size: '1 GB' },
    ] });
    store.registerModelJob({ modelId: 'B', engine: 'local', deps: [
        { depId: 'shared', type: 'model', size: '1 GB' },
    ] });
    setClock(1000);
    store.transitionModel('A', MODEL_STATES.DONE, 't');
    store.pruneTerminal(new Set(['A']));
    assert.equal(store.depJob('onlyA'), undefined, 'orphan dep gone');
    assert.ok(store.depJob('shared'), 'shared dep kept (B still owns it)');
});

test('non-terminal jobs are never pruned', () => {
    const { store, tick } = makeStore();
    registerBasic(store);
    store.transitionModel('ill-anime', MODEL_STATES.DOWNLOADING, 't');
    tick(DONE_TTL_MS * 10);
    assert.deepEqual(store.pruneTerminal(new Set(['ill-anime'])), [], 'active never pruned');
});

test('clear wipes everything and bumps version', () => {
    const { store } = makeStore();
    registerBasic(store);
    const v = store.version();
    store.clear();
    assert.equal(store.allModelJobs().length, 0);
    assert.equal(store.allDepJobs().length, 0);
    assert.ok(store.version() > v);
});

console.log(`\ninstall-store: ${passed} passed`);
