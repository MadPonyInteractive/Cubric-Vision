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

/** Subscribed renderer SSE responses. Normally exactly one (the app window). */
const _jobSubscribers = new Set();
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
    for (const client of _jobSubscribers) {
      try {
        client.write(frame);
      } catch {
        _jobSubscribers.delete(client); // dead socket — the close handler may not have fired yet
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
 * Body: { modelId, operation, positive, negative?, injectionParams? }
 *
 * Resolves when the generation reaches a terminal state, so the caller gets the
 * output it asked for rather than a job id to poll. Runs in whatever project the
 * app currently has open.
 */
router.post('/connector/generate', async (req, res) => {
  const { modelId, operation, positive, negative, injectionParams } = req.body || {};

  if (!modelId || !operation) {
    return res.status(400).json({
      ok: false,
      error: { code: 'BAD_REQUEST', message: 'body.modelId and body.operation are required.' },
    });
  }

  const result = await _dispatchToRenderer('generation.submit', {
    modelId: String(modelId),
    operation: String(operation),
    positive: positive || '',
    negative: negative || '',
    injectionParams: injectionParams || {},
  });

  if (!result.ok) {
    logger.warn('system', `connector generate failed: ${result.error?.code} ${result.error?.message}`);
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
