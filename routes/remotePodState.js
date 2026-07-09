/**
 * remotePodState.js — backend-owned remote-mode state + the helpers BOTH the
 * lifecycle and proxy-forward routers share.
 *
 * MPI-175: extracted from the old 1,610-line remoteProxy.js so Pod lifecycle and
 * /proxy/* forwarding live in separate route modules without duplicating the
 * mutable `_mode` state or the guard/health/passthrough helpers. This module
 * owns the single source of truth for remote mode; both routers import it, and
 * the remoteProxy.js barrel re-exports getRemoteMode/setRemoteMode for the
 * external consumers (remoteModels.js, main.js via server.js).
 *
 * `_startedPodId`, `_connecting`, `_starting` are NOT here — they are touched
 * only by lifecycle routes, so they stay private to remotePodLifecycle.js.
 */
'use strict';

const { Readable } = require('stream');
const logger = require('./logger');
const { getWrapperToken, proxyUrl } = require('./remoteEngine');
const { buildAuthHeaders } = require('./remoteHeaders');

// --- remote-mode state (backend-owned; Settings/boot gate flips it) ----------

const _mode = { active: false, podId: null, deleteOnQuit: false, noGpu: false };

function getRemoteMode() {
  return { ..._mode };
}

function setRemoteMode({ active, podId, deleteOnQuit, noGpu } = {}) {
  if (podId !== undefined && podId !== null) {
    const next = String(podId);
    if (next !== _mode.podId) _clearHealthVerdict(); // MPI-90: stale verdict on Pod swap
    _mode.podId = next;
  }
  _mode.active = !!active;
  if (deleteOnQuit !== undefined) _mode.deleteOnQuit = !!deleteOnQuit;
  if (noGpu !== undefined) _mode.noGpu = !!noGpu;
  return getRemoteMode();
}

// --- helpers ------------------------------------------------------------------

async function _authHeaders() {
  if (!_mode.podId) return null;
  const token = await getWrapperToken(_mode.podId);
  if (!token) return null;
  return buildAuthHeaders(token);
}

/**
 * Guard for /proxy/* routes: remote mode must be active and the wrapper token
 * resolvable. Responds itself on failure; returns headers on success.
 */
async function _guard(res) {
  if (!_mode.active) {
    res.status(409).json({ error: 'remote_inactive' });
    return null;
  }
  const headers = await _authHeaders();
  if (!headers) {
    res.status(503).json({ error: 'wrapper_token_missing' });
    return null;
  }
  return headers;
}

/**
 * Resolve a model FILENAME (the dropdown value — may be subfolder-prefixed, e.g.
 * 'style/foo.safetensors') to its absolute LOCAL path, searching the configured
 * model folders for that bucket: the primary bucket dir (custom root or default)
 * plus each stored extra folder, recursively, matched by BASENAME. Mirrors the
 * union /comfy/list-files enumerates, so the file the user sees in the dropdown
 * is the file we upload. Returns the absolute path or null if not found locally.
 * @param {'loras'|'upscale_models'} type
 * @param {string} filename
 * @returns {Promise<string|null>}
 */
async function _resolveLocalModelPath(type, filename) {
  const path = require('path');
  const { getCustomRoot, getDefaultModelsRoot, getExtraModelFolders, findFileRecursive } = require('./shared');
  const base = path.basename(String(filename || '').replace(/\\/g, '/'));
  if (!base) return null;
  const customRoot = await getCustomRoot();
  const primaryBucket = path.join(customRoot || getDefaultModelsRoot(), type);
  const extras = await getExtraModelFolders();
  const roots = [primaryBucket, ...((extras[type]) || [])];
  for (const root of roots) {
    const hit = await findFileRecursive(root, base);
    if (hit) return hit;
  }
  return null;
}

// --- pre-generation health pre-check (MPI-90) --------------------------------
//
// Before the FIRST remote generate of a Pod session, read the volume manifest
// (GET /wrapper/manifest) and refuse to dispatch if the Pod is set up by an
// incompatible Cubric version — a clear block up front instead of a mid-generation
// crash. The check is intentionally THIN: the live wrapper writes only
// { manifest_schema_version, initialized_at, models[], last_written_at }, so the
// only real block today is an unknown schema version. Richer blocks (workflow-bundle
// mismatch) and version-drift warns land when the wrapper writer stamps those fields
// (MPI-90 D0, next Pod image). A missing manifest (404) is NOT a failure — a fresh /
// pre-init volume is valid and proceeds.
//
// The highest manifest_schema_version this app build understands. Bump in lockstep
// with the wrapper when the manifest shape changes incompatibly.
// v2 (MPI-222): adds an optional `nodes[]` [{ filename, commit }] for per-node
// commit-drift detection. Additive — a v1 app ignores it, a v2 app reads it
// defensively (absent → no drift), so accepting v2 is safe.
const MANIFEST_SCHEMA_MAX = 2;

