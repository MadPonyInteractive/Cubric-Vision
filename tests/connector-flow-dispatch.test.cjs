'use strict';

/**
 * Flow dispatch over the agent connector (MPI-658).
 *
 * Before this, `POST /connector/generate` required a `modelId` — and a Flow runs with
 * `model.id: null`, so no Flow was reachable from an agent at all. That included BOTH
 * text-to-speech surfaces, which are Flows and not models, so "generate speech" was
 * simply not expressible over the API however the caller spelled it.
 *
 * Two halves are pinned here, and each fails silently rather than loudly if it breaks:
 *
 *  - THE ROUTE takes `flowId` and relays a flow-shaped job. A regression sends the
 *    old model-shaped input, the renderer reports UNKNOWN_MODEL, and the caller reads
 *    that as "the model is not installed" when nothing was ever wrong with a model.
 *
 *  - THE FIELD RESOLUTION (`resolveFlowFieldValues`) turns a caller's values into the
 *    op payload. A mis-derived `Input_Is_Multilingual` routes the run down the other
 *    arm and returns audio, in the wrong language, with no error — the exact failure
 *    MPI-607 built `derived` to make unreachable, which the agent path would otherwise
 *    have re-opened.
 *
 * The dispatch handler itself (`js/shell/agentDispatch.js`) is renderer code and imports
 * the DOM, so it is not importable here; the resolution it delegates to is, which is why
 * it lives in `declaredFields.js` rather than inline.
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const express = require('express');

const connectorRoutes = require('../routes/connector');

const repo = p => path.join(__dirname, '..', p);
const esm = p => import('file://' + repo(p).replace(/\\/g, '/'));

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

/** Subscribe as the renderer and wait for the server's `connected` frame (see MPI-546). */
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
        return {
          event: /^event: (.+)$/m.exec(raw)?.[1],
          data: JSON.parse(/^data: (.+)$/m.exec(raw)?.[1] || 'null'),
        };
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('stream closed before a frame arrived');
      buffer += decoder.decode(value, { stream: true });
    }
  }

  assert.equal((await readFrame()).event, 'connected');
  return { readFrame, close: () => ac.abort() };
}

const postJson = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then(r => r.json().then(json => ({ status: r.status, json })));

// ── The route ───────────────────────────────────────────────────────────────

test('a flowId relays a flow-shaped job, media and fields intact', async () => {
  const { base, stop } = await startServer();
  const renderer = await fakeRenderer(base);
  try {
    const pending = postJson(`${base}/connector/generate`, {
      flowId: 'chatter-box',
      fields: { positive: 'Hello and welcome to Cubric Studio.' },
      media: [{ role: 'audio1', url: '/project-file?path=C%3A%2Fp%2FMedia%2F.preview-assets%2Fab.wav' }],
    });

    const frame = await renderer.readFrame();
    assert.equal(frame.data.capability, 'generation.submit');
    assert.deepEqual(frame.data.input, {
      flowId: 'chatter-box',
      fields: { positive: 'Hello and welcome to Cubric Studio.' },
      media: [{ role: 'audio1', url: '/project-file?path=C%3A%2Fp%2FMedia%2F.preview-assets%2Fab.wav' }],
    }, 'no modelId/operation is invented for a flow — a Flow has no model');

    await postJson(`${base}/connector/jobs/${frame.data.jobId}/result`, {
      ok: true, output: { itemId: 'item-1', type: 'audio', filePath: 'C:/p/Media/flowChatterBox_001.flac' },
    });
    const { json } = await pending;
    assert.equal(json.ok, true);
    assert.equal(json.output.type, 'audio');
  } finally {
    renderer.close();
    await stop();
  }
});

test('flowId and modelId are alternatives, not a merge', async () => {
  const { base, stop } = await startServer();
  const renderer = await fakeRenderer(base);
  try {
    // Whichever won would run something the caller did not fully describe, and the
    // response would still say ok:true — so this has to be refused, not resolved.
    const both = await postJson(`${base}/connector/generate`, {
      flowId: 'chatter-box', modelId: 'krea2', operation: 't2i',
    });
    assert.equal(both.status, 400);
    assert.equal(both.json.error.code, 'BAD_REQUEST');

    const neither = await postJson(`${base}/connector/generate`, { positive: 'hi' });
    assert.equal(neither.status, 400);
  } finally {
    renderer.close();
    await stop();
  }
});

