/**
 * routes/runpodRemote.js — RunPod REST + GraphQL client and HTTP routes.
 *
 * Backend client for the RunPod remote engine (MPI-64). Talks to:
 *   - REST  https://rest.runpod.io/v1     — Pod / network-volume / template CRUD
 *   - GraphQL https://api.runpod.io/graphql — GPU catalog + data-center availability
 *
 * The user's API key is NEVER stored here and NEVER logged. It is fetched on demand
 * from the main process via the fork bridge (see getRunPodApiKey in remoteEngine.js),
 * held only for the duration of a single call. The wrapper token is likewise secret.
 *
 * Routes exposed (all renderer -> Express; Express attaches the key server-side):
 *   GET  /runpod/account/validate     — does the stored key authenticate?
 *   GET  /runpod/gpu-availability      — datacenters + gpuTypes + stockStatus (picker)
 *   POST /runpod/pods                  — create a Pod
 *   POST /runpod/pods/:id/start        — start/resume
 *   POST /runpod/pods/:id/stop         — stop
 *   DELETE /runpod/pods/:id            — delete
 *   GET  /runpod/pods/:id              — status
 *   GET  /runpod/volumes               — list network volumes
 *   POST /runpod/volumes               — create network volume
 *   DELETE /runpod/volumes/:id         — delete network volume
 *   POST /runpod/templates             — create template
 */

'use strict';

const express = require('express');
const router = express.Router();
const logger = require('./logger');

const REST = 'https://rest.runpod.io/v1';
const GQL = 'https://api.runpod.io/graphql';

// Cloudflare fronts the RunPod proxy AND the API; default fetch UA can be blocked
// (HTTP 403 error 1010). Send a browser UA on all calls. (Verified MPI-64.)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';

// --- low-level client (key passed in, never stored/logged) ------------------

async function _rest(apiKey, method, path, body) {
  const res = await _safeFetch(`${REST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

// Redact any RunPod API key that might appear in an error/URL before it can be
// logged or surfaced. The key prefix is `rpa_`; also scrub `api_key=` query values.
function redactSecret(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/api_key=[^&\s"']+/gi, 'api_key=[REDACTED]')
    .replace(/rpa_[A-Za-z0-9_-]{8,}/g, 'rpa_[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9_.-]{8,}/g, 'Bearer [REDACTED]');
}

// Wrap a fetch so a thrown error never carries the key (GraphQL passes it in the
// URL query, which would otherwise land in err.message -> app.log -> bug report).
async function _safeFetch(url, opts) {
  try {
    return await fetch(url, opts);
  } catch (err) {
    const e = new Error(redactSecret(err && err.message ? err.message : String(err)));
    e.code = err && err.code;
    throw e;
  }
}

async function _graphql(apiKey, query, variables) {
  // Key via Authorization header (NOT the URL) so it cannot leak through a URL in
  // an error or log. RunPod GraphQL accepts the bearer header.
  const res = await _safeFetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  const json = await res.json();
  return json;
}

// --- client functions (exported for remoteEngine.js + tests) ----------------

const client = {
  async validate(apiKey) {
    const r = await _rest(apiKey, 'GET', '/pods');
    return { valid: r.ok, status: r.status };
  },

  async gpuTypes(apiKey) {
    const q = `query { gpuTypes { id displayName memoryInGb secureCloud communityCloud securePrice } }`;
    const d = await _graphql(apiKey, q);
    return (d.data && d.data.gpuTypes) || [];
  },

  async dataCenters(apiKey) {
    const q = `query { dataCenters { id name storageSupport
      gpuAvailability { available gpuTypeId stockStatus } } }`;
    const d = await _graphql(apiKey, q);
    return (d.data && d.data.dataCenters) || [];
  },

  // Combined picker payload: Secure-Cloud GPUs with per-DC availability + stock.
  async availability(apiKey) {
    const [gpus, dcs] = await Promise.all([client.gpuTypes(apiKey), client.dataCenters(apiKey)]);
    return { gpuTypes: gpus, dataCenters: dcs };
  },

  async createPod(apiKey, spec) {
    return _rest(apiKey, 'POST', '/pods', spec);
  },
  async startPod(apiKey, id) {
    return _rest(apiKey, 'POST', `/pods/${id}/start`);
  },
  async stopPod(apiKey, id) {
    return _rest(apiKey, 'POST', `/pods/${id}/stop`);
  },
  async deletePod(apiKey, id) {
    return _rest(apiKey, 'DELETE', `/pods/${id}`);
  },
  async getPod(apiKey, id) {
    return _rest(apiKey, 'GET', `/pods/${id}`);
  },
  // List the account's Pods. RunPod REST `GET /pods` returns an array (same
  // endpoint validate() probes). Used by the orphan-Pod sweep (MPI-64 4.3.3).
  async listPods(apiKey) {
    return _rest(apiKey, 'GET', '/pods');
  },
  async listVolumes(apiKey) {
    return _rest(apiKey, 'GET', '/networkvolumes');
  },
  async createVolume(apiKey, spec) {
    return _rest(apiKey, 'POST', '/networkvolumes', spec);
  },
  async deleteVolume(apiKey, id) {
    return _rest(apiKey, 'DELETE', `/networkvolumes/${id}`);
  },
  async createTemplate(apiKey, spec) {
    return _rest(apiKey, 'POST', '/templates', spec);
  },
};

// --- routes -----------------------------------------------------------------
// These are mounted in server.js. They require a key-resolver injected by
// remoteEngine.js (so this module never reaches into the fork bridge directly).

let _getApiKey = async () => null;

function setApiKeyResolver(fn) {
  if (typeof fn === 'function') _getApiKey = fn;
}

async function _withKey(res, handler) {
  const key = await _getApiKey();
  if (!key) {
    return res.status(400).json({ error: 'no_api_key', message: 'RunPod API key not set' });
  }
  try {
    return await handler(key);
  } catch (err) {
    logger.error('runpod', 'RunPod request failed', err);
    return res.status(502).json({ error: 'runpod_unreachable', message: 'RunPod request failed' });
  }
}

router.get('/runpod/account/validate', (req, res) =>
  _withKey(res, async (key) => res.json(await client.validate(key))));

router.get('/runpod/gpu-availability', (req, res) =>
  _withKey(res, async (key) => res.json(await client.availability(key))));

router.post('/runpod/pods', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.createPod(key, req.body);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.post('/runpod/pods/:id/start', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.startPod(key, req.params.id);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.post('/runpod/pods/:id/stop', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.stopPod(key, req.params.id);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.delete('/runpod/pods/:id', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.deletePod(key, req.params.id);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.get('/runpod/pods/:id', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.getPod(key, req.params.id);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.get('/runpod/volumes', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.listVolumes(key);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.post('/runpod/volumes', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.createVolume(key, req.body);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.delete('/runpod/volumes/:id', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.deleteVolume(key, req.params.id);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

router.post('/runpod/templates', (req, res) =>
  _withKey(res, async (key) => {
    const r = await client.createTemplate(key, req.body);
    res.status(r.ok ? 200 : r.status).json(r.json);
  }));

module.exports = { router, client, setApiKeyResolver, redactSecret };