// Cache the verdict per podId so the manifest is fetched once per connection, not on
// every prompt. Cleared when the active Pod changes.
let _healthVerdict = null;
let _healthVerdictPodId = null;

function _clearHealthVerdict() {
  _healthVerdict = null;
  _healthVerdictPodId = null;
}

/**
 * Fetch + evaluate the Pod manifest. Returns { ok, block } where `block`, when
 * present, is { code, message } for a user-facing modal. Best-effort: any fetch /
 * parse failure resolves to ok:true (never block a generate on the check itself —
 * the wrapper's own gates remain the backstop).
 */
async function _evaluatePodHealth(podId) {
  if (_healthVerdictPodId === podId && _healthVerdict) return _healthVerdict;
  let verdict = { ok: true };
  try {
    // Lazy require: remoteModels requires this module (getRemoteMode), so a
    // top-level require here would be a cycle.
    const { wrapperFetch } = require('./remoteModels');
    // Low retry budget: a missing manifest is a LEGITIMATE persistent 404 (fresh /
    // pre-init volume), not the transient post-restart 404 wrapperFetch's default
    // 15×2s budget is for. A few retries still ride out a real warm-up blip without
    // making every first-generate on a fresh volume wait ~30s.
    const res = await wrapperFetch('/wrapper/manifest', { retries: 1 });
    if (res.status === 404) {
      verdict = { ok: true }; // fresh / pre-init volume — valid
    } else if (res.ok) {
      const manifest = await res.json();
      const ver = Number(manifest && manifest.manifest_schema_version);
      if (Number.isFinite(ver) && ver > MANIFEST_SCHEMA_MAX) {
        verdict = {
          ok: false,
          block: {
            code: 'manifest_schema_incompatible',
            message:
              'This Pod was set up by a newer version of Cubric Vision than this app ' +
              'understands. Update the app, or reinitialize the Pod, before generating.',
          },
        };
      }
    }
    // Any other status (5xx after retries, etc.): leave ok:true, let the prompt
    // path surface the real error.
  } catch (err) {
    logger.warn('runpod', `pod health pre-check skipped: ${err?.message || err}`);
  }
  _healthVerdict = verdict;
  _healthVerdictPodId = podId;
  return verdict;
}

/** Forwards a wrapper response (status + content-type + body) verbatim. */
async function _passthrough(res, upstream) {
  res.status(upstream.status);
  const type = upstream.headers.get('content-type');
  if (type) res.type(type);
  const text = await upstream.text();
  res.send(text);
}

/** Streams a wrapper response body to the client (for /view). */
function _streamthrough(req, res, upstream) {
  res.status(upstream.status);
  for (const h of ['content-type', 'content-length', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) res.set(h, v);
  }
  if (!upstream.body) return res.end();
  const nodeStream = Readable.fromWeb(upstream.body);
  // A mid-stream upstream socket drop (e.g. a Pod OOM/restart, network blip, or
  // the client aborting) makes the Readable emit 'error'. With NO handler the
  // error is uncaught and crashes the whole Express process (exit 1) — observed
  // live taking the backend down and freezing an in-flight remote generation.
  // Swallow it: log + end the response, never rethrow.
  nodeStream.on('error', (err) => {
    logger.warn('runpod', `/view stream aborted: ${err?.message || err}`);
    if (!res.headersSent || !res.writableEnded) res.end();
  });
  res.on('error', () => nodeStream.destroy());
  nodeStream.pipe(res);
  req.on('close', () => nodeStream.destroy());
}

module.exports = {
  getRemoteMode,
  setRemoteMode,
  _clearHealthVerdict,
  _authHeaders,
  _guard,
  _resolveLocalModelPath,
  _evaluatePodHealth,
  _passthrough,
  _streamthrough,
  // read-only access to the live mode object for routes that branch on it.
  getMode: () => _mode,
};
