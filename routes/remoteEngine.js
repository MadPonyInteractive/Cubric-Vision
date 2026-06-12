/**
 * routes/remoteEngine.js — remote-engine orchestration (MPI-64).
 *
 * Sits above routes/runpodRemote.js. Responsibilities:
 *   - Fork bridge to the main process for the decrypted RunPod API key + wrapper token
 *     (the Express server is a forked child and cannot call safeStorage directly).
 *   - Wrapper-token generation per Pod (crypto.randomBytes).
 *   - Readiness polling that tolerates RunPod's stale-runtime-payload window after
 *     start/resume (does NOT trust the first runtime payload — OneTrainer finding).
 *
 * Secrets (API key, wrapper token) are never logged and never written to project
 * files. The key crosses the fork channel only on demand.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('./logger');
const { client, setApiKeyResolver } = require('./runpodRemote');

// --- fork bridge (child -> main request/response by id) ---------------------

const _pending = new Map();
let _bridgeReady = false;

function _initBridge() {
  if (_bridgeReady) return;
  if (typeof process.on === 'function') {
    process.on('message', (msg) => {
      if (!msg || !msg.type || !msg.id) return;
      const entry = _pending.get(msg.id);
      if (!entry) return;
      _pending.delete(msg.id);
      entry.resolve(msg);
    });
    _bridgeReady = true;
  }
}

function _ask(type, extra, timeoutMs = 5000) {
  _initBridge();
  return new Promise((resolve) => {
    if (typeof process.send !== 'function') return resolve(null);
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      _pending.delete(id);
      resolve(null);
    }, timeoutMs);
    _pending.set(id, {
      resolve: (m) => { clearTimeout(timer); resolve(m); },
    });
    process.send({ type, id, ...extra });
  });
}

async function getRunPodApiKey() {
  const m = await _ask('secrets:get-api-key-request', {});
  return m ? m.value : null;
}

async function getWrapperToken(podId) {
  const m = await _ask('secrets:get-wrapper-token-request', { podId });
  return m ? m.value : null;
}

async function setWrapperToken(token, podId) {
  await _ask('secrets:set-wrapper-token-request', { token, podId });
}

async function clearWrapperToken() {
  await _ask('secrets:clear-wrapper-token-request', {});
}

// Wire the key resolver into runpodRemote so its routes can attach the key.
setApiKeyResolver(getRunPodApiKey);

// --- wrapper token ----------------------------------------------------------

function generateWrapperToken() {
  return crypto.randomBytes(32).toString('hex');
}

// --- readiness polling (stale-payload tolerant) -----------------------------

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';

function proxyUrl(podId, port = 8889) {
  return `https://${podId}-${port}.proxy.runpod.net`;
}

/**
 * waitForWrapperReady(podId, { timeoutMs, intervalMs }) — polls the wrapper /health
 * through the RunPod proxy until { ready:true }, tolerating the stale-runtime window
 * (connection failures early on are expected). Returns { ready, health } or { ready:false }.
 */
async function waitForWrapperReady(podId, { timeoutMs = 240000, intervalMs = 5000 } = {}) {
  const url = `${proxyUrl(podId)}/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) {
        const health = await res.json();
        if (health && health.ready) return { ready: true, health };
      }
    } catch {
      // expected during cold start / stale-payload window
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ready: false };
}

// --- routes -----------------------------------------------------------------

// Remote engine status (key present? not the value).
router.get('/remote/status', async (req, res) => {
  try {
    const key = await getRunPodApiKey();
    res.json({ hasApiKey: !!key });
  } catch (err) {
    logger.error('runpod', 'remote status failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// Poll a Pod's wrapper readiness through the proxy.
router.get('/remote/pods/:id/ready', async (req, res) => {
  try {
    const out = await waitForWrapperReady(req.params.id, {
      timeoutMs: Number(req.query.timeoutMs) || 240000,
    });
    res.json(out);
  } catch (err) {
    logger.error('runpod', 'readiness poll failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = {
  router,
  getRunPodApiKey,
  getWrapperToken,
  setWrapperToken,
  clearWrapperToken,
  generateWrapperToken,
  waitForWrapperReady,
  proxyUrl,
};