test('a flow needs no operation — the descriptor owns it', async () => {
  // `operation` is required alongside `modelId` and must NOT become required for a
  // flow: the FlowDef already names its op, and asking the caller for it invites a
  // mismatch nothing would catch.
  const { base, stop } = await startServer();
  const renderer = await fakeRenderer(base);
  try {
    const pending = postJson(`${base}/connector/generate`, { flowId: 'drama-box' });
    const frame = await renderer.readFrame();
    assert.equal(frame.data.input.flowId, 'drama-box');
    assert.deepEqual(frame.data.input.media, []);
    await postJson(`${base}/connector/jobs/${frame.data.jobId}/result`, { ok: true, output: {} });
    assert.equal((await pending).json.ok, true);
  } finally {
    renderer.close();
    await stop();
  }
});

// ── The field resolution ────────────────────────────────────────────────────

async function flow(id) {
  const mod = await esm('js/data/flowsRegistry.js');
  const f = (mod.FLOWS || mod.default).find(x => x.id === id);
  assert.ok(f, `${id} FlowDef must exist`);
  return f;
}

const fields = () => esm('js/utils/declaredFields.js');

test('declared defaults fill in for every field the caller omits', async () => {
  const { resolveFlowFieldValues } = await fields();
  // DramaBox's `Input_Duration` is the case that matters: the node's own default is
  // 0, which means "estimate from the prompt" — and that estimator makes the model
  // read the prompt aloud (MPI-607). The declared default is what keeps an agent
  // that sends only a line off that path.
  const { inputs, injectionParams } = resolveFlowFieldValues(await flow('drama-box'), {
    positive: 'A British woman says, "Hello."',
  });
  assert.equal(inputs.positive, 'A British woman says, "Hello."');
  assert.ok(injectionParams.Input_Duration >= 4, 'the measured floor, never 0');
});

test('the multilingual arm follows the language the CALLER picked', async () => {
  const { resolveFlowFieldValues } = await fields();
  const cb = await flow('chatter-box');

  const english = resolveFlowFieldValues(cb, { positive: 'hi' });
  assert.equal(english.injectionParams.Input_Is_Multilingual, false,
    'the default language must resolve to the English arm');

  // Derived is computed AFTER the override. Compute it before and this comes back
  // false, the run takes the English arm, and the caller gets English audio for a
  // Japanese request — with ok:true and nothing to explain it.
  const japanese = resolveFlowFieldValues(cb, { positive: 'hi', 'Input_Language.language': 'Japanese (ja)' });
  assert.equal(japanese.injectionParams['Input_Language.language'], 'Japanese (ja)');
  assert.equal(japanese.injectionParams.Input_Is_Multilingual, true);
});

test('an undeclared field is reported, never silently dropped', async () => {
  const { resolveFlowFieldValues } = await fields();
  // A typo on a paid generation must come back as an error rather than a run on the
  // default that looks like it worked.
  const { unknown } = resolveFlowFieldValues(await flow('drama-box'), {
    positive: 'hi', Input_Seconds: 12,
  });
  assert.deepEqual(unknown, ['Input_Seconds']);
});

test('step-level fields are collected, not just flow-level ones', async () => {
  const { flowDeclaredFields } = await fields();
  // A stepped flow declares controls inside `steps[].fields`, and they reach the op
  // exactly as flow-level ones do. Walking only `flow.fields` would run a stepped
  // flow on baked defaults and report success.
  const stepped = await flow('ltx-extend');
  const ids = flowDeclaredFields(stepped).map(f => f.id);
  const stepIds = (stepped.steps || []).flatMap(s => (s.fields || []).map(f => f.id));
  assert.ok(stepIds.length, 'ltx-extend must still declare step-level fields');
  stepIds.forEach(id => assert.ok(ids.includes(id), `step field "${id}" must be collected`));
});

test('a button never reaches the op as a value', async () => {
  const { flowDeclaredFields, resolveFlowFieldValues } = await fields();
  // A click is an ACTION. The flow frame strips these at collect time; the agent
  // path has no click at all, so the same strip has to happen from the declaration.
  const fake = { fields: [
    { id: 'positive', type: 'text', default: '' },
    { id: 'enhance', type: 'button', label: 'Enhance' },
  ] };
  assert.deepEqual(flowDeclaredFields(fake).map(f => f.id), ['positive']);
  const { inputs, unknown } = resolveFlowFieldValues(fake, { enhance: true });
  assert.equal(inputs.enhance, undefined);
  assert.deepEqual(unknown, ['enhance']);
});
