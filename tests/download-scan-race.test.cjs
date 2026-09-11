'use strict';

// MPI-719 — `FileDownloader.cancel()` removes the partial and then its `.cubricdl` marker
// in two steps, and nothing locks a route's disk scan against it. Captured 2026-09-10:
// 102 ms after a cancel, two `/comfy/models/check` calls answered 500 with ENOENT — one
// stat on a weight, one on a marker — and each dropped a `syncModelInstalled` reconcile,
// so the Model Library kept showing whatever it showed before the cancel.
//
// The fix is reader-side, in the two shared primitives that walk that live tree. These
// cases pin BOTH halves of the contract: ENOENT means the entry is absent, and every other
// error code still propagates so a real I/O fault is still the 500 it should be.
// Run: node tests/download-scan-race.test.cjs

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('fs-extra');

const { findFileRecursive } = require('../routes/shared.js');
const { getPartialDownloadState, markDownloadInProgress } = require('../routes/downloadCompletion.js');

async function withTempDir(fn) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cubric-scan-race-'));
    try {
        await fn(dir);
    } finally {
        await fs.remove(dir);
    }
}

// Swap one fs-extra method for the duration of a call. Both readers take the SAME
// fs-extra instance this file requires, so this reaches them without a loader shim.
async function withStub(method, impl, fn) {
    const original = fs[method];
    fs[method] = impl;
    try {
        return await fn();
    } finally {
        fs[method] = original;
    }
}

function fsError(code) {
    const err = new Error(`${code}: stubbed`);
    err.code = code;
    return err;
}

// Case 1 — the walk survives a name that is gone by the time it is stat-ed, and keeps
// going: the vanished entry is ordered FIRST so a walk that dies on it never reaches the
// real file. This is the marker ENOENT from the capture.
async function testWalkSkipsVanishedEntry() {
    await withTempDir(async (dir) => {
        const nested = path.join(dir, 'vendor');
        const real = path.join(nested, 'model.safetensors');
        await fs.outputFile(real, 'weight-bytes');

        const realReaddir = fs.readdir;
        const ghost = 'a-cancelled.safetensors.cubricdl';
        await withStub('readdir', async (target, ...rest) => {
            const entries = await realReaddir(target, ...rest);
            // Only the nested dir gains the ghost, so the recursion is exercised too.
            return target === nested ? [ghost, ...entries] : entries;
        }, async () => {
            assert.equal(await findFileRecursive(dir, 'model.safetensors'), real,
                'a vanished readdir entry must be skipped, not end the walk');
        });

        // A root that does not exist at all is still "not found", never a throw — the
        // pathExists this replaced was load-bearing for remotePodState's extra folders.
        assert.equal(await findFileRecursive(path.join(dir, 'absent'), 'model.safetensors'), null);
    });
}

// Case 2 — a marked partial whose file cancel() already removed reads as not resumable
// rather than throwing. No stub: marker present + file absent IS the live shape, and the
// stat is now the existence check, so the real filesystem proves it. This is the weight
// ENOENT from the capture.
async function testPartialOfDeletedFileIsNotResumable() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'depth-control-lora.safetensors');
        await fs.writeFile(file, 'partial-bytes');
        await markDownloadInProgress(file, { depId: 'race-dep' });

        assert.equal((await getPartialDownloadState(file)).resumable, true);

        await fs.remove(file);            // cancel() step 1; the marker is still there
        const partial = await getPartialDownloadState(file);
        assert.equal(partial.resumable, false);
        assert.equal(partial.reason, 'missing-file');
    });
}

// Case 3 — the negative control that keeps this from being a blanket catch. A permission
// or I/O fault is NOT "absent": both readers must still throw it.
async function testNonEnoentStillThrows() {
    await withTempDir(async (dir) => {
        const file = path.join(dir, 'model.safetensors');
        await fs.outputFile(file, 'weight-bytes');
        await markDownloadInProgress(file, { depId: 'race-dep' });

        await withStub('stat', async () => { throw fsError('EPERM'); }, async () => {
            await assert.rejects(() => findFileRecursive(dir, 'model.safetensors'),
                (err) => err.code === 'EPERM', 'findFileRecursive must not swallow EPERM');
            await assert.rejects(() => getPartialDownloadState(file),
                (err) => err.code === 'EPERM', 'getPartialDownloadState must not swallow EPERM');
        });

        // Same for the directory read itself — EACCES on a root is a real fault.
        await withStub('readdir', async () => { throw fsError('EACCES'); }, async () => {
            await assert.rejects(() => findFileRecursive(dir, 'model.safetensors'),
                (err) => err.code === 'EACCES', 'findFileRecursive must not swallow EACCES');
        });
    });
}

(async () => {
    await testWalkSkipsVanishedEntry();
    console.log('  ok  a readdir entry that vanishes before its stat is skipped');
    await testPartialOfDeletedFileIsNotResumable();
    console.log('  ok  a marked partial whose file was cancelled reads not resumable');
    await testNonEnoentStillThrows();
    console.log('  ok  EPERM / EACCES still propagate out of both readers');
    console.log('\n3 passed');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
