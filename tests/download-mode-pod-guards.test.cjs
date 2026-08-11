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
