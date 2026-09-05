'use strict';
/**
 * MPI-690 — the remote install fan-out must be capped.
 *
 * `_startRemoteDownload` used to POST /wrapper/models/install for EVERY dep of a
 * request in one loop, and each one spawns its own aria2c on the Pod. A normal
 * model (2-6 deps) never showed it. The 1.4.5 smoke matrix asked for 102 deps /
 * 340GB, put 17 concurrent downloads on the CPU download Pod, and the kernel
 * OOM-killed the container twice (`exit code 137 ... triggered memory limits`,
 * visible only in the RunPod *System* log). The LOCAL path has had a queue and
 * LOCAL_DOWNLOAD_CONCURRENCY = 3 for that reason; the remote twin never grew one.
 *
 * Bigger Pod alone is not the fix: unbounded fan-out just moves the ceiling.
 *
 * Runs the REAL _startRemoteDownload with every wrapper call stubbed — no Pod,
 * no network, no port, no local disk.
 */
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.CUBRIC_MODELS_ROOT = path.join(os.tmpdir(), 'mpi690-' + process.pid);
require('./helpers/sandbox-roots.cjs');

require('../routes/remotePodLifecycle').remoteVolumeFreeBytes = async () => null;

const remoteModels = require('../routes/remoteModels.js');
const dm = require('../routes/downloadManager.js');

const installed = [];              // dep ids sent to /wrapper/models/install, in order

remoteModels.remoteModelsCheck = async (models) => {
    const results = {};
    for (const m of models || []) {
        const deps = (m.deps || []).map(d => ({ id: d.id, installed: false }));
        results[m.id] = { deps, installed: false };
    }
    return { results };
};
remoteModels.remoteActiveInstallIds = async () => new Set(dm._remoteDepIds);
remoteModels.remoteInstallDep = async (dep) => {
    installed.push(dep.id);
    return { status: 'started', id: dep.id };
};
remoteModels.openInstallEventStream = () => ({ abort() {} });
remoteModels._isImageResident = () => false;

// Installing arms the stall watchdog (a 15s setInterval) and holds the SSE open.
// Disarm it the way production does: with nothing outstanding.
test.after(() => {
    dm._remoteInstallQueue.length = 0;
    dm._remoteDepIds.clear();
    dm._teardownRemoteEventStreamIfIdle();
});

const makeRes = () => {
    const r = { code: 200, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
};

const DEPS = (modelId, count) => Array.from({ length: count }, (_, i) => ({
    id: `${modelId}-dep-${i}`,
    type: 'checkpoints',
    filename: `checkpoints/${modelId}-dep-${i}.safetensors`,
    url: `https://x/${modelId}-dep-${i}`,
    size: '1GB',
}));

let n = 0;
const scenario = (depCount) => {
    const modelId = `mpi690-model-${++n}`;
    dm._remoteInstallQueue.length = 0;
    dm._remoteDepIds.clear();
    installed.length = 0;
    return { modelId, deps: DEPS(modelId, depCount) };
};

test('a 10-dep model issues at most 3 wrapper installs at once', async () => {
    const { modelId, deps } = scenario(10);
    await dm._startRemoteDownload(modelId, deps, makeRes());

    assert.equal(installed.length, 3, `expected 3 installs in flight, got ${installed.length}`);
    assert.equal(dm._remoteDepIds.size, 3, 'in-flight set must match the cap');
    assert.equal(dm._remoteInstallQueue.length, 7, 'the rest must wait in the queue');
    // The 17 concurrent aria2 processes that OOM-killed the Pod can no longer happen.
    assert.deepEqual(installed, deps.slice(0, 3).map(d => d.id), 'issued in request order');
});

test('a settled dep frees its slot and the next queued dep is issued', async () => {
    const { modelId, deps } = scenario(10);
    await dm._startRemoteDownload(modelId, deps, makeRes());
    assert.equal(installed.length, 3);

    // The wrapper finishes the first one. Whatever settles it, the slot must refill —
    // a queue that never drains is the same frozen bar as an install that never ticks.
    dm._remoteDepIds.delete(deps[0].id);
    dm._pumpRemoteInstalls();

    assert.equal(installed.length, 4, 'a freed slot must be refilled');
    assert.equal(installed[3], deps[3].id, 'refilled from the front of the queue');
    assert.equal(dm._remoteDepIds.size, 3, 'still exactly at the cap');
    assert.equal(dm._remoteInstallQueue.length, 6);
});

test('queued deps are not abandoned when the remote target goes away', async () => {
    // A queued dep has no wrapper install behind it, but leaving it queued is the
    // same MPI-539 failure: the model job stays 'downloading' over a target that is
    // gone, and the next pump would fire installs at a dead Pod.
    const { modelId, deps } = scenario(10);
    await dm._startRemoteDownload(modelId, deps, makeRes());
    assert.equal(dm._remoteInstallQueue.length, 7);

    dm._failOutstandingRemoteDeps('remote inactive');

    assert.equal(dm._remoteInstallQueue.length, 0, 'the queue must be drained, not stranded');
    assert.equal(dm._remoteDepIds.size, 0);
    for (const dep of deps) {
        assert.equal(dm._depJobs.get(dep.id).status, 'failed', `${dep.id} must reach a terminal state`);
    }
});

test('a model with fewer deps than the cap still installs them all at once', async () => {
    // The cap must not slow the ordinary case — a 2-dep model is the norm.
    const { modelId, deps } = scenario(2);
    await dm._startRemoteDownload(modelId, deps, makeRes());
    assert.equal(installed.length, 2);
    assert.equal(dm._remoteInstallQueue.length, 0);
});
