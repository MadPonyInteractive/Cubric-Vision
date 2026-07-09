'use strict';

// MPI-239 — _isPodDead(podStatus, connecting, absent): pure decision behind the
// /remote/comfy/status self-heal. When a CONNECTED Pod dies without a user
// Disconnect (ephemeral reaped host-side / warm evicted), the backend flips
// _mode.active=false so the hero footer, ws-token, and WS client all recover.
// Only a DEFINITE terminal/absent signal counts — never a transient blip or a
// still-booting Pod.

const assert = require('node:assert/strict');
const test = require('node:test');

const { _isPodDead } = require('../routes/remotePodLifecycle.js');

test('terminal status EXITED → dead', () => {
  assert.equal(_isPodDead('EXITED', false, false), true);
});

test('terminal status TERMINATED → dead', () => {
  assert.equal(_isPodDead('TERMINATED', false, false), true);
});

test('404-absent Pod → dead even with no status string', () => {
  assert.equal(_isPodDead(null, false, true), true);
});

test('RUNNING → NOT dead', () => {
  assert.equal(_isPodDead('RUNNING', false, false), false);
});

test('unknown/null status from a network throw → NOT dead (no false-positive on a blip)', () => {
  assert.equal(_isPodDead(null, false, false), false);
});

test('in-flight connect is never torn down, even if status looks terminal', () => {
  // A booting Pod can momentarily report EXITED / be absent — connecting wins.
  assert.equal(_isPodDead('EXITED', true, false), false);
  assert.equal(_isPodDead(null, true, true), false);
});
