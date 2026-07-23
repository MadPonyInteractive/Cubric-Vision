'use strict';

// MPI-329 — _clampVolumeDisk(sizeGb): a network-volume GPU Pod mirrors its container
// disk to the volume size + a small scratch headroom, clamped to a sane band. Guards
// a garbage size (NaN → fallback) and a runaway bill on a huge volume (max clamp).

const assert = require('node:assert/strict');
const test = require('node:test');

const { _clampVolumeDisk } = require('../routes/remotePodLifecycle.js');

test('mirrors volume size + 5GB headroom in the normal range', () => {
  assert.equal(_clampVolumeDisk(150), 155);
  assert.equal(_clampVolumeDisk(300), 305);
});

test('clamps up to the 100GB floor for a tiny volume', () => {
  assert.equal(_clampVolumeDisk(50), 100);  // 55 → floored to 100
  assert.equal(_clampVolumeDisk(90), 100);  // 95 → floored to 100
});

test('clamps down to the 600GB ceiling for a huge volume', () => {
  assert.equal(_clampVolumeDisk(1000), 600);
});

test('garbage size → fallback (200GB)', () => {
  assert.equal(_clampVolumeDisk(NaN), 200);
  assert.equal(_clampVolumeDisk('not-a-number'), 200);
  assert.equal(_clampVolumeDisk(undefined), 200);
});
