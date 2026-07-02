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
const { checkOnline } = require('./netCheck');

// RunPod proxy is behind Cloudflare — default UA gets 403 error 1010.
const { UA, buildAuthHeaders } = require('./remoteHeaders');

// Pod image spec. PyTorch + ComfyUI live in the image (Design A); the volume
// holds models only (arch-agnostic). MPI-70 split the single image into two
// CUDA-floor profiles so the picked card determines the image (Step 5.1):
//   -cu128 = Blackwell (sm_120: 5090 / RTX PRO 6000 / B200), torch 2.7.1+cu128,
//            host-driver floor cuda>=12.8.
//   -cu124 = everything else (Ampere/Ada/Hopper), torch 2.6.0+cu124, host-driver
//            floor cuda>=12.4 — lowers the floor, killing the 4090-on-old-driver
//            nvidia-container-cli refusal (see current-architecture.md §5).
// Both bake ffmpeg + git; sageattention is BAKED per-arch at image build (MPI-145,
// v0.10.0 — no first-boot compile; SDPA fallback if it didn't build). The image TAG version (0.4.8) is
// a rebuild of wrapper 0.2.10 across all three profiles (cpu/cu124/cu128). 0.4.8
// adds the first-boot manifest provenance stamp (MPI-90) the app compat gate reads.
// MPI-100 briefly shipped a v0.4.5 `disk` block (statvfs) but it was REVERTED:
// statvfs reads the multi-PB container overlay, not the RunPod network-volume
// quota, so it was useless for a disk-full gate. Disk-full is now handled
// reactively app-side (downloadService catches the wrapper's "[Errno 122] Disk
// quota exceeded" → toast). Wrapper 0.2.9 makes the idle watchdog a FIXED 10-min
// crash backstop (MPI-103: removed the live-update endpoint + the user-facing
// Settings control; CUBRIC_IDLE_TIMEOUT_S defaults to 600 and isn't sent per-create)
// and carries the MPI-78 start.sh ephemeral data-root fix, on top of 0.2.7's
// cgroup-v1 RAM read + taesd preview prebake (MPI-98), 0.2.5's wrapper-owns-ComfyUI
// + /wrapper/restart-comfy (MPI-81), 0.2.4's honest install progress (MPI-95) +
// /health download-mode branch (MPI-88); image pre-bakes lazy node weights +
// --cache-lru 2.
// v0.4.9 / wrapper 0.2.11 (MPI-82 Phase 2B): adds POST /wrapper/models/upload —
// lands a user's LOCAL LoRA/upscale model on the volume at MODELS_DIR/<type>/ so a
// remote generation auto-uploads it on demand (presence-checked via the existing
// /wrapper/models/status). ComfyUI layer cache-reused from v0.4.8 (no master drift).
// v0.6.0 / wrapper 0.2.11 (MPI-131): remote LTX parity. Adds ComfyUI-LTXVideo
// (4f45fd6) to the baked node set + pins kornia==0.8.2 after node-reqs (LTXVideo
// imports kornia.geometry.transform.pyramid.pad, removed in 0.8.3 -> import fail
// -> "Stage1_Bypass not found"). Bumps ComfyUI-MpiNodes cd951391 -> 780c7c3c
// (MpiReroute/MpiConditioningReroute, the IMG2 node). 8-node set. Wrapper unchanged.
// v0.5.0 / wrapper 0.2.11 (MPI-117 + MPI-118): ComfyUI engine bump
// v0.19.3 -> v0.25.1 (core eca4757, frontend 1.45.15, templates 0.10.0) baked into
// the cu124 + cu128 images via the node version-lock (dev_configs/node_lock.json).
// Same 7-node set as v0.4.9 (RES4LYF stays Builder-only). cpu profile = no engine,
// rebuilt only to keep the trio at one tag. Wrapper unchanged (still 0.2.11).
// EDITING THESE TWO CONSTANTS NEEDS AN APP RESTART — the Express child bakes them
// at boot; a live app keeps sending the old tag until restarted.
// v0.8.1 / wrapper 0.2.14 (MPI-144): Pod ComfyUI now launches with --lowvram, to
// MATCH the local engine (routes/comfy.js:283 uses --lowvram for every NVIDIA GPU).
// Without it the Pod ran ComfyUI in default normalvram → tried to keep the 42GB LTX
// transformer resident in VRAM → OOM-killed a 5s 704x1280 i2v on a 24GB 4090. lowvram
// offloads to system RAM (paired with the --cache-ram pressure-aware default), so big
// models fit on smaller cards exactly as they do locally.
// v0.8.0 / wrapper 0.2.13 (MPI-142 + MPI-143): drop --cache-lru 2 (was pinning
// ~74-84GB system RAM on LTX-2.3 _ms → use --cache-ram default, pressure-aware);
// + map latent_upscale_models/audio_encoders/etc. in the Pod extra_model_paths.yaml
// (a model in an unmapped folder type → ComfyUI can't see it → remote gen silently
// produces no output — the MPI-143 root cause). release:check now guards this drift.
// v0.9.0 / wrapper 0.2.14 (MPI-139): bump ComfyUI v0.25.1→v0.26.0 (node_lock core
// f6c162d, frontend 1.45.19, templates 0.10.3). FLOOR-FIRST build — v0.26 only.
// v0.9.1 / wrapper 0.2.15 (MPI-152): add GET /wrapper/history/{prompt_id} for remote
// gen completion reconciliation. v0.26 terminal WS events are broadcast=False + not
// replayed on reconnect, so a gen finishing during the ~1s remote WS reconnect blip
// never settled → gallery card spun forever. The app now polls /history on reconnect
// (comfyController._reconcileFromHistory) and settles from it. Needs this wrapper
// endpoint → wrapper bump 0.2.14→0.2.15 + a Pod image rebuild to ship for REMOTE.
// (LOCAL is fixed app-side already — it hits ComfyUI /history directly.)
const POD_IMAGE_BASE = 'ghcr.io/madponyinteractive/cubric-vision-pod';
const POD_IMAGE_VERSION = 'v0.10.3';
// The CPU "download mode" image (slim wrapper + aria2c, no torch/ComfyUI) is
// version-INDEPENDENT of the GPU perf work — MPI-156's 0.10.3 bumps (aimdo,
// torch, vram flags) don't touch it. CI builds the -cpu profile separately and it
// is NOT always pushed at the same tag as the GPU images: v0.10.3 shipped cu124
// only, so `v0.10.3-cpu` 404'd → RunPod could not pull → the Pod EXITED on boot
// and the app mis-blamed a "bad host / pick another GPU". Pin the CPU image to its
// own last-built tag so a GPU-only version bump never breaks CPU connects again.
// Bump this only when the -cpu image is actually rebuilt + pushed. (MPI-140)
const POD_IMAGE_VERSION_CPU = 'v0.10.2';
// 0.2.23 (MPI-169): add GET /wrapper/disk (du -sb of the mounted volume) so the
// Settings volume bar can show truthful USED bytes — RunPod's API has no used-bytes.
// R2-publish-only (publish-runtime.sh, no image rebuild). Degrades gracefully: an
// older wrapper 404s /wrapper/disk → app route returns success:false → bar hidden.
const WRAPPER_VERSION = '0.2.23';
const CONTAINER_DISK_GB = 50;
// RunPod CPU Pods reject container disk > 20GB ("Container Disk must be <= 20").
// Download-mode (MPI-88) lands models on the network volume, so 20GB is ample.
const CONTAINER_DISK_CPU_GB = 20;
// No-volume "Any region" ephemeral Pod (MPI-78): with no network volume the user
// picks how much container disk the models download into (it dies with the Pod).
// Default 100GB; clamp to a sane band — a host may still cap lower, in which case
// RunPod rejects the create and _createRejectReason surfaces the reason.
const CONTAINER_DISK_EPHEMERAL_DEFAULT_GB = 100;
const CONTAINER_DISK_EPHEMERAL_MIN_GB = 20;
const CONTAINER_DISK_EPHEMERAL_MAX_GB = 500;
function _clampEphemeralDisk(gb) {
  const n = Math.round(Number(gb));
  if (!Number.isFinite(n)) return CONTAINER_DISK_EPHEMERAL_DEFAULT_GB;
  return Math.min(CONTAINER_DISK_EPHEMERAL_MAX_GB,
    Math.max(CONTAINER_DISK_EPHEMERAL_MIN_GB, n));
}

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
  if (gpuTypeId === CPU_SENTINEL) return `${POD_IMAGE_BASE}:${POD_IMAGE_VERSION_CPU}-cpu`;
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
const MANIFEST_SCHEMA_MAX = 1;

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

