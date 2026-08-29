'use strict';

/**
 * routes/connector.js — Vision's caller-side connector HTTP surface (MPI-5).
 *
 * The broker client lives in this (forked server.js) process. The renderer
 * reaches it over the existing localhost:3000 surface:
 *   GET  /connector/capabilities  -> { promptEnhance, generationSubmit }  (UI gating)
 *   POST /connector/enhance       -> the prompt.enhance response envelope
 *
 * The client is injected by server.js after the responder connects (mirrors
 * comfy's setAxios pattern). No broker / no Prompt => promptEnhance:false and
 * /connector/enhance returns a clean unavailable response — never a 500.
 *
 * MPI-546 adds the generation relay:
 *   POST /connector/generate        -> submit a generation, resolve on its outcome
 *   GET  /connector/jobs/stream     -> SSE, the renderer subscribes once at boot
 *   POST /connector/jobs/:id/result -> the renderer reports a job's outcome
 *
 * MPI-592 adds the one thing a submit could not express:
 *   POST /connector/open-project    -> make a project the open one, then generate
 * A submit runs in whatever project the app has open, so an agent that created a
 * project used to generate into the previous one and be told `ok: true`.
 *
 * MPI-658 adds `flowId` to the same submit. It is not a convenience: a Flow runs
 * with `model.id: null`, so `modelId` could never reach one and EVERY Flow was
 * unreachable from an agent — including both text-to-speech surfaces, which are
 * Flows and not models. It also carries `media: [{role, url}]`, staged by the
 * caller through place-preview-asset, which is what lets an agent supply the voice
 * sample Text to Speech requires.
 *
 * `POST /connector/generate` IS THE CONTRACT. Dispatch lives in the renderer
 * (`generationService` / `commandExecutor` import components and the DOM), so v1
 * relays the job there over SSE — but callers never see that. If dispatch is ever
 * extracted server-side, this route stays and its body swaps for a local call.
 *
 * That only holds while the relay stays DUMB: one job shape in, one result shape
 * out. Media staging, job status, cancellation and queue introspection belong in
 * the route, server-side, where they survive the swap. Grow the SSE protocol and
 * the throwaway becomes load-bearing.
 */

const express = require('express');
const router = express.Router();
const { randomUUID } = require('node:crypto');

const logger = require('./logger');
const { isPromptEnhanceAvailable, requestEnhance } = require('../services/connectorResponder');

let _client = null;
function setClient(client) { _client = client; }

// --- generation relay state ------------------------------------------------

/**
 * Subscribed renderer SSE responses, oldest first.
 *
 * A job goes to exactly ONE of them — the most recent — never to all. Broadcasting
 * looks harmless while a single window is open and is a live hazard the moment a
 * second renderer exists (a dev browser tab beside the Electron window, a reload
 * whose old stream has not closed yet): every subscriber would independently
 * dispatch the same job, so the user pays for N generations and sees one result,
 * because the first reply settles the caller and the rest are dropped.
 *
 * Most recent wins because that is the renderer the user is actually looking at —
 * a stale stream from a reloaded window would otherwise keep answering forever.
 */
const _jobSubscribers = new Set();

/** The renderer a job should go to: the newest live subscriber, or null. */
function _activeSubscriber() {
  let last = null;
  for (const client of _jobSubscribers) last = client; // Set preserves insertion order
  return last;
}
/** jobId -> { settle, timer } for generations awaiting a renderer result. */
const _pendingJobs = new Map();

// A generation queued behind others can legitimately run for a long time. This
// only bounds how long the HTTP caller waits — the generation itself carries on
// in the app, and its card still lands.
// ponytail: one flat ceiling, no per-op tuning. Split it per mediaType if a real
// video queue starts tripping it.
const JOB_TIMEOUT_MS = 30 * 60 * 1000;

function _settleJob(jobId, payload) {
  const pending = _pendingJobs.get(jobId);
  if (!pending) return false; // already settled, or timed out
  clearTimeout(pending.timer);
  _pendingJobs.delete(jobId);
  pending.settle(payload);
  return true;
}

/**
 * Push a job to the subscribed renderer and resolve with whatever it reports
 * back. Rejects nothing — an unreachable renderer, a timeout and a renderer-side
 * failure all resolve to a clean `{ ok: false, error }` envelope.
 */
function _dispatchToRenderer(capability, input) {
  if (!_jobSubscribers.size) {
    return Promise.resolve({
      ok: false,
      error: {
        code: 'APP_UNAVAILABLE',
        message: 'No Vision window is listening. Is the app open?',
      },
    });
  }

  const jobId = randomUUID();
  const frame = `event: job\ndata: ${JSON.stringify({ jobId, capability, input })}\n\n`;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      _pendingJobs.delete(jobId);
      resolve({
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: `No result within ${Math.round(JOB_TIMEOUT_MS / 60000)} minutes. The generation may still be running in the app.`,
        },
      });
    }, JOB_TIMEOUT_MS);
    // Don't hold the process open on a job nobody is waiting for.
    if (typeof timer.unref === 'function') timer.unref();

    _pendingJobs.set(jobId, { settle: resolve, timer });

    // Deliver to ONE renderer. A dead socket is dropped and the next-newest gets
    // it, so a window that closed without its close handler firing costs a retry
    // rather than the job.
    for (;;) {
      const client = _activeSubscriber();
      if (!client) {
        _settleJob(jobId, {
          ok: false,
          error: {
            code: 'APP_UNAVAILABLE',
            message: 'No Vision window is listening. Is the app open?',
          },
        });
        return;
      }
      try {
        client.write(frame);
        return;
      } catch {
        _jobSubscribers.delete(client);
      }
    }
  });
}

