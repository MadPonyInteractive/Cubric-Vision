'use strict';

// MPI-276 Phase 8 — download:snapshot must preserve a client-owned QUEUED job.
// Run: node tests/snapshot-preserves-queued.test.cjs
//
// Bug: the snapshot handler wholesale-replaces state.downloadJobs with the
// backend's jobs, preserving only client jobs absent from the snapshot that are
// 'pending'/'downloading'. A 2nd+ install sits 'queued' in the serial chain with
// NO POST fired yet, so it is legitimately absent from the backend snapshot. The
// old filter dropped it → _firePost later found no job (`if (!job) return false`)
// and skipped the POST, while _inFlight still counted it → the queued install
// silently vanished and the tile reverted to Install. Repro observed live:
//   inFlight: 2, jobs: [['sdxl-realistic','downloading']]  ← queued ILL gone
//
// This is a faithful reduction of the snapshot merge in
// js/services/downloadService.js (the download:snapshot listener).

const assert = require('node:assert/strict');
const test = require('node:test');

// Reduction of the snapshot merge: backend `jobs` replace state wholesale; any
// client job ABSENT from the snapshot survives iff its status is one the backend
// hasn't caught up to yet. `preserved` mirrors the real filter's status set.
const PRESERVED = new Set(['pending', 'downloading', 'queued']);
function mergeSnapshot(clientJobs, snapshotJobs) {
    const snapshotIds = new Set(snapshotJobs.map(j => j.modelId));
    const kept = clientJobs.filter(j => PRESERVED.has(j.status) && !snapshotIds.has(j.modelId));
    return [...snapshotJobs, ...kept];
}

test('a client QUEUED job absent from the snapshot survives the merge', () => {
    const client = [
        { modelId: 'sdxl-realistic', status: 'downloading' },
        { modelId: 'ill-anime-beauty', status: 'queued' }, // waiting its turn, no POST yet
    ];
    // Backend snapshot only knows about the one that POSTed.
    const snapshot = [{ modelId: 'sdxl-realistic', status: 'downloading' }];
    const merged = mergeSnapshot(client, snapshot);
    const ids = merged.map(j => j.modelId).sort();
    assert.deepEqual(ids, ['ill-anime-beauty', 'sdxl-realistic'], 'queued job NOT dropped');
    const ill = merged.find(j => j.modelId === 'ill-anime-beauty');
    assert.equal(ill.status, 'queued', 'queued status preserved so _firePost still finds the job');
});

test('pending + downloading absent from snapshot still survive (regression guard)', () => {
    const client = [
        { modelId: 'a', status: 'pending' },
        { modelId: 'b', status: 'downloading' },
    ];
    const merged = mergeSnapshot(client, []);
    assert.deepEqual(merged.map(j => j.modelId).sort(), ['a', 'b']);
});

test('a client job PRESENT in the snapshot is taken from the snapshot, not duplicated', () => {
    const client = [{ modelId: 'a', status: 'queued' }];
    const snapshot = [{ modelId: 'a', status: 'downloading' }]; // backend caught up
    const merged = mergeSnapshot(client, snapshot);
    assert.equal(merged.length, 1, 'no duplicate');
    assert.equal(merged[0].status, 'downloading', 'snapshot wins once backend knows the job');
});

test('a TERMINAL client job absent from snapshot is NOT resurrected', () => {
    // complete/failed/cancelled must not survive — only in-progress statuses do.
    const client = [
        { modelId: 'done', status: 'complete' },
        { modelId: 'gone', status: 'cancelled' },
    ];
    const merged = mergeSnapshot(client, []);
    assert.equal(merged.length, 0, 'terminal client jobs are dropped by the snapshot');
});
