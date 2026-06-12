/**
 * routes/remoteModels.js — remote-mode model status + install bridge (MPI-64 Step 4).
 *
 * When the RunPod remote engine is active, the app's local model-check and
 * model-download paths must target the Pod volume through the wrapper instead
 * of the local filesystem. This module is the thin backend adapter that:
 *
 *   - detects remote mode (delegates to routes/remoteProxy.js),
 *   - resolves the wrapper token + proxy base (routes/remoteEngine.js),
 *   - attaches the Bearer token + a browser User-Agent (RunPod's proxy is
 *     behind Cloudflare and 403s the default UA),
 *   - tolerates the few-second post-restart window where the RunPod proxy 404s
 *     wrapper routes even though /health is already green (retry),
 *   - splits the app dep `filename` ('checkpoints/SDXL_Realistic.safetensors')
 *     into the wrapper's { type: 'checkpoints', filename: 'SDXL_Realistic...' },
 *   - maps wrapper install SSE (models:install-*) onto the app's existing
 *     download:* SSE shape so the renderer download UI is unchanged.
 *
 * The renderer never changes: it keeps POSTing /comfy/models/download/start and
 * listening on /comfy/downloads/stream. Local mode is byte-identical — every
 * function here no-ops (returns null / isRemoteActive() === false) when remote
 * mode is off.
 *
 * Secrets: the wrapper token is attached in-process only; never logged.
 */

'use strict';

const logger = require('./logger');
const { getRemoteMode } = require('./remoteProxy');
const { getWrapperToken, proxyUrl } = require('./remoteEngine');

// RunPod proxy is behind Cloudflare — the default fetch UA gets 403 error 1010.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';

function isRemoteActive() {
  const m = getRemoteMode();
  return !!(m && m.active && m.podId);
}

function _podId() {
  const m = getRemoteMode();
  return m && m.podId ? m.podId : null;
}

async function _authHeaders() {
  const podId = _podId();
  if (!podId) return null;
  const token = await getWrapperToken(podId);
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'User-Agent': UA };
}

/**
 * Split an app dep filename that embeds its subdir into the wrapper's
 * { type, filename } shape. 'checkpoints/SDXL_Realistic.safetensors' ->
 * { type: 'checkpoints', filename: 'SDXL_Realistic.safetensors' }. A bare
 * filename with no subdir yields type ''.
 */
function splitDepFilename(depFilename) {
  const norm = String(depFilename || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const idx = norm.lastIndexOf('/');
  if (idx === -1) return { type: '', filename: norm };
  return { type: norm.slice(0, idx).split('/')[0], filename: norm.slice(idx + 1) };
}

/**
 * Fetch a wrapper route through the RunPod proxy with auth + UA, retrying the
 * post-restart proxy-404 window. Returns the raw fetch Response (caller reads
 * status/body) or throws on network error after retries.
 */
async function wrapperFetch(routePath, { method = 'GET', body, retries = 4, retryDelayMs = 2000 } = {}) {
  const podId = _podId();
  if (!podId) throw new Error('remote_inactive');
  const headers = await _authHeaders();
  if (!headers) throw new Error('wrapper_token_missing');

  const url = `${proxyUrl(podId)}${routePath}`;
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, opts);
      // The proxy 404s wrapper routes for a few seconds right after a Pod
      // restart even when /health is green — retry rather than fail the call.
      if (res.status === 404 && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
    }
  }
  throw lastErr || new Error('wrapper_unreachable');
}

/**
 * True for a dep that lives in the Pod Docker image (Design A), not on the
 * network volume: custom_nodes bundles only. These are code shipped inside the
 * image (cloned at /opt/comfyui/custom_nodes), so the wrapper — which only sees
 * the /workspace volume — always reports them missing; treat them as present.
 *
 * NOTE: `installOnEngine` is NOT image-resident here. Those are model WEIGHTS
 * (upscalers, yolo/sam .pth, etc.) bundled with the LOCAL engine install only;
 * on a Pod they are real volume models the wrapper installs (e.g. 4x-NMKD-Siax,
 * verified installed-via-wrapper). Only the custom_nodes CODE ships in the image.
 */
function _isImageResident(dep) {
  const { type } = splitDepFilename(dep.filename);
  const depType = type || dep.type || '';
  return depType === 'custom_nodes';
}

/**
 * Remote equivalent of POST /comfy/models/check. The app dep `filename` embeds
 * its subdir ('checkpoints/SDXL_Realistic.safetensors'); the wrapper resolves
 * against the volume using a separate { type, filename } shape and 404s/misses
 * a path that still carries the subdir. So we split every dep's filename into
 * { type, filename } before forwarding. The wrapper response already speaks the
 * local check's shape ({ success, results: { [id]: { installed, deps: [...] } } }).
 *
 * Image-resident deps (custom_nodes code — Design A) are NOT on the volume the
 * wrapper sees, so they are marked installed inline and never sent to the
 * wrapper; otherwise the pack would read PARTIAL forever (they can't be
 * "installed" onto the volume). The model's overall `installed` is recomputed as
 * the AND of all deps (volume-checked + image-resident).
 */
