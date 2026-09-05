'use strict';
/**
 * MPI-691 — a Pod container restart must not hang remote installs forever.
 *
 * A container OOM-restart does NOT make remote mode inactive: the Pod is still
 * there and the wrapper comes back healthy on the same URL. So the app's only
 * terminal path, `_failOutstandingRemoteDeps`, is gated on !isRemoteActive() and
 * never fires. `_onRemoteStreamClosed` reconciles (nothing finished), reconnects
 * successfully to a wrapper whose install registry died with the container, gets
 * no ticks, and 90s later the MPI-136 stall watchdog re-enters the same path.
 * Forever. Observed live 2026-09-04: 70+ minutes of "recovering" then silence —
 * frozen bar, no error, no Retry, on a 340GB matrix.
 *
 * `remoteActiveInstallIds()` (MPI-481, /wrapper/models/install/active) is the
 * wrapper's own registry of what is really running. Recovery must ask it, re-issue
 * what the wrapper disowns, and — when re-issuing keeps failing — reach a real
 * terminal state instead of going quiet.
 *
 * Same silence-reads-as-progress class as MPI-539, which fixed the
 * remote-INACTIVE case and left this one.
 */
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.CUBRIC_MODELS_ROOT = path.join(os.tmpdir(), 'mpi691-' + process.pid);
require('./helpers/sandbox-roots.cjs');

require('../routes/remotePodLifecycle').remoteVolumeFreeBytes = async () => null;

const remoteModels = require('../routes/remoteModels.js');
const dm = require('../routes/downloadManager.js');

const volume = new Set();          // dep ids present on the volume
let wrapperInstalls = new Set();   // what the WRAPPER says it is installing
let wrapperActiveThrows = false;   // wrapper unreachable / too old to answer
const installed = [];              // dep ids sent to /wrapper/models/install

remoteModels.isRemoteActive = () => true;   // the Pod is still there — that is the whole point
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

let n = 0;
const scenario = () => {
    const modelId = `mpi691-model-${++n}`;
    volume.clear();
    wrapperInstalls = new Set();
    wrapperActiveThrows = false;
    installed.length = 0;
    dm._remoteInstallQueue.length = 0;
    dm._remoteDepIds.clear();
    dm._teardownRemoteEventStreamIfIdle();   // clears the re-issue round counter
    const deps = [0, 1].map((i) => ({
        id: `${modelId}-dep-${i}`,
        type: 'checkpoints',
        filename: `checkpoints/${modelId}-dep-${i}.safetensors`,
        url: `https://x/${modelId}-dep-${i}`,
        size: '1GB',
    }));
    return { modelId, deps };
};

// The close path fires reconcile + recovery as a promise chain; let it settle.
const settle = () => new Promise((r) => setImmediate(() => setImmediate(r)));

test('a wrapper that disowns our installs gets them re-issued', async () => {
    const { modelId, deps } = scenario();
    await dm._startRemoteDownload(modelId, deps, makeRes());
    assert.deepEqual(installed, deps.map(d => d.id), 'both deps installed (under the cap)');

    // The container OOM-restarted. The wrapper is healthy again on the same URL,
    // but its in-memory install registry is empty.
    installed.length = 0;
    wrapperInstalls = new Set();
    dm._onRemoteStreamClosed('silent-stall');
    await settle();

    assert.deepEqual(installed.sort(), deps.map(d => d.id).sort(),
        'orphaned deps must be re-issued — aria2 resumes from the .part on the volume');
    assert.equal(dm._remoteDepIds.size, 2, 'and they are outstanding again');
});

test('a wrapper that IS working is left alone', async () => {
    const { modelId, deps } = scenario();
    await dm._startRemoteDownload(modelId, deps, makeRes());

    installed.length = 0;
    wrapperInstalls = new Set(deps.map(d => d.id));   // a plain SSE blip, not a restart
    dm._onRemoteStreamClosed('network');
    await settle();

    assert.deepEqual(installed, [], 'a live install must never be duplicated — the wrapper 409s it');
});

test('an unanswerable wrapper does not fabricate an orphan', async () => {
    // A failed QUESTION is not evidence. Fall back to the plain MPI-97 reconnect.
    const { modelId, deps } = scenario();
    await dm._startRemoteDownload(modelId, deps, makeRes());

    installed.length = 0;
    wrapperActiveThrows = true;
    dm._onRemoteStreamClosed('silent-stall');
    await settle();

    assert.deepEqual(installed, [], 'unknown in-flight state must not trigger a re-issue');
    assert.equal(dm._remoteDepIds.size, 2, 'nor settle the deps');
});

test('installs that will not restart reach a TERMINAL state, not silence', async () => {
    const { modelId, deps } = scenario();
    await dm._startRemoteDownload(modelId, deps, makeRes());

    // The wrapper accepts every install and then runs none of them — the pathological
    // case the 70-minute hang actually was. Recovery must give up and fail loudly.
    //
    // Driven through _recoverOrphanedRemoteInstalls directly rather than repeated
    // _onRemoteStreamClosed calls: in production consecutive rounds are separated by
    // the MPI-97 reconnect (whose pending timer short-circuits a second close) and
    // then the 90s stall watchdog, so back-to-back closes are not the real sequence
    // and would only ever exercise round 1.
    wrapperInstalls = new Set();
    for (let round = 0; round <= 3; round += 1) {
        await dm._recoverOrphanedRemoteInstalls();
    }

    assert.equal(dm._remoteDepIds.size, 0, 'nothing may stay outstanding forever');
    assert.equal(dm._remoteInstallQueue.length, 0);
    for (const dep of deps) {
        const depJob = dm._depJobs.get(dep.id);
        assert.equal(depJob.status, 'failed', `${dep.id} must be terminal`);
        assert.equal(depJob.toast, true, 'a toast, never the Report-on-GitHub dialog');
        assert.match(depJob.error, /disconnected before the install finished/);
    }
    assert.equal(dm._modelJobs.get(modelId).status, 'failed',
        'the MODEL job must fail too — a dep-level failure alone is invisible to the user (MPI-539)');
});
