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

// Pod image spec. PyTorch + ComfyUI live in the image (Design A); the volume
// holds models only (arch-agnostic). MPI-70 split the single image into two
// CUDA-floor profiles so the picked card determines the image (Step 5.1):
//   -cu128 = Blackwell (sm_120: 5090 / RTX PRO 6000 / B200), torch 2.7.1+cu128,
//            host-driver floor cuda>=12.8.
//   -cu124 = everything else (Ampere/Ada/Hopper), torch 2.6.0+cu124, host-driver
//            floor cuda>=12.4 — lowers the floor, killing the 4090-on-old-driver
//            nvidia-container-cli refusal (see current-architecture.md §5).
// Both bake ffmpeg + git; sageattention compiles to the volume on first boot per
// GPU arch (~5-15 min one-time, SDPA fallback). The image TAG version (0.4.1)
// tracks CUBRIC_WRAPPER_VERSION (0.2.4 — honest install progress: _resolve_total
// HEAD pre-seed + models:install-verifying SSE (MPI-95) + /health download-mode
// branch (MPI-88); image also pre-bakes lazy node weights + --cache-lru 2;
// MPI-81 rebuild batch).
const POD_IMAGE_BASE = 'ghcr.io/madponyinteractive/cubric-vision-pod';
const POD_IMAGE_VERSION = 'v0.4.1';
const WRAPPER_VERSION = '0.2.4';
const CONTAINER_DISK_GB = 50;
// RunPod CPU Pods reject container disk > 20GB ("Container Disk must be <= 20").
// Download-mode (MPI-88) lands models on the network volume, so 20GB is ample.
const CONTAINER_DISK_CPU_GB = 20;

// Sentinel gpuTypeId for the no-GPU "download mode" Pod (MPI-88). The Settings GPU
// dropdown offers this as its first option; picking it creates a CPU-only Pod
// (computeType:'CPU') so a user can install models to the volume with NO GPU bill,
// then switch to a real GPU to generate (volume persists — Design A). It rides the
// existing gpuType field/guards/switch logic untouched; the only branches that care
// are the create spec and the generation gate.
const CPU_SENTINEL = '__cpu__';

// Blackwell (sm_120) cards need the cu128 image; everything else runs cu124.
// gpuTypeId is RunPod's card id/displayName (e.g. "NVIDIA GeForce RTX 5090",
// "NVIDIA RTX PRO 6000 Blackwell", "NVIDIA B200"). Match on the model tokens —
// RunPod ids carry the full marketing name, so a substring test is reliable and
// degrades safely (unknown card → cu124, the broad-compat default).
function podImageForCard(gpuTypeId) {
  // No-GPU "download mode" (MPI-88) → the SLIM wrapper-only image (no torch/ComfyUI).
  // The full GPU image won't run on a CPU Pod (its entrypoint inits CUDA), so the
  // -cpu tag is mandatory, not an optimization.
  if (gpuTypeId === CPU_SENTINEL) return `${POD_IMAGE_BASE}:${POD_IMAGE_VERSION}-cpu`;
  const id = String(gpuTypeId || '').toLowerCase();
  const isBlackwell =
    id.includes('5090') ||
    id.includes('rtx pro 6000') ||
    id.includes('b200') ||
    id.includes('blackwell');
  const suffix = isBlackwell ? 'cu128' : 'cu124';
  return `${POD_IMAGE_BASE}:${POD_IMAGE_VERSION}-${suffix}`;
}

// --- remote-mode state (backend-owned; Settings/boot gate flips it) ----------

const _mode = { active: false, podId: null, deleteOnQuit: false, noGpu: false };

// The Pod this server session actually STARTED (set on successful /remote/pod/start,
// cleared on stop). Quit-time stop must target this — not _mode.podId, which tracks
// the Settings field and can be changed mid-session, orphaning the running Pod.
let _startedPodId = null;

// True while a create/reconnect ROUTE is in flight (synchronous window only).
// Backend-owned so it survives a Settings panel close/reopen (the renderer's own
// _engineBusy is per-mount and resets) — prevents a second Connect firing a
// duplicate create.
let _connecting = false;