router.get('/connector/capabilities', async (_req, res) => {
  const promptEnhance = await isPromptEnhanceAvailable(_client);
  res.json({ promptEnhance, generationSubmit: _jobSubscribers.size > 0 });
});

/**
 * GET /connector/jobs/stream — the renderer's inbound command channel.
 *
 * Same SSE shape as /comfy/events/stream, but always-on: that stream is opened
 * per generation by commandExecutor, so it can never carry inbound commands.
 */
router.get('/connector/jobs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (res.flushHeaders) res.flushHeaders();

  _jobSubscribers.add(res);
  res.write('event: connected\ndata: {}\n\n');

  req.on('close', () => {
    _jobSubscribers.delete(res);
  });
});

/**
 * POST /connector/generate
 * Body, EITHER a model op:  { modelId, operation, positive, negative?, injectionParams? }
 *       OR a Flow (MPI-658): { flowId, fields?, media? }
 *
 * The two are not variants of one shape. A Flow has no model — it dispatches with
 * `model.id: null` — so `modelId` can never name one, and its controls are DECLARED
 * (`flowsRegistry` § fields) rather than free-form injection params. Sending both is
 * a caller error rather than a merge: whichever won would run something the caller
 * did not fully describe.
 *
 * `media` is `[{ role, url }]`, by reference. Bytes never come through here — the
 * caller stages its own file with `POST /project-media/:id/place-preview-asset`
 * (which accepts a plain absolute path) and passes back the url that returns.
 *
 * Resolves when the generation reaches a terminal state, so the caller gets the
 * output it asked for rather than a job id to poll. Runs in whatever project the
 * app currently has open.
 */
router.post('/connector/generate', async (req, res) => {
  const { modelId, operation, positive, negative, injectionParams, flowId, fields, media } = req.body || {};

  const _bad = (message) => res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message } });

  if (flowId && modelId) {
    return _bad('body.flowId and body.modelId are alternatives — send one, not both.');
  }
  if (!flowId && (!modelId || !operation)) {
    return _bad('body.flowId, or body.modelId and body.operation, are required.');
  }

  const input = flowId
    ? { flowId: String(flowId), fields: fields || {}, media: Array.isArray(media) ? media : [] }
    : {
      modelId: String(modelId),
      operation: String(operation),
      positive: positive || '',
      negative: negative || '',
      injectionParams: injectionParams || {},
    };

  const result = await _dispatchToRenderer('generation.submit', input);

  if (!result.ok) {
    logger.warn('system', `connector generate failed: ${result.error?.code} ${result.error?.message}`);
  }
  res.json(result);
});

/**
 * POST /connector/open-project — make a project the one the app has open, so the
 * next `/connector/generate` lands there.
 *
 * `folderPath` is the key, matching every other project route; ids are not
 * resolvable without a scan. `/list-projects` and `/create-project` both return
 * it ready to pass straight in.
 */
router.post('/connector/open-project', async (req, res) => {
  const { folderPath } = req.body || {};

  if (!folderPath) {
    return res.status(400).json({
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'body.folderPath is required.' },
    });
  }

  const result = await _dispatchToRenderer('project.open', { folderPath: String(folderPath) });

  if (!result.ok) {
    logger.warn('system', `connector open-project failed: ${result.error?.code} ${result.error?.message}`);
  }
  res.json(result);
});

/**
 * POST /connector/jobs/:id/result — the renderer reporting a job's outcome.
 * Unknown/late ids are a no-op (the caller already timed out), never an error.
 */
router.post('/connector/jobs/:id/result', (req, res) => {
  const settled = _settleJob(req.params.id, req.body || {});
  res.json({ received: settled });
});

router.post('/connector/enhance', async (req, res) => {
  if (!_client) {
    return res.json({
      ok: false,
      error: { code: 'APP_UNAVAILABLE', message: 'Connector broker not connected.' },
    });
  }
  try {
    const { prompt, negativePrompt, targetModelId, operation, injectionParams } = req.body || {};
    const resp = await requestEnhance(_client, {
      prompt: prompt || '',
      negativePrompt: negativePrompt || '',
      targetModelId,
      operation,
      injectionParams,
    });
    res.json(resp);
  } catch (err) {
    res.json({
      ok: false,
      error: { code: 'RUNTIME_ERROR', message: err && err.message ? err.message : 'Enhance failed.' },
    });
  }
});

module.exports = router;
module.exports.setClient = setClient;
