'use strict';

// MPI-241 — the Model Library detail-footer button is picked from a small state
// snapshot. A fast ephemeral-pod install collapses download:started → download:complete
// before the async reSyncInstalledModels() flips model.installed, leaving a lingering
// 'complete' job in state.downloadJobs. The bug: that window computed NOT-active +
// NOT-installed → the Install button reappeared. Fix: (1) a lingering 'complete' job
// counts as "busy" so the card holds its Cancel/progress UI (no Install flash, no new
// label); (2) anyInstalled is checked BEFORE busy so Uninstall wins the instant re-sync
// lands, even though the terminal job still lingers in the queue.
//
// This mirrors the exact branch order in MpiModelManager.openDetail()'s footer.

const assert = require('node:assert/strict');
const test = require('node:test');

const ACTIVE = new Set(['downloading', 'paused', 'installing', 'queued']);

// Pure re-implementation of the footer decision (kept in lock-step with
// _modelState + the openDetail footer if/else chain: anyInstalled → busy → install).
function footerButton({ job, anyInstalled, draftDiffersFromInstalled }) {
  const downloadState = job ? job.status : 'idle';
  const isActiveDownload = ACTIVE.has(downloadState);
  const isBusy = isActiveDownload || (!!job && downloadState === 'complete');
  if (anyInstalled) return draftDiffersFromInstalled ? 'Update' : 'Uninstall';
  if (isBusy) return 'Cancel';
  return 'Install';
}

test('active download → Cancel', () => {
  assert.equal(footerButton({ job: { status: 'downloading' }, anyInstalled: false }), 'Cancel');
  assert.equal(footerButton({ job: { status: 'queued' }, anyInstalled: false }), 'Cancel');
});

test('ephemeral-pod race: complete job, install not yet re-synced → holds Cancel, NOT Install', () => {
  // The regression window: job done, model.installed still false.
  assert.equal(footerButton({ job: { status: 'complete' }, anyInstalled: false }), 'Cancel');
});

test('complete job STILL lingers but re-sync flipped installed → Uninstall (anyInstalled wins)', () => {
  // The stuck-Finishing bug: a lingering complete job must not keep Cancel up.
  assert.equal(footerButton({ job: { status: 'complete' }, anyInstalled: true, draftDiffersFromInstalled: false }), 'Uninstall');
});

test('after re-sync clears the job + flips installed → Uninstall', () => {
  assert.equal(footerButton({ job: undefined, anyInstalled: true, draftDiffersFromInstalled: false }), 'Uninstall');
});

test('draft differs from installed → Update', () => {
  assert.equal(footerButton({ job: undefined, anyInstalled: true, draftDiffersFromInstalled: true }), 'Update');
});

test('fresh not-installed model, no job → Install', () => {
  assert.equal(footerButton({ job: undefined, anyInstalled: false }), 'Install');
});

// ── The ROOT cause (MPI-241): SSE 'open' status-fetch clobbered a live client job ──
// start() calls _ensureSSE() + creates the 'downloading' job in the SAME tick. The SSE
// 'open' handler then fetches /comfy/downloads/status and used to OVERWRITE
// state.downloadJobs with the backend list — which, on the first install after a reload,
// contained only OLD complete jobs (the fresh install not yet registered backend-side).
// That wiped the just-created job → footer reverted Cancel → Install. Fix: merge — keep
// any ACTIVE client job the backend list doesn't yet include.

const ACTIVE_STATUSES = ['downloading', 'queued', 'paused', 'installing'];

// Pure re-implementation of the SSE-open merge (lock-step with downloadService 'open').
function mergeOnSseOpen(clientJobs, backendJobs) {
  const backendIds = new Set(backendJobs.map(j => j.modelId));
  const orphanedActive = clientJobs.filter(
    j => !backendIds.has(j.modelId) && ACTIVE_STATUSES.includes(j.status));
  return [...backendJobs, ...orphanedActive];
}

test('SSE open: fresh downloading job survives a backend list of only old complete jobs', () => {
  const client = [{ modelId: 'pony-mix', status: 'downloading' }];
  const backend = [
    { modelId: 'sdxl-realistic', status: 'complete' },
    { modelId: 'ill-anime', status: 'complete' },
  ];
  const merged = mergeOnSseOpen(client, backend);
  assert.ok(merged.find(j => j.modelId === 'pony-mix' && j.status === 'downloading'),
    'the live pony-mix download must survive the reconnect status-fetch');
  assert.equal(merged.length, 3);
});

test('SSE open: backend copy WINS for a shared id (no duplicate, no stale client status)', () => {
  const client = [{ modelId: 'pony-mix', status: 'downloading' }];
  const backend = [{ modelId: 'pony-mix', status: 'installing' }];
  const merged = mergeOnSseOpen(client, backend);
  assert.deepEqual(merged, [{ modelId: 'pony-mix', status: 'installing' }]);
});

test('SSE open: a terminal client job the backend dropped is NOT resurrected', () => {
  // Only ACTIVE client jobs are preserved; a stale complete/failed one is discarded.
  const client = [{ modelId: 'old', status: 'complete' }, { modelId: 'dead', status: 'failed' }];
  const backend = [{ modelId: 'sdxl', status: 'complete' }];
  assert.deepEqual(mergeOnSseOpen(client, backend), [{ modelId: 'sdxl', status: 'complete' }]);
});
