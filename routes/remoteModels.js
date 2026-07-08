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
const { isNetworkDownError } = require('./netCheck');
const { getPinnedNodeCommit } = require('./shared');

// RunPod proxy is behind Cloudflare — the default fetch UA gets 403 error 1010.
const { buildAuthHeaders } = require('./remoteHeaders');

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
  return buildAuthHeaders(token);
}

/**
 * Split an app dep filename that embeds its subdir into the wrapper's
 * { type, filename } shape. The FIRST path segment is the model type root; the
 * REST (subfolders + basename) stays in `filename` so the Pod mirrors the local
 * on-disk layout exactly (local install is `path.join(modelsRoot, dep.filename)`,
 * which keeps every subfolder). MPI-141: splitting on the LAST '/' here used to
 * drop the middle subpath ('loras/LTX2.3/x' -> filename 'x'), so the Pod landed
 * a flat 'loras/x' while local kept 'loras/LTX2.3/x' — and the baked workflow's
 * 'LTX2.3/x' lora_name then failed ComfyUI's value_not_in_list. Two same-named
 * files in different subfolders would also collide to one basename. Splitting on
 * the FIRST '/' preserves the subpath; the wrapper's _model_dest validates it.
 * 'checkpoints/SDXL_Realistic.safetensors' -> { type: 'checkpoints', filename:
 * 'SDXL_Realistic.safetensors' }; 'loras/LTX2.3/Soft_Enhance.safetensors' ->
 * { type: 'loras', filename: 'LTX2.3/Soft_Enhance.safetensors' }. A bare
 * filename with no subdir yields type ''.
 */
