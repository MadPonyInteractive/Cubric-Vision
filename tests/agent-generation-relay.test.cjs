'use strict';

/**
 * The agent generation relay (MPI-546) — routes/connector.js.
 *
 * `POST /connector/generate` is the contract; the SSE hop to the renderer is the
 * disposable half. These tests drive the REAL router over a real socket with a
 * fake renderer, because the failure that matters is silent: a job that is never
 * delivered, or a result that never settles its caller, both look like a hung app
 * rather than a broken relay.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

const connectorRoutes = require('../routes/connector');

/** Boot the router on an ephemeral port; returns the base URL and a stop(). */
async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(connectorRoutes);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * A fake renderer: subscribes to the job stream and resolves once the server has
 * confirmed the subscription with its `connected` frame. Waiting for that frame
 * is load-bearing — POSTing /connector/generate before the server has registered
 * the subscriber races into a false APP_UNAVAILABLE.
 */
async function fakeRenderer(base) {
  const ac = new AbortController();
  const res = await fetch(`${base}/connector/jobs/stream`, { signal: ac.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function readFrame() {
    for (;;) {
      const idx = buffer.indexOf('\n\n');
      if (idx !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = /^event: (.+)$/m.exec(raw)?.[1];
        const data = /^data: (.+)$/m.exec(raw)?.[1];
        return { event, data: data ? JSON.parse(data) : null };
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream closed before a frame arrived');
      buffer += decoder.decode(value, { stream: true });
    }
  }

  const hello = await readFrame();
  assert.equal(hello.event, 'connected');

  return { readFrame, close: () => ac.abort() };
}

const postJson = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json().then((json) => ({ status: r.status, json })));

test('generate → job frame → result settles the waiting caller', async () => {
  const { base, stop } = await startServer();
  const renderer = await fakeRenderer(base);
  try {
    // Don't await yet — the route holds this open until the renderer reports back.
    const pending = postJson(`${base}/connector/generate`, {
      modelId: 'krea2',
      operation: 't2i',
      positive: 'a lone rider at dusk',
    });

    const frame = await renderer.readFrame();
    assert.equal(frame.event, 'job');
    assert.equal(frame.data.capability, 'generation.submit');
    assert.ok(frame.data.jobId, 'job carries an id to report against');
    assert.deepEqual(frame.data.input, {
      modelId: 'krea2',
      operation: 't2i',
      positive: 'a lone rider at dusk',
      negative: '',
      injectionParams: {},
    });

    const ack = await postJson(`${base}/connector/jobs/${frame.data.jobId}/result`, {
      ok: true,
      output: { itemId: 'item-9', filePath: 'C:/out/rider.png' },
    });
    assert.equal(ack.json.received, true, 'a live job id is settled, not dropped');

    const { json } = await pending;
    assert.equal(json.ok, true);
    assert.equal(json.output.itemId, 'item-9');
    assert.equal(json.output.filePath, 'C:/out/rider.png');
  } finally {
    renderer.close();
    await stop();
  }
});

test('an error result from the renderer reaches the caller intact', async () => {
  const { base, stop } = await startServer();
  const renderer = await fakeRenderer(base);
  try {
    const pending = postJson(`${base}/connector/generate`, { modelId: 'krea2', operation: 't2i' });
    const frame = await renderer.readFrame();
    await postJson(`${base}/connector/jobs/${frame.data.jobId}/result`, {
      ok: false,
      error: { code: 'NO_PROJECT', message: 'No project is open in Vision. Open one first.' },
    });
    const { json } = await pending;
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'NO_PROJECT');
  } finally {
    renderer.close();
    await stop();
  }
});

test('no subscribed renderer yields APP_UNAVAILABLE rather than hanging', async () => {
  const { base, stop } = await startServer();
  try {
    const { json } = await postJson(`${base}/connector/generate`, { modelId: 'krea2', operation: 't2i' });
    assert.equal(json.ok, false);
    assert.equal(json.error.code, 'APP_UNAVAILABLE');
  } finally {
    await stop();
  }
});

test('modelId and operation are required', async () => {
  const { base, stop } = await startServer();
  const renderer = await fakeRenderer(base);
  try {
    const missingOp = await postJson(`${base}/connector/generate`, { modelId: 'krea2' });
    assert.equal(missingOp.status, 400);
    assert.equal(missingOp.json.error.code, 'BAD_REQUEST');

    const missingModel = await postJson(`${base}/connector/generate`, { operation: 't2i' });
    assert.equal(missingModel.status, 400);
  } finally {
    renderer.close();
    await stop();
  }
});

test('a job goes to ONE renderer only — never broadcast', async () => {
  // Found in the MPI-546 live smoke: the relay wrote each frame to every
  // subscriber, so two renderers (a dev browser tab beside the Electron window)
  // both dispatched the same job. The user pays for two generations and sees one
  // result, because the first reply settles the caller and the rest are dropped.
  const { base, stop } = await startServer();
  const first = await fakeRenderer(base);
  const second = await fakeRenderer(base);
  try {
    const pending = postJson(`${base}/connector/generate`, { modelId: 'krea2', operation: 't2i' });

    // Newest subscriber wins — it is the renderer the user is looking at.
    const frame = await second.readFrame();
    assert.equal(frame.event, 'job');

    // The older one must see NOTHING. Race its next frame against a settled
    // timer: if the frame wins, the job was broadcast.
    const leaked = await Promise.race([
      first.readFrame().then(() => true),
      new Promise((r) => setTimeout(() => r(false), 250)),
    ]);
    assert.equal(leaked, false, 'the older renderer must not receive the job');

    await postJson(`${base}/connector/jobs/${frame.data.jobId}/result`, { ok: true, output: {} });
    assert.equal((await pending).json.ok, true);
  } finally {
    first.close();
    second.close();
    await stop();
  }
});

test('a result for an unknown job id is a no-op, never an error', async () => {
  const { base, stop } = await startServer();
  try {
    const { status, json } = await postJson(`${base}/connector/jobs/not-a-real-job/result`, { ok: true });
    assert.equal(status, 200);
    assert.equal(json.received, false);
  } finally {
    await stop();
  }
});

test('capabilities reports generationSubmit only while a renderer is subscribed', async () => {
  const { base, stop } = await startServer();
  try {
    const before = await fetch(`${base}/connector/capabilities`).then((r) => r.json());
    assert.equal(before.generationSubmit, false);

    const renderer = await fakeRenderer(base);
    const during = await fetch(`${base}/connector/capabilities`).then((r) => r.json());
    assert.equal(during.generationSubmit, true);
    renderer.close();
  } finally {
    await stop();
  }
});
