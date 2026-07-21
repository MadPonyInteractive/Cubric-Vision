'use strict';

const assert = require('assert');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
    getDownloadMarkerPath,
    isCompleteOnDisk,
    markDownloadInProgress,
    clearDownloadMarker,
    getPartialDownloadState,
} = require('../routes/downloadCompletion');
const { FileDownloader, _setModelStatus, _installStore } = require('../routes/downloadManager');

async function withTempDir(fn) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cubric-download-test-'));
    try {
        await fn(dir);
    } finally {
        await fs.remove(dir);
    }
}

async function testMarkerCompletionState() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'model.safetensors');
        await fs.writeFile(file, 'partial');

        assert.strictEqual(await isCompleteOnDisk(file), true);

        await markDownloadInProgress(file, { depId: 'test-dep' });
        assert.strictEqual(await fs.pathExists(getDownloadMarkerPath(file)), true);
        assert.strictEqual(await isCompleteOnDisk(file), false);

        const partial = await getPartialDownloadState(file);
        assert.strictEqual(partial.resumable, true);
        assert.strictEqual(partial.downloaded, 7);

        await clearDownloadMarker(file);
        assert.strictEqual(await isCompleteOnDisk(file), true);
    });
}

async function testDownloaderResumesMarkedPartial() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'partial.bin');
        await fs.writeFile(file, 'existing-bytes');
        await markDownloadInProgress(file, { depId: 'resume-dep' });

        const depJob = { id: 'resume-dep', url: 'https://example.invalid/file', downloadedBytes: 0 };
        const downloader = new FileDownloader(depJob, file);
        const calls = [];
        downloader._downloader = {
            start: () => calls.push({ method: 'start' }),
            resumeFromFile: (filePath, options) => {
                calls.push({ method: 'resumeFromFile', filePath, options });
                return Promise.resolve();
            },
        };

        await downloader.download();

        assert.deepStrictEqual(calls.map(call => call.method), ['resumeFromFile']);
        assert.strictEqual(calls[0].filePath, file);
        assert.strictEqual(calls[0].options.downloaded, 14);
        assert.strictEqual(calls[0].options.fileName, 'partial.bin');
        assert.strictEqual(depJob.downloadedBytes, 14);
    });
}

async function testDownloaderStartsWhenNoPartialExists() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'new.bin');
        const depJob = { id: 'new-dep', url: 'https://example.invalid/file', downloadedBytes: 0 };
        const downloader = new FileDownloader(depJob, file);
        const calls = [];
        downloader._downloader = {
            start: () => calls.push({ method: 'start' }),
            resumeFromFile: () => {
                calls.push({ method: 'resumeFromFile' });
                return Promise.resolve();
            },
        };

        await downloader.download();

        assert.deepStrictEqual(calls.map(call => call.method), ['start']);
        assert.strictEqual(await fs.pathExists(getDownloadMarkerPath(file)), true);
    });
}

async function testDownloaderDoesNotResumeUnmarkedExistingFile() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'existing.bin');
        await fs.writeFile(file, 'complete-or-unknown');
        const depJob = { id: 'existing-dep', url: 'https://example.invalid/file', downloadedBytes: 0 };
        const downloader = new FileDownloader(depJob, file);
        const calls = [];
        downloader._downloader = {
            start: () => calls.push({ method: 'start' }),
            resumeFromFile: () => {
                calls.push({ method: 'resumeFromFile' });
                return Promise.resolve();
            },
        };

        await downloader.download();

        assert.deepStrictEqual(calls.map(call => call.method), ['start']);
    });
}

async function testDownloaderCancelUsesStop() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'cancel.bin');
        const depJob = { id: 'cancel-dep', url: 'https://example.invalid/file', downloadedBytes: 0 };
        const downloader = new FileDownloader(depJob, file);
        const calls = [];
        downloader._downloader = {
            stop: () => {
                calls.push({ method: 'stop' });
                return Promise.resolve(true);
            },
            pause: () => {
                calls.push({ method: 'pause' });
                return Promise.resolve(true);
            },
        };

        await downloader.cancel();

        assert.deepStrictEqual(calls.map(call => call.method), ['stop']);
    });
}

// MPI-317 F5 — once the reconciler has settled the store job to a terminal state
// (disk truth on a resumed install), the legacy map's trailing status walk
// (downloading→installing→complete) must keep driving its work WITHOUT pushing
// writes into the settled store (each write was a rejected 'Illegal transition'
// warn). Guard: store-terminal → map write only, no store transition attempt.
async function testMapWalkDoesNotFightSettledStore() {
    const modelId = 'f5-test-model';
    _installStore.registerModelJob({
        modelId,
        engine: 'local',
        deps: [{ depId: 'f5-test-dep', type: 'model', seedBytes: 10 }],
    });
    const transitions = [];
    const realTransition = _installStore.transitionModel;
    _installStore.transitionModel = (id, to, reason) => {
        transitions.push({ id, to });
        return realTransition(id, to, reason);
    };
    try {
        // Walk the store to done (reconciler-settled analogue).
        realTransition(modelId, 'downloading', 'test');
        realTransition(modelId, 'done', 'test: reconciler settled');
        transitions.length = 0;

        // Trailing map walk on the settled job: map field updates, store untouched.
        const mapJob = { modelId, status: 'downloading' };
        _setModelStatus(mapJob, 'installing', 'uw installing');
        assert.strictEqual(mapJob.status, 'installing'); // map still drives its work
        _setModelStatus(mapJob, 'complete', 'uw done');
        assert.strictEqual(mapJob.status, 'complete');
        assert.deepStrictEqual(transitions, []); // no store write attempted
        assert.strictEqual(_installStore.modelJob(modelId).status, 'done');

        // Control: a NON-terminal store job still receives the write.
        const otherId = 'f5-test-model-2';
        _installStore.registerModelJob({
            modelId: otherId,
            engine: 'local',
            deps: [{ depId: 'f5-test-dep-2', type: 'model', seedBytes: 10 }],
        });
        _setModelStatus({ modelId: otherId, status: 'queued' }, 'downloading', 'test');
        assert.deepStrictEqual(transitions, [{ id: otherId, to: 'downloading' }]);
    } finally {
        _installStore.transitionModel = realTransition;
        _installStore.clear();
    }
}

(async () => {
    await testMarkerCompletionState();
    await testDownloaderResumesMarkedPartial();
    await testDownloaderStartsWhenNoPartialExists();
    await testDownloaderDoesNotResumeUnmarkedExistingFile();
    await testDownloaderCancelUsesStop();
    await testMapWalkDoesNotFightSettledStore();
    console.log('download-completion tests passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
