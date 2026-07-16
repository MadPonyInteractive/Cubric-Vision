/**
 * routes/downloadManager.js — Non-blocking, single-stream download manager.
 *
 * Endpoints:
 *   POST /comfy/models/download/start   — enqueue a model's deps
 *   POST /comfy/models/download/cancel  — clean stop + remove partial (no resume)
 *   GET  /comfy/downloads/status         — full queue snapshot
 *   GET  /comfy/downloads/stream         — SSE stream
 *
 * Downloads do NOT resume (MPI-258 Bug 2): NDH resume appended a full 200 response
 * onto a partial → SHA256 corruption. A cancelled/interrupted download restarts clean.
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
// trash@8 is ESM-only; lazy-load via dynamic import for CommonJS interop
let _trashFn = null;
async function _trash(p) {
    if (!_trashFn) {
        const mod = await import('trash');
        _trashFn = mod.default;
    }
    return _trashFn(p);
}
const crypto = require('crypto');
const { createRequire } = require('module');
const logger = require('./logger');
const { checkOnline } = require('./netCheck');
const { runPipCommand, runCustomCommand, resolveComfyPath, getCustomRoot, cleanEmptyDirs, getUniversalWorkflowDepIds, getDefaultModelsRoot, processState, writeNodeCommitMarker } = require('./shared');
const { getComfyPath, getEngineRoot } = require('./platformEngine');
const {
    isCompleteOnDisk,
    markDownloadInProgress,
    clearDownloadMarker,
} = require('./downloadCompletion');
const { DownloaderHelper } = require('node-downloader-helper');
const remoteModels = require('./remoteModels');
const { createInstallStore } = require('./install/installStore');
const { createReconciler } = require('./install/reconciler');

const _require = createRequire(__filename);
let _extractZip = null;

// Extract a custom-node archive (GitHub /archive/ or Comfy Registry zip).
// Fast path: native `tar` (bsdtar on Windows/macOS = libarchive, reads zip) —
// ~2.7x faster than pure-JS extract-zip on Windows (the villain was extract-zip's
// single-file JS write loop, not decompression), and streams one entry at a time
// in a separate process = constant RAM regardless of file count. GNU tar on Linux
// can't read zip, so ANY tar failure falls back to extract-zip (Linux keeps today's
// exact behaviour). Remote/Pod nodes are image-resident and never reach this path.
// See MPI-248 for measurements + the bite-back watchlist.
async function _extractZipArchive(zipPath, extractDir) {
    const dir = path.resolve(extractDir);
    try {
        const { execFile } = _require('child_process');
        const { promisify } = _require('util');
        await promisify(execFile)('tar', ['-xf', zipPath, '-C', dir], { windowsHide: true });
        return;
    } catch (err) {
        logger.warn('download', `native tar extract failed (${err.message}) — falling back to extract-zip`);
    }
    if (!_extractZip) {
        _extractZip = _require('extract-zip');
    }
    await _extractZip(zipPath, { dir });
}

// MPI-243: is a custom-node folder actually EXTRACTED, or just a shell created by
// a `targetPath` weight that lands under it (e.g. RIFE writes
// comfyui-frame-interpolation/ckpts/rife/rife47.pth before the node itself
// extracts)? A real node ships top-level FILES (__init__.py, install.py, ...); a
// weight-only shell holds nothing but subdirs. True = at least one top-level file.
async function _nodeFolderHasFiles(dir) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
        return false; // absent or unreadable → treat as not extracted
    }
    return entries.some(e => e.isFile());
}

const ENGINE_ROOT = getEngineRoot();

// ── Engine-aware dep filter (server-side defense) ─────────────────────────────
// The renderer resolves a model's deps for the target engine before POSTing, but
// a stale client / direct API call could send the wrong set. Re-resolve the
// model's engine-correct universe and keep only incoming deps whose id is in it.
// Unknown model (universal/no entry) → pass dependencies through unchanged. (MPI-163)
function _filterDepsForEngine(modelId, dependencies, engine) {
    if (!Array.isArray(dependencies)) return [];
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const model = MODELS.find(m => m.id === modelId);
    if (!model) return dependencies;
    const allowed = new Set(resolveFullUniverse(model, null, engine));
    return dependencies.filter(d => d && allowed.has(d.id));
}

// MPI-179 — intersecting alone cannot HEAL a wrong-engine request: a renderer
// with a stale engine mirror resolves the OTHER engine's universe, so the set
// it sends simply lacks this engine's required weights. The intersect then
// silently installs a partial model (live 2026-07-02: a No-GPU download Pod
// install of LTX dropped the bf16 but never added the GGUF transformer — the
// model read INSTALLED with no transformer on the volume). engines[engine]
// extraDeps are required for this engine regardless of drafted ops — union any
// missing ones back in; install dedupe still skips deps already on disk/volume.
function _withEngineExtraDeps(modelId, dependencies, engine) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const model = MODELS.find(m => m.id === modelId);
    const extraIds = model?.engines?.[engine]?.extraDeps || [];
    const have = new Set(dependencies.map(d => d.id));
    const missing = extraIds.filter(id => !have.has(id)).map(id => DEPS[id]).filter(Boolean);
    return missing.length ? dependencies.concat(missing) : dependencies;
}

// ── Shared-dep helper ─────────────────────────────────────────────────────────

// Local variant of the shared-dep guard (MPI-216). The old `_findOtherModelsUsingDep`
// filtered on `m.installed === true` — a RENDERER-ONLY flag (set by syncModelInstalled)
// that is NEVER defined in the backend (Node) process, so the guard ALWAYS returned []
// and a local uninstall deleted SHARED deps. That is the exact bug MPI-122 fixed for the
// REMOTE path (`_remoteSharedDepIds`, which checks the Pod volume) but the local path was
// never given the fix: uninstalling LTX-2.3 high trashed the Gemma + VAEs + LoRAs that the
// balanced tier shares. Here we stat the LOCAL disk (same custom-root + default-root +
// recursive-search + completeness logic as /comfy/models/check) to learn which OTHER model
// is WHOLE-MODEL installed (every dep complete on disk), and protect that model's deps —
// plus any dep with a live in-flight install job. Returns depId → [modelName, …].
// MPI-258 replaced the earlier per-dep on-disk test (see the loop below for why).
async function _localSharedDepsMap(excludeModelId) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse, deriveInstalledOps, resolveDeps } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const comfyRoutes = _require('./comfy.js');
    // Stat against the FULL universe so per-op completeness can be derived below —
    // deriveInstalledOps needs the disk status of every op's deps, not just one op's.
    const others = MODELS
        .filter(m => m.id !== excludeModelId)
        .map(m => ({ model: m, depIds: resolveFullUniverse(m) }))
        .filter(o => o.depIds.length > 0);
    const checkModels = others.map(({ model, depIds }) => ({
        id: model.id,
        deps: depIds.map(depId => {
            const d = DEPS[depId] || {};
            return { id: depId, type: d.type, filename: d.filename };
        }),
    }));
    const map = new Map(); // depId → Set<modelName>
    const results = await comfyRoutes.localModelsCheck(checkModels);
    for (const { model } of others) {
        const entry = results[model.id];
        if (!entry) continue;
        // MPI-276: protect the deps of the OPS this model actually has on disk, not
        // the whole universe. The old gate (`entry.installed !== true`) required
        // EVERY op complete, so an op-partial install (e.g. Wan 2.2 Smooth with only
        // I2V installed) counted as "not installed" and protected NOTHING — a sibling
        // uninstall then trashed the shared clip/VAE both models need, cascading the
        // op-partial model out too. deriveInstalledOps gives fullyInstalled (common +
        // ≥1 op complete) and the installed-op list; we protect commonDeps + those
        // ops' deps only.
        //
        // MPI-258 tier-cycle stays broken: a tier whose transformer is absent has no
        // complete op → fullyInstalled false → protects nothing → still deletable.
        const depStatus = new Map((entry.deps || []).map(d => [d.id, d.installed === true]));
        const { installedOps, fullyInstalled } = deriveInstalledOps(model, id => depStatus.get(id) === true, 'local');
        if (!fullyInstalled) continue;
        // null engine → union of both engine sets (never delete a weight the remote
        // engine also needs), matching the pre-MPI-276 protection stance.
        const protectedDeps = resolveDeps(model, installedOps.length ? installedOps : null, null, null);
        for (const depId of protectedDeps) {
            if (!map.has(depId)) map.set(depId, new Set());
            map.get(depId).add(model.name);
        }
    }
    // Mid-install protection (was the reason for the old per-dep test): a dep that is
    // ACTIVELY downloading/queued for another model right now must never be trashed.
    // MPI-276: the refCount lie is gone — liveness is now a STORE query. A dep is
    // in-flight iff some NON-TERMINAL model job still references it
    // (store.activeModelsForDep). That replaces the old `_depJobs.status` map read
    // (which lingered as 'complete'/'idle' and could mis-protect). We exclude the
    // model being uninstalled so its own just-cancelled job never self-protects.
    for (const depId of _inFlightDepIds(excludeModelId)) {
        if (!map.has(depId)) map.set(depId, new Set());
        map.get(depId).add('(installing)');
    }
    return map;
}

// Dep ids held by a live (non-terminal) model job OTHER than excludeModelId.
// The store is the SOT for "is this dep still being installed right now" (G5:
// refCount deleted). Used by BOTH engine uninstall guards.
function _inFlightDepIds(excludeModelId) {
    const out = new Set();
    for (const job of store.allModelJobs()) {
        if (job.modelId === excludeModelId) continue;
        if (store.MODEL_TERMINAL.has(job.status)) continue;
        for (const d of job.deps) out.add(d.id);
    }
    return out;
}

// Remote variant of the shared-dep guard. `_findOtherModelsUsingDep` trusts the
// renderer-only `MODELS[].installed` flag, which is NEVER set in the backend
// (Node) process — `installed` is resolved at runtime by the renderer's
// syncModelInstalled(). So in remote mode that guard always returned 0 and a
// remote uninstall deleted SHARED deps (e.g. uninstalling Wan I2V trashed the
// wan_2.1_vae + umt5 text-encoder that Wan T2V also needs → T2V went PARTIAL).
// Here we resolve "other model is installed" from the actual Pod VOLUME via the
// wrapper (remoteModelsCheck) instead of the dead flag. Returns the set of dep
// ids that ARE still needed by another volume-installed model (must be kept).
async function _remoteSharedDepIds(excludeModelId) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse, deriveInstalledOps, resolveDeps } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    // Full dep universe per model (commonDeps + every op) so op-specific + common
    // deps of another volume-installed model are kept, not the gone flat list. (MPI-122)
    const others = MODELS
        .filter(m => m.id !== excludeModelId)
        .map(m => ({ model: m, depIds: resolveFullUniverse(m) }))
        .filter(o => o.depIds.length > 0);
    // Ask the wrapper which of those models are installed on the volume. Pass each
    // model's deps as { id, type, filename } (remoteModelsCheck owns the split).
    const checkModels = others.map(({ model, depIds }) => ({
        id: model.id,
        deps: depIds.map(depId => {
            const d = DEPS[depId] || {};
            return { id: depId, type: d.type, filename: d.filename };
        }),
    }));
    const keep = new Set();
    try {
        const out = await remoteModels.remoteModelsCheck(checkModels);
        const results = (out && out.results) || {};
        for (const { model } of others) {
            const entry = results[model.id];
            if (!entry) continue;
            // MPI-276: protect the deps of the OPS this model has on the volume, not
            // the whole universe. Old gate (`installed === true`) required EVERY op
            // complete, so an op-partial volume install protected nothing and a
            // sibling uninstall trashed the shared clip/VAE both need. Mirrors the
            // local guard; MPI-258 tier-cycle stays broken (absent-transformer tier
            // has no complete op → fullyInstalled false → protects nothing).
            const depStatus = new Map((entry.deps || []).map(d => [d.id, d.installed === true]));
            const { installedOps, fullyInstalled } = deriveInstalledOps(model, id => depStatus.get(id) === true, 'remote');
            if (!fullyInstalled) continue;
            const protectedDeps = resolveDeps(model, installedOps.length ? installedOps : null, null, null);
            for (const depId of protectedDeps) keep.add(depId);
        }
    } catch (err) {
        // Fail SAFE: if we cannot confirm volume state, keep nothing extra here —
        // the caller still falls back to the universal guard. (Better to leave an
        // orphan dep than to delete a shared one we could not verify; see below —
        // the caller treats an empty set as "no protection" only when the check
        // genuinely returned, so a thrown check is surfaced, not silently trusted.)
        logger.warn('download', `remote shared-dep check failed: ${err.message}`);
        throw err;
    }
    // MPI-276: remote uninstall previously had NO in-flight protection — a dep
    // actively installing for another model on the volume could be trashed mid-
    // download. Mirror the local guard: keep any dep a live (non-terminal) model
    // job still references. Store is the SOT (refCount deleted, G5).
    for (const depId of _inFlightDepIds(excludeModelId)) keep.add(depId);
    return keep;
}

function _isInsidePath(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

// Uninstall path derivation (MPI-276). For a custom_nodes dep the install path
// extracts to the FOLDER `custom_nodes/<dep.filename>/` and the zip is removed
// right after (see _runCustomNodeInstall: targetDir = extractDir/dep.filename,
// fs.remove(zipPath)). The old uninstall re-derived `custom_nodes/<name>.zip` —
// the long-gone zip — so the delete no-op'd yet the loop still reported the dep
// in removed[] and logged a lie. Target the extracted folder instead. Weight
// deps are unchanged (resolved by the caller against the models roots).
function _customNodeUninstallPath(dep, customNodesRoot) {
    return path.join(customNodesRoot, dep.filename);
}

// ── Job Storage ────────────────────────────────────────────────────────────────
const _depJobs = new Map();       // depId → DepJob
const _modelJobs = new Map();     // modelId → DownloadJob
const _activeDownloaders = new Map(); // depId → FileDownloader (actively downloading)
// 3 parallel deps. Was 1 (commit 47e924a) only because parallel HF/Xet streams
// fought over throttled bandwidth and made each other worse. Now that all MPI
// weights are on R2 (free egress, no wave-throttle, MPI-129), parallel pulls no
// longer self-throttle, so multi-dep installs (Wan = 4 files + encoders) finish
// faster. Kept modest — a single R2 stream already saturates a typical link, so
// 3 overlaps small deps with large ones without thrashing. (MPI-140)
const LOCAL_DOWNLOAD_CONCURRENCY = 3;

function _createDepJob(dep) {
    return {
        id: dep.id,
        url: dep.url,
        type: dep.type || null,
        filename: dep.filename || null,
        localPath: null,
        status: 'queued',
        downloadedBytes: 0,
        totalBytes: 0,
        // MPI-95 — registry-size floor for the aggregate denominator. The wrapper
        // reports each dep's REAL `total` only once its install emits a first tick;
        // until then totalBytes can be 0. Summing only arrived totals shrinks the
        // denominator so the bar hits 100% while other deps are still pending
        // ("sits at 100%"). seedBytes keeps every dep counted at its best-known
        // size from the moment the job is created.
        seedBytes: _parseSizeToBytes(dep.size),
        error: null,
        sha256Expected: dep.sha256 || null,
        // MPI-149 — carry the install-enforcement fields through to the runtime depJob.
        // finishCustomNodeInstall iterates modelJob.deps (these depJobs); the install
        // loop reads dep.pipPins (force known-good pins AFTER requirements, e.g.
        // kornia==0.8.2 for LTXVideo) and dep.installRequirementsCommand (custom
        // installer, e.g. Frame-Interpolation `python install.py`). Without these here
        // they were dropped on the engine-deps/upgrade path → kornia floated to 0.8.3 →
        // LTXVideo `pad` ImportError after every engine update.
        pipPins: dep.pipPins || null,
        installRequirementsCommand: dep.installRequirementsCommand || null,
    };
}

// MPI-95 — a dep's best-known total for the aggregate denominator: the wrapper's
// real total once it has arrived, else the registry seed, so a not-yet-emitting
// dep is never counted as 0 (which would let the bar reach 100% early).
// MPI-164 — real total WINS over the seed (no Math.max): when the declared
// registry size overestimates the real bytes, max() kept the inflated seed in
// the denominator and the remote bar finished short (~95-98% on the LTX GGUF
// set). Same rule the local path already uses in _wireProgress.
function _depDenominator(d) {
    return d.totalBytes || d.seedBytes || 0;
}

// MPI-231 — byte-ratio for the download bar, custom_nodes EXCLUDED (work-not-bytes).
// A GitHub `/archive/` zip has no Content-Length (denominator falls back to a tiny
// registry seed) while the numerator counts real streamed bytes, and the requirements
// pip phase pulls ~200MB of wheels with no honest total up-front — a node's bytes make
// a determinate bar overshoot (RES4LYF read "203 MB / 15 MB"). Summing only weight deps
// keeps both sides honest; the emitting tick decides whether to show the sweep instead.
// `active` = 'local' (seed fallback) | 'remote' (real-total-or-seed via _depDenominator).
function _byteRatioExcludingNodes(deps, active = 'local') {
    let downloaded = 0;
    let total = 0;
    for (const d of deps) {
        if (d.type === 'custom_nodes') continue;
        downloaded += d.downloadedBytes || 0;
        total += active === 'remote' ? _depDenominator(d) : (d.totalBytes || d.seedBytes || 0);
    }
    return { downloaded, total };
}

function _createModelJob(modelId, deps) {
    return {
        id: modelId,
        modelId,
        status: 'queued',
        totalBytes: 0,
        downloadedBytes: 0,
        speed: '',
        deps: [],
        progress: 0,
        installCustomNodes: deps.some(d => d.type === 'custom_nodes'),
    };
}

// ── FileDownloader (node-downloader-helper wrapper) ──────────────────────────
// Plain single-stream NDH wrapper: start, cancel (clean stop + remove), no
// pause/resume — resume was removed (MPI-258 Bug 2, the 200-vs-206 append
// corruption); the class was renamed from ResumableDownloader to match (MPI-276).
// NDH itself stays — it downloads every engine + model file.

class FileDownloader {
    constructor(depJob, localPath) {
        this.depJob = depJob;
        this.localPath = localPath;
        this._downloader = null;
        this.onProgress = null;
        this._eventsBound = false;
        // MPI-291 — byte-flow stall watchdog. Last moment a progress tick moved bytes.
        // Seeded at construction so a downloader that never emits a single tick (dead
        // socket from the start, distinct from the timeout:30000 no-response case) is
        // still caught. _watchdogSweep() force-errors any downloader quiet past the window.
        this._lastByteTs = Date.now();
        this._lastBytes = -1;
    }

    _bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        // Progress — forwarded to our onProgress callback
        this._downloader.on('progress', (stats) => {
            const speed = stats.speed || 0;
            // MPI-291 — only a real byte advance resets the stall clock. A repeated
            // same-total tick with no new bytes must NOT count as liveness.
            if (stats.downloaded > this._lastBytes) {
                this._lastBytes = stats.downloaded;
                this._lastByteTs = Date.now();
            }
            this.depJob.downloadedBytes = stats.downloaded;
            this.depJob.totalBytes = stats.total;
            this.depJob.speed = _formatSpeed(speed);
            if (this.onProgress) {
                this.onProgress(stats.downloaded, stats.total, this.depJob.speed);
            }
        });

        // Download finished successfully
        this._downloader.on('end', async () => {
            _activeDownloaders.delete(this.depJob.id);
            try {
                // sha256 re-reads the whole file (~20-60s for 6GB, ~1-2min for Wan's
                // 14GB) with no byte progress — the bar would sit at a dead 100%. Flip
                // each owning model card to the indeterminate "Verifying…" sweep first,
                // reusing the same download:progress {indeterminate, phase} contract the
                // remote path uses (downloadService.js reads phase==='verifying'). (MPI-140)
                //
                // MPI-216: gate the model-level sweep behind allBytesDone, mirroring the
                // remote path (MPI-164). A per-dep verify mid-install (this dep finished,
                // hashing it, while OTHER deps still download) must NOT flip the whole-model
                // bar to an indeterminate "Verifying…" at <100% — the user reads it as a
                // stall. This dep just ended (byte-complete), so mark it complete for the
                // check; custom_nodes are work-not-bytes (excluded, same as remote).
                if (this.depJob.sha256Expected) {
                    this.depJob.downloadedBytes = this.depJob.totalBytes || this.depJob.downloadedBytes;
                    for (const modelJob of _modelJobs.values()) {
                        if (!modelJob.deps.some(d => d.id === this.depJob.id)) continue;
                        const allBytesDone = modelJob.deps.every(d =>
                            d.id === this.depJob.id
                            || d.status === 'complete'
                            || d.type === 'custom_nodes'
                            || (d.downloadedBytes || 0) >= _depDenominator(d));
                        _broadcast('download:progress', {
                            modelId: modelJob.modelId,
                            depId: this.depJob.id,
                            downloadedBytes: allBytesDone ? modelJob.totalBytes : modelJob.downloadedBytes,
                            totalBytes: modelJob.totalBytes,
                            progress: allBytesDone ? 1 : modelJob.progress,
                            indeterminate: allBytesDone,
                            phase: allBytesDone ? 'verifying' : undefined,
                        });
                    }
                }
                const _tHash0 = Date.now(); // MPI-TEMP-TIMING
                await _verifySha256(this.localPath, this.depJob.sha256Expected);
                if (this.depJob.sha256Expected) { // MPI-TEMP-TIMING
                    let _sz = 0; try { _sz = (await fs.stat(this.localPath)).size; } catch {}
                    logger.info('download', `[MPI-TEMP-TIMING] sha256 ${this.depJob.id}: ${Date.now() - _tHash0}ms for ${(_sz / 1024 / 1024).toFixed(0)}MB`);
                }
                await clearDownloadMarker(this.localPath);
                _setDepStatus(this.depJob, 'complete', 'downloader end');
                _broadcast('download:complete', { depId: this.depJob.id, modelId: null });
                _checkModelJobsComplete();
                _startPendingDeps();
            } catch (err) {
                // SHA256 mismatch — clean up and mark failed
                await fs.remove(this.localPath).catch(() => {});
                await clearDownloadMarker(this.localPath).catch(() => {});
                _setDepStatus(this.depJob, 'failed', 'downloader fail');
                this.depJob.error = err.message;
                _broadcast('download:failed', { depId: this.depJob.id, error: err.message });
                _checkModelJobsComplete();
                _startPendingDeps();
            }
        });

        // Error occurred
        this._downloader.on('error', (err) => {
            _activeDownloaders.delete(this.depJob.id);
            if (this.depJob.status === 'paused' || this.depJob.status === 'cancelled') return;
            _setDepStatus(this.depJob, 'failed', 'downloader error');
            this.depJob.error = err.message;
            _broadcast('download:failed', { depId: this.depJob.id, error: err.message });
            _checkModelJobsComplete();
            _startPendingDeps();
        });
    }

    async _ensureDownloader() {
        if (this._downloader) return;
        await fs.ensureDir(path.dirname(this.localPath));

        const fileName = path.basename(this.localPath);
        const destDir = path.dirname(this.localPath);

        // DO NOT add `resumeIfFileExists`/`override`. download() scrubs any stale/partial
        // file before start() so NDH always writes one clean copy (no " (1)" dup). We do
        // NOT resume partials at all (MPI-258 Bug 2), so no resume option belongs here.
        this._downloader = new DownloaderHelper(this.depJob.url, destDir, {
            fileName: fileName,
            // NDH default timeout is -1 (no socket timeout) → a black-hole route
            // (DNS resolves but the server never responds) hangs at 0% forever.
            // 30s socket timeout makes a stalled connection emit 'error' instead
            // of hanging silently. Does NOT cap total download time — it's an
            // inactivity timeout on the socket. (MPI-120)
            timeout: 30000,
        });

        this._bindEvents();
    }

    async download() {
        await this._ensureDownloader();
        // MPI-258 Bug 2: NEVER resume a leftover .part. NDH resumes with
        // `Range: bytes=<n>-` on a file opened in append mode; when R2/Cloudflare
        // answers 200 (full body) instead of 206, it appends the WHOLE file onto the
        // partial → SHA256 mismatch (observed live on the 25GB LTX transformer). A
        // stale/partial file at localPath is always scrubbed for a clean single-stream
        // start. (Also covers the MPI-243 " (1)" duplicate: a stale COMPLETE file whose
        // marker was already cleared — installed deps are marked complete upstream and
        // never reach download(), so any file here is stale.)
        await fs.remove(this.localPath).catch(() => {});
        await markDownloadInProgress(this.localPath, {
            depId: this.depJob.id,
            url: this.depJob.url,
        });
        this._downloader.start();
    }

    async cancel() {
        if (this._downloader) {
            await this._downloader.stop().catch(() => false);
        }
    }

    // MPI-291 — driven by _watchdogSweep when the socket goes quiet mid-stream past
    // the stall window. NDH's timeout:30000 promises this but does NOT fire on a
    // mid-stream quiet socket (v2.1.11). Stop the stream and route into the EXISTING
    // 'error' → _setDepStatus('failed') → retry/report path — never a raw store poke.
    async forceStall() {
        // stop() prevents NDH from emitting its own late 'end'/'error'; then we
        // synthesize the error so the bound 'error' handler runs the failed path
        // (_setDepStatus('failed') → retry/report). NDH extends EventEmitter, so emit
        // always reaches the handler _bindEvents wired.
        if (!this._downloader) return;
        await this._downloader.stop().catch(() => false);
        this._downloader.emit('error', new Error('Download stalled — no data received.'));
    }
}

// MPI-291 — byte-flow stall watchdog. Self-idling backstop (mirrors
// MpiModelManager._pumpBackstop): runs only while a download is active, stops when
// _activeDownloaders drains. If a downloader hasn't advanced a byte in STALL_MS it's
// force-errored into the existing failed/retry path. Window is longer than NDH's
// timeout:30000 so this is a genuine backstop, not a double-fire.
const STALL_MS = 60_000;
let _watchdogTimer = null;

function _startStallWatchdog() {
    if (_watchdogTimer) return;
    _watchdogTimer = setInterval(_watchdogSweep, 15_000);
}

function _watchdogSweep() {
    if (_activeDownloaders.size === 0) {
        clearInterval(_watchdogTimer);
        _watchdogTimer = null;
        return;
    }
    const now = Date.now();
    for (const [depId, dl] of _activeDownloaders) {
        if (now - dl._lastByteTs < STALL_MS) continue;
        logger.warn('download', `stall watchdog: ${depId} no byte movement in ${STALL_MS}ms — forcing failure`);
        dl.forceStall().catch(err =>
            logger.error('download', `forceStall(${depId}) threw: ${err.message}`));
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _verifySha256(filePath, expected) {
    if (!expected) return;
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => {
            const actual = hash.digest('hex');
            if (actual !== expected) {
                reject(new Error(`SHA256 mismatch: expected ${expected}, got ${actual}`));
            } else {
                resolve();
            }
        });
        stream.on('error', reject);
    });
}

function _formatSpeed(bytesPerSec) {
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
    if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
    return `${bytesPerSec.toFixed(0)} B/s`;
}

function _modelSpeedLabel(modelJob) {
    const now = Date.now();
    const bytes = modelJob.downloadedBytes || 0;
    const prev = modelJob._speedSample;
    if (!prev) {
        modelJob._speedSample = {
            bytes,
            t: now,
            rate: 0,
            label: modelJob.speed || '',
        };
        return modelJob._speedSample.label;
    }

    const dt = (now - prev.t) / 1000;
    const dBytes = bytes - prev.bytes;
    if (dt < 1 || dBytes <= 0) return prev.label;

    const instantRate = dBytes / dt;
    const rate = prev.rate > 0 ? (prev.rate * 0.65) + (instantRate * 0.35) : instantRate;
    const label = _formatSpeed(rate);
    modelJob._speedSample = { bytes, t: now, rate, label };
    return label;
}

function _resetModelSpeed(modelJob) {
    if (!modelJob) return;
    delete modelJob._speedSample;
    modelJob.speed = '';
}

function _parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers = { 'GB': 1024 ** 3, 'MB': 1024 ** 2, 'KB': 1024, 'B': 1 };
    return val * (multipliers[unit] || 0);
}

async function _getFileSizeFromUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? require('https') : require('http');
        const request = protocol.request(url, { method: 'HEAD' }, (res) => {
            const size = parseInt(res.headers['content-length'], 10);
            resolve(isNaN(size) ? 0 : size);
        });
        request.on('error', (err) => {
            logger.warn('downloadManager', `HEAD request failed for ${url}: ${err.message}`);
            resolve(0);
        });
        request.setTimeout(5000, () => {
            request.abort();
            resolve(0);
        });
        request.end();
    });
}

// ── SSE Clients ───────────────────────────────────────────────────────────────
const _sseClients = new Set();

function _broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (e) { _sseClients.delete(res); }
    }
}

// ── installStore SOT (MPI-276 Phase 2b.3) ────────────────────────────────────
// The store owns lifecycle state + progress + the monotonic snapshot version.
// SHADOW STAGE: populated alongside _modelJobs/_depJobs and used for the READ
// paths (status endpoint, snapshot); the maps stay write-authoritative until the
// write-flip commit. The maps remain the transport carriers (url, localPath,
// sha256Expected, pipPins, installRequirementsCommand — fields the pure store
// deliberately omits). `broadcast` is late-bound so it is defined by call time.
const store = createInstallStore({
    broadcast: (event, data) => _broadcast(event, data),
    logger,
    now: Date.now,
});

// Runtime→store status translation. The runtime maps use a few strings the pure
// store doesn't model: a model's terminal success is 'complete' here but 'done' in
// the store, and 'idle' (disk-full / rejected pre-register) has no store state.
const _MODEL_STATUS_TO_STORE = {
    queued: 'queued', downloading: 'downloading', verifying: 'verifying',
    installing: 'installing', complete: 'done', done: 'done',
    failed: 'failed', cancelled: 'cancelled',
    // idle: intentionally absent — the model is never registered in the store on
    // that path (it 400s before register), so there is nothing to transition.
};
const _DEP_STATUS_TO_STORE = {
    queued: 'queued', downloading: 'downloading', verifying: 'verifying',
    complete: 'complete', failed: 'failed', cancelled: 'cancelled',
};

// Write the runtime map field (unchanged behavior) AND drive the store in lockstep
// (MPI-276 2b.3). SHADOW STAGE: both writes happen; the map is still authoritative.
// A status with no store equivalent (e.g. 'idle') updates the map only. transition*
// no-ops safely if the store has no such job yet (register happens at start).
function _setModelStatus(modelJob, status, reason) {
    modelJob.status = status;
    const to = _MODEL_STATUS_TO_STORE[status];
    if (to && store.modelJob(modelJob.modelId)) store.transitionModel(modelJob.modelId, to, reason);
}
function _setDepStatus(depJob, status, reason) {
    depJob.status = status;
    const to = _DEP_STATUS_TO_STORE[status];
    if (to && store.depJob(depJob.id)) store.transitionDep(depJob.id, to, reason);
    // Stamp last-activity on the store model job so the reconciler's orphan-fail
    // gate (G11) measures staleness from real progress, not registration alone.
    const sj = store.modelJob(depJob.modelId);
    if (sj) sj.lastTickAt = Date.now();
}

// Mirror a map modelJob's freshly-recomputed progress/bytes into the store (4c) so
// snapshot()/the download:snapshot broadcast reflect live progress, not just
// lifecycle. Called right after each map-side progress recompute. Status stays owned
// by _setModelStatus/_setDepStatus; this touches numbers only.
function _syncStoreProgress(modelJob) {
    if (!store.modelJob(modelJob.modelId)) return;
    store.syncProgress(modelJob.modelId, {
        progress: modelJob.progress,
        totalBytes: modelJob.totalBytes,
        downloadedBytes: modelJob.downloadedBytes,
        speed: modelJob.speed,
        deps: modelJob.deps.map(d => ({ id: d.id, downloadedBytes: d.downloadedBytes, totalBytes: d.totalBytes })),
    });
}

// Register (or REPLACE) the store record for a runtime modelJob, translating its
// deps into the store's spec. Called once per start on both engines. The store
// holds lifecycle+progress+version; the runtime maps keep the transport fields.
function _registerModelInStore(modelJob, engine) {
    store.registerModelJob({
        modelId: modelJob.modelId,
        engine,
        deps: modelJob.deps.map(d => ({
            depId: d.id,
            type: d.type || 'model',
            size: d.size || '',
            seedBytes: d.seedBytes || 0,
            totalBytes: d.totalBytes || 0,
            downloadedBytes: d.downloadedBytes || 0,
            alreadyInstalled: d.status === 'complete',
        })),
    });
    // Stamp the grace-window anchor for the reconciler's orphan-fail gate (G11).
    const sj = store.modelJob(modelJob.modelId);
    if (sj) { sj.registeredAt = Date.now(); sj.lastTickAt = Date.now(); }
    reconciler.start(); // idempotent; self-idles when no jobs are active
}

// ── Reconciler SOT-driver (MPI-276 Phase 3, G11) ─────────────────────────────
// Polls disk/volume truth while the store has active jobs, settles wedged jobs
// (missed-terminal SSE), fails orphans, prunes terminal jobs, broadcasts the
// snapshot. Generalises the remote-only recovery to BOTH engines. Disk truth is
// injected so the module stays pure/testable.

// Resolve installed-truth for a batch of the store's active model jobs. Groups
// by engine: local jobs → localModelsCheck (disk), remote jobs → remoteModelsCheck
// (volume). Returns Map<depId, boolean>. Any dep whose model can't be checked is
// simply absent from the map (treated as not-yet-installed — never a false settle).
async function _reconcilerCheckInstalled(jobs) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const comfyRoutes = _require('./comfy.js');
    const truth = new Map();

    const toCheckModel = (job) => ({
        id: job.modelId,
        deps: job.deps.map(d => {
            const def = DEPS[d.id] || {};
            return { id: d.id, type: def.type, filename: def.filename };
        }),
    });
    const absorb = (results) => {
        if (!results) return;
        for (const modelId of Object.keys(results)) {
            const deps = (results[modelId] && results[modelId].deps) || [];
            for (const d of deps) if (d && d.id) truth.set(d.id, d.installed === true);
        }
    };

    const localJobs = jobs.filter(j => j.engine !== 'remote');
    const remoteJobs = jobs.filter(j => j.engine === 'remote');

    if (localJobs.length) {
        absorb(await comfyRoutes.localModelsCheck(localJobs.map(toCheckModel)));
    }
    if (remoteJobs.length && remoteModels.isRemoteActive()) {
        const out = await remoteModels.remoteModelsCheck(remoteJobs.map(toCheckModel));
        absorb(out && out.results);
    }
    return truth;
}

const reconciler = createReconciler({
    store,
    checkInstalled: _reconcilerCheckInstalled,
    now: Date.now,
    logger,
});

router.get('/comfy/downloads/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    _sseClients.add(res);
    req.on('close', () => { _sseClients.delete(res); });
    // G11: reconcile against truth, then hand the fresh client the current
    // snapshot so it rebuilds state.downloadJobs wholesale (kills cold-boot
    // phantom cards). Runs only when jobs are live; otherwise emits an empty
    // snapshot so the FE clears any stale bars. Errors are non-fatal.
    (store.hasActiveJobs()
        ? reconciler.reconcileOnce().catch((err) => logger.warn('download', `SSE-connect reconcile failed: ${err.message}`))
        : Promise.resolve()
    ).finally(() => store.broadcastSnapshot());
});

// ── Status Endpoint ───────────────────────────────────────────────────────────

// Serialize one model job for the wire — the shape the FE mirror consumes from
// both GET /downloads/status and the register-before-respond /download/start body
// (MPI-276 G8). Single serializer so the two never drift.
//
// MPI-276 4c NOTE: sourced from the runtime MAP job, NOT store.snapshot(). Live
// progress/bytes are recomputed onto the map job at ~15 tick sites and are NOT yet
// mirrored into the store (the store tracks lifecycle+status, mirrored in lockstep;
// progress-mirror is the remaining gap). So a pull-read off store.snapshot() would
// report 0% mid-download. The store-sourced SOT path is the `download:snapshot`
// BROADCAST (reconciler, P3) + the FE snapshot consumer (4a); this pull endpoint
// stays map-backed until progress is mirrored. Map `status` vocabulary is already
// correct ('complete'); the FE mirror handles both it and the store's 'done'.
function _serializeModelJob(job) {
    return {
        id: job.id,
        modelId: job.modelId,
        status: job.status,
        totalBytes: job.totalBytes,
        downloadedBytes: job.downloadedBytes,
        speed: job.speed,
        progress: job.progress,
        deps: job.deps.map(d => ({
            id: d.id,
            status: d.status,
            downloadedBytes: d.downloadedBytes,
            totalBytes: d.totalBytes,
            error: d.error,
        })),
    };
}

router.get('/comfy/downloads/status', (req, res) => {
    const jobs = Array.from(_modelJobs.values()).map(_serializeModelJob);
    // G9: monotonic snapshot version from the store (the FE version-gates deltas
    // against it). Jobs stay map-sourced for live progress (see _serializeModelJob).
    res.json({ success: true, version: store.version(), jobs });
});

router.get('/comfy/downloads/active', (req, res) => {
    const models = Array.from(_modelJobs.values())
        .filter(job => ['queued', 'downloading', 'paused', 'installing'].includes(job.status))
        .filter(job => job.modelId !== '__universal_workflow__')
        .map(job => ({
            modelId: job.modelId,
            status: job.status,
            deps: job.deps
                .filter(dep => ['queued', 'downloading', 'paused'].includes(dep.status))
                .map(dep => ({
                    id: dep.id,
                    status: dep.status,
                    downloadedBytes: dep.downloadedBytes || 0,
                    totalBytes: dep.totalBytes || 0,
                })),
        }));
    res.json({
        success: true,
        models,
        engine: !!_activeEngineDownloader,
    });
});

// ── Start Endpoint ────────────────────────────────────────────────────────────

router.post('/comfy/models/download/start', async (req, res) => {
    const { modelId, dependencies } = req.body;
    if (!modelId || !Array.isArray(dependencies)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

    // Offline pre-flight (MPI-120): downloads (local or remote-Pod install) all
    // need real internet. Fail fast with a distinct offline flag so the renderer
    // shows a "you're offline" toast instead of a stuck/0% job or a cryptic
    // getaddrinfo error dialog.
    if (!(await checkOnline())) {
        logger.warn('download', 'Download blocked: host appears offline');
        return res.status(503).json({ error: 'offline', offline: true });
    }

    // Remote engine: install onto the Pod volume via the wrapper instead of
    // downloading to the local filesystem. Same modelJob/SSE shape, so the
    // renderer download UI is unchanged.
    if (remoteModels.isRemoteActive()) {
        return _startRemoteDownload(modelId, dependencies, res);
    }

    // LOCAL path: keep only deps the LOCAL engine installs (drop the Pod-only GGUF
    // transformer + node). The renderer already resolves per-engine, but a stale
    // client / direct API call could send the remote set — defend server-side by
    // intersecting against the model's local-engine universe. (MPI-163;
    // MPI-179 — union the local extraDeps back in so a stale-engine request heals)
    const localDeps = _withEngineExtraDeps(modelId, _filterDepsForEngine(modelId, dependencies, 'local'), 'local');

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, localDeps);
        _modelJobs.set(modelId, modelJob);
    }

    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    // Pre-sum totalBytes from ALL deps (including already-installed ones).
    // SET, never += (MPI-276 G12): a re-POST of the same model must not accumulate
    // the denominator — a second click read the bar at 200% of real size.
    const allDepsSize = localDeps.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0);
    modelJob.totalBytes = allDepsSize;

    for (const dep of localDeps) {
        let localPath;
        let installedCheckPath;
        if (dep.targetPath) {
            // MPI-222: in-node weight — engine-anchored regardless of customRoot.
            const { localPath: lp } = await resolveComfyPath(dep, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else if (dep.type === 'custom_nodes') {
            // GitHub archives download as .zip; after extraction the zip is deleted.
            // Use the extracted folder path to check if already installed.
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
            installedCheckPath = path.join(defaultCustomNodesRoot, dep.filename);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
            installedCheckPath = localPath;
        }

        const isInstalled = await isCompleteOnDisk(installedCheckPath);

        let depJob = _depJobs.get(dep.id);
        if (!depJob) {
            depJob = _createDepJob(dep);
            depJob.localPath = localPath;
            _depJobs.set(dep.id, depJob);
        }

        if (!modelJob.deps.find(d => d.id === dep.id)) {
            modelJob.deps.push(depJob);
        }

        // Mark installed deps as complete immediately (they contribute to progress but not to active downloads)
        if (isInstalled) {
            _setDepStatus(depJob, 'complete', 'local already-installed');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else if (depJob.status !== 'queued' && depJob.status !== 'downloading') {
            // Reset any terminal state (complete, failed, cancelled) back to queued.
            _setDepStatus(depJob, 'queued', 'local reset requeue');
            depJob.downloadedBytes = 0;
            depJob.error = null;
        }
    }

    // Recalculate progress from completed deps before broadcasting (bug fix)
    modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;

    // ── Disk-full pre-flight gate (MPI-99) ──────────────────────────────────
    // Refuse a local install that won't fit on the target drive instead of
    // starting a doomed download that fails partway with a cryptic write error.
    // Only the deps still queued (not already complete-on-disk) need new space;
    // a 5% margin covers temp/.part overhead. A failed statfs is non-fatal — we
    // skip the gate rather than block a legitimate install.
    // Use seedBytes (declared size, known NOW), NOT totalBytes — totalBytes is the
    // real Content-Length which is still 0 at install-start (it only arrives mid-
    // download). Summing totalBytes made neededBytes 0, the gate never fired, the
    // download started anyway, and the first write to a full disk crashed the
    // server with an unhandled ENOSPC. (MPI-140; was the MPI-99 gate's blind spot.)
    const neededBytes = modelJob.deps
        .filter(d => d.status === 'queued')
        .reduce((sum, d) => sum + (d.totalBytes || d.seedBytes || 0), 0);
    if (neededBytes > 0) {
        const targetDir = customRoot || defaultModelsRoot;
        const freeBytes = await _freeDiskBytes(targetDir);
        if (freeBytes !== null && freeBytes < neededBytes * 1.05) {
            _setModelStatus(modelJob, 'idle', 'disk-full idle');
            logger.warn('download', `install blocked — disk full: need ${_fmtGb(neededBytes)} free, have ${_fmtGb(freeBytes)} at ${targetDir}`);
            return res.status(400).json({
                error: `Not enough disk space to install this model. ${_fmtGb(neededBytes)} needed, ${_fmtGb(freeBytes)} free.`,
            });
        }
    }

    // Register in the store now that the disk-full gate has passed (MPI-276 2b.3).
    // registerModelJob REPLACES on a re-POST (kills totalBytes accumulation) and
    // credits already-installed deps at full size. Done before the status flip so the
    // transition below lands on a live store job.
    _registerModelInStore(modelJob, 'local');

    _setModelStatus(modelJob, 'downloading', 'download start');
    _resetModelSpeed(modelJob);
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });

    _startPendingDeps();

    // Register-before-respond (MPI-276 G8): the job is fully in _modelJobs before we
    // reply, and the reply carries its snapshot — the FE mirror renders the card from
    // the response, never racing the SSE stream open (the MPI-241 race class).
    res.json({ success: true, jobId: modelId, version: store.version(), job: _serializeModelJob(modelJob) });
});

// Free bytes available on the filesystem holding `dir`. Returns null on any
// failure so callers can treat "unknown" as "don't block". (MPI-99)
async function _freeDiskBytes(dir) {
    try {
        const stats = await fs.statfs(dir);
        return stats.bavail * stats.bsize;
    } catch (err) {
        logger.warn('download', `statfs failed for ${dir}: ${err.message}`);
        return null;
    }
}

function _fmtGb(bytes) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// ── Pending Deps Launcher ──────────────────────────────────────────────────────

async function _startPendingDeps() {
    const pending = Array.from(_depJobs.values()).filter(d =>
        d.status === 'queued'
        && _depHasActiveDownloadConsumer(d.id)
    );
    const slots = Math.max(0, LOCAL_DOWNLOAD_CONCURRENCY - _activeDownloaders.size);
    logger.info('download', `_startPendingDeps: ${pending.length} queued deps, ${_activeDownloaders.size}/${LOCAL_DOWNLOAD_CONCURRENCY} active`);
    if (slots <= 0) return;

    let started = 0;
    for (const depJob of pending) {
        if (started >= slots) break;
        if (_activeDownloaders.has(depJob.id)) {
            continue;
        }

        _setDepStatus(depJob, 'downloading', 'local dep start');
        const downloader = new FileDownloader(depJob, depJob.localPath);
        _activeDownloaders.set(depJob.id, downloader);
        _startStallWatchdog(); // MPI-291 — self-idles when _activeDownloaders drains

        _wireProgress(depJob, downloader);
        logger.info('download', `Starting download for ${depJob.id} from ${depJob.url}`);
        downloader.download().catch(err => {
            logger.error('download', `downloader.download() caught error for ${depJob.id}: ${err.message}`);
        });
        started += 1;
    }
}

function _wireProgress(depJob, downloader) {
    downloader.onProgress = (downloadedBytes, totalBytes) => {
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depJob.id);
            if (!myDep) continue;
            myDep.downloadedBytes = downloadedBytes;
            myDep.totalBytes = totalBytes;
            // MPI-231 — custom_nodes are WORK, not bytes: a GitHub `/archive/` zip is
            // served with no Content-Length (totalBytes stays 0 → denominator falls
            // back to the tiny registry seed) while the numerator counts real streamed
            // bytes, and the following pip requirements phase pulls ~200MB of wheels
            // that no honest total covers up-front. Both make a determinate bar a lie
            // (RES4LYF read "203 MB / 15 MB"). Exclude custom_nodes from BOTH sides of
            // the ratio; when the active tick is a node download, show the indeterminate
            // "Preparing…" sweep — the same work-not-bytes rule the verify aggregate
            // already applies (MPI-164).
            // Denominator tracks each weight dep's REAL Content-Length once known, not
            // the declared `size:` estimate — else the bar finishes short (e.g. Wan
            // declared 15GB but is 14.3GB → caps ~91% then jumps to done). Prefer real
            // total; fall back to seedBytes only while real is still 0 (dep not yet
            // emitting). NB: NOT _depDenominator's Math.max(real,seed) — when the seed
            // over-declares, max() keeps the inflated seed and the bar finishes short.
            const isNodeTick = myDep.type === 'custom_nodes';
            const ratio = _byteRatioExcludingNodes(modelJob.deps, 'local');
            modelJob.downloadedBytes = ratio.downloaded;
            modelJob.totalBytes = ratio.total;
            modelJob.speed = _modelSpeedLabel(modelJob);
            // A node-only job has a 0 byte-denominator — keep the sweep going rather
            // than a static 0 MB / 0 MB.
            const indeterminate = isNodeTick || modelJob.totalBytes <= 0;
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _syncStoreProgress(modelJob); // 4c: mirror live progress into the store SOT
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId: depJob.id,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: modelJob.speed,
                progress: modelJob.progress,
                indeterminate,
                phase: indeterminate ? 'preparing' : undefined,
            });
        }
    };
}

function _depHasActiveDownloadConsumer(depId) {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.status !== 'downloading') continue;
        if (modelJob.deps.some(d => d.id === depId)) return true;
    }
    return false;
}

// True if a model OTHER than excludeModelId is actively downloading/installing this
// dep right now — the real "don't stop the downloader" test for cancel (MPI-258 Bug
// B). refCount can't be trusted here (it leaks up on successful installs).
function _otherActiveModelUsesDep(depId, excludeModelId) {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.modelId === excludeModelId) continue;
        if (modelJob.status !== 'downloading' && modelJob.status !== 'queued' && modelJob.status !== 'installing') continue;
        if (modelJob.deps.some(d => d.id === depId)) return true;
    }
    return false;
}

// ── Remote (RunPod wrapper) install driver ──────────────────────────────────
//
// In remote mode the wrapper streams installs onto the Pod volume. We reuse the
// same _modelJobs/_depJobs maps and _broadcast events so the renderer's download
// UI works unchanged. One wrapper SSE stream serves all active remote installs;
// it is torn down when no remote installs remain. There is no local .part file,
// so pause/resume are not supported remotely (see the pause/resume routes).

let _remoteEventStream = null;       // AbortController for the wrapper SSE stream
const _remoteDepIds = new Set();     // dep ids currently installing remotely
let _remoteReconnectTimer = null;    // MPI-97 — pending SSE reconnect timer
let _remoteReconnectAttempt = 0;     // MPI-97 — backoff counter (reset on a clean open)

// MPI-136 — silent-SSE-stall watchdog. MPI-97 recovers a CLOSED stream, but a
// stream that stays OPEN while the Pod's download loop is wedged on a zombie
// socket stops emitting progress with no close event → a permanent ghost bar.
// We stamp the last progress tick and, on a timer, treat a long tick-silence as
// a stall: run the SAME reconcile+reconnect recovery as a close. The wrapper's
// own chunk-deadline (v0.2.21) then surfaces a clean install-error; reconcile
// settles any dep that actually finished during the silence.
const _REMOTE_STALL_MS = 90_000;     // no tick this long on an open stream = stalled
const _REMOTE_STALL_POLL_MS = 15_000;
let _remoteLastTickAt = 0;           // monotonic-ish: Date.now() of last progress tick
let _remoteStallTimer = null;        // setInterval handle

function _markRemoteTick() { _remoteLastTickAt = Date.now(); }

function _startRemoteStallWatchdog() {
    if (_remoteStallTimer) return;
    _markRemoteTick(); // grace period before the first tick
    _remoteStallTimer = setInterval(() => {
        if (_remoteDepIds.size === 0 || !remoteModels.isRemoteActive()) return;
        if (_remoteReconnectTimer) return; // a reconnect already in flight

        // MPI-255: LOST-COMPLETION backstop, independent of the 90s stall gate.
        // A dep whose bytes are 100% in (downloadedBytes >= totalBytes > 0) but whose
        // status is still 'downloading' has a MISSED terminal SSE — the wrapper fired
        // models:install-complete into a not-yet-attached / dropped stream, so it never
        // settled and the model hangs at 100% forever. This hits any fast-settling dep
        // (a `requirements_only` node pip no-op, OR a weight whose final tick was lost),
        // NOT just stalls — and waiting the full 90s stall window to notice is the
        // user-visible "tanking at 100%" hang. Reconcile against volume truth NOW, on
        // the normal 15s poll. Reconcile only settles deps the wrapper reports
        // installed:true, so an in-flight download is never force-completed.
        let allBytesInButUnsettled = false;
        for (const depId of _remoteDepIds) {
            const dj = _depJobs.get(depId);
            if (dj && dj.status === 'downloading' && dj.totalBytes > 0
                && (dj.downloadedBytes || 0) >= dj.totalBytes) { allBytesInButUnsettled = true; break; }
        }
        if (allBytesInButUnsettled) {
            _reconcileOutstandingRemoteDeps().catch((err) =>
                logger.warn('download', `lost-completion reconcile failed: ${err.message}`));
            return; // volume-truth reconcile settles it; skip the stall/abort path this poll
        }

        if (Date.now() - _remoteLastTickAt < _REMOTE_STALL_MS) return;
        logger.warn('download', `remote install silent for ${Math.round((Date.now() - _remoteLastTickAt) / 1000)}s with ${_remoteDepIds.size} dep(s) outstanding — treating as stalled`);
        _markRemoteTick(); // don't re-fire every poll while recovery runs
        // Reuse the close-recovery path: reconcile completions + abort/reconnect
        // the (wedged) stream so a re-subscribe picks up the wrapper's error.
        if (_remoteEventStream) {
            _remoteEventStream.abort();
            _remoteEventStream = null;
        }
        _onRemoteStreamClosed('silent-stall');
    }, _REMOTE_STALL_POLL_MS);
}

function _stopRemoteStallWatchdog() {
    if (_remoteStallTimer) {
        clearInterval(_remoteStallTimer);
        _remoteStallTimer = null;
    }
}

function _ensureRemoteEventStream() {
    if (_remoteEventStream) return;
    _startRemoteStallWatchdog();
    _remoteEventStream = remoteModels.openInstallEventStream(
        (evt) => {
            // A live event means the stream is healthy — clear backoff + stamp tick.
            _remoteReconnectAttempt = 0;
            _markRemoteTick();
            _onRemoteInstallEvent(evt);
        },
        (reason) => _onRemoteStreamClosed(reason),
    );
}

// MPI-97 — the wrapper install SSE can drop mid-install (observed live as
// "remote install SSE closed"); previously the stream just died and the card
// hung at its last % with no completion event. Recover: if installs are still
// outstanding, reconcile missed completions against the volume, then reconnect
// the stream with backoff. Once no installs remain (or remote went inactive),
// let it stay closed.
function _onRemoteStreamClosed(reason) {
    _remoteEventStream = null;
    if (_remoteDepIds.size === 0) { _stopRemoteStallWatchdog(); return; } // clean close
    if (!remoteModels.isRemoteActive()) return;    // Pod gone — nothing to recover to
    if (_remoteReconnectTimer) return;             // a reconnect is already scheduled

    logger.warn('download', `remote install SSE closed (${reason}); ${_remoteDepIds.size} dep(s) outstanding — recovering`);

    // Backstop: a dep may have COMPLETED during the dead window, so its
    // models:install-complete was missed and the card would hang forever. Settle
    // those against the volume via the existing models/status check (no new
    // wrapper endpoint) before/independently of the reconnect.
    _reconcileOutstandingRemoteDeps().catch((err) =>
        logger.warn('download', `remote dep reconcile failed: ${err.message}`));

    if (_remoteDepIds.size === 0) return;          // reconcile may have settled them all

    const delay = Math.min(1000 * 2 ** _remoteReconnectAttempt, 15000); // 1s,2s,4s… cap 15s
    _remoteReconnectAttempt += 1;
    _remoteReconnectTimer = setTimeout(() => {
        _remoteReconnectTimer = null;
        if (_remoteDepIds.size === 0 || !remoteModels.isRemoteActive()) return;
        _ensureRemoteEventStream();
    }, delay);
}

// Settle outstanding remote deps against the actual volume state. Used to
// recover completions missed while the install SSE was down. Reuses
// remoteModelsCheck (/wrapper/models/status) — no new wrapper endpoint.
async function _reconcileOutstandingRemoteDeps() {
    if (_remoteDepIds.size === 0) return;
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    // Build a one-model check carrying every outstanding dep so the wrapper
    // reports each dep's real installed state on the volume.
    const outstanding = Array.from(_remoteDepIds);
    const deps = outstanding.map((depId) => {
        const d = DEPS[depId] || {};
        return { id: depId, type: d.type, filename: d.filename };
    });
    let results;
    try {
        const out = await remoteModels.remoteModelsCheck([{ id: '__reconcile__', deps }]);
        results = (out && out.results && out.results['__reconcile__'] && out.results['__reconcile__'].deps) || [];
    } catch (err) {
        throw err; // surfaced by caller; reconnect still proceeds
    }
    const byId = Object.fromEntries(results.map((d) => [d.id, d]));
    for (const depId of outstanding) {
        const entry = byId[depId];
        if (entry && entry.installed === true) {
            const depJob = _depJobs.get(depId);
            if (depJob) {
                _setDepStatus(depJob, 'complete', 'local complete');
                depJob.downloadedBytes = depJob.totalBytes || depJob.downloadedBytes;
            }
            _remoteDepIds.delete(depId);
            _broadcast('download:complete', { depId, modelId: null });
        }
    }
    _checkModelJobsComplete();
}

function _teardownRemoteEventStreamIfIdle() {
    if (_remoteDepIds.size > 0) return;
    if (_remoteReconnectTimer) {
        clearTimeout(_remoteReconnectTimer);
        _remoteReconnectTimer = null;
    }
    _remoteReconnectAttempt = 0;
    _stopRemoteStallWatchdog(); // MPI-136 — no installs left, stop polling
    if (_remoteEventStream) {
        _remoteEventStream.abort();
        _remoteEventStream = null;
    }
}

// Map a wrapper models:install-* event onto the dep + its model jobs.
function _onRemoteInstallEvent(evt) {
    const data = evt.data || {};
    const depId = data.id;
    if (!depId) return;
    const depJob = _depJobs.get(depId);
    if (!depJob) return;

    if (evt.type === 'models:install-progress') {
        const downloaded = Number(data.bytes) || 0;
        const total = Number(data.total) || depJob.totalBytes || 0;
        // Per-dep bytes are physically monotonic (a download never un-downloads).
        // A wrapper restart-from-0 (fast-path→fallback handoff) or an SSE
        // reconnect can report a LOWER `bytes` for a tick; assigning it absolutely
        // walked the whole-model aggregate BACKWARDS ("97% → 37%"). Clamp so the
        // numerator only ever climbs within an install. Reset paths (cancel,
        // fresh start) rebuild the depJob, so this never wedges a stale high.
        depJob.downloadedBytes = Math.max(depJob.downloadedBytes || 0, downloaded);
        if (total) depJob.totalBytes = total;
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depId);
            if (!myDep) continue;
            // MPI-95 fix: re-derive BOTH sides of the ratio from the per-dep jobs
            // every tick. The wrapper's _resolve_total corrects each dep's real
            // `total` (line above); we sum the per-dep DENOMINATOR (real total when
            // known, else the registry seed — _depDenominator) so the bar neither
            // snaps to ~80% on the first tick (numerator outran a rounded
            // denominator) NOR sits at 100% while a not-yet-emitting dep counts as 0
            // in the denominator. Every dep is always counted at its best-known size.
            // MPI-231 — exclude custom_nodes from both sides (work-not-bytes): a node
            // re-clone can report git bytes with no honest total vs a tiny seed, and a
            // requirements pip run has no up-front total (twin of the local overshoot).
            const isNodeTick = myDep.type === 'custom_nodes';
            const ratio = _byteRatioExcludingNodes(modelJob.deps, 'remote');
            modelJob.totalBytes = ratio.total;
            modelJob.downloadedBytes = ratio.downloaded;
            const nodeIndeterminate = isNodeTick || modelJob.totalBytes <= 0;
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _syncStoreProgress(modelJob); // 4c: mirror live progress into the store SOT
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                // MPI-95: a real weight-progress tick definitively clears the
                // Preparing… sweep (covers a HEAD-slower-than-first-tick race).
                // MPI-231: a custom_node tick (no honest total) stays indeterminate.
                indeterminate: nodeIndeterminate,
                phase: nodeIndeterminate ? 'preparing' : undefined,
            });
        }
    } else if (evt.type === 'models:install-verifying') {
        // The wrapper finished downloading this dep and is now hashing it (sha256
        // re-reads the whole file — seconds on a CPU Pod, no byte progress). Flip the
        // bar to the indeterminate "Verifying…" sweep so the otherwise-silent stall
        // at 100% is explained — matching the LOCAL path (see download:verifying emit
        // in FileDownloader.on('end')). Keeps remote + local consistent.
        // (MPI-140; supersedes the MPI-95 park-at-100% determinate choice.)
        const total = Number(data.total) || depJob.totalBytes || 0;
        if (total) depJob.totalBytes = total;
        depJob.downloadedBytes = total || depJob.downloadedBytes;
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depId);
            if (!myDep) continue;
            modelJob.totalBytes = modelJob.deps.reduce((s, d) => s + _depDenominator(d), 0);
            modelJob.downloadedBytes = modelJob.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            // MPI-164 — the model-level "Verifying…" sweep belongs ONLY once EVERY
            // dep is byte-complete: a per-dep verify of one dep mid-install was
            // flipping the whole-model bar to an indeterminate "Verifying…" while
            // other deps were still downloading (user read it as a stall/failure).
            // While any dep still has bytes to fetch, keep the tick determinate.
            // When all deps ARE byte-complete, pin the bar to a FULL 100% under
            // the sweep (MPI-140 contract: download fills the bar, THEN verify).
            // custom_nodes deps are WORK, not bytes — a requirements-only node
            // re-install sits at 0 bytes through its whole pip run (minutes),
            // which gated the sweep off for the entire final weight hash (live
            // 2026-07-02: bar hung full+determinate, then snapped to INSTALLED).
            // Their few MB are invisible next to multi-GB weights; exclude them.
            const allBytesDone = modelJob.deps.every(d =>
                d.status === 'complete'
                || d.type === 'custom_nodes'
                || (d.downloadedBytes || 0) >= _depDenominator(d));
            if (allBytesDone) {
                modelJob.downloadedBytes = modelJob.totalBytes;
                modelJob.progress = 1;
            }
            _syncStoreProgress(modelJob); // 4c: mirror live progress into the store SOT
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                indeterminate: allBytesDone,
                phase: allBytesDone ? 'verifying' : undefined,
            });
        }
    } else if (evt.type === 'models:install-complete') {
        depJob.downloadedBytes = Number(data.size_bytes) || depJob.totalBytes || 0;
        depJob.totalBytes = depJob.downloadedBytes;
        _setDepStatus(depJob, 'complete', 'remote complete');
        _remoteDepIds.delete(depId);
        _broadcast('download:complete', { depId, modelId: null });
        // A per-model custom_node landed on the volume; ComfyUI only scans
        // custom_nodes at startup, so the Pod must warm-cycle before the new
        // node loads (Design B+). Surface it so the app can prompt/reconnect.
        if (data.needs_comfy_restart) {
            _broadcast('comfy:needs-restart', { depId, remote: true });
        }
        _checkModelJobsComplete();
        _teardownRemoteEventStreamIfIdle();
    } else if (evt.type === 'models:install-error') {
        _remoteDepIds.delete(depId);
        if (data.error === 'cancelled') {
            _setDepStatus(depJob, 'cancelled', 'remote cancelled');
        } else {
            _setDepStatus(depJob, 'failed', 'remote failed');
            depJob.error = data.message || data.error || 'remote install failed';
            _broadcast('download:failed', { depId, error: depJob.error });
        }
        _checkModelJobsComplete();
        _teardownRemoteEventStreamIfIdle();
    }
}

async function _startRemoteDownload(modelId, dependencies, res) {
    // REMOTE path: keep only deps the POD engine installs (drop the 41GB bf16
    // transformer the local engine uses). Renderer already resolves per-engine;
    // defend server-side by intersecting against the model's remote universe.
    // (MPI-163 — engine-aware resolution, replaces the old per-dep-tag post-filter;
    //  MPI-179 — union the remote extraDeps back in so a stale-engine request heals)
    dependencies = _withEngineExtraDeps(modelId, _filterDepsForEngine(modelId, dependencies, 'remote'), 'remote');

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, dependencies);
        _modelJobs.set(modelId, modelJob);
    }
    // Remote installs never run local custom-node extraction — custom_nodes are
    // image-resident on the Pod, so completion must not route through
    // _runCustomNodeInstall (which extracts a local zip that does not exist).
    modelJob.installCustomNodes = false;

    // Resolve which deps are already installed on the volume up-front so the
    // progress bar starts at the right place (matches the local path's behavior).
    let statusResults = {};
    try {
        // Pass raw app deps (subdir filename) — remoteModelsCheck owns the split.
        const checkModels = [{ id: modelId, deps: dependencies.map(d => ({ id: d.id, type: d.type, filename: d.filename })) }];
        const out = await remoteModels.remoteModelsCheck(checkModels);
        statusResults = (out && out.results && out.results[modelId] && out.results[modelId].deps) || [];
        statusResults = Object.fromEntries(statusResults.map(d => [d.id, d]));
    } catch (err) {
        // Non-fatal: treat as nothing installed and let install dedupe handle it.
        logger.warn('download', `remote pre-check failed: ${err.message}`);
    }

    // SET, never += (MPI-276 G12) — a re-POST must not accumulate the denominator.
    const allDepsSize = dependencies.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0);
    modelJob.totalBytes = allDepsSize;

    const toInstall = [];
    for (const dep of dependencies) {
        let depJob = _depJobs.get(dep.id);
        if (!depJob) {
            depJob = _createDepJob(dep);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
            _depJobs.set(dep.id, depJob);
        }
        if (!modelJob.deps.find(d => d.id === dep.id)) modelJob.deps.push(depJob);

        // MPI-97 — shared-dep ATTACH. When this dep is already installing for
        // ANOTHER model (its wrapper install is in flight: `_remoteDepIds` holds
        // it, or its job is mid-download/already-finished this session), model B
        // must NOT fire a second `/wrapper/models/install` — the wrapper rejects a
        // duplicate ("this model is already downloading") and B's whole install
        // was failing with a Download-Failed + Report-on-GitHub dialog. Instead B
        // ATTACHES: the dep stays in B's
        // modelJob.deps, and the shared install SSE (_onRemoteInstallEvent loops
        // EVERY modelJob owning this dep id) fills B's bar from A's stream. B
        // settles via _checkModelJobsComplete when the shared dep lands. We do not
        // touch the dep's live status/bytes here and we do NOT add it to toInstall.
        // MPI-100 — a cached `complete` is only trustworthy if the volume STILL
        // has the file. After an uninstall (deleteFiles), the module-level
        // _depJobs entry keeps its stale 'complete' from a prior install; without
        // this, the ATTACH guard below short-circuits the re-install, toInstall
        // ends empty, no /wrapper/models/install fires, and the card flips to a
        // FALSE green INSTALLED while the weight is gone. The up-front
        // remoteModelsCheck (statusResults) is fresh wrapper truth (real on-disk
        // existence+size), so prefer it: a dep the volume reports as NOT installed
        // must not read 'complete' from cache. statusResults absent (pre-check
        // failed) → fall back to the cached status (install dedupe still guards).
        const freshStatus = statusResults[dep.id];
        const reallyComplete = depJob.status === 'complete'
            && (freshStatus ? freshStatus.installed === true : true);
        const inFlight = _remoteDepIds.has(dep.id)
            || depJob.status === 'downloading'
            || reallyComplete;
        if (inFlight) {
            // Attach only — leave the shared dep's live state alone.
            continue;
        }

        // remoteModelsCheck already reports universal (image-resident) nodes as
        // installed and per-model nodes/weights by their real volume state, so
        // trust `installed`: anything not present is installed via the wrapper
        // (per-model custom_nodes now install onto the volume — Design B+).
        const alreadyInstalled = !!(statusResults[dep.id] && statusResults[dep.id].installed);
        // MPI-244: a BAKED (image-resident) custom_node lives in the Pod IMAGE at
        // /opt/ComfyUI/custom_nodes, NOT on the /workspace volume. Its pip
        // requirements already ran at image-build time. The `requirements_only`
        // self-heal below `cd`s into the volume node folder to re-run pip -r — but
        // a baked node has NO volume folder, so the wrapper dies with
        // "[Errno 2] No such file or directory: '/workspace/.../comfyui_controlnet_aux'"
        // and the whole model install fails with a Download-Failed dialog. Baked
        // nodes are already present + already have their deps: settle complete,
        // never send them to the wrapper. (comfyui_controlnet_aux is the first baked
        // node a model DECLARES as a dep — LTX/Impact/etc. are implicit engine deps,
        // never in a model's `deps`, so this path was never hit before Krea2.)
        // MPI-293: the image-resident check must run REGARDLESS of alreadyInstalled.
        // On a FRESH volume the wrapper scans /workspace and reports a baked node as
        // NOT installed (it lives in the image at /opt, invisible to the volume scan),
        // so `alreadyInstalled` is false — but sending it to the wrapper still dies
        // with the Errno-2 above because there is no volume folder to cd into. A baked
        // node is present + its pip deps ran at build time: settle complete either way.
        if (dep.type === 'custom_nodes' && remoteModels._isImageResident(dep)) {
            _setDepStatus(depJob, 'complete', 'remote baked complete');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else if (alreadyInstalled && dep.type === 'custom_nodes') {
            // A custom_node folder present on the volume does NOT prove its pip
            // requirements ran (a prior install may have landed the folder but
            // failed/skipped requirements.txt — e.g. ComfyUI-GGUF present but the
            // `gguf` pkg missing → node import fails on every gen). The wrapper's
            // status check only sees the folder. So for a custom_node in THIS
            // install request, still send it with `requirements_only` so the
            // wrapper re-runs (idempotent) pip -r requirements.txt WITHOUT
            // re-downloading or removing the folder. Self-heals the recurring
            // "node present, dep missing" class. Weights (non-node) trust the flag.
            _setDepStatus(depJob, 'queued', 'remote node requeue');
            depJob.downloadedBytes = 0;
            depJob.error = null;
            toInstall.push({ ...dep, requirementsOnly: true });
        } else if (alreadyInstalled) {
            _setDepStatus(depJob, 'complete', 'remote already-installed');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else {
            _setDepStatus(depJob, 'queued', 'remote requeue');
            depJob.downloadedBytes = 0;
            depJob.error = null;
            // MPI-222: a DRIFTED volume node's folder is still present (wrong commit),
            // so the wrapper would answer `already_installed` and never re-fetch. Carry
            // the drift flag → remoteInstallDep sends force:true → wrapper rmtree's the
            // stale folder + re-clones at the pinned commit + re-stamps the marker.
            const freshStatus = statusResults[dep.id];
            toInstall.push(freshStatus && freshStatus.drifted ? { ...dep, forceReinstall: true } : dep);
        }
    }

    // NOTE (MPI-100): there is NO truthful remote disk-full PRE-FLIGHT here. A
    // RunPod network volume enforces its size as a QUOTA that statvfs cannot see
    // (statvfs reports the multi-PB container overlay, not the 80GB volume cap),
    // and the RunPod REST volume object exposes only the configured size, never
    // live usage. So a doomed install can't be reliably blocked up-front; instead
    // the wrapper's "[Errno 122] Disk quota exceeded" failure is caught REACTIVELY
    // in downloadService and surfaced as a friendly disk-full toast (not the
    // GitHub error dialog). The LOCAL install path keeps its real statfs gate.

    // MPI-95: the denominator seeded above is summed from rounded registry sizes,
    // which the wrapper's real content-length bytes overshoot — causing the ~80%
    // snap on press. The wrapper's _resolve_total reports a real per-dep `total`
    // from the first models:install-progress tick; _onRemoteInstallEvent then
    // RE-DERIVES modelJob.totalBytes from the corrected per-dep totals every tick
    // (the seed here is only the pre-first-tick placeholder). Here we show an
    // instant indeterminate "Preparing…" so the first frame isn't a fake number in
    // the gap before that first tick arrives; the tick clears it to a real %.
    // ── Remote disk-full pre-flight gate (mirrors the local MPI-99 gate) ─────
    // The MPI-100 note above said a truthful remote pre-flight was impossible;
    // MPI-169's `du` route made the volume's USED bytes real, so free space =
    // configured size − used is now knowable. Block a doomed install up-front
    // (needed > free) with the SAME friendly disk-full message the reactive toast
    // uses, instead of letting it run and die at ~98% with a cryptic stall/
    // peer-closed error the disk-full matcher can't recognise. Only deps in
    // toInstall need NEW space; a 5% margin covers .part overhead. Unknown free
    // space (old wrapper / du fail / size unresolved) → skip the gate, never
    // false-block. seedBytes = declared size, known NOW (totalBytes is still 0).
    const remoteNeededBytes = toInstall.reduce(
      (sum, d) => sum + _parseSizeToBytes(d.size), 0);
    if (remoteNeededBytes > 0) {
      let freeInfo = null;
      try {
        const { remoteVolumeFreeBytes } = _require('./remotePodLifecycle');
        freeInfo = await remoteVolumeFreeBytes();
      } catch (err) {
        logger.warn('download', `remote free-space check unavailable: ${err.message}`);
      }
      if (freeInfo && Number.isFinite(freeInfo.freeBytes)
          && freeInfo.freeBytes < remoteNeededBytes * 1.05) {
        _setModelStatus(modelJob, 'idle', 'remote disk-full idle');
        logger.warn('download', `remote install blocked — volume full: need ${_fmtGb(remoteNeededBytes)}, have ${_fmtGb(freeInfo.freeBytes)} free of ${_fmtGb(freeInfo.totalBytes)}`);
        return res.status(400).json({
          error: `[Errno 28] No space left on device — ${_fmtGb(remoteNeededBytes)} needed, ${_fmtGb(freeInfo.freeBytes)} free on the Pod volume.`,
        });
      }
    }

    modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
    _registerModelInStore(modelJob, 'remote');
    _setModelStatus(modelJob, 'downloading', 'remote download start');
    _resetModelSpeed(modelJob);

    if (!toInstall.length) {
        // Everything already present — settle the job state immediately.
        _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });
        res.json({ success: true, jobId: modelId, version: store.version(), job: _serializeModelJob(modelJob) });
        _checkModelJobsComplete();
        return;
    }

    // Instant feedback: indeterminate, no number to lie about until the wrapper's
    // first real-total progress tick arrives.
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress, indeterminate: true });

    // Respond before kicking off installs (matches the local path's fire-and-forget).
    // Register-before-respond (MPI-276 G8): job snapshot in the body.
    res.json({ success: true, jobId: modelId, version: store.version(), job: _serializeModelJob(modelJob) });

    _ensureRemoteEventStream();
    for (const dep of toInstall) {
        const depJob = _depJobs.get(dep.id);
        if (depJob) _setDepStatus(depJob, 'downloading', 'remote dep start');
        _remoteDepIds.add(dep.id);
        // Do NOT pass the app's display `size` ("67MB") as size_bytes — it is
        // approximate and the wrapper rejects an exact-correct file on a
        // done != expected_size mismatch. The wrapper uses content-length for
        // the progress total and the dep sha256 (when present) for integrity.
        remoteModels.remoteInstallDep(dep, { force: dep.forceReinstall === true })
            .then((out) => {
                // already_installed: the SSE will not fire — settle here.
                if (out && out.status === 'already_installed') {
                    const dj = _depJobs.get(dep.id);
                    if (dj) {
                        _setDepStatus(dj, 'complete', 'remote uw dep complete');
                        dj.downloadedBytes = dj.totalBytes || _parseSizeToBytes(dep.size);
                    }
                    _remoteDepIds.delete(dep.id);
                    _broadcast('download:complete', { depId: dep.id, modelId: null });
                    _checkModelJobsComplete();
                    _teardownRemoteEventStreamIfIdle();
                }
            })
            .catch((err) => {
                const dj = _depJobs.get(dep.id);
                if (dj) { _setDepStatus(dj, 'failed', 'remote uw dep error'); dj.error = err.message; }
                _remoteDepIds.delete(dep.id);
                logger.error('download', `remote install trigger failed for ${dep.id}: ${err.message}`);
                _broadcast('download:failed', { depId: dep.id, error: err.message });
                _checkModelJobsComplete();
                _teardownRemoteEventStreamIfIdle();
            });
    }
}

// ── Model Job Completion ──────────────────────────────────────────────────────

function _recalculateModelJobProgress(modelJob) {
    modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
    // MPI-95 — best-known denominator (real total or registry seed) so a dep that
    // has not reported a real total yet never collapses the denominator to 0.
    modelJob.totalBytes = modelJob.deps.reduce((sum, d) => sum + _depDenominator(d), 0) || modelJob.totalBytes;
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
}

function _downloadJobEventPayload(modelJob) {
    return {
        modelId: modelJob.modelId,
        status: modelJob.status,
        downloadedBytes: modelJob.downloadedBytes || 0,
        totalBytes: modelJob.totalBytes || 0,
        speed: modelJob.speed || '',
        progress: modelJob.progress || 0,
    };
}

function _checkModelJobsComplete() {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.status !== 'downloading') continue;
        const anyFailed = modelJob.deps.some(d => d.status === 'failed');
        const allComplete = modelJob.deps.every(d => d.status === 'complete');
        const allDone = modelJob.deps.every(d => ['complete', 'failed', 'cancelled'].includes(d.status));

        if (anyFailed || (allDone && !allComplete)) {
            _setModelStatus(modelJob, 'failed', 'uw fail');
            // Surface the first failed dep's error so the UI shows a real reason
            // instead of "undefined" (the model-level event carried no error).
            const failedDep = modelJob.deps.find(d => d.status === 'failed' && d.error);
            _broadcast('download:failed', {
                modelId: modelJob.modelId,
                error: failedDep ? failedDep.error : 'One or more dependencies failed to download',
            });
        } else if (allComplete) {
            if (modelJob.installCustomNodes) {
                _setModelStatus(modelJob, 'installing', 'uw installing');
                _broadcast('download:installing', { modelId: modelJob.modelId });
                _runCustomNodeInstall(modelJob).catch(err => {
                    logger.error('download', `_runCustomNodeInstall crashed: ${err.message}`);
                    _setModelStatus(modelJob, 'failed', 'uw install fail');
                    _broadcast('download:failed', { modelId: modelJob.modelId });
                });
            } else {
                _setModelStatus(modelJob, 'complete', 'uw done');
                _broadcast('download:complete', { modelId: modelJob.modelId });
            }
        }
    }
}

async function _runCustomNodeInstall(modelJob) {
    const customDeps = modelJob.deps.filter(d =>
        d.status === 'complete' && d.localPath != null && d.type === 'custom_nodes'
    );
    if (!customDeps.length) {
        logger.info('download', `_runCustomNodeInstall: no custom_nodes deps found for model ${modelJob.modelId}`);
        _setModelStatus(modelJob, 'complete', 'uw done');
        _broadcast('download:complete', { modelId: modelJob.modelId });
        return;
    }
    logger.info('download', `_runCustomNodeInstall: extracting ${customDeps.length} custom node(s) for model ${modelJob.modelId}`);

    let anyFailure = false;

    for (const dep of customDeps) {
        // Guard: skip deps without a valid localPath string
        if (dep.localPath == null || typeof dep.localPath !== 'string') {
            logger.warn('download', `dep ${dep.id} has invalid localPath (${JSON.stringify(dep.localPath)}), skipping`);
            continue;
        }
        if (!dep.filename || typeof dep.filename !== 'string') {
            logger.warn('download', `dep ${dep.id} has invalid filename (${JSON.stringify(dep.filename)}), skipping`);
            continue;
        }
        const zipPath = String(dep.localPath); // ensure string
        const extractDir = path.dirname(zipPath); // custom_nodes/
        const targetDir = path.join(extractDir, dep.filename); // dep.filename is the source of truth for target name

        // If the extracted node ALREADY has its own files, skip ONLY extraction —
        // but still fall through to the requirements step below. A node folder can
        // land without its pip deps (a prior install where requirements.txt
        // failed/was interrupted, or the node was extracted by a different path
        // that never ran pip); folder-present is NOT proof the deps are installed.
        // pip with --upgrade is idempotent (a no-op when already satisfied), so
        // re-running it is cheap + self-healing. This is the general cure for the
        // recurring "node present, dep missing" class (e.g. ComfyUI-GGUF folder on
        // disk but `gguf` pkg absent).
        //
        // MPI-243: `pathExists(targetDir)` alone is a FALSE POSITIVE. A `targetPath`
        // weight (e.g. RIFE's ckpts/rife/rife47.pth, which resolves UNDER the node
        // folder) downloads first and creates `comfyui-frame-interpolation/` with
        // only a `ckpts/` subdir — no node files. The old check then "skipped
        // extraction" and ran `python install.py` in a folder that has no
        // install.py → Errno 2, "UW deps installation failed", user must Retry.
        // A real node always ships top-level FILES (__init__.py, install.py). So
        // "already extracted" means: the folder holds at least one top-level file,
        // not just weight subdirs.
        const alreadyExtracted = await _nodeFolderHasFiles(targetDir);
        if (alreadyExtracted) {
            logger.info('download', `Custom node already extracted: ${targetDir}, skipping extraction but verifying requirements`);
        }

        if (!alreadyExtracted) {
            // Extract GitHub archive zip (extracts to custom_nodes/owner-repo-main/)
            // Do this FIRST so we can scan for the extracted folder AFTER it's created
            try {
                if (await fs.pathExists(zipPath)) {
                    logger.info('download', `Extracting zip: ${zipPath}`);
                    await _extractZipArchive(zipPath, extractDir);
                    await fs.remove(zipPath); // clean up zip after successful extraction
                    logger.info('download', `Zip extracted and removed: ${zipPath}`);
                } else {
                    // Zip not found — download was never completed. Mark failure so repair
                    // flow (engine/repair-deps) re-triggers the full download.
                    logger.warn('download', `Zip not found at ${zipPath} — marking dep for repair re-download`);
                    anyFailure = true;
                    continue;
                }
            } catch (err) {
                logger.error('download', `zip extract FAILED for ${dep.id}: ${err.message} — removing corrupted zip so repair can re-download`);
                await fs.remove(zipPath).catch(() => {}); // delete corrupted zip so repair re-downloads it
                anyFailure = true;
                continue;
            }

            // Scan for the extracted folder — GitHub archives extract as '<RepoName>-<BranchName>/'
            // The branch name casing varies (e.g. 'main' vs 'Main') and the repo name casing
            // may differ from dep.filename. Match case-insensitively against dep.filename and
            // dep.id, accepting any branch-name suffix after the last '-'.
            let extractedMainDir = null;
            try {
                const entries = await fs.readdir(extractDir, { withFileTypes: true });
                const targetLower = (dep.filename || '').toLowerCase();
                const depIdLower = (dep.id || '').toLowerCase();
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const entryLower = entry.name.toLowerCase();
                    // Strip the last '-<branch>' segment and compare the base against dep.filename/dep.id
                    const lastDash = entryLower.lastIndexOf('-');
                    if (lastDash === -1) continue;
                    const entryBase = entryLower.slice(0, lastDash);
                    if (entryBase === targetLower || entryBase === depIdLower) {
                        extractedMainDir = path.join(extractDir, entry.name);
                        logger.info('download', `Found extracted folder: ${extractedMainDir}`);
                        break;
                    }
                }
            } catch (err) {
                logger.error('download', `scan for extracted folder failed for ${dep.id}: ${err.message}`);
            }

            if (!extractedMainDir) {
                // Zip was removed (extraction succeeded per flow) but folder not found — corrupt extraction
                logger.warn('download', `Could not find extracted folder for ${dep.id} in ${extractDir} — corrupt zip, will re-download on repair`);
                anyFailure = true;
                continue;
            }

            // Rename 'owner-repo-main' → 'owner-repo' (dep.filename)
            try {
                if (await _nodeFolderHasFiles(targetDir)) {
                    // A fully-extracted node is already there — the freshly-extracted
                    // copy is a duplicate; drop it.
                    await fs.remove(extractedMainDir);
                    logger.warn('download', `Target ${targetDir} already extracted, removed duplicate: ${extractedMainDir}`);
                } else if (await fs.pathExists(targetDir)) {
                    // MPI-243: targetDir exists but holds NO node files — it's the
                    // weight-shell a `targetPath` dep created (e.g. RIFE's ckpts/
                    // landed here before the node extracted). MERGE the node's files
                    // into it instead of deleting the node (the old `remove` branch
                    // dropped the real node and left the empty shell → `install.py`
                    // missing). `overwrite` lets node files win; the existing weight
                    // subdir is preserved.
                    await fs.copy(extractedMainDir, targetDir, { overwrite: true });
                    await fs.remove(extractedMainDir);
                    logger.info('download', `Merged extracted node into weight-shell ${targetDir}`);
                } else {
                    await fs.move(extractedMainDir, targetDir);
                    logger.info('download', `Renamed ${extractedMainDir} → ${targetDir}`);
                }
            } catch (err) {
                logger.error('download', `folder rename failed for ${dep.id}: ${err.message}`);
            }
        }

        // Install requirements: custom command or pip. ALWAYS runs (even when the
        // folder was already present) — idempotent, the self-heal for missing deps.
        // MPI-243: a single dep's requirements step must NOT abort the whole batch.
        // Previously a `throw err` here unwound the entire for-loop, so when
        // comfyui-frame-interpolation's `python install.py` hit a transient error
        // (Errno 2 — the parallel install raced its own extraction), every LATER
        // dep (Impact-Subpack, RES4LYF) was left un-installed and the user had to
        // Retry. Treat a reqs failure like an extraction failure: mark anyFailure,
        // skip the rest of THIS dep, keep going. The failed dep has no commit
        // marker stamped (below), so repair-deps re-installs just it next boot.
        if (dep.installRequirementsCommand) {
            try {
                await runCustomCommand(dep.installRequirementsCommand, targetDir);
                logger.info('download', `Custom install command succeeded for ${dep.id}`);
            } catch (err) {
                logger.error('download', `Custom install command FAILED for ${dep.id}: ${err.message} — continuing with remaining deps`);
                anyFailure = true;
                continue;
            }
        } else {
            const reqPath = path.join(targetDir, 'requirements.txt');
            if (await fs.pathExists(reqPath)) {
                try {
                    await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
                    logger.info('download', `pip requirements installed for ${dep.id}`);
                } catch (err) {
                    logger.error('download', `pip install FAILED for ${dep.id}: ${err.message} — continuing with remaining deps`);
                    anyFailure = true;
                    continue;
                }
            }
        }

        // Version pins (MPI-127): some nodes have UNPINNED requirements that pull a
        // package version which breaks the node import (e.g. ComfyUI-LTXVideo's
        // unpinned `kornia` resolves to 0.8.3, which removed `pad` →
        // `ImportError: cannot import name 'pad'` → the whole node fails to load).
        // Force the known-good pins AFTER requirements so they win.
        if (Array.isArray(dep.pipPins) && dep.pipPins.length) {
            try {
                await runPipCommand(['install', ...dep.pipPins, '--no-warn-script-location']);
                logger.info('download', `pip pins installed for ${dep.id}: ${dep.pipPins.join(', ')}`);
            } catch (err) {
                logger.error('download', `pip pin install FAILED for ${dep.id}: ${err.message} — continuing with remaining deps`);
                anyFailure = true;
                continue;
            }
        }

        // Stamp the pinned-commit marker LAST, so it only lands on a fully-installed
        // node (extract + reqs + pins all succeeded). A missing/mismatched marker =
        // drift → targeted reinstall on next boot (MPI-222). No-op for unpinned nodes.
        try {
            const stamped = await writeNodeCommitMarker(targetDir, dep.id);
            if (stamped) logger.info('download', `node commit marker stamped for ${dep.id}`);
        } catch (err) {
            logger.warn('download', `node commit marker write failed for ${dep.id}: ${err.message}`);
        }
    }

    if (anyFailure) {
        _setModelStatus(modelJob, 'failed', 'local fail');
        _broadcast('download:failed', { modelId: modelJob.modelId, error: 'One or more custom node extractions failed' });
        throw new Error('One or more custom node extractions failed — see logs');
    }

    _setModelStatus(modelJob, 'complete', 'local done');
    _broadcast('download:complete', { modelId: modelJob.modelId });
    // A custom node was installed. The frontend gets `comfy:needs-restart` (→
    // state.comfyNeedsRestart) and the gen gate restarts ComfyUI. But that flag is
    // FRONTEND-ONLY and dies on an app restart — and if the node was installed while
    // ComfyUI was still BOOTING (e.g. "start ComfyUI on launch" + Install pressed
    // mid-boot), ComfyUI's one-shot node scan already ran and cached an IMPORT
    // FAILURE, yet the frontend flag is lost on the next app restart → the node
    // silently never loads. Mirror the flag SERVER-side so it is authoritative and
    // survives a browser/app reload; the gen gate (and /comfy/status) consult it.
    // LOCAL installs only — a remote (Pod) install owns its own restart path
    // (state.remoteComfyNeedsRestart), so don't poison the local flag during a
    // remote session.
    if (!remoteModels.isRemoteActive()) {
        processState.comfyNeedsRestart = true;
    }
    _broadcast('comfy:needs-restart', { modelId: modelJob.modelId });
}

// ── Cancel ────────────────────────────────────────────────────────────────────
// Pause/Resume removed (MPI-258 Bug 2): NDH resume appended a full 200 response onto
// a partial → SHA256 corruption. Cancel does a clean stop() + remove; a fresh install
// re-downloads single-stream. Installs are queued (MPI-184) so pause had little value.

router.post('/comfy/models/download/cancel', async (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    // Cancel is idempotent: a job the backend already lost (restart mid-install, a
    // double Cancel press, an already-completed download) is not an error — nothing
    // to stop. Return 200 so the client isn't spammed with 404s in the console.
    // (MPI-258 Bug B)
    if (!job) { _broadcast('download:cancelled', { modelId }); return res.json({ success: true, alreadyGone: true }); }

    for (const dep of job.deps) {
        // MPI-97 — cancelling THIS model must not stop a dep another ACTIVE model is
        // still downloading. Gate on live consumers (job status), never a refCount:
        // refCount leaked upward (a successful download never decremented it) so a
        // second install of the same model stacked it to 2 and cancel then saw 1 > 0,
        // skipped dl.cancel(), deleted _modelJobs, and left the download streaming
        // invisibly while every re-press 404'd. (MPI-258 Bug B; refCount DELETED
        // MPI-276.) _otherActiveModelUsesDep excludes THIS model (still in _modelJobs).
        if (!_otherActiveModelUsesDep(dep.id, modelId)) {
            // Remote install in flight on the Pod — cancel via the wrapper.
            if (_remoteDepIds.has(dep.id)) {
                _remoteDepIds.delete(dep.id);
                await remoteModels.remoteCancelInstall(dep.id);
                // MPI-123 — remoteCancelInstall is SOFT+ASYNC: the wrapper only
                // sets a cancel flag and removes the `<dest>.part` on its next
                // chunk write, so the frontend re-sync (/wrapper/models/status)
                // races the purge and reports the stale partialBytes the user
                // saw stuck on the card. Follow with a synchronous delete so the
                // `.part` is gone by the time this route returns and the card
                // re-derives a clean readout. Best-effort — never hard-fail cancel.
                await remoteModels.remoteUninstallDep(dep).catch(() => {});
            }
            const dl = _activeDownloaders.get(dep.id);
            if (dl) {
                await dl.cancel();
                _activeDownloaders.delete(dep.id);
            }
            if (dep.localPath) clearDownloadMarker(dep.localPath).catch(() => {});
            _setDepStatus(dep, 'cancelled', 'cancel');
            _depJobs.delete(dep.id);
        }
    }

    _teardownRemoteEventStreamIfIdle();
    // Drive the store to the terminal state (it holds the cancelled job on its own
    // short TTL — the final SOT; the map hard-delete below is the legacy path the
    // write-flip step removes).
    if (store.modelJob(modelId)) _setModelStatus(job, 'cancelled', 'user cancel');
    _modelJobs.delete(modelId);
    _broadcast('download:cancelled', { modelId });
    _startPendingDeps();
    res.json({ success: true });
});

// ── Uninstall ─────────────────────────────────────────────────────────────────

router.post('/comfy/models/uninstall', async (req, res) => {
    const { modelId, dependencies: wireDeps, deleteFiles = true } = req.body;
    if (!modelId || !Array.isArray(wireDeps)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

    // MPI-276 G13: uninstall previously trusted the wire dep array verbatim, so a
    // stale client / direct API call could ask to delete the WRONG engine's files
    // (remote-resolved deps against local disk, or vice-versa). Re-resolve the
    // engine-correct universe server-side and keep only deps that belong to it.
    // Unknown model passes through unchanged (same _filterDepsForEngine contract as
    // install). Wire the filtered set through the rest of the route as `dependencies`.
    const _engine = remoteModels.isRemoteActive() ? 'remote' : 'local';
    const dependencies = _filterDepsForEngine(modelId, wireDeps, _engine);

    // Remote mode: the model files live on the Pod volume, NOT local disk. The
    // local trash path below would destroy the user's LOCAL models and leave the
    // volume untouched (UI then desyncs because a re-check still sees the volume
    // files). Route deletion to the wrapper instead. The wrapper delete endpoint
    // ships in image v0.4.0 / wrapper 0.2.3 (MPI-75); on an OLDER Pod image it is
    // absent, so remoteUninstallDep returns 'unsupported' and we surface that
    // (toast below) without trashing anything.
    if (remoteModels.isRemoteActive()) {
        const _universalIds = new Set(getUniversalWorkflowDepIds());
        const removed = [];
        const keptUniversal = [];
        const keptShared = [];
        const keptModelFiles = [];
        let anyUnsupported = false;

        // Resolve which deps are still needed by ANOTHER model installed on the
        // volume (NOT the dead backend `MODELS[].installed` flag). If this check
        // fails we ABORT rather than risk deleting a shared dep we could not
        // verify — uninstalling Wan I2V must not trash the VAE + text-encoder that
        // Wan T2V shares (that bug dragged T2V to PARTIAL).
        let sharedKeep;
        try {
            sharedKeep = await _remoteSharedDepIds(modelId);
        } catch (err) {
            // Transient: the wrapper was unreachable (Pod still resuming from
            // warm-stop → proxy 404/502 during warm-up) so we could not verify the
            // shared-dep set. This is NOT a bug — it self-heals once the wrapper is
            // ready. Surface a 'transient' reason so the renderer shows a TOAST, not
            // an error+Report-on-GitHub dialog (which produced junk issues for a
            // benign warm-up window).
            return res.json({
                success: false,
                remoteUnsupported: 'uninstall',
                reason: 'wrapper-unreachable',
                message: 'The Pod is still starting up — could not verify shared files yet. Try the uninstall again in a moment.',
            });
        }

        for (const dep of dependencies) {
            if (_universalIds.has(dep.id)) {
                keptUniversal.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            if (sharedKeep.has(dep.id)) {
                keptShared.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            // MPI-97 — honor the "delete files from disk" checkbox in REMOTE mode.
            // The LOCAL branch keeps the file when `deleteFiles` is false; the remote
            // branch previously ignored the flag and ALWAYS called the wrapper delete,
            // so unchecking the box still trashed the weights off the Pod volume (a
            // user lost ~30GB of Wan 2.2 T2V weights this way). When the box is
            // unchecked we KEEP every volume dep and just drop the install record —
            // a re-install is then near-instant.
            //
            // This includes PER-MODEL custom_nodes (e.g. ComfyUI-PainterI2Vadvanced):
            // they install onto the VOLUME via the wrapper (NOT image-resident — see
            // remoteModels._isImageResident / the doc note there), so they are part of
            // "keep files". An earlier carve-out (`dep.type !== 'custom_nodes'`) wrongly
            // deleted the per-model node even on keep, dropping the model to PARTIALLY
            // INSTALLED for a 144KB folder while all 36GB of weights stayed. Keep them.
            if (!deleteFiles) {
                keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            try {
                const out = await remoteModels.remoteUninstallDep(dep);
                if (out && out.status === 'unsupported') {
                    anyUnsupported = true;
                } else {
                    removed.push({ depId: dep.id, depName: dep.name || dep.id });
                }
            } catch (err) {
                logger.error('download', `remote uninstall failed for ${dep.id}: ${err.message}`);
                anyUnsupported = true;
            }
        }

        if (anyUnsupported && removed.length === 0) {
            logger.warn('download', `remote uninstall ${modelId}: wrapper has no delete endpoint (needs engine update)`);
            return res.json({
                success: false,
                remoteUnsupported: 'uninstall',
                message: 'Remote uninstall needs an engine update — model files remain on the Pod volume.',
                keptUniversal, keptShared,
            });
        }

        logger.info('download', `remote uninstall ${modelId}: removed ${removed.length}, kept ${keptUniversal.length} universal, ${keptShared.length} shared, ${keptModelFiles.length} model files (deleteFiles=${deleteFiles})`);
        _modelJobs.delete(modelId);
        _broadcast('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls: [], remote: true });
        return res.json({ success: true, removed, keptUniversal, keptShared, keptModelFiles, remote: true, partialUnsupported: anyUnsupported });
    }

    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const managedModelsRoot = customRoot || defaultModelsRoot;
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    const removed = [];
    const keptShared = [];
    const keptModelFiles = [];
    const keptPipInstalls = [];
    const keptUniversal = [];

    const _universalDepIds = new Set(getUniversalWorkflowDepIds());

    // Shared-dep guard (MPI-216): resolve — from the ACTUAL local disk, not the dead
    // backend `MODELS[].installed` flag — which deps are still complete on disk for
    // another model, and protect them. Computed ONCE (a single _localModelsCheck over
    // every other model's universe) then queried per dep. If the check throws we ABORT
    // rather than risk deleting a shared dep we could not verify — same fail-safe stance
    // as the remote path (uninstalling one LTX tier must not trash the Gemma/VAE/LoRAs
    // the other tier shares).
    let sharedKeep;
    try {
        sharedKeep = await _localSharedDepsMap(modelId);
    } catch (err) {
        logger.error('download', `local shared-dep check failed for ${modelId}: ${err.message}`);
        return res.status(500).json({
            success: false,
            error: 'shared-dep-check-failed',
            message: 'Could not verify which files other models still need — uninstall aborted to avoid deleting shared files. Try again.',
        });
    }

    for (const dep of dependencies) {
        let localPath;
        if (dep.targetPath) {
            // MPI-222: in-node weight — engine-anchored regardless of customRoot.
            const { localPath: lp } = await resolveComfyPath(dep, customRoot, {});
            localPath = lp;
        } else if (dep.type === 'custom_nodes') {
            // MPI-276: the extracted node FOLDER, not the long-gone install zip.
            localPath = _customNodeUninstallPath(dep, defaultCustomNodesRoot);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        // Rule 1: always preserve universal workflow deps (every custom_node + engineAsset weights)
        if (_universalDepIds.has(dep.id)) {
            keptUniversal.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        if (sharedKeep.has(dep.id)) {
            keptShared.push({ depId: dep.id, depName: dep.name || dep.id, sharedWith: [...sharedKeep.get(dep.id)] });
            continue;
        }

        if (dep.type === 'custom_nodes' && dep.installRequirements === true) {
            keptPipInstalls.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        if (dep.type !== 'custom_nodes' && !_isInsidePath(managedModelsRoot, localPath)) {
            keptModelFiles.push({
                depId: dep.id,
                depName: dep.name || dep.id,
                reason: 'outside-managed-models-root',
            });
            logger.warn('download', `uninstall: refused to trash outside managed models root: ${localPath}`);
            continue;
        }

        if (dep.type === 'custom_nodes' && !_isInsidePath(defaultCustomNodesRoot, localPath)) {
            keptModelFiles.push({
                depId: dep.id,
                depName: dep.name || dep.id,
                reason: 'outside-custom-nodes-root',
            });
            logger.warn('download', `uninstall: refused to trash outside custom nodes root: ${localPath}`);
            continue;
        }

        const isInModelsFolder = dep.type !== 'custom_nodes' && _isInsidePath(managedModelsRoot, localPath);
        if (!deleteFiles && isInModelsFolder) {
            keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        try {
            // MPI-276: only report a dep in removed[] when a delete ACTUALLY ran.
            // The custom-node zip-path bug meant the old loop hit a non-existent
            // path, deleted nothing, yet still pushed to removed[] and logged a lie.
            // A missing path now lands in keptModelFiles(reason:'already-absent').
            const existed = await fs.pathExists(localPath);
            if (existed) {
                // Try Recycle Bin first (undo-safety). But model weights are large
                // (6-25GB) and Windows refuses to recycle a file bigger than the
                // drive's Recycle Bin quota — windows-trash.exe exits 255 and the
                // file survives. Since uninstall exists to FREE disk space, parking a
                // 25GB weight in the bin wouldn't free it anyway: fall back to a
                // permanent delete so uninstall never silently no-ops. (MPI-258)
                try {
                    await _trash(localPath);
                    logger.info('download', `uninstall: moved to trash ${localPath}`);
                } catch (trashErr) {
                    await fs.remove(localPath);
                    logger.warn('download', `uninstall: trash failed (${trashErr.message}) — permanently deleted ${localPath}`);
                }
                await cleanEmptyDirs(localPath, dep.type === 'custom_nodes' ? defaultCustomNodesRoot : managedModelsRoot);
            }
            await clearDownloadMarker(localPath).catch(() => {});
            if (existed) {
                removed.push({ depId: dep.id, depName: dep.name || dep.id });
            } else {
                keptModelFiles.push({ depId: dep.id, depName: dep.name || dep.id, reason: 'already-absent' });
                logger.info('download', `uninstall: ${dep.id} already absent at ${localPath} — nothing removed`);
            }
            // The shared-dep guard upstream already excluded deps another installed
            // model needs, so a dep that reaches this delete loop is unshared — drop
            // its job. A re-install re-creates it. (refCount gate DELETED MPI-276.)
            _depJobs.delete(dep.id);
        } catch (err) {
            logger.error('download', `uninstall: failed to trash ${localPath}`, err);
        }
    }

    logger.info('download', `uninstall ${modelId}: removed ${removed.length}, kept ${keptUniversal.length} universal, ${keptShared.length} shared, ${keptModelFiles.length} model files, ${keptPipInstalls.length} pip-installs`);
    _modelJobs.delete(modelId);
    _broadcast('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls });
    // G11: reconcile against post-delete disk truth (settles/prunes anything the
    // removal touched) and refresh the snapshot. Non-fatal — the uninstall itself
    // already succeeded.
    reconciler.reconcileOnce().catch((err) => logger.warn('download', `post-uninstall reconcile failed: ${err.message}`));
    res.json({ success: true, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

function cancelAllDownloads() {
    for (const [, downloader] of _activeDownloaders) {
        downloader.cancel().catch(() => {});
    }
    _activeDownloaders.clear();
    for (const [, job] of _modelJobs) {
        job.deps.forEach(d => { _setDepStatus(d, 'cancelled', 'cancel all'); });
        _setModelStatus(job, 'cancelled', 'cancel all');
    }
    _modelJobs.clear();
    _depJobs.clear();
    store.clear();
    reconciler.stop();
    _broadcast('download:cancelled', { all: true });
}

// ── Universal Workflow Deps Installer ─────────────────────────────────────────

/**
 * Installs universal workflow dependencies: downloads missing deps and optionally runs
 * custom node install steps (pip, custom commands) for any custom_nodes.
 *
 * Called after engine install completes (new install or upgrade).
 * Also called by POST /engine/repair-deps for the "repairing" flow.
 *
 * @param {string[]} depIds - DEPS ids to install (from checkUniversalWorkflowDepsStatus)
 * @param {boolean} broadcastProgress - whether to emit engine:uw-installing SSE events
 * @param {boolean} skipCustomNodeInstall - if true, download only; don't run custom node pip install
 */