async function remoteModelsCheck(models) {
  // Per model, partition deps into image-resident (always present) and
  // volume deps (asked of the wrapper). Track image-resident ids to fold back
  // into the response.
  const imageResidentByModel = {};
  const split = (models || []).map((m) => {
    const residentIds = [];
    const volumeDeps = [];
    for (const d of (m.deps || [])) {
      if (_isImageResident(d)) {
        residentIds.push(d.id || null);
        continue;
      }
      const { type, filename } = splitDepFilename(d.filename);
      volumeDeps.push({ ...d, type: type || d.type || '', filename });
    }
    imageResidentByModel[m.id] = residentIds;
    return { ...m, deps: volumeDeps };
  });

  const res = await wrapperFetch('/wrapper/models/status', { method: 'POST', body: { models: split } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error((json && (json.message || json.error)) || `wrapper status ${res.status}`);
  }

  // Fold the image-resident deps back in as installed:true and recompute the
  // per-model `installed` flag so a complete-on-volume pack is not dragged to
  // PARTIAL by an image-resident dep the wrapper never saw.
  const results = json.results || {};
  for (const [mid, residentIds] of Object.entries(imageResidentByModel)) {
    const entry = results[mid] || { installed: true, deps: [] };
    const deps = Array.isArray(entry.deps) ? entry.deps : [];
    for (const id of residentIds) {
      deps.push({ id, installed: true, partialBytes: 0 });
    }
    entry.deps = deps;
    entry.installed = deps.every((d) => d.installed);
    results[mid] = entry;
  }
  json.results = results;
  return json;
}

/**
 * Trigger a single dependency install on the volume through the wrapper.
 * Translates an app dep ({ id, filename:'subdir/file', url, size, sha256 }) into
 * the wrapper body ({ id, type, filename, url, size_bytes, sha256, force }).
 * Returns { status, id } from the wrapper ('started' | 'already_installed').
 */
async function remoteInstallDep(dep, { sizeBytes = 0, force = false } = {}) {
  const { type, filename } = splitDepFilename(dep.filename);
  const body = {
    id: dep.id,
    type,
    filename,
    url: dep.url,
    size_bytes: sizeBytes || 0,
  };
  if (dep.sha256) body.sha256 = dep.sha256;
  if (force) body.force = true;

  const res = await wrapperFetch('/wrapper/models/install', { method: 'POST', body });
  const json = await res.json().catch(() => null);
  // 202 started, 200 already_installed; anything else is a real failure.
  if (res.status !== 202 && res.status !== 200) {
    throw new Error((json && (json.message || json.error)) || `wrapper install ${res.status}`);
  }
  return json || { status: 'started', id: dep.id };
}

/** Cancel an in-flight wrapper install by dep id. Best-effort. */
async function remoteCancelInstall(depId) {
  try {
    await wrapperFetch('/wrapper/models/install/cancel', { method: 'POST', body: { id: depId }, retries: 1 });
  } catch (err) {
    logger.warn('runpod', `remote install cancel failed for ${depId}`);
  }
}

/**
 * Open the wrapper install SSE stream and invoke onEvent({ type, data }) for
 * each models:install-* event. Returns an AbortController; call .abort() to
 * close the stream. Parses the SSE framing line-by-line. Auto-reconnects are
 * the caller's concern (installs are short-lived; the driver tears down on
 * terminal events).
 */
function openInstallEventStream(onEvent) {
  const controller = new AbortController();
  (async () => {
    let headers;
    try {
      headers = await _authHeaders();
    } catch {
      headers = null;
    }
    if (!headers) return;
    const podId = _podId();
    if (!podId) return;
    try {
      const res = await fetch(`${proxyUrl(podId)}/wrapper/events/stream`, {
        headers: { ...headers, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep;
        // SSE events are separated by a blank line.
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let evtName = 'message';
          let dataLine = '';
          for (const line of raw.split('\n')) {
            if (line.startsWith('event:')) evtName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
          }
          if (!evtName.startsWith('models:install-')) continue;
          let data = {};
          try { data = dataLine ? JSON.parse(dataLine) : {}; } catch { data = {}; }
          try { onEvent({ type: evtName, data }); } catch { /* driver-side */ }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      logger.warn('runpod', 'remote install SSE closed');
    }
  })();
  return controller;
}

module.exports = {
  isRemoteActive,
  splitDepFilename,
  wrapperFetch,
  remoteModelsCheck,
  remoteInstallDep,
  remoteCancelInstall,
  openInstallEventStream,
};
