/**
 * routes/remoteProxy.js — Express forwarding layer for the RunPod remote engine (MPI-64).
 *
 * Implements the backend-proxy topology from
 * .agents/mpi-kanban/tasks/MPI-64/research/transport-topology.md:
 *   - The renderer talks ComfyUI-shaped HTTP to `/proxy/*` on localhost; this
 *     router attaches the wrapper token server-side and forwards to the
 *     RunPod HTTP proxy. The token never reaches renderer storage.
 *   - `GET /remote/ws-token` is the one renderer-direct exception bootstrap:
 *     it returns the WSS base + token over loopback so the renderer can open
 *     the binary-preview WebSocket directly against the RunPod proxy.
 *   - `GET /comfy/events/stream` is intercepted ONLY when remote mode is
 *     active (falls through to routes/comfy.js otherwise) and relays the
 *     wrapper's synthesized model-init SSE verbatim.
 *
 * MUST be mounted BEFORE routes/comfy.js in server.js so the SSE intercept
 * can fall through with next(). When remote mode is inactive every route here
 * either passes through or 409s — local mode behavior is byte-identical.
 *
 * Secrets: the wrapper token is attached in-process only; it is never logged
 * and never included in any response except `/remote/ws-token` (loopback).
 */

'use strict';

const express = require('express');
const { Readable } = require('stream');
const router = express.Router();
const logger = require('./logger');
const {
  getWrapperToken,
  setWrapperToken,
  clearWrapperToken,
  generateWrapperToken,
  getRunPodApiKey,
  waitForWrapperReady,
  proxyUrl,
} = require('./remoteEngine');
const { client } = require('./runpodRemote');

// RunPod proxy is behind Cloudflare — default UA gets 403 error 1010.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';

// v0.2.0 Pod image spec (proven live in cubric-remote-wrapper/recreate_pod.py).
// PyTorch + ComfyUI live in the image (Design A); the volume holds models only.
const POD_IMAGE = 'ghcr.io/madponyinteractive/cubric-vision-pod:v0.2.2';
const WRAPPER_VERSION = '0.2.2';
const CONTAINER_DISK_GB = 50;

// --- remote-mode state (backend-owned; Settings/boot gate flips it) ----------

const _mode = { active: false, podId: null };

// The Pod this server session actually STARTED (set on successful /remote/pod/start,
// cleared on stop). Quit-time stop must target this — not _mode.podId, which tracks
// the Settings field and can be changed mid-session, orphaning the running Pod.
let _startedPodId = null;

// True while a create/reconnect is in flight. Backend-owned so the in-progress
// state survives a Settings panel close/reopen (the renderer's own _engineBusy is
// per-mount and resets) — prevents a second Connect firing a duplicate create.
let _connecting = false;

function getRemoteMode() {
  return { ..._mode };
}

function setRemoteMode({ active, podId } = {}) {
  if (podId !== undefined && podId !== null) _mode.podId = String(podId);
  _mode.active = !!active;
  return getRemoteMode();
}

// --- helpers ------------------------------------------------------------------

async function _authHeaders() {
  if (!_mode.podId) return null;
  const token = await getWrapperToken(_mode.podId);
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'User-Agent': UA };
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
  nodeStream.pipe(res);
  req.on('close', () => nodeStream.destroy());
}

// --- mode routes ----------------------------------------------------------------

router.get('/remote/mode', (req, res) => {
  res.json(getRemoteMode());
});

router.post('/remote/mode', (req, res) => {
  // Step 4.2: remote mode can be active with NO podId — the Pod is created later
  // on Connect (create-on-Connect). The boot gate just needs the active flag to
  // skip the local-engine install path. /proxy/* routes still 503 until a Pod
  // exists (the token guard), so there is no unauthenticated remote call.
  const { active, podId } = req.body || {};
  const out = setRemoteMode({ active, podId });
  logger.info('runpod', `Remote mode ${out.active ? 'enabled' : 'disabled'}`);
  res.json(out);
});

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