// MPI-96: the wrapper /health can't distinguish "Pod booting slowly" from "Pod
// created but never started on the host" — both fail to answer, so the renderer's
// connect bar crawled to 99% on a phantom Pod. Fetch RunPod's Pod runtime status
// (desiredStatus: CREATED/RUNNING/EXITED/TERMINATED/PAUSED/DEAD) as a fallback
// signal when the wrapper isn't ready, so the renderer can bail early on a Pod
// that isn't running. Throttled so the 4s status poll never hammers the RunPod API.
let _lastPodStatus = null;
let _lastPodStatusAt = 0;
let _lastPodStatusId = null;
const POD_STATUS_TTL_MS = 12000;
// MPI-135 (C): getPod's machine object carries maintenanceStart/End/Note when the
// host is scheduled for / under maintenance (RunPod REST). The old code read only
// desiredStatus and threw the rest of p away, so a host placed on a draining machine
// looked like a slow boot and the user waited the full 5-min watchdog. Captured from
// the SAME getPod call (no extra request) and surfaced on /remote/comfy/status so the
// renderer can offer "host looks bad — Cancel & retry" early. Stuck-PULL hosts (the
// other bad-host case) are NOT detectable: the REST API exposes no image-pull progress.
let _lastPodMaintenance = null; // { note, start, end } | null

