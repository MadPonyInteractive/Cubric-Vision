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
const { ResumableDownloader } = require('../routes/downloadManager');

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
        const downloader = new ResumableDownloader(depJob, file);
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
        const downloader = new ResumableDownloader(depJob, file);
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
        const downloader = new ResumableDownloader(depJob, file);
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
        const downloader = new ResumableDownloader(depJob, file);
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

(async () => {
    await testMarkerCompletionState();
    await testDownloaderResumesMarkedPartial();
    await testDownloaderStartsWhenNoPartialExists();
    await testDownloaderDoesNotResumeUnmarkedExistingFile();
    await testDownloaderCancelUsesStop();
    console.log('download-completion tests passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
