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
 * The UNIVERSAL custom_nodes baked into the Pod image (Design B+): the
 * `installOnEngine: true` custom_nodes from dependencies.js. These are the
 * stable engine baseline (ComfyUI-MpiNodes, VHS, Impact, KJ, etc.) cloned into
 * /opt/ComfyUI/custom_nodes by the image Dockerfile, so the wrapper — which only
 * sees the /workspace volume — never finds them and they must be treated as
 * present. PER-MODEL custom_nodes (e.g. ComfyUI-PainterI2Vadvanced) are NOT in
 * this set: they install onto the volume via the wrapper so a new model never
 * forces an image rebuild. Loaded once from the app dep registry.
 * @returns {Set<string>} dep.filename folder names of the universal node packs
 */
let _universalNodeNames = null;
function _universalNodeFilenames() {
  if (_universalNodeNames) return _universalNodeNames;
  _universalNodeNames = new Set();
  try {
    // CJS-friendly read of the ESM dep registry (same pattern as shared.js).
    const path = require('path');
    const file = path.join(__dirname, '..', 'js', 'data', 'modelConstants', 'dependencies.js');
    const src = require('fs').readFileSync(file, 'utf8');
    // Split into per-dep blocks at the top-level "  'id': {" keys so the marker
    // checks stay scoped to ONE dep (a whole-file regex leaks across deps). A
    // dep block runs from its opening "'key': {" to the next such key.
    const keyRe = /^\s{4}'[^']+':\s*\{/gm;
    const starts = [];
    let km;
    while ((km = keyRe.exec(src)) !== null) starts.push(km.index);
    for (let i = 0; i < starts.length; i++) {
      const block = src.slice(starts[i], starts[i + 1] ?? src.length);
      if (!/type:\s*'custom_nodes'/.test(block)) continue;
      if (!/installOnEngine:\s*true/.test(block)) continue;
      const fn = block.match(/filename:\s*'([^']+)'/);
      if (fn && fn[1]) _universalNodeNames.add(fn[1]);
    }
  } catch (err) {
    logger.warn('runpod', `universal node list load failed: ${err.message}`);
  }
  return _universalNodeNames;
}

/**
 * True for a dep that lives in the Pod Docker IMAGE (universal engine nodes,
 * Design B+), not on the network volume. Only `installOnEngine: true`
 * custom_nodes qualify — the wrapper can't see them on the volume, so they are
 * reported present. A per-model custom_node returns false → it routes to the
 * wrapper for volume install.
 */
function _isImageResident(dep) {
  const { type } = splitDepFilename(dep.filename);
  const depType = type || dep.type || '';
  if (depType !== 'custom_nodes') return false;
  // The node's folder name is the bare dep.filename (no subdir for nodes).
  const name = (splitDepFilename(dep.filename).filename) || dep.filename || '';
  return _universalNodeFilenames().has(name);
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
      // Per-model custom_node: wrapper checks a folder, so keep type
      // 'custom_nodes' + the bare folder name (dep.filename has no subdir).
      if (d.type === 'custom_nodes') {
        volumeDeps.push({ ...d, type: 'custom_nodes', filename: d.filename });
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
  let body;
  if (dep.type === 'custom_nodes') {
    // Per-model node: install a folder onto the volume. filename is the bare
    // folder name; pass the per-pack requirements command when present.
    body = {
      id: dep.id,
      type: 'custom_nodes',
      filename: dep.filename,
      url: dep.url,
    };
    if (dep.installRequirementsCommand) body.install_command = dep.installRequirementsCommand;
  } else {
    const { type, filename } = splitDepFilename(dep.filename);
    body = {
      id: dep.id,
      type,
      filename,
      url: dep.url,
      size_bytes: sizeBytes || 0,
    };
    if (dep.sha256) body.sha256 = dep.sha256;
  }
  if (force) body.force = true;

  const res = await wrapperFetch('/wrapper/models/install', { method: 'POST', body });
  const json = await res.json().catch(() => null);
  // 202 started, 200 already_installed; anything else is a real failure.
  if (res.status !== 202 && res.status !== 200) {
    throw new Error((json && (json.message || json.error)) || `wrapper install ${res.status}`);
  }
  return json || { status: 'started', id: dep.id };
}

/**
 * Upload a LOCAL file to the wrapper as an input asset (video/audio or .latent),
 * landing it in the Pod volume input dir under a bare basename. Mirrors the
 * wrapper's multipart contract: field `file` (the blob), Form `filename` (bare
 * basename), Form `overwrite`. `endpoint` is '/wrapper/upload/media' or
 * '/wrapper/upload/latent'. Reads the file server-side (the renderer's resolved
 * path is meaningless on the Pod) and streams it through the RunPod proxy with
 * auth + browser UA + the post-restart proxy-404 retry. Returns the wrapper
 * JSON ({ name, type:'input', path? }).
 */
async function remoteUploadInput(localPath, filename, endpoint) {
  const fs = require('fs-extra');
  const path = require('path');
  if (!localPath || typeof localPath !== 'string') throw new Error('localPath required');
  if (!(await fs.pathExists(localPath))) throw new Error(`input asset missing: ${localPath}`);

  const base = path.basename(String(filename || localPath));
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new Error('filename must resolve to a bare basename');
  }

  const podId = _podId();
  if (!podId) throw new Error('remote_inactive');
  const headers = await _authHeaders();
  if (!headers) throw new Error('wrapper_token_missing');

  const buf = await fs.readFile(localPath);
  const url = `${proxyUrl(podId)}${endpoint}`;

  // Multipart is rebuilt per attempt (FormData/Blob are single-use streams).
  const retries = 4;
  const retryDelayMs = 2000;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([buf]), base);
      form.append('filename', base);
      form.append('overwrite', 'true');
      const res = await fetch(url, { method: 'POST', headers: { ...headers }, body: form });
      if (res.status === 404 && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error((json && (json.message || json.error)) || `wrapper upload ${res.status}`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
    }
  }
  throw lastErr || new Error('wrapper_upload_failed');
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
  remoteUploadInput,
  remoteCancelInstall,
  openInstallEventStream,
};
