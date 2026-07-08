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
    // MPI-211: remote inactive is not an error for this route — the renderer
    // polls it on every mode refresh, including on the local/offline landing.
    // Answer 200 with a null token (no channel to open) instead of a 409 so the
    // browser doesn't log a red network row for an expected steady state.
    if (!_mode.active) return res.json({ wsBase: null, token: null, inactive: true });
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
// stages big (>=20GB) weights from the slow network volume onto its fast container
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

// MPI-208 B1-B: MERGE mode — local stdout events (tagged engine:'local' by
// _broadcastComfyEvent) flow to this client via the _comfyEventClients Set
// while Pod wrapper frames arrive tagged engine:'remote'. Replaces the old
// replace-relay that piped the raw upstream stream and poisoned local gens
// with unfiltered Pod install activity. models:install-* frames pass through
// unchanged (downloadManager path must be unaffected).
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

    // Register with the local broadcast set so _broadcastComfyEvent (comfy.js)
    // delivers engine:'local'-tagged frames to this merged-stream client.
    const { addComfyEventClient, removeComfyEventClient } = require('./comfy');
    addComfyEventClient(res);

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

    const cleanup = () => {
      stopKeepalive();
      removeComfyEventClient(res);
    };

    // Parse incoming SSE text from the Pod wrapper.
    // Each SSE message block is delimited by a blank line. We accumulate lines
    // until the block is complete, then route it:
    //   • models:install-* events → pass through UNCHANGED (downloadManager).
    //   • all other events        → parse data JSON, inject engine:'remote'.
    //   • comment lines (:...)    → forward as-is (keepalive pass-through).
    const nodeStream = Readable.fromWeb(upstream.body);
    let buf = '';
    nodeStream.setEncoding('utf8');
    nodeStream.on('data', (chunk) => {
      buf += chunk;
      let boundary;
      // SSE message blocks are separated by '\n\n' (or '\r\n\r\n').
      while ((boundary = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, boundary);
        buf = buf.slice(boundary + 2);
        if (!block.trim()) continue; // skip empty blocks
        if (res.writableEnded) continue;

        // Parse the block into its event name and raw data string.
        let eventName = '';
        let dataStr = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataStr = line.slice(5).trim();
          } else if (line.startsWith(':')) {
            // SSE comment (keepalive ping from wrapper) — forward unchanged.
            try { res.write(line + '\n\n'); } catch (_) { /* client closed */ }
          }
        }

        if (!eventName) continue; // no event name — skip malformed block

        // models:install-* frames: pass through UNCHANGED (downloadManager path).
        if (eventName.startsWith('models:install-')) {
          try { res.write(`event: ${eventName}\ndata: ${dataStr}\n\n`); } catch (_) { /* client closed */ }
          continue;
        }

        // All other Pod frames: inject engine:'remote'.
        let data = {};
        try { data = JSON.parse(dataStr); } catch (_) { /* non-JSON data — leave as empty object */ }
        try {
          res.write(`event: ${eventName}\ndata: ${JSON.stringify({ ...data, engine: 'remote' })}\n\n`);
        } catch (_) { /* client closed */ }
      }
    });

    // Same crash guard as _streamthrough: the SSE relay is the live event
    // channel during a generation, so its upstream socket drops whenever the
    // Pod OOMs/restarts mid-gen. An unhandled 'error' here would crash the
    // backend (exit 1) and freeze the generation. Swallow + end the SSE.
    nodeStream.on('error', (err) => {
      logger.warn('runpod', `remote SSE stream aborted: ${err?.message || err}`);
      cleanup();
      ctrl.abort();
      if (!res.writableEnded) res.end();
    });
    nodeStream.on('end', () => {
      cleanup();
      if (!res.writableEnded) res.end();
    });
    res.on('error', () => {
      cleanup();
      ctrl.abort();
      nodeStream.destroy();
    });
    // res 'close' fires on every terminal path (clean pipe-end, client abort,
    // error) — the catch-all that guarantees the interval is cleared and the
    // client is removed from the local broadcast set.
    res.on('close', cleanup);
    req.on('close', () => {
      cleanup();
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
