/**
 * remoteProxyForward.js — /proxy/* wrapper forwarding + upload + SSE relay routes.
 *
 * MPI-175: extracted from the old 1,610-line remoteProxy.js. These are the
 * renderer base-URL swap targets — thin fetch->passthrough forwards to the Pod
 * wrapper (prompt/view/interrupt/queue/history/upload), plus the model/media
 * upload endpoints and the model-init SSE relay. All auth/mode/health state comes
 * from remotePodState.js; nothing here owns Pod lifecycle.
 */
'use strict';

const express = require('express');
const { Readable } = require('stream');
const router = express.Router();
const logger = require('./logger');
const { getWrapperToken, proxyUrl } = require('./remoteEngine');
const { UA } = require('./remoteHeaders');
const state = require('./remotePodState');
const { _authHeaders, _guard, _evaluatePodHealth, _passthrough, _streamthrough, _resolveLocalModelPath } = state;
const _mode = state.getMode(); // live singleton

// --- WS bootstrap (renderer-direct binary preview exception) --------------------

router.get('/remote/ws-token', async (req, res) => {
  try {
    if (!_mode.active) return res.status(409).json({ error: 'remote_inactive' });
    const token = await getWrapperToken(_mode.podId);
    if (!token) return res.status(503).json({ error: 'wrapper_token_missing' });
    res.json({
      wsBase: proxyUrl(_mode.podId).replace(/^https:/, 'wss:'),
      token,
    });
  } catch (err) {
    logger.error('runpod', 'ws-token resolve failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

// --- ComfyUI-shaped forwarding routes (renderer base-URL swap targets) ----------

router.post('/proxy/prompt', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  // MPI-90: block an incompatible Pod up front instead of a mid-generation crash.
  // Cached per connection, so this is one manifest fetch per Pod, not per prompt.
  const health = await _evaluatePodHealth(_mode.podId);
  if (!health.ok) {
    return res.status(409).json({ error: health.block.code, message: health.block.message });
  }
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/prompt`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy prompt failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

router.get('/proxy/view', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const qs = new URLSearchParams(req.query).toString();
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/view?${qs}`, { headers });
    _streamthrough(req, res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy view failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

router.post('/proxy/interrupt', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/interrupt`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy interrupt failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

// MPI-81: restart ONLY the Pod's internal ComfyUI (rescan custom_nodes after a
// per-model node install) — no Pod reboot. The app calls this on
// state.comfyNeedsRestart instead of telling the user to Disconnect/Connect.
// Ships in image v0.4.2 / wrapper 0.2.5; on an OLDER image the wrapper lacks the
// endpoint and answers 404 → the app falls back to the manual-reconnect message.
router.post('/proxy/restart-comfy', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/restart-comfy`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy restart-comfy failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

router.get('/proxy/queue', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/queue`, { headers });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy queue snapshot failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

// Completion reconciliation (MPI-152): the app polls ComfyUI /history/{prompt_id}
// on WS reconnect to settle a gen whose terminal event was missed during the blip
// (terminal events are broadcast=False + not replayed). Forwards to the wrapper's
// /wrapper/history/{prompt_id} (wrapper >= 0.2.15). An empty `{}` body = the prompt
// is not yet in history (still running); the app treats that as "keep waiting".
router.get('/proxy/history/:promptId', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/history/${encodeURIComponent(req.params.promptId)}`, { headers });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy history reconcile failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

router.post('/proxy/queue', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/queue`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy queue op failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

// Multipart image/mask upload — stream the raw request body to the wrapper
// untouched (bodyParser.json ignores multipart, so req is still a readable
// stream of the original form data).
router.post('/proxy/upload/image', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const fwd = { ...headers };
    if (req.headers['content-type']) fwd['Content-Type'] = req.headers['content-type'];
    if (req.headers['content-length']) fwd['Content-Length'] = req.headers['content-length'];
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/upload/image`, {
      method: 'POST',
      headers: fwd,
      body: req,
      duplex: 'half',
    });
    await _passthrough(res, upstream);
  } catch (err) {
    logger.error('runpod', 'proxy image upload failed', err);
    res.status(502).json({ error: 'relay_failed' });
  }
});

// Renderer video/audio input upload — the renderer resolves a local media path
// (meaningless on the Pod) and posts { localPath, filename } here; the backend
// reads the local file and uploads it to the Pod volume input dir via the
// wrapper, returning the bare filename the workflow node should load. Mirrors
// the local path-injection seam (comfyController._resolveMediaPath) for remote.
router.post('/remote/upload/media', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const { localPath, filename } = req.body || {};
    if (!localPath || typeof localPath !== 'string') {
      return res.status(400).json({ error: 'localPath required' });
    }
    // Lazy require — remoteModels requires remotePodState (circular at load time).
    const remoteModels = require('./remoteModels');
    const out = await remoteModels.remoteUploadInput(localPath, filename || localPath, '/wrapper/upload/media');
    // `path` is the absolute Pod path (e.g. /workspace/comfyui/input/<name>).
    // VHS_LoadVideoPath resolves a literal path, NOT a bare basename against
    // --input-directory, so the renderer must inject the full path (not name).
    res.json({ success: true, name: out.name, path: out.path, type: out.type || 'input' });
  } catch (err) {
    logger.error('runpod', `remote media upload failed: ${err.message}`);
    res.status(502).json({ error: 'upload_failed', message: err.message });
  }
});

// MPI-82: generate-time auto-upload of a LOCAL LoRA/upscale model to the Pod
// volume's models dir, mirroring /remote/upload/media for input assets. The
// renderer calls /remote/model-present first to skip a redundant multi-GB
// transfer, then /remote/upload/model only when absent. `type` is the wrapper
// bucket ('loras' | 'upscale_models'); the Pod resolves the model by basename,
// so unlike media there is NO path to inject back — the upload is the side effect.
router.post('/remote/model-present', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const { type, filename } = req.body || {};
    if (!type || !filename) return res.status(400).json({ error: 'type and filename required' });
    const remoteModels = require('./remoteModels');
    const present = await remoteModels.remoteModelPresent(type, filename);
    res.json({ success: true, present });
  } catch (err) {
    // Presence is advisory — a failure here means "unknown", caller treats as absent.
    logger.warn('runpod', `remote model presence failed: ${err.message}`);
    res.json({ success: true, present: false });
  }
});