function _readPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function _firstFinite(obj, paths = []) {
  for (const path of paths) {
    const value = Number(_readPath(obj, path));
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

function _gbToBytes(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n * (1024 ** 3) : null;
}

function _metricFromPod(obj, {
  totalGbPaths = [],
  usedGbPaths = [],
  usedBytePaths = [],
  percentPaths = [],
} = {}) {
  const totalBytes = _gbToBytes(_firstFinite(obj, totalGbPaths));
  let usedBytes = _firstFinite(obj, usedBytePaths);
  if (usedBytes == null) {
    const usedGb = _firstFinite(obj, usedGbPaths);
    usedBytes = _gbToBytes(usedGb);
  }
  let percent = _firstFinite(obj, percentPaths);
  if (percent == null && usedBytes != null && totalBytes) {
    percent = (usedBytes / totalBytes) * 100;
  } else if (percent != null) {
    percent = Math.max(0, Math.min(100, percent));
  }
  if (usedBytes == null && percent != null && totalBytes) {
    usedBytes = totalBytes * (percent / 100);
  }
  return {
    totalBytes,
    usedBytes,
    percent,
    available: totalBytes != null && (usedBytes != null || percent != null),
  };
}

async function _podRuntimeStatus(podId) {
  if (!podId) return null;
  const fresh =
    _lastPodStatusId === podId &&
    Date.now() - _lastPodStatusAt < POD_STATUS_TTL_MS;
  if (fresh) return _lastPodStatus;
  try {
    const key = await getRunPodApiKey();
    if (!key) return _lastPodStatus;
    const r = await client.getPod(key, podId);
    const p = (r && r.json) || {};
    // REST shape varies; desiredStatus is the v1 field. Normalise to uppercase.
    const raw = p.desiredStatus || p.currentStatus || p.status || null;
    _lastPodStatus = raw ? String(raw).toUpperCase() : null;
    // MPI-135 (C): grab maintenance off the machine object from this same call.
    // A maintenanceStart (with no past maintenanceEnd) means the host is draining —
    // bail early instead of waiting out the watchdog on a doomed host.
    const m = p.machine || {};
    _lastPodMaintenance = (m.maintenanceStart || m.maintenanceNote)
      ? { note: m.maintenanceNote || '', start: m.maintenanceStart || '', end: m.maintenanceEnd || '' }
      : null;
    _lastPodStatusId = podId;
    _lastPodStatusAt = Date.now();
  } catch (_) { /* best-effort — leave podStatus null, no regression */ }
  return _lastPodStatus;
}

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
    if (!r.ok) {
      // Wrapper not answering — surface the RunPod Pod status so the renderer can
      // tell a slow boot from a Pod that never started (MPI-96), plus any host
      // maintenance flag so it can bail early on a draining host (MPI-135 C).
      const podStatus = await _podRuntimeStatus(_mode.podId);
      return res.json({ running: false, ready: false, connecting: inFlight(), podStatus, maintenance: _lastPodMaintenance });
    }
    const health = await r.json();
    // Pod is up — the background start finished; clear the spanning flag so the
    // panel flips from "creating…" to ready/Disconnect.
    if (health.ready) _starting = false;
    res.json({ running: true, ready: !!health.ready, comfyReady: !!health.comfy_ready, wrapperVersion: health.wrapper_version || null, connecting: inFlight(), noGpu: _mode.noGpu });
  } catch (_) {
    // expected during Pod cold start / stale-payload window — but also the window
    // where a non-started Pod looks identical. Attach the RunPod Pod status (MPI-96)
    // and any host maintenance flag (MPI-135 C).
    const podStatus = await _podRuntimeStatus(_mode.podId);
    res.json({ running: false, ready: false, connecting: inFlight(), podStatus, maintenance: _lastPodMaintenance });
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
  // MPI-135: a schema-validation 400 comes back as a TOP-LEVEL ARRAY
  // [{ error, problems:[{ ... }] }] — the old code read json.error on the array
  // (always undefined) so it fell through to the misleading "out of stock" copy.
  // Unwrap the first element and surface its problems[] (the field that actually
  // failed), so a malformed-request 400 stops masquerading as a stock refusal.
  if (Array.isArray(json)) {
    const first = json.find((e) => e && typeof e === 'object') || {};
    const probs = Array.isArray(first.problems)
      ? first.problems.map((p) => (p && (p.message || p.detail)) || (typeof p === 'string' ? p : JSON.stringify(p))).filter(Boolean).join('; ')
      : '';
    const head = first.error || first.message || '';
    const reason = [head, probs].filter(Boolean).join(' — ').replace(/\s+/g, ' ').trim();
    return reason.length > 300 ? `${reason.slice(0, 300)}…` : reason;
  }
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

async function _createPodInternal(key, { gpuTypeId, volumeId, datacenter, containerDiskGb, minMemoryInGb, timeoutMs = 300000, wait = true }) {
  const token = generateWrapperToken();
  const noGpu = gpuTypeId === CPU_SENTINEL;
  // No-volume "Any region" ephemeral Pod (MPI-78): no network volume → models
  // download to container disk and die with the Pod. The user sizes that disk; with
  // no volume there is also no DC-lock, so let RunPod auto-place (omit dataCenterIds).
  // CPU download-mode always uses a volume, so it never takes this branch.
  const ephemeral = !noGpu && !volumeId;
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
    // CPU Pods cap container disk at 20GB ("Container Disk must be <= 20"); a volume
    // GPU Pod uses the small default (models live on the volume); an ephemeral
    // no-volume GPU Pod (MPI-78) uses the user-chosen size since models download here.
    containerDiskInGb: noGpu ? CONTAINER_DISK_CPU_GB
      : ephemeral ? _clampEphemeralDisk(containerDiskGb)
      : CONTAINER_DISK_GB,
    ports: ['8889/http'],
    env: {
      CUBRIC_TOKEN: token,
      RUNPOD_API_KEY: key, // watchdog self-stop backstop
      CUBRIC_WRAPPER_VERSION: WRAPPER_VERSION,
      // Idle watchdog is a fixed 10-min CRASH backstop baked into the image
      // (wrapper CUBRIC_IDLE_TIMEOUT_S default 600). It fires only when the app
      // stops sending authenticated traffic — i.e. crashed/closed without a clean
      // teardown — never under a live app. Not user-configurable (MPI-103 removed
      // the Settings control); no per-create override needed.
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
    // Ephemeral "Any region" Pod (MPI-78): tell the image to root model/cache/node
    // data on the CONTAINER disk (start.sh: CUBRIC_EPHEMERAL=1 → /cubric-data) instead
    // of /workspace. RunPod auto-mounts a small (~20GB) default volume at /workspace on
    // every Pod even with no networkVolumeId, so models written there are silently
    // capped at 20GB and ignore the user-chosen container-disk size (verified live:
    // container 31MB/60GB, default volume 7GB/20GB). Needs the image fix (v0.4.6-cu124
    // rebuild) — the env flag alone does nothing on an old image.
    if (ephemeral) spec.env.CUBRIC_EPHEMERAL = '1';
  }
  if (volumeId) spec.networkVolumeId = volumeId;
  // Request the /workspace mount only for a real volume (network volume or CPU
  // download-mode). An ephemeral Pod does NOT name it — though RunPod still attaches
  // its own ~20GB default volume there, the image now writes models to /cubric-data on
  // the container disk (CUBRIC_EPHEMERAL above), so that default volume just sits unused.
  if (volumeId || noGpu) spec.volumeMountPath = '/workspace';
  // Pin the Pod to a data center only when one is given. A volume is DC-locked so a
  // volume Pod always carries a datacenter; an ephemeral no-volume Pod omits it and
  // RunPod auto-places on any region with the GPU in stock ("Any region", MPI-78).
  if (datacenter) spec.dataCenterIds = [datacenter];
  // MPI-160: optional system-RAM FLOOR. RunPod honors minMemoryInGb as a hard
  // placement filter (live-proven: a 200GB ask fails SUPPLY_CONSTRAINT while 90/none
  // create) — so a user who needs a high-RAM host for LTX (or any heavy model) picks
  // a GPU and sets a floor; RunPod only lands a host with >= that much system RAM.
  // Only meaningful for a GPU Pod (RunPod ignores it on CPU download mode).
  if (!noGpu && Number.isFinite(minMemoryInGb) && minMemoryInGb > 0) {
    spec.minMemoryInGb = minMemoryInGb;
  }

  // Pre-create sweep (single-Pod invariant): kill any stray 'cubric-vision' Pod
  // BEFORE making a new one, so a Pod leaked by a prior failed Connect (created
  // but its ready-poll never succeeded → RUNNING + billing, untracked) can never
  // coexist with the one we are about to create. keepPodId=null reaps everything
  // currently stray; the post-create sweep below then keeps only the fresh Pod.
  await _sweepOrphanPods(key, null);

  // MPI-160: when a system-RAM floor is requested, create via GraphQL. minMemoryInGb
  // is live-PROVEN honored on podFindAndDeployOnDemand; the REST POST /pods enum path
  // was NOT proven to accept it (it may silently ignore the floor or schema-400). The
  // GraphQL path returns the same {ok,status,json:{id}} shape, so the flow below is
  // identical. Never for CPU download mode (GraphQL create has no computeType).
  if (spec.minMemoryInGb && !noGpu) {
    logger.info('runpod', `RAM floor ${spec.minMemoryInGb}GB requested → GraphQL create`);
    const gql = await client.createPodGraphql(key, spec);
    const gqlPodId = gql.json && gql.json.id;
    if (gql.ok && gqlPodId) {
      logger.info('runpod', `createPod (RAM-floor GraphQL) -> podId=${gqlPodId}`);
      return _afterPodCreated(key, gqlPodId, token, noGpu, { wait, timeoutMs });
    }
    // Failed — surface the reason (a genuine "no host with >= N GB" is a stock-shaped
    // SUPPLY_CONSTRAINT the shell retry loop can wait on; see _createRejectReason).
    const reason = _createRejectReason(gql.json);
    logger.warn('runpod', `RAM-floor GraphQL create failed: ${reason}`);
    return { ok: false, message: reason || 'No host met the requested system-RAM floor', ramFloorMissed: true };
  }

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
      logger.warn('runpod', `createPod ${created.status}: no parseable reason; raw body=${(body || '{}').slice(0, 2000)}`);
    }
    // MPI-135: a schema-400 naming gpuTypeIds/items/enum means RunPod's REST create
    // endpoint does NOT recognise this GPU id — its createPod enum lags the GraphQL
    // catalogue the picker lists from, so newer cards (e.g. "NVIDIA RTX PRO 4500
    // Blackwell") show as pickable + in-stock yet can never deploy. This is NOT stock;
    // tell the user to pick another card and flag it so the renderer can mark the card
    // unsupported (gpuUnsupported) rather than looping them on a doomed retry.
    const gpuEnumReject = created.status === 400 && /gpuTypeIds\/items\/enum/i.test(parsed || '');
    // MPI-159: the card is genuinely absent from the REST create enum but the GraphQL
    // catalogue (the picker's source) offers it — fall back to GraphQL create, which
    // takes gpuTypeId as a free string and CAN deploy these cards (live-proven on
    // RTX PRO 4500 Blackwell). REST manages the resulting Pod, so the post-create flow
    // below is identical. Never for CPU download-mode (GraphQL create has no computeType).
    if (gpuEnumReject && !noGpu) {
      logger.info('runpod', `REST enum rejected ${gpuTypeId}; falling back to GraphQL create`);
      const gql = await client.createPodGraphql(key, spec);
      const gqlPodId = gql.json && gql.json.id;
      if (gql.ok && gqlPodId) {
        logger.info('runpod', `createPod GraphQL fallback -> podId=${gqlPodId}`);
        return _afterPodCreated(key, gqlPodId, token, noGpu, { wait, timeoutMs });
      }
      // GraphQL ALSO failed. Surface its reason honestly: a true out-of-stock is
      // retryable (let the shell retry loop see a stock-shaped message); only a real
      // unsupported-card stays gpuUnsupported. RunPod GraphQL stock failures don't
      // carry the REST enum marker, so they won't be misclassified as unsupported.
      const gqlReason = _createRejectReason(gql.json) || 'GraphQL create failed';
      logger.warn('runpod', `createPod GraphQL fallback failed: ${gqlReason}`);
      return { ok: false, message: gqlReason, gpuUnsupported: false };
    }
    const reason = gpuEnumReject
      ? `RunPod's deploy API doesn't support this GPU yet (its create list lags the catalogue). Pick a different card — this one can't be deployed even though it shows as available.`
      : (parsed
        || (created.status === 400
          ? `RunPod rejected the request (400) — that GPU may be unavailable in this data center, or out of stock. Try another card or data center.`
          : `create returned ${created.status}`));
    logger.warn('runpod', `createPod REST -> http ${created.status} ok=${created.ok} podId=none reason="${reason}"`);
    return { ok: false, message: reason, gpuUnsupported: gpuEnumReject };
  }
  logger.info('runpod', `createPod REST -> http ${created.status} ok=${created.ok} podId=${podId}`);
  return _afterPodCreated(key, podId, token, noGpu, { wait, timeoutMs });
}