// --- readiness relay -------------------------------------------------------------

router.get('/remote/comfy/status', async (req, res) => {
  if (!_mode.active || !_mode.podId) return res.json({ running: false, ready: false, connecting: _connecting });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${proxyUrl(_mode.podId)}/health`, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return res.json({ running: false, ready: false, connecting: _connecting });
    const health = await r.json();
    res.json({ running: true, ready: !!health.ready, comfyReady: !!health.comfy_ready, connecting: _connecting });
  } catch (_) {
    // expected during Pod cold start / stale-payload window
    res.json({ running: false, ready: false, connecting: _connecting });
  }
});

// --- Pod lifecycle (Step 4.3: stop-not-delete + reconnect with delete-fallback) -
// A RUNNING Pod bills GPU per-second, a STOPPED Pod bills only volume + reserved
// container disk, a DELETED Pod bills only volume. So: quit/Disconnect STOP the
// Pod (warm-resumable, no GPU bill); reconnect tries startPod and, if the host is
// full (a STOPPED Pod is host-pinned), DELETES it and creates a fresh one on the
// same GPU; GPU-switch / GPU-unavailable DELETE. The volume persists throughout
// (Design A → any supported card re-attaches with no reinit/re-download).

// Is `gpuTypeId` currently available in `datacenter`? Mirrors the picker's
// availability join (dataCenters[].gpuAvailability{available,gpuTypeId}).
async function _isGpuAvailable(key, gpuTypeId, datacenter) {
  try {
    const dcs = await client.dataCenters(key);
    const dc = (dcs || []).find((d) => d.id === datacenter);
    if (!dc) return false;
    return (dc.gpuAvailability || []).some(
      (g) => g.available && g.gpuTypeId === gpuTypeId
    );
  } catch (err) {
    logger.warn('runpod', 'availability check failed; treating as unavailable');
    return false;
  }
}

// Create a fresh Pod on `gpuTypeId`, store a new wrapper token keyed to its podId,
// record it as the started Pod, and wait for the wrapper to report ready. Returns
// { ready, podId, health } or throws/returns { ok:false, message } on a create
// refusal. Shared by /create and the reconnect recreate-fallback.
async function _createPodInternal(key, { gpuTypeId, volumeId, datacenter, timeoutMs = 300000, wait = true }) {
  const token = generateWrapperToken();
  const spec = {
    name: 'cubric-vision',
    imageName: POD_IMAGE,
    gpuTypeIds: [gpuTypeId],
    gpuCount: 1,
    dataCenterIds: [datacenter],
    volumeMountPath: '/workspace',
    containerDiskInGb: CONTAINER_DISK_GB,
    ports: ['8889/http'],
    env: {
      CUBRIC_TOKEN: token,
      RUNPOD_API_KEY: key, // watchdog self-stop backstop
      CUBRIC_WRAPPER_VERSION: WRAPPER_VERSION,
    },
  };
  if (volumeId) spec.networkVolumeId = volumeId;

  const created = await client.createPod(key, spec);
  const podId = created.json && created.json.id;
  logger.info('runpod', `createPod REST -> http ${created.status} ok=${created.ok} podId=${podId || 'none'}`);
  if (!created.ok || !podId) {
    const message =
      (created.json && (created.json.error || created.json.message)) ||
      `create returned ${created.status}`;
    return { ok: false, message };
  }

  // Running (billing) from here. Token keyed to the new podId; _startedPodId set
  // BEFORE the ready-wait so a timeout still lets teardown stop/delete it.
  await setWrapperToken(token, podId);
  _startedPodId = podId;
  setRemoteMode({ active: true, podId });

  // Reap any stranded EXITED 'cubric-vision' Pods now that the fresh one is known
  // (keeps this new podId). Non-blocking-best-effort but awaited so the ready-wait
  // window absorbs the (fast) list+delete instead of racing teardown. (Step 4.3.3)
  await _sweepOrphanPods(key, podId);

  // wait:false — the caller (Settings Connect) returns immediately after the
  // (fast) createPod and lets the renderer poll /remote/comfy/status for ready.
  // This avoids holding the HTTP request open for the whole boot, which 504s when
  // RunPod cold-pulls a fresh image tag (~3GB) past the gateway timeout. The
  // reconnect recreate-fallback keeps wait:true (server-internal, needs the result).
  if (!wait) {
    logger.info('runpod', `Pod created (${podId}); renderer will poll for ready`);
    return { ok: true, ready: false, starting: true, podId };
  }

  logger.info('runpod', `waiting for wrapper ready: ${podId}`);
  const out = await waitForWrapperReady(podId, { timeoutMs });
  logger.info('runpod', `wrapper ready=${!!out.ready} for ${podId}`);
  return { ok: true, ready: !!out.ready, podId, health: out.health };
}

// Reap orphaned stopped Pods (Step 4.3.3). The stop-not-delete lifecycle plus the
// recreate-fallback can strand EXITED Pods that nothing tracks (a prior session's
// Pod, or a stuck Pod the fallback replaced). List the account's Pods, keep only
// our own ('cubric-vision') that are EXITED and are NOT the Pod we want to keep
// (the just-created/tracked one), and delete them. Best-effort: a delete failure
// for one Pod never aborts the rest or the caller. Returns the deleted podIds.
async function _sweepOrphanPods(key, keepPodId) {
  const keep = new Set([keepPodId, _startedPodId, _mode.podId].filter(Boolean).map(String));
  let reaped = [];
  try {
    const listed = await client.listPods(key);
    const pods = Array.isArray(listed.json)
      ? listed.json
      : (listed.json && (listed.json.pods || listed.json.data)) || [];
    const orphans = pods.filter(
      (p) =>
        p &&
        p.name === 'cubric-vision' &&
        String(p.desiredStatus).toUpperCase() === 'EXITED' &&
        !keep.has(String(p.id))
    );
    for (const p of orphans) {
      try {
        const del = await client.deletePod(key, p.id);
        if (del.ok) reaped.push(p.id);
      } catch (_) { /* best-effort, continue */ }
    }
    if (reaped.length) {
      logger.info('runpod', `orphan sweep deleted ${reaped.length} stopped Pod(s): ${reaped.join(',')}`);
    }
  } catch (err) {
    logger.warn('runpod', 'orphan Pod sweep failed (non-fatal)');
  }
  return reaped;
}

// Delete the currently-tracked Pod (GPU-switch, failed-resume, or unavailable).
// Clears the token + ids. Best-effort.
async function _deleteTrackedPod(key) {
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  if (!podId) return { deleted: false, reason: 'inactive' };
  const deleted = await client.deletePod(key, podId);
  if (deleted.ok) {
    await clearWrapperToken();
    if (podId === _startedPodId) _startedPodId = null;
    _mode.podId = null;
  }
  return { deleted: !!deleted.ok };
}

// First Connect (and GPU-switch create). Creates a fresh Pod on the picked GPU.
router.post('/remote/pod/create', async (req, res) => {
  const { gpuTypeId, volumeId, datacenter } = req.body || {};
  if (!gpuTypeId) return res.status(422).json({ error: 'gpu_type_required' });
  if (!datacenter) return res.status(422).json({ error: 'datacenter_required' });
  _connecting = true;
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.status(400).json({ error: 'no_api_key' });
    logger.info('runpod', `Pod create requested: gpu=${gpuTypeId} dc=${datacenter} vol=${volumeId || 'none'}`);
    // wait:false — return as soon as the Pod is created; the renderer polls
    // /remote/comfy/status for ready (no 504 on a long first-image pull).
    const out = await _createPodInternal(key, {
      gpuTypeId, volumeId, datacenter, wait: false,
    });
    if (!out.ok) {
      logger.warn('runpod', `Pod create refused: ${out.message}`);
      return res.status(502).json({ error: 'pod_create_failed', message: out.message });
    }
    logger.info('runpod', `Pod create kicked off: ${out.podId}`);
    res.json({ starting: true, ready: false, podId: out.podId });
  } catch (err) {
    logger.error('runpod', 'pod create failed', err);
    res.status(502).json({ error: 'pod_create_failed' });
  } finally {
    _connecting = false;
  }
});

// Reconnect to a saved STOPPED Pod (boot auto-reconnect + Settings Connect when a
// podId is already saved). Flow:
//   1. availability pre-check on the saved GPU → if gone, DELETE the stuck Pod and
//      return { unavailable:true, gpuTypeId } (caller pops "pick another GPU").
//   2. startPod(savedPodId) → ready? warm resume done (same podId, token still valid).
//   3. start fails (host-pinned / any non-already-running error) → DELETE the stuck
//      Pod + create fresh on the same GPU (new token). Returns { ready, podId, recreated }.
router.post('/remote/pod/reconnect', async (req, res) => {
  const { podId, gpuTypeId, volumeId, datacenter } = req.body || {};
  if (!podId) return res.status(422).json({ error: 'pod_id_required' });
  if (!gpuTypeId || !datacenter) return res.status(422).json({ error: 'gpu_type_required' });
  _connecting = true;
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.status(400).json({ error: 'no_api_key' });
    logger.info('runpod', `Pod reconnect requested: podId=${podId} gpu=${gpuTypeId} dc=${datacenter}`);

    // Track the saved Pod so a delete-fallback / teardown targets it.
    _startedPodId = podId;
    setRemoteMode({ active: true, podId });

    // 1. Availability pre-check — a STOPPED Pod can only resume where its GPU type
    //    is free; if the saved GPU is gone, recreating on it would also fail.
    const available = await _isGpuAvailable(key, gpuTypeId, datacenter);
    if (!available) {
      await _deleteTrackedPod(key);
      return res.json({ unavailable: true, gpuTypeId });
    }

    // 2. Warm resume — keeps the same podId (stored token still matches). startPod
    //    is fast; the boot/ready wait is long, so on a successful start return
    //    `starting` and let the renderer poll /remote/comfy/status (no 504).
    const started = await client.startPod(key, podId);
    const startOk = started.ok || started.status === 400; // 400 ~ already running
    if (startOk) {
      logger.info('runpod', `Pod resume kicked off: ${podId}; renderer will poll for ready`);
      return res.json({ starting: true, ready: false, podId, recreated: false });
    }
    const msg = (started.json && (started.json.error || started.json.message)) || `start ${started.status}`;
    logger.warn('runpod', `Pod resume failed (${msg}); recreating fresh`);

    // 3. Resume failed → delete the stuck Pod and create fresh (also poll-for-ready).
    await _deleteTrackedPod(key);
    const out = await _createPodInternal(key, {
      gpuTypeId, volumeId, datacenter, wait: false,
    });
    if (!out.ok) {
      logger.warn('runpod', `recreate after failed resume refused: ${out.message}`);
      return res.status(502).json({ error: 'pod_create_failed', message: out.message });
    }
    res.json({ starting: true, ready: false, podId: out.podId, recreated: true });
  } catch (err) {
    logger.error('runpod', 'pod reconnect failed', err);
    res.status(502).json({ error: 'pod_reconnect_failed' });
  } finally {
    _connecting = false;
  }
});

// Delete the tracked Pod explicitly (GPU-switch in Settings, or a user-initiated
// teardown). The volume is unaffected.
router.post('/remote/pod/delete-active', async (req, res) => {
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.json({ deleted: false, reason: 'no_api_key' });
    res.json(await _deleteTrackedPod(key));
  } catch (err) {
    logger.error('runpod', 'pod delete-active failed', err);
    res.json({ deleted: false, reason: 'error' });
  }
});

// STOP (not delete) the tracked Pod — Disconnect + quit teardown. EXITED bills no
// GPU; the podId is KEPT (persisted client-side) so boot can warm-resume it. Best
// effort — the wrapper idle watchdog is the backstop. Token is retained (a warm
// resume reuses the same podId, so the stored token still matches).
router.post('/remote/pod/stop-active', async (req, res) => {
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  if (!podId) return res.json({ stopped: false, reason: 'inactive' });
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.json({ stopped: false, reason: 'no_api_key' });
    const stopped = await client.stopPod(key, podId);
    if (stopped.ok && podId === _startedPodId) _startedPodId = null;
    res.json({ stopped: !!stopped.ok, podId });
  } catch (err) {
    logger.error('runpod', 'pod stop-active failed', err);
    res.json({ stopped: false, reason: 'error' });
  }
});

// Badge specs for the connected Pod (Step 4.4): GPU name + VRAM (from the gpuTypes
// catalog, the same field the picker shows) + container RAM (from getPod). VRAM is
// always resolvable; RAM is best-effort (omitted if RunPod's Pod shape lacks it).
// `gpuTypeId` comes from the caller (the saved runpodConfig.gpuType).
router.get('/remote/pod/specs', async (req, res) => {
  const gpuTypeId = req.query.gpuTypeId ? String(req.query.gpuTypeId) : null;
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.json({ gpuName: gpuTypeId, vramGb: null, ramGb: null });

    let vramGb = null;
    let gpuName = gpuTypeId;
    if (gpuTypeId) {
      const gpus = await client.gpuTypes(key);
      const g = (gpus || []).find((x) => x.id === gpuTypeId);
      if (g) {
        vramGb = Number(g.memoryInGb) || null;
        gpuName = g.displayName || gpuTypeId;
      }
    }

    // Container RAM from the live Pod. RunPod's REST Pod shape varies; read the
    // likely fields defensively and omit RAM rather than guess.
    let ramGb = null;
    if (podId) {
      try {
        const r = await client.getPod(key, podId);
        const p = r.json || {};
        const m = p.machine || {};
        ramGb =
          Number(p.memoryInGb) ||
          Number(m.memoryInGb) ||
          Number(p.containerMemoryInGb) ||
          null;
      } catch (_) { /* best-effort */ }
    }

    res.json({ gpuName, vramGb, ramGb });
  } catch (err) {
    logger.error('runpod', 'pod specs failed', err);
    res.json({ gpuName: gpuTypeId, vramGb: null, ramGb: null });
  }
});

// Reap stranded stopped 'cubric-vision' Pods (Step 4.3.3). Settings "clean up old
// Pods" action / Connect-time call. Keeps the currently-tracked Pod.
router.post('/remote/pod/cleanup-orphans', async (req, res) => {
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.json({ reaped: [], reason: 'no_api_key' });
    const reaped = await _sweepOrphanPods(key, _startedPodId || _mode.podId);
    res.json({ reaped });
  } catch (err) {
    logger.error('runpod', 'pod cleanup-orphans failed', err);
    res.json({ reaped: [], reason: 'error' });
  }
});

// --- ComfyUI-shaped forwarding routes (renderer base-URL swap targets) ----------

router.post('/proxy/prompt', async (req, res) => {
  const headers = await _guard(res);
  if (!headers) return;
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
    nodeStream.pipe(res);
    req.on('close', () => {
      ctrl.abort();
      nodeStream.destroy();
    });
  } catch (err) {
    logger.error('runpod', 'remote SSE relay failed', err);
    if (!res.headersSent) res.status(502).json({ error: 'relay_failed' });
    else res.end();
  }
});

module.exports = {
  router,
  getRemoteMode,
  setRemoteMode,
};