function splitDepFilename(depFilename) {
  const norm = String(depFilename || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const idx = norm.indexOf('/');
  if (idx === -1) return { type: '', filename: norm };
  return { type: norm.slice(0, idx), filename: norm.slice(idx + 1) };
}

/**
 * Fetch a wrapper route through the RunPod proxy with auth + UA, retrying the
 * transient warm-up window. Returns the raw fetch Response (caller reads
 * status/body) or throws on network error after retries.
 *
 * Default budget = 15 × 2s ≈ 30s. A Pod RESUMED from warm-stop (the common case
 * on auto-reconnect at app start) can take 20-60s before its wrapper answers —
 * during that window the proxy returns 404 then 502. 8s (the old 4-retry budget)
 * surfaced a failure mid-resume; ~30s rides the resume out so the op self-heals
 * instead of aborting. A genuinely-down wrapper still fails after the budget,
 * surfaced to the user as a TOAST (never an error+GitHub dialog — it's transient).
 */
async function wrapperFetch(routePath, { method = 'GET', body, retries = 15, retryDelayMs = 2000 } = {}) {
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
      // The RunPod proxy returns a TRANSIENT gateway status while the wrapper is
      // briefly unreachable — 404 for a few seconds right after a Pod restart even
      // when /health is green, and 502/503/504 when the proxy has the Pod but the
      // wrapper upstream is still warming or momentarily dropped (seen live on a
      // no-GPU Pod: an uninstall silently did nothing because its shared-dep guard
      // hit a 502 on /wrapper/models/status and safe-aborted; "fixed" only by an
      // app restart that re-warmed the proxy). Retry these rather than fail the
      // whole operation. A real wrapper 4xx/5xx (e.g. 400 bad body, 501 no
      // endpoint) is NOT in this set and still surfaces immediately.
      const isTransientProxyStatus = res.status === 404
        || res.status === 502
        || res.status === 503
        || res.status === 504;
      if (isTransientProxyStatus && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      // Host has no internet (DNS/route dead) — retrying 15× just hangs ~32s
      // for a result that can't change. Fail fast; caller surfaces an offline
      // toast. Transient proxy 5xx (handled above) is a DIFFERENT case and
      // still retries — do not collapse the two. (MPI-120)
      if (isNetworkDownError(err)) {
        const e = new Error('offline');
        e.offline = true;
        throw e;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
    }
  }
  throw lastErr || new Error('wrapper_unreachable');
}

/**
 * The custom_nodes BAKED into the Pod image (Design B+): the nodes WITH pip
 * requirements (`installRequirements: true`) from dependencies.js — baking them
 * at build time keeps venv resolution deterministic. These (ComfyUI-LTXVideo,
 * Impact-Pack, KJNodes, Frame-Interpolation, Impact-Subpack, RES4LYF) are cloned
 * into /opt/ComfyUI/custom_nodes by the image Dockerfile, so the wrapper — which
 * only sees the /workspace volume — never finds them and they must be treated as
 * present. CODE-ONLY custom_nodes (MpiNodes, VHS, UltimateSDUpscale,
 * PainterI2Vadvanced) are NOT in this set: they install onto the volume via the
 * wrapper so a node bump never forces an image rebuild. Loaded from the app dep
 * registry. (MPI-222: bake discriminator was installOnEngine, now installRequirements.)
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
      if (!/installRequirements:\s*true/.test(block)) continue;
      const fn = block.match(/filename:\s*'([^']+)'/);
      if (fn && fn[1]) _universalNodeNames.add(fn[1]);
    }
  } catch (err) {
    logger.warn('runpod', `universal node list load failed: ${err.message}`);
  }
  return _universalNodeNames;
}

/**
 * True for a dep that lives in the Pod Docker IMAGE (baked pip-req nodes,
 * Design B+), not on the network volume. Only `installRequirements: true`
 * custom_nodes qualify — the wrapper can't see them on the volume, so they are
 * reported present. A code-only custom_node returns false → it routes to the
 * wrapper for volume install.
 */
function _isImageResident(dep) {
  // MPI-222: a `targetPath` weight (e.g. RIFE) lives INSIDE a baked node folder in
  // the Pod image (the Dockerfile bakes rife47.pth into comfyui-frame-interpolation/
  // ckpts/rife/), so on remote it is image-resident just like the node — the wrapper
  // can't see it on the volume and must not try to install it (bare filename → empty
  // type → wrapper reject). Report present; the Pod already has it.
  if (dep.targetPath) return true;
  const { type } = splitDepFilename(dep.filename);
  const depType = type || dep.type || '';
  if (depType !== 'custom_nodes') return false;
  // The node's folder name is the bare dep.filename (no subdir for nodes).
  const name = (splitDepFilename(dep.filename).filename) || dep.filename || '';
  return _universalNodeFilenames().has(name);
}

/**
 * Best-effort map of installed node commit by folder name, read from the Pod
 * manifest `nodes[]` (schema v2, MPI-222 — written by the wrapper for volume
 * installs and stamped from the baked `.mpi_node_commit` at boot). Returns {} for
 * an old wrapper (no `nodes[]`) or any fetch error — so a Pod that predates the
 * commit-marker work reports NO drift instead of a false reinstall/warn.
 * @returns {Promise<Record<string,string>>} folder → installed commit
 */
async function _installedNodeCommits() {
  try {
    const res = await wrapperFetch('/wrapper/manifest', { retries: 1 });
    if (!res.ok) return {};
    const manifest = await res.json().catch(() => null);
    const nodes = manifest && Array.isArray(manifest.nodes) ? manifest.nodes : [];
    const map = {};
    for (const n of nodes) {
      if (n && n.filename && n.commit) map[n.filename] = String(n.commit).trim();
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Remote equivalent of POST /comfy/models/check. The app dep `filename` embeds
 * its subdir ('checkpoints/SDXL_Realistic.safetensors'); the wrapper resolves
 * against the volume using a separate { type, filename } shape and 404s/misses
 * a path that still carries the subdir. So we split every dep's filename into
 * { type, filename } before forwarding. The wrapper response already speaks the
 * local check's shape ({ success, results: { [id]: { installed, deps: [...] } } }).
 *
 * Image-resident (BAKED) deps are NOT on the volume the wrapper sees, so they are
 * marked installed inline and never sent to the wrapper; otherwise the pack would
 * read PARTIAL forever. The model's overall `installed` is recomputed as the AND
 * of all deps (volume-checked + image-resident).
 *
 * Node drift (MPI-222), by class:
 *   - VOLUME node: installed commit (manifest nodes[]) ≠ node_lock pinned → mark
 *     installed:false so the pack routes to the existing reinstall path.
 *   - BAKED node: installed commit ≠ pinned → collect into response `bakedDrift`
 *     (a stale Pod image needs a REBUILD); the client shows a ui:warning. Never
 *     mark not-installed, never volume-heal a baked node.
 */
async function remoteModelsCheck(models) {
  const installedCommits = await _installedNodeCommits();
  const bakedDrift = [];
  // Per model, partition deps into image-resident (always present) and
  // volume deps (asked of the wrapper). Track image-resident ids to fold back
  // into the response.
  const imageResidentByModel = {};
  const volumeNodeDrifted = new Set(); // dep ids whose volume install is stale
  const split = (models || []).map((m) => {
    const residentIds = [];
    const volumeDeps = [];
    for (const d of (m.deps || [])) {
      if (_isImageResident(d)) {
        // BAKED node — never volume-checked. Drift here = a stale Pod IMAGE.
        const pinned = getPinnedNodeCommit(d.id);
        if (pinned) {
          const have = installedCommits[d.filename];
          // Only warn when we actually KNOW the baked commit (manifest reported it)
          // and it disagrees — an unknown commit (old wrapper) stays silent.
          if (have && have !== pinned) bakedDrift.push({ id: d.id, filename: d.filename });
        }
        residentIds.push(d.id || null);
        continue;
      }
      // Per-model custom_node: wrapper checks a folder, so keep type
      // 'custom_nodes' + the bare folder name (dep.filename has no subdir).
      if (d.type === 'custom_nodes') {
        // VOLUME node — drift means the folder is present at the WRONG commit; flag
        // it so the fold-back marks it not-installed → existing reinstall path.
        const pinned = getPinnedNodeCommit(d.id);
        if (pinned) {
          const have = installedCommits[d.filename];
          if (have && have !== pinned) volumeNodeDrifted.add(d.id);
        }
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
  // PARTIAL by an image-resident dep the wrapper never saw. Drifted VOLUME nodes
  // are forced installed:false here so the pack routes to the reinstall path.
  const results = json.results || {};
  for (const [mid, residentIds] of Object.entries(imageResidentByModel)) {
    const entry = results[mid] || { installed: true, deps: [] };
    const deps = Array.isArray(entry.deps) ? entry.deps : [];
    for (const d of deps) {
      // A drifted volume node's folder IS present (wrong commit), so the wrapper
      // reports it complete. Force installed:false to route it to reinstall AND tag
      // it `drifted` so the installer sends force:true — else the wrapper short-
      // circuits `already_installed` on folder-exists (wrapper.py) and the node
      // never re-fetches at the pinned commit → an endless install loop (MPI-222).
      if (d && volumeNodeDrifted.has(d.id)) { d.installed = false; d.drifted = true; }
    }
    for (const id of residentIds) {
      deps.push({ id, installed: true, partialBytes: 0 });
    }
    entry.deps = deps;
    entry.installed = deps.every((d) => d.installed);
    results[mid] = entry;
  }
  json.results = results;
  // Surface baked-image drift so the client can warn (rebuild needed). Never
  // affects `installed` — a baked node can't be volume-healed.
  if (bakedDrift.length) json.bakedDrift = bakedDrift;
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
    // MPI-222: pass the node_lock pinned commit so the wrapper stamps
    // .mpi_node_commit + records it in manifest nodes[] for drift detection.
    const pinnedCommit = getPinnedNodeCommit(dep.id);
    if (pinnedCommit) body.commit = pinnedCommit;
    if (dep.installRequirementsCommand) body.install_command = dep.installRequirementsCommand;
    // requirements_only: the node folder is already on the volume, just (re-)run
    // its requirements.txt idempotently — do NOT re-download or remove the folder.
    // Self-heals a node that landed without its pip deps. (set by downloadManager
    // for an already-present custom_node in an install request)
    if (dep.requirementsOnly) body.requirements_only = true;
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
 * Delete a single dependency from the volume through the wrapper. Mirrors the
 * install body shape (id, type, filename). The wrapper endpoint
 * `/wrapper/models/delete` SHIPS in image v0.4.0 / wrapper 0.2.3 (MPI-75). A
 * 404/501 now means the Pod is running an OLDER image without it: that is
 * treated as a SOFT 'unsupported' result, NOT a thrown error, so the caller
 * surfaces a toast and does NOT pretend the model was uninstalled. Returns
 * { status: 'deleted' | 'not_found' | 'unsupported', id }.
 */
async function remoteUninstallDep(dep) {
  let body;
  if (dep.type === 'custom_nodes') {
    body = { id: dep.id, type: 'custom_nodes', filename: dep.filename };
  } else {
    const { type, filename } = splitDepFilename(dep.filename);
    body = { id: dep.id, type, filename };
  }

  let res;
  try {
    res = await wrapperFetch('/wrapper/models/delete', { method: 'POST', body });
  } catch (err) {
    // Network/proxy failure — report unsupported so the UI can explain, don't crash.
    logger.warn('runpod', `remote uninstall ${dep.id}: wrapper unreachable (${err.message})`);
    return { status: 'unsupported', id: dep.id };
  }
  // An OLDER pre-v0.4.0 image lacks the endpoint and answers 404 (FastAPI) or 501.
  if (res.status === 404 || res.status === 501) {
    return { status: 'unsupported', id: dep.id };
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((json && (json.message || json.error)) || `wrapper delete ${res.status}`);
  }
  return json || { status: 'deleted', id: dep.id };
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

/**
 * Ask the Pod whether a single LoRA/upscale model file already sits on the
 * volume, by basename, so a generate-time auto-upload can SKIP a multi-GB
 * re-transfer. Reuses the existing `/wrapper/models/status` contract — the
 * wrapper reads only `dep.type` + `dep.filename` and checks
 * `os.path.exists(MODELS_DIR/<type>/<basename>) && size>0` (no url/sha/size
 * needed). `type` is a wrapper subdir bucket ('loras' | 'upscale_models').
 * Returns true iff present-and-complete; false on absent/partial OR any wrapper
 * error (fail-open to upload — a needless re-upload is safe, a skipped one is
 * not). The basename is taken from the (possibly subfolder-prefixed) filename.
 * @param {string} type      wrapper bucket ('loras' | 'upscale_models')
 * @param {string} filename  local filename (subfolder prefix tolerated)
 * @returns {Promise<boolean>}
 */
async function remoteModelPresent(type, filename) {
  const path = require('path');
  const base = path.basename(String(filename || '').replace(/\\/g, '/'));
  if (!type || !base) return false;
  try {
    const body = { models: [{ id: '_present', deps: [{ id: base, type, filename: base }] }] };
    const res = await wrapperFetch('/wrapper/models/status', { method: 'POST', body });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return false;
    const dep = json.results?._present?.deps?.[0];
    return Boolean(dep && dep.installed);
  } catch (err) {
    // Wrapper unreachable / transient — fail open (upload). A redundant upload is
    // cheap-ish and the overwrite is idempotent; a wrongly-skipped one breaks gen.
    logger.warn('runpod', `remote model presence check failed for ${base} (${err.message})`);
    return false;
  }
}

/**
 * Upload a LOCAL LoRA/upscale model file to the Pod volume's models dir so a
 * remote generation can resolve it by basename. Mirrors `remoteUploadInput`
 * (read file server-side, multipart through the RunPod proxy with auth + browser
 * UA + post-restart 404 retry) but targets the NEW wrapper endpoint
 * `/wrapper/models/upload`, which lands the file in `MODELS_DIR/<type>/<basename>`
 * (via the wrapper's `_model_dest`) instead of the input dir. Adds a `type` form
 * field (the wrapper bucket: 'loras' | 'upscale_models').
 *
 * GATING: `/wrapper/models/upload` ships in a Pod-image rebuild (MPI-81). Against
 * an older image the endpoint 404s; `remoteUploadInput`'s shared retry treats a
 * 404 as transient warm-up and exhausts its budget, then throws — so the CALLER
 * must guard this behind a rebuilt-image check (or accept a clean failure toast)
 * until the endpoint exists. Returns the wrapper JSON ({ name, type, path }).
 * @param {string} localPath  absolute local model path
 * @param {string} type       wrapper bucket ('loras' | 'upscale_models')
 * @param {string} filename   destination basename (subfolder prefix tolerated)
 * @returns {Promise<object>}
 */
async function remoteUploadModel(localPath, type, filename) {
  const fs = require('fs-extra');
  const path = require('path');
  if (!localPath || typeof localPath !== 'string') throw new Error('localPath required');
  if (!type || typeof type !== 'string') throw new Error('type required');
  if (!(await fs.pathExists(localPath))) throw new Error(`model file missing: ${localPath}`);

  const base = path.basename(String(filename || localPath).replace(/\\/g, '/'));
  if (!base || base === '.' || base === '..') {
    throw new Error('filename must resolve to a bare basename');
  }

  const podId = _podId();
  if (!podId) throw new Error('remote_inactive');
  const headers = await _authHeaders();
  if (!headers) throw new Error('wrapper_token_missing');

  const buf = await fs.readFile(localPath);
  const url = `${proxyUrl(podId)}/wrapper/models/upload`;

  const retries = 4;
  const retryDelayMs = 2000;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const form = new FormData();
      form.append('file', new Blob([buf]), base);
      form.append('filename', base);
      form.append('type', type);
      form.append('overwrite', 'true');
      const res = await fetch(url, { method: 'POST', headers: { ...headers }, body: form });
      if (res.status === 404 && attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        throw new Error((json && (json.message || json.error)) || `wrapper model upload ${res.status}`);
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
  throw lastErr || new Error('wrapper_model_upload_failed');
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
function openInstallEventStream(onEvent, onClose) {
  const controller = new AbortController();
  // MPI-97 — fire onClose exactly once when the stream ends WITHOUT a deliberate
  // abort, so the driver can decide whether to reconnect (installs still
  // outstanding) or let it go. A deliberate abort() is a clean teardown and must
  // NOT trigger reconnect.
  let _closed = false;
  const _fireClose = (reason) => {
    if (_closed) return;
    _closed = true;
    if (controller.signal.aborted) return;
    if (typeof onClose === 'function') {
      try { onClose(reason); } catch { /* driver-side */ }
    }
  };
  (async () => {
    let headers;
    try {
      headers = await _authHeaders();
    } catch {
      headers = null;
    }
    if (!headers) { _fireClose('no-auth'); return; }
    const podId = _podId();
    if (!podId) { _fireClose('no-pod'); return; }
    try {
      const res = await fetch(`${proxyUrl(podId)}/wrapper/events/stream`, {
        headers: { ...headers, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) { _fireClose('bad-response'); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;  // server closed the stream — falls through to _fireClose below
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
      // Reader drained (server closed the stream) without an abort — recover.
      _fireClose('stream-ended');
    } catch (err) {
      if (controller.signal.aborted) return;
      logger.warn('runpod', 'remote install SSE closed');
      _fireClose('error');
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
  remoteUninstallDep,
  remoteUploadInput,
  remoteModelPresent,
  remoteUploadModel,
  remoteCancelInstall,
  openInstallEventStream,
};