// Shared post-create flow for BOTH the REST primary path and the MPI-159 GraphQL
// fallback. Whichever API created the Pod, REST manages it from here (shared id
// namespace) — token keyed to the podId, single-Pod sweep, then ready-wait (or a
// fast {starting} kickoff when wait:false). Extracted so the GraphQL path reuses
// it verbatim instead of duplicating the wiring.
async function _afterPodCreated(key, podId, token, noGpu, { wait, timeoutMs }) {
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
  const { gpuTypeId, volumeId, datacenter, containerDiskGb, minMemoryInGb } = req.body || {};
  if (!gpuTypeId) return res.status(422).json({ error: 'gpu_type_required' });
  // A volume is locked to its DC, so a volume Pod must name one. An ephemeral
  // no-volume Pod (MPI-78) has no DC-lock → datacenter optional (RunPod auto-places).
  if (volumeId && !datacenter) return res.status(422).json({ error: 'datacenter_required' });
  _connecting = true;
  let kicked = false; // true once a {starting} kickoff is returned — keep _starting set
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.status(400).json({ error: 'no_api_key' });
    // Offline pre-flight (MPI-120): RunPod connect needs real internet. Without
    // this, an offline create still calls the REST API and surfaces a generic
    // "Could not connect" — the renderer can't tell offline from out-of-stock.
    if (!(await checkOnline())) {
      logger.warn('runpod', 'Pod create blocked: host appears offline');
      return res.status(503).json({ error: 'offline', offline: true });
    }
    logger.info('runpod', `Pod create requested: gpu=${gpuTypeId} dc=${datacenter || 'any'} vol=${volumeId || 'none(ephemeral)'}`);
    // wait:false — return as soon as the Pod is created; the renderer polls
    // /remote/comfy/status for ready (no 504 on a long first-image pull).
    const out = await _createPodInternal(key, {
      gpuTypeId, volumeId, datacenter, containerDiskGb, minMemoryInGb, wait: false,
    });
    if (!out.ok) {
      logger.warn('runpod', `Pod create refused: ${out.message}`);
      // MPI-135: a GPU the REST create enum doesn't recognise — pass the flag so the
      // renderer can mark the card unsupported instead of "still preparing".
      // MPI-160: ramFloorMissed → the DC has no host meeting the RAM floor right now.
      return res.status(502).json({ error: 'pod_create_failed', message: out.message, gpuUnsupported: !!out.gpuUnsupported, ramFloorMissed: !!out.ramFloorMissed });
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
  const { podId, gpuTypeId, volumeId, datacenter, containerDiskGb, minMemoryInGb } = req.body || {};
  if (!podId) return res.status(422).json({ error: 'pod_id_required' });
  // datacenter is required only for a volume Pod (DC-locked). An ephemeral no-volume
  // Pod (MPI-78) resumes / recreates with no DC — RunPod auto-places (MPI-78).
  if (!gpuTypeId) return res.status(422).json({ error: 'gpu_type_required' });
  if (volumeId && !datacenter) return res.status(422).json({ error: 'datacenter_required' });
  _connecting = true;
  let kicked = false; // true once a {starting} kickoff is returned — keep _starting set
  try {
    const key = await getRunPodApiKey();
    if (!key) return res.status(400).json({ error: 'no_api_key' });
    // Offline pre-flight (MPI-120): same as create — fail fast with a distinct
    // offline flag instead of the slow REST/recreate path on a dead network.
    if (!(await checkOnline())) {
      logger.warn('runpod', 'Pod reconnect blocked: host appears offline');
      return res.status(503).json({ error: 'offline', offline: true });
    }
    logger.info('runpod', `Pod reconnect requested: podId=${podId} gpu=${gpuTypeId} dc=${datacenter || 'any'}`);

    // Track the saved Pod so a delete-fallback / teardown targets it.
    const noGpu = gpuTypeId === CPU_SENTINEL;
    _startedPodId = podId;
    setRemoteMode({ active: true, podId, noGpu });

    // 1. Availability pre-check — a STOPPED Pod can only resume where its GPU type
    //    is free; if the saved GPU is gone, recreating on it would also fail. A CPU
    //    "download mode" Pod (MPI-88) has no GPU type to check — CPU capacity is
    //    effectively always available, so skip the GPU availability gate for it.
    //    An ephemeral no-volume Pod (MPI-78) has no datacenter to scope the check to
    //    (it was auto-placed); skip the gate and let startPod try — if the host is
    //    full, the start-fail path below deletes + recreates fresh (auto-placed again).
    const skipAvailCheck = noGpu || !datacenter;
    const available = skipAvailCheck || await _isGpuAvailable(key, gpuTypeId, datacenter);
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
      gpuTypeId, volumeId, datacenter, containerDiskGb, minMemoryInGb, wait: false,
    });
    if (!out.ok) {
      logger.warn('runpod', `recreate after failed resume refused: ${out.message}`);
      return res.status(502).json({ error: 'pod_create_failed', message: out.message, ramFloorMissed: !!out.ramFloorMissed });
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

    // Container RAM + billable session figures from the live Pod. RunPod's REST
    // Pod shape (rest.runpod.io/v1) has NO `runtime.uptimeInSeconds` — that field
    // is GraphQL-only, so reading it always yielded null. The REST Pod instead
    // exposes `lastStartedAt` (UTC ISO, when the Pod last STARTED) and `costPerHr`
    // ($/hr, the real billed rate). MPI-80: uptime = now − lastStartedAt is
    // billing-true and (per the OOM self-heal) survives a ComfyUI container
    // restart — lastStartedAt only moves on a real Pod start/resume.
    let ramGb = null;
    let uptimeSeconds = null;
    let pricePerHr = null;
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
        const cost = Number(p.costPerHr ?? p.adjustedCostPerHr);
        if (Number.isFinite(cost) && cost > 0) pricePerHr = cost;
        if (p.lastStartedAt) {
          const started = new Date(p.lastStartedAt).getTime();
          if (Number.isFinite(started)) {
            const secs = Math.floor((Date.now() - started) / 1000);
            if (secs > 0) uptimeSeconds = secs;
          }
        }
      } catch (_) { /* best-effort */ }
    }

    res.json({ gpuName, vramGb, ramGb, uptimeSeconds, pricePerHr });
  } catch (err) {
    logger.error('runpod', 'pod specs failed', err);
    res.json({ gpuName: gpuTypeId, vramGb: null, ramGb: null });
  }
});