// True from the moment a create/reconnect returns `{starting:true}` until the Pod
// reaches ready (or the attempt is abandoned). Unlike _connecting, this spans the
// whole BACKGROUND boot/resume — the route returns fast (wait:false) but the Pod
// keeps booting, and without this the status route would report "stopped" + the
// Settings panel would re-enable Connect mid-boot (race: open Settings during a
// boot auto-reconnect → "stopped" + Connect enabled → a second Connect = duplicate
// Pod). The status route self-clears it when /health goes ready or the podId drifts.
let _starting = false;

function getRemoteMode() {
  return { ..._mode };
}

function setRemoteMode({ active, podId, deleteOnQuit, noGpu } = {}) {
  if (podId !== undefined && podId !== null) _mode.podId = String(podId);
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

// --- mode routes ----------------------------------------------------------------

router.get('/remote/mode', (req, res) => {
  res.json(getRemoteMode());
});

router.post('/remote/mode', (req, res) => {
  // Step 4.2: remote mode can be active with NO podId — the Pod is created later
  // on Connect (create-on-Connect). The boot gate just needs the active flag to
  // skip the local-engine install path. /proxy/* routes still 503 until a Pod
  // exists (the token guard), so there is no unauthenticated remote call.
  const { active, podId, deleteOnQuit } = req.body || {};
  const out = setRemoteMode({ active, podId, deleteOnQuit });
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
  // `connecting` = the synchronous route window OR a background boot/resume still
  // in progress, so the Settings panel stays "creating…" + Connect disabled for
  // the WHOLE boot (not just the brief route call) — closes the open-Settings-
  // during-boot race that re-enabled Connect mid-boot.
  const inFlight = () => _connecting || _starting;
  if (!_mode.active || !_mode.podId) return res.json({ running: false, ready: false, connecting: inFlight() });
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${proxyUrl(_mode.podId)}/health`, {
      headers: { 'User-Agent': UA },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return res.json({ running: false, ready: false, connecting: inFlight() });
    const health = await r.json();
    // Pod is up — the background start finished; clear the spanning flag so the
    // panel flips from "creating…" to ready/Disconnect.
    if (health.ready) _starting = false;
    res.json({ running: true, ready: !!health.ready, comfyReady: !!health.comfy_ready, connecting: inFlight(), noGpu: _mode.noGpu });
  } catch (_) {
    // expected during Pod cold start / stale-payload window
    res.json({ running: false, ready: false, connecting: inFlight() });
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
// Pull the most useful human reason out of a RunPod createPod reject body (L2).
// Order: explicit error/message, a GraphQL-style errors[].message, then a raw
// non-JSON body (HTML/plain that _rest stored under {raw}). Truncated so a long
// HTML error page can't flood the log line or the failure dialog.
function _createRejectReason(json) {
  if (!json || typeof json !== 'object') return '';
  // RunPod's v1 REST error shape isn't fully documented and varies by failure
  // class (a stock 500 answers {error}; some 400 validation rejects use {detail}
  // or {title}, or send an EMPTY body). Read every field we've seen, then fall
  // back to the raw text body.
  let reason = json.error || json.message || json.detail || json.title || json.reason || '';
  if (!reason && Array.isArray(json.errors) && json.errors.length) {
    reason = json.errors.map((e) => (e && (e.message || e.error || e.detail)) || String(e)).filter(Boolean).join('; ');
  }
  if (!reason && typeof json.raw === 'string') reason = json.raw.trim();
  reason = String(reason).replace(/\s+/g, ' ').trim();
  return reason.length > 300 ? `${reason.slice(0, 300)}…` : reason;
}

async function _createPodInternal(key, { gpuTypeId, volumeId, datacenter, timeoutMs = 300000, wait = true }) {
  const token = generateWrapperToken();
  const noGpu = gpuTypeId === CPU_SENTINEL;
  // CPU "download mode" Pod (MPI-88): same POST /pods endpoint, computeType:'CPU' +
  // cpuFlavorIds; RunPod ignores the GPU fields. The SLIM -cpu image (wrapper +
  // aria2c only, no torch/ComfyUI) is REQUIRED — the full GPU image's entrypoint
  // inits CUDA and won't run on a CPU Pod (verified: 0 processes, eternal
  // "connecting"). /health + /wrapper/models/install work for downloads with no GPU
  // bill. cpu3c = cheapest flavor; a model download is network/disk-bound.
  const imageName = podImageForCard(gpuTypeId);
  logger.info('runpod', `Pod image for ${noGpu ? 'CPU (download mode)' : gpuTypeId}: ${imageName}`);
  const spec = {
    name: 'cubric-vision',
    imageName,
    dataCenterIds: [datacenter],
    volumeMountPath: '/workspace',
    // CPU Pods cap container disk at 20GB ("Container Disk must be <= 20"); GPU
    // Pods allow the larger default. Models land on the network volume either way,
    // so 20GB of container disk is plenty for the download-mode Pod.
    containerDiskInGb: noGpu ? CONTAINER_DISK_CPU_GB : CONTAINER_DISK_GB,
    ports: ['8889/http'],
    env: {
      CUBRIC_TOKEN: token,
      RUNPOD_API_KEY: key, // watchdog self-stop backstop
      CUBRIC_WRAPPER_VERSION: WRAPPER_VERSION,
    },
  };
  if (noGpu) {
    spec.computeType = 'CPU';
    spec.cpuFlavorIds = ['cpu3c'];
    // Belt-and-braces: the -cpu image's start-cpu.sh already exports this, but set
    // it on the Pod env too so the wrapper reports /health ready (no ComfyUI probe)
    // even if the image is ever launched with a different entrypoint.
    spec.env.CUBRIC_DOWNLOAD_MODE = '1';
  } else {
    spec.gpuTypeIds = [gpuTypeId];
    spec.gpuCount = 1;
  }
  if (volumeId) spec.networkVolumeId = volumeId;

  // Pre-create sweep (single-Pod invariant): kill any stray 'cubric-vision' Pod
  // BEFORE making a new one, so a Pod leaked by a prior failed Connect (created
  // but its ready-poll never succeeded → RUNNING + billing, untracked) can never
  // coexist with the one we are about to create. keepPodId=null reaps everything
  // currently stray; the post-create sweep below then keeps only the fresh Pod.
  await _sweepOrphanPods(key, null);

  const created = await client.createPod(key, spec);
  const podId = created.json && created.json.id;
  if (!created.ok || !podId) {
    // Surface RunPod's actual reject reason (L2). _rest parses the body into
    // created.json — a JSON error answers {error|message|errors}; a non-JSON
    // body (HTML/plain) lands as {raw}. Fall back through all of them so the
    // failure is self-diagnosing in BOTH the log line and the failure dialog,
    // instead of a bare "create returned 400". (RunPod responses don't echo our
    // key; truncate only to keep the log/dialog readable.)
    const parsed = _createRejectReason(created.json);
    // When RunPod gives no parseable reason (a bare 400 with an empty/odd body),
    // dump the raw JSON body so the NEXT occurrence self-diagnoses instead of the
    // opaque "create returned 400". Keys only (no secret echo); truncated.
    if (!parsed) {
      let body = '';
      try { body = JSON.stringify(created.json); } catch (_) { body = String(created.json); }
      logger.warn('runpod', `createPod ${created.status}: no parseable reason; raw body=${(body || '{}').slice(0, 300)}`);
    }
    const reason = parsed
      || (created.status === 400
        ? `RunPod rejected the request (400) — that GPU may be unavailable in this data center, or out of stock. Try another card or data center.`
        : `create returned ${created.status}`);
    logger.warn('runpod', `createPod REST -> http ${created.status} ok=${created.ok} podId=none reason="${reason}"`);
    return { ok: false, message: reason };
  }
  logger.info('runpod', `createPod REST -> http ${created.status} ok=${created.ok} podId=${podId}`);

  // Running (billing) from here. Token keyed to the new podId; _startedPodId set
  // BEFORE the ready-wait so a timeout still lets teardown stop/delete it.
  await setWrapperToken(token, podId);
  _startedPodId = podId;
  setRemoteMode({ active: true, podId, noGpu });

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

// Single-Pod invariant (Step 4.3.4): Cubric uses exactly ONE 'cubric-vision' Pod
// per RunPod account (one volume, one session). Any OTHER 'cubric-vision' Pod is
// an orphan and is DELETED regardless of status — EXITED *or* RUNNING. This is the
// billing guardrail for the failure that stranded paid Pods live: a Connect that
// creates a Pod then fails its ready-poll left a RUNNING orphan, and the next
// Connect created a second one (two cards billing at once). Reaping RUNNING
// non-keepers makes that double-billing structurally impossible instead of
// relying on the per-Pod 15-min idle watchdog.
//
// `keepPodId` is the Pod we must NOT delete (the just-created/tracked one); pass
// null to reap EVERYTHING (pre-create sweep, before a new Pod exists). The tracked
// ids (_startedPodId/_mode.podId) are also spared. Best-effort: one delete failing
// never aborts the rest or the caller. Returns the deleted podIds.
async function _sweepOrphanPods(key, keepPodId) {
  const keep = new Set([keepPodId, _startedPodId, _mode.podId].filter(Boolean).map(String));
  let reaped = [];
  try {
    const listed = await client.listPods(key);
    const pods = Array.isArray(listed.json)
      ? listed.json
      : (listed.json && (listed.json.pods || listed.json.data)) || [];
    const orphans = pods.filter(
      (p) => p && p.name === 'cubric-vision' && !keep.has(String(p.id))
    );
    for (const p of orphans) {
      try {
        const del = await client.deletePod(key, p.id);
        if (del.ok) reaped.push(p.id);
      } catch (_) { /* best-effort, continue */ }
    }
    if (reaped.length) {
      logger.info('runpod', `orphan sweep deleted ${reaped.length} stray Pod(s): ${reaped.join(',')}`);
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
  let kicked = false; // true once a {starting} kickoff is returned — keep _starting set
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
    kicked = true;
    _starting = true; // spans the background boot until status sees ready
    res.json({ starting: true, ready: false, podId: out.podId });
  } catch (err) {
    logger.error('runpod', 'pod create failed', err);
    res.status(502).json({ error: 'pod_create_failed' });
  } finally {
    _connecting = false;
    if (!kicked) _starting = false; // refused/errored — not actually booting
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
  let kicked = false; // true once a {starting} kickoff is returned — keep _starting set
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.status(400).json({ error: 'no_api_key' });
    logger.info('runpod', `Pod reconnect requested: podId=${podId} gpu=${gpuTypeId} dc=${datacenter}`);

    // Track the saved Pod so a delete-fallback / teardown targets it.
    const noGpu = gpuTypeId === CPU_SENTINEL;
    _startedPodId = podId;
    setRemoteMode({ active: true, podId, noGpu });

    // 1. Availability pre-check — a STOPPED Pod can only resume where its GPU type
    //    is free; if the saved GPU is gone, recreating on it would also fail. A CPU
    //    "download mode" Pod (MPI-88) has no GPU type to check — CPU capacity is
    //    effectively always available, so skip the GPU availability gate for it.
    const available = noGpu || await _isGpuAvailable(key, gpuTypeId, datacenter);
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
      kicked = true;
      _starting = true; // spans the background resume until status sees ready
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
    kicked = true;
    _starting = true;
    res.json({ starting: true, ready: false, podId: out.podId, recreated: true });
  } catch (err) {
    logger.error('runpod', 'pod reconnect failed', err);
    res.status(502).json({ error: 'pod_reconnect_failed' });
  } finally {
    _connecting = false;
    if (!kicked) _starting = false; // unavailable / refused / errored — not booting
  }
});

// Delete the tracked Pod explicitly (GPU-switch in Settings, or a user-initiated
// teardown). The volume is unaffected.
router.post('/remote/pod/delete-active', async (req, res) => {
  _starting = false; // terminal action — no longer booting
  // Disconnect/delete → use the LOCAL engine now. Flip remote mode OFF so
  // isRemoteActive() returns false and local _ms input-prep takes the local
  // copy path instead of the (gone) wrapper. See stop-active for the full why.
  setRemoteMode({ active: false, noGpu: false });
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
  _starting = false; // terminal action — no longer booting
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  // Disconnect means "use the LOCAL engine now". Flip remote mode OFF so
  // isRemoteActive() (= active && podId) returns false — otherwise local _ms
  // generations route input-prep (prepare-workflow-inputs / stage-preview-latent)
  // to the now-stopped wrapper and fail with "wrapper upload 404". podId is kept
  // client-side for warm-resume; a fresh Connect re-sets active=true.
  setRemoteMode({ active: false, noGpu: false });
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

// Quit teardown — branches on the user's delete-on-quit pref (runpodConfig,
// pushed to _mode via /remote/mode). OFF (default) = STOP warm (Step 4.3);
// ON = DELETE the Pod (frees GPU + container disk; the volume persists). main.js
// calls this on clean quit so it never has to know the pref itself.
router.post('/remote/pod/teardown', async (req, res) => {
  _starting = false; // terminal action — no longer booting
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.json({ ok: false, action: 'none', reason: 'no_api_key' });

    if (_mode.deleteOnQuit) {
      // Delete-on-quit: delete the tracked Pod FIRST, then sweep any stray.
      // NOTE: _sweepOrphanPods ALWAYS spares _startedPodId + _mode.podId (they
      // point at the live Pod), so calling it alone reaps nothing — that left the
      // running Pod alive on quit (hit live: "reaped=none"). _deleteTrackedPod
      // kills the tracked Pod and CLEARS those ids; the follow-up sweep then has
      // an empty keep-set and reaps any other stray 'cubric-vision' Pod. Volume
      // persists.
      logger.info('runpod', `teardown: delete-on-quit — deleting tracked Pod ${podId || 'none'} + sweeping`);
      const del = await _deleteTrackedPod(key); // clears _startedPodId + _mode.podId on success
      const reaped = await _sweepOrphanPods(key, null);
      await clearWrapperToken().catch(() => {});
      logger.info('runpod', `teardown delete done: tracked=${del.deleted ? podId : 'none'} reaped=${reaped.join(',') || 'none'}`);
      return res.json({ ok: !!del.deleted || reaped.length > 0, action: 'delete', podId, reaped });
    }

    // Stop-warm (default): stop the tracked Pod, then reap any OTHER stray
    // 'cubric-vision' Pod (a leaked one) so nothing else keeps billing GPU.
    logger.info('runpod', `teardown: stop-warm podId=${podId || 'none'}`);
    if (podId) {
      const stopped = await client.stopPod(key, podId);
      if (stopped.ok && podId === _startedPodId) _startedPodId = null;
    }
    const reaped = await _sweepOrphanPods(key, podId);
    logger.info('runpod', `teardown stop done: podId=${podId || 'none'} reaped=${reaped.join(',') || 'none'}`);
    res.json({ ok: true, action: 'stop', podId, reaped });
  } catch (err) {
    logger.error('runpod', 'pod teardown failed', err);
    res.json({ ok: false, action: 'error', reason: 'error' });
  }
});

// Badge specs for the connected Pod (Step 4.4): GPU name + VRAM (from the gpuTypes
// catalog, the same field the picker shows) + container RAM (from getPod). VRAM is
// always resolvable; RAM is best-effort (omitted if RunPod's Pod shape lacks it).
// `gpuTypeId` comes from the caller (the saved runpodConfig.gpuType).
router.get('/remote/pod/specs', async (req, res) => {
  const gpuTypeId = req.query.gpuTypeId ? String(req.query.gpuTypeId) : null;
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  // MPI-88: the no-GPU "download mode" Pod has no GPU to look up — label the badge
  // "No GPU (download)" instead of leaking the raw sentinel, and skip the catalog.
  if (gpuTypeId === CPU_SENTINEL) {
    return res.json({ gpuName: 'No GPU (download)', vramGb: null, ramGb: null });
  }
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
    // Lazy require — remoteModels requires this module (circular at load time).
    const remoteModels = require('./remoteModels');
    const out = await remoteModels.remoteUploadInput(localPath, filename || localPath, '/wrapper/upload/media');
    res.json({ success: true, name: out.name, type: out.type || 'input' });
  } catch (err) {
    logger.error('runpod', `remote media upload failed: ${err.message}`);
    res.status(502).json({ error: 'upload_failed', message: err.message });
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
    // Same crash guard as _streamthrough: the SSE relay is the live event
    // channel during a generation, so its upstream socket drops whenever the
    // Pod OOMs/restarts mid-gen. An unhandled 'error' here would crash the
    // backend (exit 1) and freeze the generation. Swallow + end the SSE.
    nodeStream.on('error', (err) => {
      logger.warn('runpod', `remote SSE stream aborted: ${err?.message || err}`);
      ctrl.abort();
      if (!res.writableEnded) res.end();
    });
    res.on('error', () => {
      ctrl.abort();
      nodeStream.destroy();
    });
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