router.post('/remote/upload/model', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const { type, filename } = req.body || {};
    if (!type) return res.status(400).json({ error: 'type required' });
    if (!filename) return res.status(400).json({ error: 'filename required' });
    // The renderer only knows the model's filename (the dropdown value); resolve
    // it to an absolute LOCAL path across the configured model folders. Local is
    // the source of truth (MPI-82) — the user keeps weights local, we ship them up.
    const localPath = await _resolveLocalModelPath(type, filename);
    if (!localPath) {
      return res.status(404).json({ error: 'not_found', message: `"${filename}" not found in your ${type} folders` });
    }
    const remoteModels = require('./remoteModels');
    const out = await remoteModels.remoteUploadModel(localPath, type, filename);
    res.json({ success: true, name: out.name, type: out.type || type, path: out.path });
  } catch (err) {
    logger.error('runpod', `remote model upload failed: ${err.message}`);
    res.status(502).json({ error: 'upload_failed', message: err.message });
  }
});

// MPI-194: forward the renderer's hot-store request to the Pod wrapper, which
// stages big (>=15GB) weights from the slow network volume onto its fast container
// disk before generation. Best-effort — the renderer treats any non-2xx as "not
// staged, generate from the volume", so a failure here never blocks a gen. The
// wrapper blocks until every file is staged (~55s for the 40GB LTX transformer on
// first use), so this proxy must not impose a short timeout.
router.post('/remote/hot-store/ensure', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
  try {
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/hot-store/ensure`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    logger.warn('runpod', `hot-store ensure forward failed: ${err.message}`);
    res.status(502).json({ error: 'hot_store_failed', message: err.message });
  }
});

// --- model-init SSE relay (remote-mode intercept; falls through when local) ----

router.get('/comfy/events/stream', async (req, res, next) => {
  if (!_mode.active) return next();
  const headers = await _authHeaders();
  if (!headers) return res.status(503).json({ error: 'wrapper_token_missing' });
  try {
    const ctrl = new AbortController();
    const upstream = await fetch(`${proxyUrl(_mode.podId)}/wrapper/events/stream`, {
      headers: { ...headers, Accept: 'text/event-stream' },
      signal: ctrl.signal,
    });
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: 'relay_failed' });
    }
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.flushHeaders();
    const nodeStream = Readable.fromWeb(upstream.body);
    // MPI-156: keepalive. The upstream wrapper SSE goes quiet during long
    // sampling/load stretches; with no traffic the proxy/socket reaps this
    // relay at a ~128s idle cadence ("remote SSE stream aborted: terminated")
    // and the live progress bar freezes while the Pod is still connected (the
    // gen finishes server-side regardless). A ':'-prefixed line is an SSE
    // comment — EventSource ignores it, but it resets the idle timer.
    const keepalive = setInterval(() => {
      if (!res.writableEnded) res.write(':ping\n\n');
    }, 20000);
    const stopKeepalive = () => clearInterval(keepalive);
    // Same crash guard as _streamthrough: the SSE relay is the live event
    // channel during a generation, so its upstream socket drops whenever the
    // Pod OOMs/restarts mid-gen. An unhandled 'error' here would crash the
    // backend (exit 1) and freeze the generation. Swallow + end the SSE.
    nodeStream.on('error', (err) => {
      logger.warn('runpod', `remote SSE stream aborted: ${err?.message || err}`);
      stopKeepalive();
      ctrl.abort();
      if (!res.writableEnded) res.end();
    });
    res.on('error', () => {
      stopKeepalive();
      ctrl.abort();
      nodeStream.destroy();
    });
    nodeStream.pipe(res);
    // res 'close' fires on every terminal path (clean pipe-end, client abort,
    // error) — the catch-all that guarantees the interval is cleared even when
    // upstream ends cleanly without an 'error' event.
    res.on('close', stopKeepalive);
    req.on('close', () => {
      stopKeepalive();
      ctrl.abort();
      nodeStream.destroy();
    });
  } catch (err) {
    logger.error('runpod', 'remote SSE relay failed', err);
    if (!res.headersSent) res.status(502).json({ error: 'relay_failed' });
    else res.end();
  }
});

module.exports = { router };
