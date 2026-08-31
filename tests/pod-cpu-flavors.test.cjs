'use strict';

// MPI-667 — a CPU download-mode create must not die on ONE flavor going out of stock.
//
// Live 2026-08-31, EU-RO-1: Connect with "No GPU — download only" refused with RunPod's
// "There are no longer any instances available with the requested specifications", every
// attempt, because the spec pinned `cpuFlavorIds: ['cpu3c']` and nothing else. The
// byte-identical spec had created fine on 2026-07-29, so it was pure supply — and with a
// single flavor named, supply is a hard block on the whole download-mode feature.
//
// Pinned here against the REAL route module (client.createPod stubbed at the shared
// client singleton, so the spec under test is the one the route actually builds):
//   1. A refused CPU create walks every flavor in CPU_FLAVORS, cpu3c first.
//   2. It stops at the first flavor that creates — the later ones cost nothing.
//   3. A refused GPU create still makes exactly ONE attempt: out-of-stock there is the
//      shell's retry/DC-steering signal, and the card is the user's choice.

const test = require('node:test');
const assert = require('node:assert/strict');

const { client } = require('../routes/runpodRemote');
const { _createPodInternal, CPU_FLAVORS } = require('../routes/remotePodLifecycle');

const REFUSED = {
  ok: false,
  status: 500,
  json: { error: 'create pod: There are no longer any instances available with the requested specifications. Please refresh and try again.' },
};

// The pre-create orphan sweep and the volume-size lookup both hit the API; answer them
// empty so the test exercises the create path and nothing else.
client.listPods = async () => ({ ok: true, status: 200, json: [] });
client.listVolumes = async () => ({ ok: true, status: 200, json: [] });
client.deletePod = async () => ({ ok: true, status: 200, json: {} });

function record(answer) {
  const seen = [];
  client.createPod = async (_key, spec) => {
    seen.push(spec.cpuFlavorIds ? spec.cpuFlavorIds.slice() : null);
    return answer(seen.length);
  };
  return seen;
}

const CPU_ARGS = { gpuTypeId: '__cpu__', volumeId: 'vol1', datacenter: 'EU-RO-1', wait: false };

test('a refused CPU create walks every flavor, cheapest sized id first', async () => {
  assert.ok(CPU_FLAVORS.length > 1, 'CPU_FLAVORS must offer more than one flavor');
  // A RunPod CPU flavor id is `family-vcpu-ram`. A bare family resolves to no instance and
  // is refused in the same words as a stock-out, which is the whole bug — so the list must
  // LEAD with a sized id, and the cheapest one at that.
  assert.match(CPU_FLAVORS[0], /^cpu\d[a-z]-\d+-\d+$/, 'the first flavor must be a sized id, not a bare family');
  assert.equal(CPU_FLAVORS[0], 'cpu3c-2-4', 'cheapest first — 2 vCPU / 4 GB is ample for wrapper + aria2c');

  const seen = record(() => REFUSED);
  const out = await _createPodInternal('key', CPU_ARGS);

  assert.deepEqual(
    seen.map((f) => f[0]), CPU_FLAVORS,
    'REGRESSION: a stock-out on one CPU flavor blocked download mode instead of trying the rest',
  );
  assert.equal(out.ok, false, 'all flavors refused must still surface a failure');
});

test('the walk stops at the first flavor that creates', async () => {
  const seen = record((n) => (n === 2 ? { ok: true, status: 201, json: { id: 'pod-abc' } } : REFUSED));
  await _createPodInternal('key', CPU_ARGS);

  assert.deepEqual(
    seen.map((f) => f[0]), CPU_FLAVORS.slice(0, 2),
    'the retry must stop on the first success, not walk the whole list',
  );
});

test('a refused GPU create still makes exactly one attempt', async () => {
  let calls = 0;
  client.createPod = async () => { calls += 1; return REFUSED; };
  await _createPodInternal('key', {
    gpuTypeId: 'NVIDIA GeForce RTX 5090', volumeId: 'vol1', datacenter: 'EU-RO-1', wait: false,
  });
  assert.equal(calls, 1, 'the CPU flavor walk must not leak onto the GPU path');
});
