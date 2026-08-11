'use strict';

// MPI-539 — a DOWNLOAD-MODE Pod (no GPU) is a download TARGET, never a generation
// engine.
//
// Live 2026-08-11: the user connected in download mode (gpu=__cpu__) to install models
// onto the volume while a local generation ran. The generation preflight treated the
// Pod as its engine, staged a 469MB LoRA onto its 3.7 GiB container (wrapper OOM-killed,
// exit 137), read the resulting not-ready as a dead Pod, and POSTed
// /remote/mode {active:false} — which disarmed the download manager's SSE reconnect and
// abandoned four in-flight installs. They stayed 'downloading' forever, so the Model
// Library painted a frozen Pod snapshot over a locally-installed model.
//
// Two pins, both against the REAL modules (not a mirrored copy of their logic):
//   1. getEngine() must hand back the local-pinned engine whenever a download-mode Pod
//      is connected. That one resolution is what keeps the whole remote preflight —
//      hot-store staging AND the remote-mode teardown — off a CPU box.
//   2. _failOutstandingRemoteDeps() must DRAIN the outstanding set. Abandoning it
//      silently is what made a dead install keep reporting live progress.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

process.env.CUBRIC_MODELS_ROOT = path.join(os.tmpdir(), 'mpi539-' + process.pid);

test('getEngine routes a download-mode Pod to the LOCAL engine', async () => {
    const { getEngine, localEngine, remoteEngine } =
        await import('../js/services/comfyController.js');
    const { remoteEngineClient } = await import('../js/services/remoteEngineClient.js');

    // No Pod: the historical resolution is untouched.
    remoteEngineClient._active = false;
    remoteEngineClient._noGpu = false;
    assert.equal(getEngine(false), remoteEngine, 'local mode must still take remoteEngine');
    assert.equal(getEngine(true), localEngine, 'forceLocal must still take localEngine');

    // GPU Pod connected: also untouched — this is the path that must keep working.
    remoteEngineClient._active = true;
    remoteEngineClient._noGpu = false;
    assert.equal(getEngine(false), remoteEngine, 'a GPU Pod must still take remoteEngine');
    assert.equal(getEngine(true), localEngine, 'forceLocal must still win on a GPU Pod');

    // DOWNLOAD-MODE Pod: local, regardless of forceLocal. This is the regression.
    remoteEngineClient._active = true;
    remoteEngineClient._noGpu = true;
    assert.equal(
        getEngine(false), localEngine,
        'REGRESSION: a download-mode Pod took remoteEngine — the remote preflight will '
        + 'stage weights onto a no-GPU box and tear down remote mode on the not-ready',
    );
    assert.equal(getEngine(true), localEngine);

    remoteEngineClient._active = false; // leave the singleton clean for other tests
    remoteEngineClient._noGpu = false;
});

test('isDownloadOnly is true ONLY for an active no-GPU Pod', async () => {
    const { remoteEngineClient } = await import('../js/services/remoteEngineClient.js');
    const truth = [
        [false, false, false],
        [false, true, false], // noGpu with no active Pod is not download mode
        [true, false, false],
        [true, true, true],
    ];
    for (const [active, noGpu, expected] of truth) {
        remoteEngineClient._active = active;
        remoteEngineClient._noGpu = noGpu;
        assert.equal(
            remoteEngineClient.isDownloadOnly(), expected,
            `isDownloadOnly({active:${active}, noGpu:${noGpu}}) must be ${expected}`,
        );
    }
    remoteEngineClient._active = false;
    remoteEngineClient._noGpu = false;
});

test('_failOutstandingRemoteDeps drains the outstanding set instead of abandoning it', () => {
    const dm = require('../routes/downloadManager.js');

    dm._remoteDepIds.add('mpi539-dep-a');
    dm._remoteDepIds.add('mpi539-dep-b');
    assert.equal(dm._remoteDepIds.size, 2);

    dm._failOutstandingRemoteDeps('unit-test');

    assert.equal(
        dm._remoteDepIds.size, 0,
        'REGRESSION: outstanding deps survived the abandon path — they will report live '
        + 'progress forever with no remote target left to advance them',
    );
});

test('the abandon path terminates the owning MODEL job, not just its deps', () => {
    // The half the first pin missed, and Fabio hit it a second time on 2026-08-11:
    // the Pod OOMed mid-install, the app fell back to local, and the Model Library
    // still showed "MiniMax H3 Reference · 56%" — Pod progress painted over a model
    // his LOCAL disk already had, with no way to clear it.
    //
    // Draining `_remoteDepIds` is not enough. The dep-level `download:failed` this
    // path broadcasts carries NO modelId, and the client deliberately drops those
    // (MPI-97, so a dep transient can't raise a second scary dialog). Only a
    // MODEL-level terminal reaches the card, and only _checkModelJobsComplete()
    // produces one — which every other terminal path calls and this one did not.
    const dm = require('../routes/downloadManager.js');

    const depJob = { id: 'mpi539-dep-c', modelId: 'mpi539-model', status: 'downloading' };
    dm._depJobs.set(depJob.id, depJob);
    dm._modelJobs.set('mpi539-model', {
        modelId: 'mpi539-model', status: 'downloading', progress: 0.56, deps: [depJob],
    });
    dm._remoteDepIds.add(depJob.id);

    dm._failOutstandingRemoteDeps('unit-test');

    assert.equal(depJob.status, 'failed', 'the dep itself must go terminal');
    assert.equal(
        depJob.toast, true,
        'REGRESSION: the abandon failure lost its toast verdict — a user stopping their '
        + 'own Pod raises the Report-on-GitHub dialog, which is how this defect ships as '
        + 'a stream of bogus issues',
    );
    assert.equal(
        dm._modelJobs.get('mpi539-model').status, 'failed',
        'REGRESSION: the model job stayed \'downloading\' after its deps were abandoned — '
        + 'the snapshot keeps serving its last Pod progress and the card is frozen at 56% '
        + 'over whatever the local disk actually holds',
    );

    dm._depJobs.delete(depJob.id);
    dm._modelJobs.delete('mpi539-model');
});

test('a queued install is dropped, never retargeted, when the engine changes', () => {
    // Fabio queued Boogu Image Edit behind MiniMax H3 Reference onto a download-only
    // Pod. The Pod OOMed, the app fell back to local, and the queued install had still
    // never fired its POST — so its turn would have landed on the LOCAL engine and put
    // 20.8GB on his own disk unasked. The engine is read when the POST lands, not when
    // Install is pressed, and a queued job carried no record of which one it meant.
    //
    // SOURCE-READ, not behavioural: js/services/downloadService.js cannot import in bare
    // Node — MpiButton.js imports an ABSOLUTE '/js/utils/icons.js', which resolves to
    // c:\js\utils\icons.js and throws. So this pins the guard's presence and, critically,
    // its POSITION: ahead of _firePost. A guard after the POST is not a guard.
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js/services/downloadService.js'), 'utf8');

    assert.match(src, /const queuedEngine = _installEngine\(\)/,
        'the install no longer records which engine it was queued for');

    const runAt = src.indexOf('const run = () => {');
    const postAt = src.indexOf('this._firePost(modelId, dependencies)', runAt);
    const guardAt = src.indexOf('_installEngine() !== queuedEngine', runAt);
    assert.ok(runAt > 0 && postAt > 0, 'the serial-install chain moved — re-anchor this test');
    assert.ok(
        guardAt > runAt && guardAt < postAt,
        'REGRESSION: the engine-change guard is gone or now sits AFTER the POST — a '
        + 'queued remote install will fire against whatever engine happens to be current',
    );
});