// Live remote telemetry for the status-bar memory monitor (MPI-98). Unlike
// /remote/pod/specs, this route is about CURRENT Pod usage, not static Pod
// capacity. The frontend already gets authoritative capacity (gpuName/vramGb/
// ramGb) from the existing remote:connection feed; this route supplies the live
// usage side and is allowed to be partial/unavailable.
//
// SOURCE ORDER (MPI-98): the wrapper's GET /wrapper/stats is the TRUTHFUL source
// (in-Pod cgroup-v2 RAM + nvidia-smi VRAM, v0.4.3+). Try it first. RunPod's REST
// getPod carries NO live usage telemetry in the shapes we've seen, so the REST
// path below is only a best-effort fallback for an OLD wrapper image (pre-stats)
// — it almost always resolves to telemetry_unavailable. If neither source has
// live usage we return `success:false` so the UI shows an explicit
// remote-unavailable state ("Pod N/A") rather than silently showing LOCAL usage.
router.get('/remote/pod/stats', async (req, res) => {
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  if (!_mode.active || !podId) {
    return res.json({ success: false, source: 'remote', unavailable: true, reason: 'remote_inactive' });
  }

  // Preferred: the wrapper's truthful in-Pod stats. A 404 means an old image
  // without the endpoint — fall through to the RunPod REST guess. Any other
  // failure (wrapper booting, network) also falls through; the monitor polls on
  // an interval so a transient miss self-heals next tick.
  try {
    const headers = await _authHeaders();
    if (headers) {
      const upstream = await fetch(`${proxyUrl(podId)}/wrapper/stats`, { headers });
      if (upstream.ok) {
        const wrapperStats = await upstream.json();
        if (wrapperStats && wrapperStats.success) {
          return res.json(wrapperStats);
        }
      }
      // non-ok / unsuccessful → fall through to REST fallback below
    }
  } catch (err) {
    logger.warn('runpod', `wrapper /wrapper/stats unavailable, trying REST: ${err?.message || err}`);
  }

  try {
    const key = await getRunPodApiKey();
    if (!key) {
      return res.json({ success: false, source: 'remote', unavailable: true, reason: 'no_api_key' });
    }
    const podRes = await client.getPod(key, podId);
    const pod = (podRes && podRes.json) || {};

    const ram = _metricFromPod(pod, {
      totalGbPaths: [
        'memoryInGb',
        'machine.memoryInGb',
        'containerMemoryInGb',
      ],
      usedGbPaths: [
        'machine.currentStats.memoryUsedInGb',
        'machine.currentStats.memory.usedInGb',
        'machine.currentStats.systemMemoryUsedInGb',
        'telemetry.memoryUsedInGb',
        'telemetry.memory.usedInGb',
        'runtime.telemetry.memoryUsedInGb',
        'runtime.telemetry.memory.usedInGb',
        'machine.telemetry.memoryUsedInGb',
        'machine.telemetry.memory.usedInGb',
        'machine.podHostCurrentUtilization.memoryUsedInGb',
        'machine.podHostCurrentUtilization.memory.usedInGb',
      ],
      usedBytePaths: [
        'machine.currentStats.memoryUsedBytes',
        'machine.currentStats.memory.usedBytes',
        'telemetry.memoryUsedBytes',
        'telemetry.memory.usedBytes',
        'runtime.telemetry.memoryUsedBytes',
        'runtime.telemetry.memory.usedBytes',
        'machine.telemetry.memoryUsedBytes',
        'machine.telemetry.memory.usedBytes',
        'machine.podHostCurrentUtilization.memoryUsedBytes',
        'machine.podHostCurrentUtilization.memory.usedBytes',
      ],
      percentPaths: [
        'machine.currentStats.memoryUtilPercent',
        'machine.currentStats.memory.percent',
        'machine.currentStats.systemMemoryUtilPercent',
        'telemetry.memoryPercent',
        'telemetry.memory.percent',
        'runtime.telemetry.memoryPercent',
        'runtime.telemetry.memory.percent',
        'machine.telemetry.memoryPercent',
        'machine.telemetry.memory.percent',
        'machine.podHostCurrentUtilization.memoryUtilPercent',
        'machine.podHostCurrentUtilization.memory.percent',
      ],
    });

    const vram = _metricFromPod(pod, {
      totalGbPaths: [
        'gpu.memoryInGb',
        'machine.gpu.memoryInGb',
        'runtime.gpu.memoryInGb',
      ],
      usedGbPaths: [
        'machine.currentStats.gpuMemoryUsedInGb',
        'machine.currentStats.gpu.memoryUsedInGb',
        'machine.currentStats.gpu.usedMemoryInGb',
        'machine.currentStats.vramUsedInGb',
        'telemetry.gpuMemoryUsedInGb',
        'telemetry.gpu.memoryUsedInGb',
        'telemetry.vramUsedInGb',
        'runtime.telemetry.gpuMemoryUsedInGb',
        'runtime.telemetry.gpu.memoryUsedInGb',
        'machine.telemetry.gpuMemoryUsedInGb',
        'machine.telemetry.gpu.memoryUsedInGb',
        'machine.podHostCurrentUtilization.gpuMemoryUsedInGb',
        'machine.podHostCurrentUtilization.gpu.memoryUsedInGb',
      ],
      usedBytePaths: [
        'machine.currentStats.gpuMemoryUsedBytes',
        'machine.currentStats.gpu.memoryUsedBytes',
        'machine.currentStats.gpu.usedMemoryBytes',
        'machine.currentStats.vramUsedBytes',
        'telemetry.gpuMemoryUsedBytes',
        'telemetry.gpu.memoryUsedBytes',
        'telemetry.vramUsedBytes',
        'runtime.telemetry.gpuMemoryUsedBytes',
        'runtime.telemetry.gpu.memoryUsedBytes',
        'machine.telemetry.gpuMemoryUsedBytes',
        'machine.telemetry.gpu.memoryUsedBytes',
        'machine.podHostCurrentUtilization.gpuMemoryUsedBytes',
        'machine.podHostCurrentUtilization.gpu.memoryUsedBytes',
      ],
      percentPaths: [
        'machine.currentStats.gpuMemoryUtilPercent',
        'machine.currentStats.gpu.memoryPercent',
        'machine.currentStats.gpu.memory.percent',
        'machine.currentStats.vramUtilPercent',
        'telemetry.gpuMemoryPercent',
        'telemetry.gpu.memoryPercent',
        'telemetry.gpu.memory.percent',
        'telemetry.vramPercent',
        'runtime.telemetry.gpuMemoryPercent',
        'runtime.telemetry.gpu.memoryPercent',
        'machine.telemetry.gpuMemoryPercent',
        'machine.telemetry.gpu.memoryPercent',
        'machine.podHostCurrentUtilization.gpuMemoryPercent',
        'machine.podHostCurrentUtilization.gpu.memoryPercent',
      ],
    });

    const anyTelemetry = ram.available || vram.available;
    if (!anyTelemetry) {
      return res.json({ success: false, source: 'remote', unavailable: true, reason: 'telemetry_unavailable' });
    }

    res.json({
      success: true,
      source: 'remote',
      ram: {
        used: ram.usedBytes,
        percent: ram.percent != null ? Number(ram.percent.toFixed(1)) : null,
      },
      vram: {
        used: vram.usedBytes,
        percent: vram.percent != null ? Number(vram.percent.toFixed(1)) : null,
      },
    });
  } catch (err) {
    logger.warn('runpod', `pod stats unavailable: ${err?.message || err}`);
    res.json({ success: false, source: 'remote', unavailable: true, reason: 'stats_failed' });
  }
});

