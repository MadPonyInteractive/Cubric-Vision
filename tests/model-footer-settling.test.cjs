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

const ACTIVE = new Set(['pending', 'downloading', 'paused', 'installing', 'queued']);

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

test('optimistic pending click → Cancel (G2)', () => {
  // A 'pending' job (Starting…) counts as busy so the footer shows Cancel, not Install.
  assert.equal(footerButton({ job: { status: 'pending' }, anyInstalled: false }), 'Cancel');
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

// ── MPI-276 G9: the snapshot protocol REPLACED the SSE-open merge heuristic ──
// The old fix merged a live client job into the backend /status list to survive the
// reconnect race (start() created the job in the same tick the status-fetch raced
// ahead of backend registration). Register-before-respond (G8) kills that race
// structurally — the backend registers the job before /download/start returns — so
// the FE no longer merges: a download:snapshot REPLACES state.downloadJobs wholesale,
// version-gated. These tests pin the new snapshot-apply contract (lock-step with the
// download:snapshot listener in downloadService).

// Pure re-implementation of the snapshot-apply: store 'done' → FE 'complete',
// version-gate drops a stale snapshot, a client-only 'pending' job the backend has
// not registered yet is preserved. Returns { jobs, version } (version unchanged if
// the snapshot was stale).
function applySnapshot(clientJobs, snapshot, lastVersion) {
  if (typeof snapshot.version === 'number' && snapshot.version < lastVersion) {
    return { jobs: clientJobs, version: lastVersion }; // stale — dropped
  }
  const version = typeof snapshot.version === 'number' ? snapshot.version : lastVersion;
  const jobs = (snapshot.jobs || []).map(j => ({
    ...j,
    status: j.status === 'done' ? 'complete' : j.status,
  }));
  const ids = new Set(jobs.map(j => j.modelId));
  const clientPending = clientJobs.filter(j => j.status === 'pending' && !ids.has(j.modelId));
  return { jobs: [...jobs, ...clientPending], version };
}

test('snapshot REPLACES the client list wholesale (store done → complete)', () => {
  const client = [{ modelId: 'stale-ghost', status: 'downloading' }];
  const snap = { version: 5, jobs: [{ modelId: 'pony-mix', status: 'done' }] };
  const { jobs, version } = applySnapshot(client, snap, -1);
  assert.deepEqual(jobs, [{ modelId: 'pony-mix', status: 'complete' }]);
  assert.equal(version, 5); // phantom ghost gone, no merge
});

test('a stale snapshot (lower version than applied) is dropped', () => {
  const client = [{ modelId: 'pony-mix', status: 'installing' }];
  const snap = { version: 3, jobs: [{ modelId: 'pony-mix', status: 'downloading' }] };
  const { jobs, version } = applySnapshot(client, snap, 7);
  assert.deepEqual(jobs, client); // unchanged — snapshot ignored
  assert.equal(version, 7);
});

test('a client-only pending job the snapshot lacks is preserved (G2 optimistic click)', () => {
  const client = [{ modelId: 'just-clicked', status: 'pending' }];
  const snap = { version: 1, jobs: [{ modelId: 'other', status: 'downloading' }] };
  const { jobs } = applySnapshot(client, snap, -1);
  assert.ok(jobs.find(j => j.modelId === 'just-clicked' && j.status === 'pending'));
  assert.equal(jobs.length, 2);
});

test('a snapshot that now includes the formerly-pending job drops the client duplicate', () => {
  const client = [{ modelId: 'just-clicked', status: 'pending' }];
  const snap = { version: 2, jobs: [{ modelId: 'just-clicked', status: 'downloading' }] };
  const { jobs } = applySnapshot(client, snap, -1);
  assert.deepEqual(jobs, [{ modelId: 'just-clicked', status: 'downloading' }]);
});