async function startUniversalWorkflowInstall(depIds, broadcastProgress = true, skipCustomNodeInstall = false) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    logger.info('download', `startUniversalWorkflowInstall: customRoot=${customRoot}, ${depIds.length} deps to check`);

    if (broadcastProgress) {
        broadcastEngineEvent('engine:uw-installing', { status: 'Installing dependencies...' });
    }

    const modelJob = {
        modelId: '__universal_workflow__',
        status: 'downloading',
        deps: [],
        totalBytes: 0,
        downloadedBytes: 0,
        speed: '',
        progress: 0,
    };

    for (const depId of depIds) {
        const dep = DEPS[depId];
        if (!dep) {
            logger.warn('download', `startUniversalWorkflowInstall: unknown dep "${depId}"`);
            continue;
        }

        modelJob.totalBytes += _parseSizeToBytes(dep.size);

        let localPath;
        let installedCheckPath; // path to check for "already installed" (folder for custom_nodes, file otherwise)
        if (dep.targetPath) {
            // MPI-222: an in-node weight (e.g. RIFE) resolves engine-anchored via the
            // resolver's targetPath branch — always, regardless of customRoot.
            const { localPath: lp } = await resolveComfyPath(dep, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else if (dep.type === 'custom_nodes') {
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
            // After successful extraction the zip is deleted and only the folder remains.
            // Check the folder, not the zip, so repair-deps skips already-extracted nodes.
            installedCheckPath = path.join(defaultCustomNodesRoot, dep.filename);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
            installedCheckPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
            installedCheckPath = localPath;
        }

        const isInstalled = await isCompleteOnDisk(installedCheckPath);
        logger.info('download', `startUniversalWorkflowInstall: dep ${depId} resolved to ${localPath}, installedCheck=${installedCheckPath}, exists=${isInstalled}`);

        let depJob = _depJobs.get(depId);
        if (!depJob) {
            depJob = _createDepJob(dep);
            _depJobs.set(depId, depJob);
        }
        depJob.localPath = localPath;

        if (!modelJob.deps.find(d => d.id === depId)) {
            modelJob.deps.push(depJob);
        }

        // Mark already-installed deps as complete without downloading
        if (isInstalled) {
            _setDepStatus(depJob, 'complete', 'uw already-installed');
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
            logger.info('download', `startUniversalWorkflowInstall: skipping already installed: ${depId} -> ${installedCheckPath}`);
        } else if (depJob.status !== 'queued' && depJob.status !== 'downloading') {
            // Reset any terminal state (complete, failed, cancelled) back to queued
            // so _startPendingDeps will re-download. Covers: zip missing after failed
            // extraction (was complete), and previously failed downloads on retry.
            const prevStatus = depJob.status;
            _setDepStatus(depJob, 'queued', 'uw requeue');
            depJob.downloadedBytes = 0;
            depJob.error = null;
            logger.info('download', `startUniversalWorkflowInstall: resetting ${depId} (was ${prevStatus}) for re-download`);
        }
    }

    _modelJobs.set(modelJob.modelId, modelJob);
    _registerModelInStore(modelJob, 'local');
    // UW job is born 'downloading' (literal above); mirror that onto the fresh
    // store record, which registers every model as 'queued'.
    _setModelStatus(modelJob, 'downloading', 'uw install start');

    // Log download URLs before starting so we know which URL fails
    for (const depJob of modelJob.deps) {
        if (depJob.status !== 'complete') {
            logger.info('download', `startUniversalWorkflowInstall: will download ${depJob.id} from ${depJob.url}`);
        }
    }

    _startPendingDeps();

    // Wait for all UW deps to reach a terminal state (with 30-minute timeout to prevent infinite hangs)
    await new Promise((resolve, reject) => {
        const startTime = Date.now();
        const maxWaitMs = 30 * 60 * 1000; // 30 minutes max for slower connections
        const checkInterval = setInterval(() => {
            const allDone = modelJob.deps.every(d => ['complete', 'failed', 'cancelled'].includes(d.status));
            const anyFailed = modelJob.deps.some(d => d.status === 'failed');
            const elapsedMs = Date.now() - startTime;

            if (allDone) {
                clearInterval(checkInterval);
                if (anyFailed) {
                    const failedNames = modelJob.deps.filter(d => d.status === 'failed').map(d => d.id).join(', ');
                    reject(new Error(`UW deps install failed: ${failedNames}`));
                } else {
                    resolve();
                }
            } else if (elapsedMs > maxWaitMs) {
                clearInterval(checkInterval);
                const stillPending = modelJob.deps.filter(d => !['complete', 'failed', 'cancelled'].includes(d.status)).map(d => d.id).join(', ');
                logger.error('download', `UW deps install timeout after 30 minutes. Still pending: ${stillPending}`);
                reject(new Error(`UW deps install timeout — still waiting for: ${stillPending}`));
            }
        }, 500);
    });

    // Run custom node install steps if not skipped
    if (!skipCustomNodeInstall) {
        const customNodeDeps = modelJob.deps.filter(d =>
            d.status === 'complete' && d.type === 'custom_nodes' && d.localPath != null
        );

        if (customNodeDeps.length > 0) {
            if (broadcastProgress) {
                broadcastEngineEvent('engine:uw-installing', { status: 'Installing custom node requirements...' });
            }
            // Re-use the modelJob-shaped structure that _runCustomNodeInstall expects
            await _runCustomNodeInstall({
                modelId: modelJob.modelId,
                deps: customNodeDeps,
            });
        }

        if (broadcastProgress) {
            broadcastEngineEvent('engine:uw-installing', { status: 'Universal workflow dependencies ready' });
        }
    } else {
        logger.info('download', 'Skipping custom node install; will be called after engine extraction');
        if (broadcastProgress) {
            broadcastEngineEvent('engine:uw-installing', { status: 'Dependencies downloaded, waiting for engine...' });
        }
    }

    return modelJob;
}

/**
 * Finishes custom node installation after engine is ready.
 * Call this after calling startUniversalWorkflowInstall with skipCustomNodeInstall=true.
 *
 * @param {Object} modelJob - the modelJob returned by startUniversalWorkflowInstall
 * @param {boolean} broadcastProgress - whether to emit SSE events
 */
async function finishCustomNodeInstall(modelJob, broadcastProgress = true) {
    const customNodeDeps = modelJob.deps.filter(d =>
        d.status === 'complete' && d.type === 'custom_nodes' && d.localPath != null
    );

    if (customNodeDeps.length > 0) {
        if (broadcastProgress) {
            broadcastEngineEvent('engine:uw-installing', { status: 'Installing custom node requirements...' });
        }
        await _runCustomNodeInstall({
            modelId: modelJob.modelId,
            deps: customNodeDeps,
        });
    }

    if (broadcastProgress) {
        broadcastEngineEvent('engine:uw-installing', { status: 'Universal workflow dependencies ready' });
    }
}

// Named export for engine to broadcast on shared SSE
function broadcastEngineEvent(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch { _sseClients.delete(res); }
    }
}

// ── Engine Download Pause/Resume ───────────────────────────────────────────────

let _activeEngineDownloader = null;
let _activeEngineDownloadId = null;

function registerEngineDownload(downloader, downloadId) {
    _activeEngineDownloader = downloader;
    _activeEngineDownloadId = downloadId;
}

function clearEngineDownload() {
    _activeEngineDownloader = null;
    _activeEngineDownloadId = null;
}

// /engine/pause + /engine/resume removed (MPI-258 Bug 2): resume corrupted large
// files (NDH 200-vs-206 append) and had no frontend caller. Engine download is
// cancel-only via the existing cancel path.

module.exports = {
    router,
    cancelAllDownloads,
    broadcastEngineEvent,
    FileDownloader,
    registerEngineDownload,
    clearEngineDownload,
    runCustomNodeInstall: _runCustomNodeInstall,
    startUniversalWorkflowInstall,
    finishCustomNodeInstall,
    _byteRatioExcludingNodes, // MPI-231 — exported for unit test
    _customNodeUninstallPath, // MPI-276 — exported for unit test
    _filterDepsForEngine, // MPI-276 — exported for unit test
};