// MPI-169: truthful USED bytes of the connected Pod's mounted volume. Unlike RAM/VRAM
// there is NO RunPod REST fallback — the API exposes only the volume's configured size,
// never live usage (proven dead), so the wrapper's `du` is the ONLY source. Returns
// success:false when no pod / old wrapper (pre /wrapper/disk) so the UI hides the bar.
// Works for a GPU pod OR a CPU download pod — both mount the volume at /workspace.
router.get('/remote/pod/disk', async (req, res) => {
  const podId = _startedPodId || (_mode.active && _mode.podId) || null;
  if (!_mode.active || !podId) {
    return res.json({ success: false, source: 'remote', unavailable: true, reason: 'remote_inactive' });
  }
  try {
    const headers = await _authHeaders();
    if (headers) {
      const upstream = await fetch(`${proxyUrl(podId)}/wrapper/disk`, { headers });
      if (upstream.ok) {
        const wrapperDisk = await upstream.json();
        if (wrapperDisk && wrapperDisk.success && Number.isFinite(wrapperDisk.used)) {
          return res.json({ success: true, source: 'wrapper', used: wrapperDisk.used });
        }
      }
      // 404 = old wrapper without /wrapper/disk; 503 = volume not mounted / du failed.
    }
  } catch (err) {
    logger.warn('runpod', `wrapper /wrapper/disk unavailable: ${err?.message || err}`);
  }
  return res.json({ success: false, source: 'remote', unavailable: true, reason: 'disk_unavailable' });
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
    // Lazy require — remoteModels requires this module (circular at load time).
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

module.exports = {
  router,
  getRemoteMode,
  setRemoteMode,
};
