'use strict';
/**
 * MPI-481 — a dead remote install must not poison every later install.
 *
 * `_startRemoteDownload`'s shared-dep ATTACH guard (MPI-97) skips any dep it
 * believes is already in flight. Both of its in-flight signals — `_remoteDepIds`
 * and the dep job's 'downloading' — are module-level and scoped to ONE Pod
 * instance, and nothing settles them when that Pod dies, is deleted or
 * warm-cycles: the wrapper cannot emit a terminal event for an install that died
 * with its host. So every dep of the dead run stays 'downloading' forever, the
 * next Install ATTACHES to a corpse, NO /wrapper/models/install fires at all, and
 * the card sits on a stream with no producer until the app restarts. Found live
 * 2026-08-08 with 13 model jobs frozen from a previous session's dead Pod.
 *
 * MPI-100 fixed the identical staleness for the guard's third arm ('complete')
 * by cross-checking cached state against fresh wrapper truth. This is that same
 * fix for the in-flight arms, against `/wrapper/models/install/active`.
 *
 * Runs the REAL _startRemoteDownload with every wrapper call stubbed — no Pod,
 * no network, no port, no local disk.
 */
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.CUBRIC_MODELS_ROOT = path.join(os.tmpdir(), 'mpi481-' + process.pid);

// The remote disk-full pre-flight lazily requires this; unknown free space skips
// the gate, so answer null instead of reaching for a Pod's volume. Patch the real
// module (remoteProxy mounts a router off it, so it must not be replaced wholesale).
require('../routes/remotePodLifecycle').remoteVolumeFreeBytes = async () => null;

const remoteModels = require('../routes/remoteModels.js');
const dm = require('../routes/downloadManager.js');

// ── Fake Pod ─────────────────────────────────────────────────────────────────
const volume = new Set();          // dep ids present on the volume
let wrapperInstalls = new Set();   // dep ids the WRAPPER says it is installing
let wrapperActiveThrows = false;   // wrapper unreachable / too old to answer
const installed = [];              // dep ids sent to /wrapper/models/install

remoteModels.remoteModelsCheck = async (models) => {
    const results = {};
    for (const m of models || []) {
        const deps = (m.deps || []).map(d => ({ id: d.id, installed: volume.has(d.id) }));
        results[m.id] = { deps, installed: deps.every(d => d.installed) };
    }
    return { results };
};
remoteModels.remoteActiveInstallIds = async () => {
    if (wrapperActiveThrows) throw new Error('wrapper install/active 404');
    return new Set(wrapperInstalls);
};
remoteModels.remoteInstallDep = async (dep) => {
    installed.push(dep.id);
    return { status: 'started', id: dep.id };
};
remoteModels.openInstallEventStream = () => ({ abort() {} });
remoteModels._isImageResident = () => false;

// Installing arms the remote stall watchdog (a 15s setInterval) and holds the SSE
// stream open — real behaviour, but it outlives the assertions and would hang the
// runner. Disarm it the way production does: with nothing left in flight.
test.after(() => {
    dm._remoteDepIds.clear();
    dm._teardownRemoteEventStreamIfIdle();
});

const makeRes = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
};

// Each case gets its own model + dep ids so the module-level job maps can't leak
// between tests. An unknown model id passes _filterDepsForEngine through unchanged.
let n = 0;
const scenario = () => {
    const i = ++n;
    volume.clear();
    wrapperInstalls = new Set();
    wrapperActiveThrows = false;
    installed.length = 0;
    return { modelId: `mpi481-model-${i}`, depId: `mpi481-dep-${i}` };
};
const start = (modelId, depId) => dm._startRemoteDownload(
    modelId,
    [{ id: depId, type: 'checkpoints', filename: `checkpoints/${depId}.safetensors`, url: `https://x/${depId}`, size: '1GB' }],
    makeRes(),
);

test('a live install ATTACHES — the wrapper still owns it (MPI-97 must not regress)', async () => {
    const { modelId, depId } = scenario();
    await start(modelId, depId);
    assert.deepEqual(installed, [depId], 'first press installs');

    // The wrapper confirms it is genuinely still downloading.
    wrapperInstalls = new Set([depId]);
    installed.length = 0;
    await start(modelId, depId);
    assert.deepEqual(installed, [], 'a live shared install must be attached to, never re-fired');
    assert.equal(dm._remoteDepIds.has(depId), true, 'a live record must survive');
});

test('a corpse is re-installed — the Pod behind it is gone', async () => {
    const { modelId, depId } = scenario();
    await start(modelId, depId);
    assert.deepEqual(installed, [depId], 'first press installs');
    assert.equal(dm._remoteDepIds.has(depId), true, 'the dep is cached as in flight');

    // That Pod died and was replaced. Its wrapper is gone with it, so the new one
    // reports no such install — but the app's cache still says 'downloading'.
    wrapperInstalls = new Set();
    installed.length = 0;
    await start(modelId, depId);
    assert.deepEqual(installed, [depId], 'a dead install must be re-fired, not attached to');
});

test('a corpse that is already on the volume drops its in-flight record', async () => {
    // The leak the re-install case hides: nothing re-adds this dep, so a stale
    // _remoteDepIds entry would keep the stall watchdog polling and stop
    // _teardownRemoteEventStreamIfIdle ever closing the SSE, forever.
    const { modelId, depId } = scenario();
    await start(modelId, depId);
    assert.equal(dm._remoteDepIds.has(depId), true, 'the dep is cached as in flight');

    volume.add(depId);        // it actually landed before the Pod died
    wrapperInstalls = new Set();
    installed.length = 0;
    await start(modelId, depId);
    assert.deepEqual(installed, [], 'an installed dep needs no install');
    assert.equal(dm._remoteDepIds.has(depId), false, 'the stale record must be dropped');
});

test('an unanswerable wrapper keeps the old cache-trusting behaviour', async () => {
    // A duplicate install is worse than a delayed one: the wrapper 409s it
    // ("this model is already downloading") and the whole model fails with the
    // Download-Failed + Report-on-GitHub dialog MPI-97 removed. So when the
    // wrapper cannot be asked, attach exactly as before.
    const { modelId, depId } = scenario();
    await start(modelId, depId);
    assert.deepEqual(installed, [depId], 'first press installs');

    wrapperActiveThrows = true;
    installed.length = 0;
    await start(modelId, depId);
    assert.deepEqual(installed, [], 'unknown in-flight state must never fire a duplicate install');
});
