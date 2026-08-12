'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { handleMemoryRelease, handleGenerationSubmit } = require('../services/connectorResponder');

function makeReq(deep) {
  return {
    schemaVersion: 1,
    requestId: 'req-mr-1',
    from: { appId: 'cubric.prompt' },
    to: { appId: 'cubric.vision' },
    capability: 'system.memory.release',
    input: { deep },
  };
}

test('handleMemoryRelease POSTs { deep } to /comfy/unload and returns a success envelope', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ success: true, deep: true }) };
  };

  const resp = await handleMemoryRelease(makeReq(true), {
    unloadUrl: 'http://127.0.0.1:3000/comfy/unload',
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/comfy/unload');
  assert.deepEqual(calls[0].body, { deep: true });

  assert.equal(resp.ok, true);
  assert.equal(resp.capability, 'system.memory.release');
  assert.equal(resp.from.appId, 'cubric.vision');
  assert.equal(resp.output.success, true);
  assert.equal(resp.output.deep, true);
  assert.equal(resp.requestId, 'req-mr-1');
});

test('handleMemoryRelease defaults deep to false', async () => {
  let sentBody = null;
  const fetchImpl = async (_url, init) => {
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ success: true }) };
  };
  await handleMemoryRelease(makeReq(undefined), { fetchImpl });
  assert.deepEqual(sentBody, { deep: false });
});

test('handleMemoryRelease returns a RUNTIME_ERROR envelope when unload fails', async () => {
  const fetchImpl = async () => {
    throw new Error('comfy down');
  };
  const resp = await handleMemoryRelease(makeReq(false), { fetchImpl });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'RUNTIME_ERROR');
  assert.match(resp.error.message, /comfy down/);
});

test('handleMemoryRelease reports ok:false when /comfy/unload says success:false', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ success: false, message: 'Not running' }),
  });
  const resp = await handleMemoryRelease(makeReq(false), { fetchImpl });
  assert.equal(resp.ok, false);
  assert.equal(resp.output.success, false);
  assert.equal(resp.output.message, 'Not running');
});

// --- generation.submit (MPI-546) -------------------------------------------
// The capability is a thin wrapper over POST /connector/generate — the route is
// the contract. These pin the wrapper to the route's envelope so the broker path
// and the plain-HTTP path cannot drift.

function makeGenReq(input) {
  return {
    schemaVersion: 1,
    requestId: 'req-gen-1',
    from: { appId: 'cubric.studio' },
    to: { appId: 'cubric.vision' },
    capability: 'generation.submit',
    input,
  };
}

test('handleGenerationSubmit POSTs the job to /connector/generate and passes the output through', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({ ok: true, output: { itemId: 'item-1', filePath: 'C:/out/a.png' } }),
    };
  };

  const resp = await handleGenerationSubmit(
    makeGenReq({ modelId: 'krea2', operation: 't2i', positive: 'a horse' }),
    { generateUrl: 'http://127.0.0.1:3000/connector/generate', fetchImpl },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/connector/generate');
  assert.deepEqual(calls[0].body, {
    modelId: 'krea2',
    operation: 't2i',
    positive: 'a horse',
    negative: '',
    injectionParams: {},
  });

  assert.equal(resp.ok, true);
  assert.equal(resp.capability, 'generation.submit');
  assert.equal(resp.from.appId, 'cubric.vision');
  assert.equal(resp.requestId, 'req-gen-1');
  assert.equal(resp.output.itemId, 'item-1');
  assert.equal(resp.error, undefined);
});

test('handleGenerationSubmit forwards the route error instead of inventing one', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ ok: false, error: { code: 'NO_PROJECT', message: 'No project is open in Vision. Open one first.' } }),
  });
  const resp = await handleGenerationSubmit(makeGenReq({ modelId: 'krea2', operation: 't2i' }), { fetchImpl });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'NO_PROJECT');
  assert.match(resp.error.message, /No project is open/);
  assert.equal(resp.output, undefined);
});

test('handleGenerationSubmit returns a RUNTIME_ERROR envelope when the route is unreachable', async () => {
  const fetchImpl = async () => {
    throw new Error('server down');
  };
  const resp = await handleGenerationSubmit(makeGenReq({ modelId: 'krea2', operation: 't2i' }), { fetchImpl });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, 'RUNTIME_ERROR');
  assert.match(resp.error.message, /server down/);
});
