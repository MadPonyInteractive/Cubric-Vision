'use strict';

/**
 * MPI-396 — uninstalling a model must clear its job from the install store.
 *
 * Found live: after uninstalling SDXL Realistic on a remote Pod the tile drew a full
 * 100% progress bar instead of Install, and Ctrl+R did NOT clear it.
 *
 * Three things compounded, and no single one of them is the whole bug:
 *   1. `pruneTerminal` cannot express "confirmed UNinstalled". Its DONE branch drops on
 *      `confirmedInstalled.has(modelId) || age >= DONE_TTL_MS`, and the reconciler builds
 *      `confirmedInstalled` from deps that ARE on disk — so an uninstalled model can only
 *      leave via the 120s belt.
 *   2. The belt never runs. `reconciler.start()`'s tick gates on `store.hasActiveJobs()`,
 *      which is true only for a NON-terminal job; post-uninstall everything is terminal,
 *      so the poll returns early forever.
 *   3. The REMOTE uninstall leg never even called `reconciler.reconcileOnce()` — the LOCAL
 *      leg does. An engine-split half-wire.
 *
 * Net: the stale `done` job was immortal, served by the status endpoint and every
 * snapshot, and main-process so a renderer reload re-hydrated it.
 *
 * The fix is `store.dropModel(modelId)` at BOTH uninstall legs. Tests 1-3 pin the store
 * contract; test 4 is the engine-split guard — the one that catches a future edit fixing
 * only one leg.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const {
    createInstallStore,
    MODEL_STATES,
    DONE_TTL_MS,
} = require('../routes/install/installStore.js');

const DL_ROUTE = path.join(__dirname, '..', 'routes', 'downloadManager.js');
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function makeStore() {
    let clock = 1000;
    const events = [];
    const store = createInstallStore({
        broadcast: (event, data) => events.push({ event, data }),
        logger: { info() {}, warn() {}, error() {} },
        now: () => clock,
    });
    const register = (modelId, engine = 'remote') => store.registerModelJob({
        modelId,
        engine,
        deps: [{ depId: `${modelId}.safetensors`, type: 'model', size: '6.9 GB', seedBytes: 6.9 * 1024 ** 3 }],
    });
    return { store, events, register, tick: (ms) => { clock += ms; } };
}

// Drive a job to DONE the way a real install does, without assuming the transition table.
function driveToDone(store, modelId) {
    for (const to of ['downloading', 'verifying', 'installing', 'done']) {
        if (store.modelJob(modelId).status === MODEL_STATES.DONE) break;
        store.transitionModel(modelId, to, 'test');
    }
    assert.equal(store.modelJob(modelId).status, MODEL_STATES.DONE, 'setup: job should be done');
}

test('dropModel removes a terminal job immediately — no wait for the DONE_TTL belt', () => {
    const { store, register } = makeStore();
    register('sdxl-realistic');
    driveToDone(store, 'sdxl-realistic');

    // Precondition: this is exactly what pruneTerminal CANNOT do. An uninstalled model is
    // never in confirmedInstalled, and no time has passed, so the belt has not opened.
    assert.deepEqual(store.pruneTerminal(new Set()), [],
        'pruneTerminal must not drop a fresh done job — if it does, this bug moved elsewhere');
    assert.ok(store.modelJob('sdxl-realistic'), 'still present after the prune attempt');

    const before = store.version();
    assert.equal(store.dropModel('sdxl-realistic'), true, 'dropModel reports the drop');
    assert.equal(store.modelJob('sdxl-realistic'), undefined, 'job is gone');
    assert.ok(store.version() > before, 'version bumped so the snapshot is seen as changed');
    assert.equal(store.snapshot().jobs.find(j => j.modelId === 'sdxl-realistic'), undefined,
        'and it is gone from the snapshot the FE replaces state.downloadJobs with');
});

test('dropModel also drops the deps no surviving job references, and spares shared ones', () => {
    const { store } = makeStore();
    const shared = { depId: 'vae.safetensors', type: 'model', size: '300 MB', seedBytes: 300 * 1024 ** 2 };
    store.registerModelJob({
        modelId: 'sdxl-realistic',
        engine: 'remote',
        deps: [{ depId: 'sdxl.safetensors', type: 'model', size: '6.9 GB', seedBytes: 6.9 * 1024 ** 3 }, shared],
    });
    store.registerModelJob({ modelId: 'sdxl-nsfw', engine: 'remote', deps: [shared] });
    driveToDone(store, 'sdxl-realistic');

    store.dropModel('sdxl-realistic');
    assert.equal(store.depJob('sdxl.safetensors'), undefined, 'exclusive dep dropped with its model');
    assert.ok(store.depJob('vae.safetensors'), 'dep another live job still references is KEPT');
});

test('dropModel refuses a live job — a mid-download uninstall is the in-flight guard\'s job', () => {
    const { store, register } = makeStore();
    register('klein-4b');
    store.transitionModel('klein-4b', 'downloading', 'test');

    const before = store.version();
    assert.equal(store.dropModel('klein-4b'), false, 'refuses to drop a non-terminal job');
    assert.ok(store.modelJob('klein-4b'), 'live job survives — its downloaders still own it');
    assert.equal(store.version(), before, 'no bump, so no spurious snapshot broadcast');

    assert.equal(store.dropModel('never-registered'), false, 'unknown model is a quiet false');
});

test('BOTH uninstall legs settle the store — remote returns early and cannot borrow the local one', async () => {
    const code = stripComments(await fs.readFile(DL_ROUTE, 'utf8'));

    // The remote leg is identified by its own broadcast (remote: true); the local leg by
    // the plain one. Both must be preceded by a dropModel settle.
    const drops = [...code.matchAll(/store\.dropModel\(modelId\)/g)].map(m => m.index);
    assert.equal(drops.length, 2,
        'expected exactly two store.dropModel settles — one per engine leg (MPI-396). '
        + `found ${drops.length}. A one-leg fix is a false done: the remote leg returns `
        + 'res.json() before ever reaching the local leg\'s reconcileOnce().');

    const remoteBroadcast = code.indexOf("_broadcast('download:uninstalled'");
    const localBroadcast = code.indexOf("_broadcast('download:uninstalled'", remoteBroadcast + 1);
    assert.ok(remoteBroadcast > -1 && localBroadcast > -1, 'expected both uninstall broadcasts');

    assert.ok(drops[0] < remoteBroadcast,
        'the remote leg must drop the store job BEFORE broadcasting download:uninstalled, '
        + 'so the FE never re-renders against a job for a model it was just told is gone');
    assert.ok(drops[1] > remoteBroadcast && drops[1] < localBroadcast,
        'the local leg must do the same, before its own broadcast');

    // The local leg's reconcileOnce() is NOT a substitute for the settle — pin that the
    // settle is not silently replaced by a reliance on it.
    assert.match(code, /store\.dropModel\(modelId\)\)\s*store\.broadcastSnapshot\(\)/,
        'a successful drop must broadcast the fresh snapshot — the FE only replaces '
        + 'state.downloadJobs on download:snapshot');
});

test('the DONE_TTL belt is still the backstop for a job nobody uninstalled', () => {
    const { store, register, tick } = makeStore();
    register('chroma-flash');
    driveToDone(store, 'chroma-flash');

    tick(DONE_TTL_MS + 1);
    assert.deepEqual(store.pruneTerminal(new Set()), ['chroma-flash'],
        'MPI-276 G10 belt must survive this change');
});
