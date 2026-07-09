'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { handleMemoryRelease } = require('../services/connectorResponder');

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
