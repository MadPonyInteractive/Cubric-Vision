'use strict';

// MPI-237 — resolveDiskTotalBytes(pod, volumeList): pure denominator decision for
// the connected-Pod disk-usage bar. Volume pod → configured volume size; ephemeral
// pod (no networkVolumeId) → container-disk size; unknown → null (bar hides).

const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveDiskTotalBytes } = require('../routes/remotePodLifecycle.js');

test('volume pod → total = matched volume size (base-10 GB)', () => {
  const pod = { networkVolumeId: 'vol-abc', containerDiskInGb: 50 };
  const vols = [{ id: 'vol-xyz', size: 100 }, { id: 'vol-abc', size: 130 }];
  const out = resolveDiskTotalBytes(pod, vols);
  assert.deepEqual(out, { totalBytes: 130 * 1e9, ephemeral: false });
});

test('ephemeral pod (no volume) → total = container disk size', () => {
  const pod = { containerDiskInGb: 200 }; // no networkVolumeId
  const out = resolveDiskTotalBytes(pod, null);
  assert.deepEqual(out, { totalBytes: 200 * 1e9, ephemeral: true });
});

test('ephemeral is NOT read from the volume list even if one exists', () => {
  // A no-volume pod must use its own container disk, never a stray account volume.
  const pod = { containerDiskInGb: 60 };
  const vols = [{ id: 'vol-abc', size: 500 }];
  const out = resolveDiskTotalBytes(pod, vols);
  assert.deepEqual(out, { totalBytes: 60 * 1e9, ephemeral: true });
});

test('volume pod with no matching volume and multiple candidates → null', () => {
  const pod = { networkVolumeId: 'vol-missing' };
  const vols = [{ id: 'vol-a', size: 100 }, { id: 'vol-b', size: 130 }];
  assert.equal(resolveDiskTotalBytes(pod, vols), null);
});

test('volume pod, id absent but sole volume in account → fall back to it', () => {
  const pod = { networkVolumeId: 'vol-x' };
  const vols = [{ id: 'vol-only', size: 250 }];
  const out = resolveDiskTotalBytes(pod, vols);
  assert.deepEqual(out, { totalBytes: 250 * 1e9, ephemeral: false });
});

test('unknown totals → null (bar hides, never a lie)', () => {
  assert.equal(resolveDiskTotalBytes({ containerDiskInGb: 0 }, null), null, 'ephemeral zero disk');
  assert.equal(resolveDiskTotalBytes({}, null), null, 'ephemeral missing disk');
  assert.equal(resolveDiskTotalBytes({ networkVolumeId: 'v' }, []), null, 'volume, empty list');
  assert.equal(resolveDiskTotalBytes({ networkVolumeId: 'v' }, [{ id: 'v', size: 0 }]), null, 'volume size 0');
  assert.equal(resolveDiskTotalBytes(null, null), null, 'null pod');
});
