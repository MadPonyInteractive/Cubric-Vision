/**
 * routes/downloadManager.js — Non-blocking download manager with resume support.
 *
 * Endpoints:
 *   POST /comfy/models/download/start   — enqueue a model's deps
 *   POST /comfy/models/download/pause
 *   POST /comfy/models/download/resume
 *   POST /comfy/models/download/cancel
 *   GET  /comfy/downloads/status         — full queue snapshot
 *   GET  /comfy/downloads/stream         — SSE stream
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
const { runPipCommand, runCustomCommand, resolveComfyPath, getCustomRoot, cleanEmptyDirs, getUniversalWorkflowDepIds, getDefaultModelsRoot, processState } = require('./shared');
const { getComfyPath, getEngineRoot } = require('./platformEngine');
const {
    isCompleteOnDisk,
    markDownloadInProgress,
    clearDownloadMarker,
    getPartialDownloadState,
} = require('./downloadCompletion');
const { DownloaderHelper } = require('node-downloader-helper');
const remoteModels = require('./remoteModels');

const _require = createRequire(__filename);
let _extractZip = null;

async function _extractZipArchive(zipPath, extractDir) {
    if (!_extractZip) {
        _extractZip = _require('extract-zip');
    }
    await _extractZip(zipPath, { dir: path.resolve(extractDir) });
}

const ENGINE_ROOT = getEngineRoot();

// ── Shared-dep helper ─────────────────────────────────────────────────────────

function _findOtherModelsUsingDep(depId, excludeModelId) {
    const { MODELS } = _require('../js/data/modelConstants/models.js');
    const { resolveFullUniverse } = _require('../js/data/modelConstants/resolveModelDeps.js');
    // Resolve each model's FULL dep universe (commonDeps + every op) so an
    // op-specific or common dep of another installed model is protected — the
    // flat `.dependencies` field no longer exists on operation-keyed models. (MPI-122)
    return MODELS
        .filter(m => m.id !== excludeModelId && m.installed === true && resolveFullUniverse(m).includes(depId))
        .map(m => ({ modelId: m.id, modelName: m.name }));
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
    const { resolveFullUniverse } = _require('../js/data/modelConstants/resolveModelDeps.js');
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
        for (const { model, depIds } of others) {
            const entry = results[model.id];
            // Only an INSTALLED (complete-on-volume) other model protects its deps.
            if (entry && entry.installed === true) {
                for (const depId of depIds) keep.add(depId);
            }
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
    return keep;
}

function _isInsidePath(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

// ── Job Storage ────────────────────────────────────────────────────────────────
const _depJobs = new Map();       // depId → DepJob
const _modelJobs = new Map();     // modelId → DownloadJob
const _activeDownloaders = new Map(); // depId → ResumableDownloader (actively downloading)
const _pausedDownloaders = new Map(); // depId → ResumableDownloader (paused, kept for resume)
// 3 parallel deps. Was 1 (commit 47e924a) only because parallel HF/Xet streams
// fought over throttled bandwidth and made each other worse. Now that all MPI
// weights are on R2 (free egress, no wave-throttle, MPI-129), parallel pulls no
// longer self-throttle, so multi-dep installs (Wan = 4 files + encoders) finish
// faster. Kept modest — a single R2 stream already saturates a typical link, so
// 3 overlaps small deps with large ones without thrashing. (MPI-140)
const LOCAL_DOWNLOAD_CONCURRENCY = 3;
const SLOW_RECONNECT_MIN_BEST_BPS = 5 * 1024 * 1024;
const SLOW_RECONNECT_MIN_BPS = 512 * 1024;
const SLOW_RECONNECT_RATIO = 0.15;
const SLOW_RECONNECT_AFTER_MS = 45000;
const SLOW_RECONNECT_COOLDOWN_MS = 120000;

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
        refCount: 0,
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
function _depDenominator(d) {
    return Math.max(d.totalBytes || 0, d.seedBytes || 0);
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

// ── ResumableDownloader (node-downloader-helper wrapper) ─────────────────────

class ResumableDownloader {
    constructor(depJob, localPath) {
        this.depJob = depJob;
        this.localPath = localPath;
        this._downloader = null;
        this.onProgress = null;
        this._eventsBound = false;
        this._bestSpeed = 0;
        this._slowSince = 0;
        this._lastSlowReconnectAt = 0;
        this._slowReconnectInFlight = false;
    }

    _bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;

        // Progress — forwarded to our onProgress callback
        this._downloader.on('progress', (stats) => {
            const speed = stats.speed || 0;
            this.depJob.downloadedBytes = stats.downloaded;
            this.depJob.totalBytes = stats.total;
            this.depJob.speed = _formatSpeed(speed);
            this._maybeRecoverSlowStream(speed, stats.downloaded, stats.total);
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
                if (this.depJob.sha256Expected) {
                    for (const modelJob of _modelJobs.values()) {
                        if (!modelJob.deps.some(d => d.id === this.depJob.id)) continue;
                        _broadcast('download:progress', {
                            modelId: modelJob.modelId,
                            depId: this.depJob.id,
                            downloadedBytes: modelJob.downloadedBytes,
                            totalBytes: modelJob.totalBytes,
                            progress: modelJob.progress,
                            indeterminate: true,
                            phase: 'verifying',
                        });
                    }
                }
                await _verifySha256(this.localPath, this.depJob.sha256Expected);
                await clearDownloadMarker(this.localPath);
                this.depJob.status = 'complete';
                _broadcast('download:complete', { depId: this.depJob.id, modelId: null });
                _checkModelJobsComplete();
                _startPendingDeps();
            } catch (err) {
                // SHA256 mismatch — clean up and mark failed
                await fs.remove(this.localPath).catch(() => {});
                await clearDownloadMarker(this.localPath).catch(() => {});
                this.depJob.status = 'failed';
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
            this.depJob.status = 'failed';
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

        // DO NOT add `resumeIfFileExists`/`override` here. They route start()
        // through an async getTotalSize()→resumeFromFile() chain, so this.__request
        // is not yet set when pause()/abort() runs immediately after start() — the
        // abort misses and the stream keeps downloading after a Pause. In-session
        // pause/resume relies on the synchronous start() path below.
        //   - In-session resume uses the SAME instance via resume() (getResumeState
        //     + resumeFromFile), which is independent of these constructor options.
        //   - The cross-restart "(1)" duplication that resumeIfFileExists/override
        //     would have addressed is instead handled by explicitly scrubbing stale
        //     archives/.part/dups BEFORE download (see _clearStaleWindowsEngineArtifacts
        //     in routes/engine.js). That keeps the fragile pause path untouched.
        // `resume` is not a real node-downloader-helper option (silently ignored),
        // but it is left as a harmless marker of intent; do not "fix" it to
        // resumeIfFileExists — that reintroduces the pause race.
        this._downloader = new DownloaderHelper(this.depJob.url, destDir, {
            fileName: fileName,
            resume: true,
            // NDH default timeout is -1 (no socket timeout) → a black-hole route
            // (DNS resolves but the server never responds) hangs at 0% forever.
            // 30s socket timeout makes a stalled connection emit 'error' instead
            // of hanging silently. Does NOT cap total download time — it's an
            // inactivity timeout on the socket. (MPI-120)
            timeout: 30000,
        });

        this._bindEvents();
    }

    _maybeRecoverSlowStream(speed, downloaded, total) {
        // DISABLED (MPI-129): the pause()→resumeFromFile() recover path races the
        // live NDH socket — old socket pushes bytes into a WriteStream resume has
        // already ended → ERR_STREAM_WRITE_AFTER_END, an UNHANDLED 'error' that
        // crashes the whole server (observed 2026-06-25 on ltx23-gemma-clip, HF
        // throttled to 101 KB/s, bogus best=6554 MB/s baseline). Net value was
        // negative: zero saves, one server-kill. HF/Xet wave-throttling self-
        // recovers on its own, so riding it out beats reconnecting. The real fix
        // is the R2 migration (this card); remove this method + the _bestSpeed/
        // _slowSince/_slowReconnect* fields + SLOW_RECONNECT_* consts once the
        // last HF URL is gone. No-op until then.
        return;
        if (!this._downloader || this.depJob.status !== 'downloading') return;
        if (this._slowReconnectInFlight) return;
        if (!downloaded || (total && downloaded >= total)) return;

        const now = Date.now();
        if (speed > this._bestSpeed) this._bestSpeed = speed;

        const hadHealthySpeed = this._bestSpeed >= SLOW_RECONNECT_MIN_BEST_BPS;
        const isVerySlow = speed > 0
            && speed < SLOW_RECONNECT_MIN_BPS
            && speed < this._bestSpeed * SLOW_RECONNECT_RATIO;

        if (!hadHealthySpeed || !isVerySlow) {
            this._slowSince = 0;
            return;
        }

        if (!this._slowSince) {
            this._slowSince = now;
            return;
        }

        const slowForMs = now - this._slowSince;
        const sinceReconnectMs = now - this._lastSlowReconnectAt;
        if (slowForMs < SLOW_RECONNECT_AFTER_MS || sinceReconnectMs < SLOW_RECONNECT_COOLDOWN_MS) return;

        this._recoverSlowStream(speed).catch(err => {
            logger.warn('download', `slow-stream reconnect failed for ${this.depJob.id}: ${err.message}`);
        });
    }

    async _recoverSlowStream(speed) {
        if (!this._downloader || this._slowReconnectInFlight) return;
        this._slowReconnectInFlight = true;
        this._lastSlowReconnectAt = Date.now();
        this._slowSince = 0;

        try {
            const state = this._downloader.getResumeState();
            logger.warn('download', `slow-stream reconnect for ${this.depJob.id}: current=${_formatSpeed(speed)}, best=${_formatSpeed(this._bestSpeed)}`);
            await this._downloader.pause().catch(() => false);
            if (this.depJob.status !== 'downloading') return;
            this._downloader.resumeFromFile(state.filePath, {
                downloaded: state.downloaded,
                total: state.total,
                fileName: state.fileName,
            }).catch(err => logger.warn('download', `slow-stream resume failed for ${this.depJob.id}: ${err.message}`));
        } finally {
            this._bestSpeed = 0;
            this._slowReconnectInFlight = false;
        }
    }

    async download() {
        await this._ensureDownloader();
        const partial = await getPartialDownloadState(this.localPath);
        if (partial.resumable) {
            await markDownloadInProgress(this.localPath, {
                depId: this.depJob.id,
                url: this.depJob.url,
                resumedAt: new Date().toISOString(),
            });
            this.depJob.downloadedBytes = partial.downloaded;
            this._downloader.resumeFromFile(partial.filePath, {
                downloaded: partial.downloaded,
                fileName: partial.fileName,
            }).catch(() => {});
            return;
        }
        await markDownloadInProgress(this.localPath, {
            depId: this.depJob.id,
            url: this.depJob.url,
        });
        this._downloader.start();
    }

    abort() {
        if (this._downloader) {
            setImmediate(() => {
                this._downloader.pause().catch(() => {});
            });
        }
    }

    async cancel() {
        if (this._downloader) {
            await this._downloader.stop().catch(() => false);
        }
    }

    resume() {
        if (!this._downloader) return;
        const state = this._downloader.getResumeState();
        this._downloader.resumeFromFile(state.filePath, {
            downloaded: state.downloaded,
            total: state.total,
            fileName: state.fileName,
        }).catch(() => {});
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

router.get('/comfy/downloads/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    _sseClients.add(res);
    req.on('close', () => { _sseClients.delete(res); });
});

// ── Status Endpoint ───────────────────────────────────────────────────────────

router.get('/comfy/downloads/status', (req, res) => {
    const jobs = Array.from(_modelJobs.values()).map(job => ({
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
            refCount: d.refCount,
        }))
    }));
    res.json({ success: true, jobs });
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

    // LOCAL path: drop any `engine:'remote'` deps (e.g. the Pod-only GGUF
    // transformer) so the local box never downloads weights it can't use. The
    // frontend already filters, but a stale client / direct API call could send
    // both — filter server-side too. Untagged (shared) deps pass through.
    const { filterDepsByEngine } = _require('../js/data/modelConstants/resolveModelDeps.js');
    const localDeps = filterDepsByEngine(dependencies, false);

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, localDeps);
        _modelJobs.set(modelId, modelJob);
    }

    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    // Pre-sum totalBytes from ALL deps (including already-installed ones)
    const allDepsSize = localDeps.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0);
    modelJob.totalBytes += allDepsSize;

    for (const dep of localDeps) {
        let localPath;
        let installedCheckPath;
        if (dep.type === 'custom_nodes') {
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
        depJob.refCount += 1;

        if (!modelJob.deps.find(d => d.id === dep.id)) {
            modelJob.deps.push(depJob);
        }

        // Mark installed deps as complete immediately (they contribute to progress but not to active downloads)
        if (isInstalled) {
            depJob.status = 'complete';
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else if (depJob.status !== 'queued' && depJob.status !== 'downloading') {
            // Reset any terminal state (complete, failed, cancelled) back to queued.
            depJob.status = 'queued';
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
            // Roll back the refCount bumps this call made so a later retry (after
            // the user frees space) is not blocked by orphaned references.
            for (const dep of localDeps) {
                const depJob = _depJobs.get(dep.id);
                if (depJob) depJob.refCount = Math.max(0, depJob.refCount - 1);
            }
            modelJob.status = 'idle';
            logger.warn('download', `install blocked — disk full: need ${_fmtGb(neededBytes)} free, have ${_fmtGb(freeBytes)} at ${targetDir}`);
            return res.status(400).json({
                error: `Not enough disk space to install this model. ${_fmtGb(neededBytes)} needed, ${_fmtGb(freeBytes)} free.`,
            });
        }
    }

    modelJob.status = 'downloading';
    _resetModelSpeed(modelJob);
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });

    _startPendingDeps();

    res.json({ success: true, jobId: modelId });
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
        && d.refCount > 0
        && _depHasActiveDownloadConsumer(d.id)
    );
    const slots = Math.max(0, LOCAL_DOWNLOAD_CONCURRENCY - _activeDownloaders.size);
    logger.info('download', `_startPendingDeps: ${pending.length} queued deps, ${_activeDownloaders.size}/${LOCAL_DOWNLOAD_CONCURRENCY} active`);
    if (slots <= 0) return;

    let started = 0;
    for (const depJob of pending) {
        if (started >= slots) break;
        // Resume a paused downloader (same instance — node-downloader-helper picks up from .part file)
        if (_pausedDownloaders.has(depJob.id)) {
            const downloader = _pausedDownloaders.get(depJob.id);
            _pausedDownloaders.delete(depJob.id);
            _activeDownloaders.set(depJob.id, downloader);
            depJob.status = 'downloading';
            // Re-wire progress in case the same dep is shared across model jobs
            _wireProgress(depJob, downloader);
            downloader.resume();
            started += 1;
            continue;
        }

        if (_activeDownloaders.has(depJob.id)) {
            continue;
        }

        depJob.status = 'downloading';
        const downloader = new ResumableDownloader(depJob, depJob.localPath);
        _activeDownloaders.set(depJob.id, downloader);

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
            modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
            // Denominator must track each dep's REAL Content-Length once known, not the
            // declared `size:` estimate — else the bar finishes short (e.g. Wan declared
            // 15GB but is 14.3GB → bar caps ~91% then jumps to done). Prefer real total;
            // fall back to seedBytes only while real is still 0 (dep not yet emitting).
            // NB: NOT _depDenominator's Math.max(real,seed) here — when the declared seed
            // is larger than the real size, max() keeps the inflated seed and the bar
            // still finishes short. The actual byte count is the truth once it arrives.
            modelJob.totalBytes = modelJob.deps.reduce(
                (sum, d) => sum + (d.totalBytes || d.seedBytes || 0), 0);
            modelJob.speed = _modelSpeedLabel(modelJob);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId: depJob.id,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: modelJob.speed,
                progress: modelJob.progress,
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
                depJob.status = 'complete';
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
        depJob.downloadedBytes = downloaded;
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
            modelJob.totalBytes = modelJob.deps.reduce((s, d) => s + _depDenominator(d), 0);
            modelJob.downloadedBytes = modelJob.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                // MPI-95: any real wrapper progress tick definitively clears the
                // Preparing… sweep (covers a HEAD-slower-than-first-tick race).
                indeterminate: false,
            });
        }
    } else if (evt.type === 'models:install-verifying') {
        // The wrapper finished downloading this dep and is now hashing it (sha256
        // re-reads the whole file — seconds on a CPU Pod, no byte progress). Flip the
        // bar to the indeterminate "Verifying…" sweep so the otherwise-silent stall
        // at 100% is explained — matching the LOCAL path (see download:verifying emit
        // in ResumableDownloader.on('end')). Keeps remote + local consistent.
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
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                indeterminate: true,
                phase: 'verifying',
            });
        }
    } else if (evt.type === 'models:install-complete') {
        depJob.downloadedBytes = Number(data.size_bytes) || depJob.totalBytes || 0;
        depJob.totalBytes = depJob.downloadedBytes;
        depJob.status = 'complete';
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
            depJob.status = 'cancelled';
        } else {
            depJob.status = 'failed';
            depJob.error = data.message || data.error || 'remote install failed';
            _broadcast('download:failed', { depId, error: depJob.error });
        }
        _checkModelJobsComplete();
        _teardownRemoteEventStreamIfIdle();
    }
}

async function _startRemoteDownload(modelId, dependencies, res) {
    // REMOTE path: drop any `engine:'local'` deps (e.g. the 41GB bf16 transformer
    // that only the local engine uses) so the Pod volume never installs weights it
    // can't use. Untagged (shared) deps pass through. (bf16-local / GGUF-Pod split)
    const { filterDepsByEngine } = _require('../js/data/modelConstants/resolveModelDeps.js');
    dependencies = filterDepsByEngine(dependencies, true);

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

    const allDepsSize = dependencies.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0);
    modelJob.totalBytes += allDepsSize;

    const toInstall = [];
    for (const dep of dependencies) {
        let depJob = _depJobs.get(dep.id);
        if (!depJob) {
            depJob = _createDepJob(dep);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
            _depJobs.set(dep.id, depJob);
        }
        depJob.refCount += 1;
        if (!modelJob.deps.find(d => d.id === dep.id)) modelJob.deps.push(depJob);

        // MPI-97 — shared-dep ATTACH. When this dep is already installing for
        // ANOTHER model (its wrapper install is in flight: `_remoteDepIds` holds
        // it, or its job is mid-download/already-finished this session), model B
        // must NOT fire a second `/wrapper/models/install` — the wrapper rejects a
        // duplicate ("this model is already downloading") and B's whole install
        // was failing with a Download-Failed + Report-on-GitHub dialog. Instead B
        // ATTACHES: refCount is already bumped above, the dep stays in B's
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
        if (alreadyInstalled && dep.type === 'custom_nodes') {
            // A custom_node folder present on the volume does NOT prove its pip
            // requirements ran (a prior install may have landed the folder but
            // failed/skipped requirements.txt — e.g. ComfyUI-GGUF present but the
            // `gguf` pkg missing → node import fails on every gen). The wrapper's
            // status check only sees the folder. So for a custom_node in THIS
            // install request, still send it with `requirements_only` so the
            // wrapper re-runs (idempotent) pip -r requirements.txt WITHOUT
            // re-downloading or removing the folder. Self-heals the recurring
            // "node present, dep missing" class. Weights (non-node) trust the flag.
            depJob.status = 'queued';
            depJob.downloadedBytes = 0;
            depJob.error = null;
            toInstall.push({ ...dep, requirementsOnly: true });
        } else if (alreadyInstalled) {
            depJob.status = 'complete';
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
        } else {
            depJob.status = 'queued';
            depJob.downloadedBytes = 0;
            depJob.error = null;
            toInstall.push(dep);
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
    modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
    modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
    modelJob.status = 'downloading';
    _resetModelSpeed(modelJob);

    if (!toInstall.length) {
        // Everything already present — settle the job state immediately.
        _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });
        res.json({ success: true, jobId: modelId });
        _checkModelJobsComplete();
        return;
    }

    // Instant feedback: indeterminate, no number to lie about until the wrapper's
    // first real-total progress tick arrives.
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress, indeterminate: true });

    // Respond before kicking off installs (matches the local path's fire-and-forget).
    res.json({ success: true, jobId: modelId });

    _ensureRemoteEventStream();
    for (const dep of toInstall) {
        const depJob = _depJobs.get(dep.id);
        if (depJob) depJob.status = 'downloading';
        _remoteDepIds.add(dep.id);
        // Do NOT pass the app's display `size` ("67MB") as size_bytes — it is
        // approximate and the wrapper rejects an exact-correct file on a
        // done != expected_size mismatch. The wrapper uses content-length for
        // the progress total and the dep sha256 (when present) for integrity.
        remoteModels.remoteInstallDep(dep)
            .then((out) => {
                // already_installed: the SSE will not fire — settle here.
                if (out && out.status === 'already_installed') {
                    const dj = _depJobs.get(dep.id);
                    if (dj) {
                        dj.status = 'complete';
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
                if (dj) { dj.status = 'failed'; dj.error = err.message; }
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
            modelJob.status = 'failed';
            // Surface the first failed dep's error so the UI shows a real reason
            // instead of "undefined" (the model-level event carried no error).
            const failedDep = modelJob.deps.find(d => d.status === 'failed' && d.error);
            _broadcast('download:failed', {
                modelId: modelJob.modelId,
                error: failedDep ? failedDep.error : 'One or more dependencies failed to download',
            });
        } else if (allComplete) {
            if (modelJob.installCustomNodes) {
                modelJob.status = 'installing';
                _broadcast('download:installing', { modelId: modelJob.modelId });
                _runCustomNodeInstall(modelJob).catch(err => {
                    logger.error('download', `_runCustomNodeInstall crashed: ${err.message}`);
                    modelJob.status = 'failed';
                    _broadcast('download:failed', { modelId: modelJob.modelId });
                });
            } else {
                modelJob.status = 'complete';
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
        modelJob.status = 'complete';
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

        // If the extracted folder already exists (installed by engine install or a
        // prior run), skip ONLY extraction — but still fall through to the
        // requirements step below. A node folder can land without its pip deps (a
        // prior install where requirements.txt failed/was interrupted, or the node
        // was extracted by a different path that never ran pip); folder-present is
        // NOT proof the deps are installed. pip with --upgrade is idempotent (a
        // no-op when already satisfied), so re-running it is cheap + self-healing.
        // This is the general cure for the recurring "node present, dep missing"
        // class (e.g. ComfyUI-GGUF folder on disk but `gguf` pkg absent).
        const alreadyExtracted = await fs.pathExists(targetDir);
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
                if (await fs.pathExists(targetDir)) {
                    // Target already exists — remove the incorrectly-named duplicate
                    await fs.remove(extractedMainDir);
                    logger.warn('download', `Target ${targetDir} already exists, removed duplicate: ${extractedMainDir}`);
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
        if (dep.installRequirementsCommand) {
            try {
                await runCustomCommand(dep.installRequirementsCommand, targetDir);
                logger.info('download', `Custom install command succeeded for ${dep.id}`);
            } catch (err) {
                logger.error('download', `Custom install command FAILED for ${dep.id}: ${err.message}`);
                throw err;
            }
        } else {
            const reqPath = path.join(targetDir, 'requirements.txt');
            if (await fs.pathExists(reqPath)) {
                try {
                    await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
                    logger.info('download', `pip requirements installed for ${dep.id}`);
                } catch (err) {
                    logger.error('download', `pip install FAILED for ${dep.id}: ${err.message}`);
                    throw err;
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
                logger.error('download', `pip pin install FAILED for ${dep.id}: ${err.message}`);
                throw err;
            }
        }
    }

    if (anyFailure) {
        modelJob.status = 'failed';
        _broadcast('download:failed', { modelId: modelJob.modelId, error: 'One or more custom node extractions failed' });
        throw new Error('One or more custom node extractions failed — see logs');
    }

    modelJob.status = 'complete';
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

// ── Pause / Resume / Cancel ───────────────────────────────────────────────────

router.post('/comfy/models/download/pause', (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    // Remote installs stream on the Pod and have no resumable .part — pause is
    // not supported; the install keeps running rather than break the button.
    if (remoteModels.isRemoteActive()) {
        return res.json({ success: true, remoteUnsupported: 'pause' });
    }
    job.status = 'paused';
    job.deps.forEach(d => {
        if (d.status === 'downloading') {
            const dl = _activeDownloaders.get(d.id);
            if (dl) {
                dl.abort();
                _activeDownloaders.delete(d.id);
                // Keep the instance so resume can call .download() on the same object
                _pausedDownloaders.set(d.id, dl);
            }
            d.status = 'paused';
        }
    });
    _recalculateModelJobProgress(job);
    _broadcast('download:paused', _downloadJobEventPayload(job));
    _startPendingDeps();
    res.json({ success: true });
});

router.post('/comfy/models/download/resume', (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (remoteModels.isRemoteActive()) {
        return res.json({ success: true, remoteUnsupported: 'resume' });
    }
    job.status = 'downloading';
    _resetModelSpeed(job);
    job.deps.forEach(d => { if (d.status === 'paused') d.status = 'queued'; });
    _recalculateModelJobProgress(job);
    _broadcast('download:resumed', _downloadJobEventPayload(job));
    _startPendingDeps();
    res.json({ success: true });
});

router.post('/comfy/models/download/cancel', async (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    for (const dep of job.deps) {
        dep.refCount -= 1;
        // MPI-97 — the refCount gate is load-bearing for shared-dep cancel: when a
        // dep is shared with ANOTHER active model (it ATTACHED at start, so
        // refCount >= 2), cancelling THIS model must only decrement, never
        // wrapper-cancel or delete the dep out from under the model still using it.
        // Do NOT collapse this `refCount <= 0` guard.
        if (dep.refCount <= 0) {
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
            const dl = _activeDownloaders.get(dep.id) || _pausedDownloaders.get(dep.id);
            if (dl) {
                await dl.cancel();
                _activeDownloaders.delete(dep.id);
                _pausedDownloaders.delete(dep.id);
            }
            if (dep.localPath) clearDownloadMarker(dep.localPath).catch(() => {});
            dep.status = 'cancelled';
            _depJobs.delete(dep.id);
        }
    }

    _teardownRemoteEventStreamIfIdle();
    _modelJobs.delete(modelId);
    _broadcast('download:cancelled', { modelId });
    _startPendingDeps();
    res.json({ success: true });
});

// ── Uninstall ─────────────────────────────────────────────────────────────────

router.post('/comfy/models/uninstall', async (req, res) => {
    const { modelId, dependencies, deleteFiles = true } = req.body;
    if (!modelId || !Array.isArray(dependencies)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

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

    for (const dep of dependencies) {
        let localPath;
        if (dep.type === 'custom_nodes') {
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        // Rule 1: always preserve universal workflow deps (installOnEngine)
        if (_universalDepIds.has(dep.id)) {
            keptUniversal.push({ depId: dep.id, depName: dep.name || dep.id });
            continue;
        }

        const sharedWith = _findOtherModelsUsingDep(dep.id, modelId);
        if (sharedWith.length > 0) {
            keptShared.push({ depId: dep.id, depName: dep.name || dep.id, sharedWith: sharedWith.map(m => m.modelName) });
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
            if (await fs.pathExists(localPath)) {
                await _trash(localPath);
                await cleanEmptyDirs(localPath, dep.type === 'custom_nodes' ? defaultCustomNodesRoot : managedModelsRoot);
                logger.info('download', `uninstall: moved to trash ${localPath}`);
            }
            await clearDownloadMarker(localPath).catch(() => {});
            removed.push({ depId: dep.id, depName: dep.name || dep.id });
            const depJob = _depJobs.get(dep.id);
            if (depJob) {
                depJob.refCount -= 1;
                if (depJob.refCount <= 0) _depJobs.delete(dep.id);
            }
        } catch (err) {
            logger.error('download', `uninstall: failed to trash ${localPath}`, err);
        }
    }

    logger.info('download', `uninstall ${modelId}: removed ${removed.length}, kept ${keptUniversal.length} universal, ${keptShared.length} shared, ${keptModelFiles.length} model files, ${keptPipInstalls.length} pip-installs`);
    _modelJobs.delete(modelId);
    _broadcast('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls });
    res.json({ success: true, removed, keptUniversal, keptShared, keptModelFiles, keptPipInstalls });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

function cancelAllDownloads() {
    for (const [, downloader] of _activeDownloaders) {
        downloader.cancel().catch(() => {});
    }
    for (const [, downloader] of _pausedDownloaders) {
        downloader.cancel().catch(() => {});
    }
    _activeDownloaders.clear();
    _pausedDownloaders.clear();
    for (const [, job] of _modelJobs) {
        job.deps.forEach(d => { d.status = 'cancelled'; });
        job.status = 'cancelled';
    }
    _modelJobs.clear();
    _depJobs.clear();
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
        if (dep.type === 'custom_nodes') {
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
        depJob.refCount += 1;

        if (!modelJob.deps.find(d => d.id === depId)) {
            modelJob.deps.push(depJob);
        }

        // Mark already-installed deps as complete without downloading
        if (isInstalled) {
            depJob.status = 'complete';
            depJob.downloadedBytes = _parseSizeToBytes(dep.size);
            depJob.totalBytes = _parseSizeToBytes(dep.size);
            logger.info('download', `startUniversalWorkflowInstall: skipping already installed: ${depId} -> ${installedCheckPath}`);
        } else if (depJob.status !== 'queued' && depJob.status !== 'downloading') {
            // Reset any terminal state (complete, failed, cancelled) back to queued
            // so _startPendingDeps will re-download. Covers: zip missing after failed
            // extraction (was complete), and previously failed downloads on retry.
            const prevStatus = depJob.status;
            depJob.status = 'queued';
            depJob.downloadedBytes = 0;
            depJob.error = null;
            logger.info('download', `startUniversalWorkflowInstall: resetting ${depId} (was ${prevStatus}) for re-download`);
        }
    }

    _modelJobs.set(modelJob.modelId, modelJob);

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

router.post('/engine/pause', (req, res) => {
    if (!_activeEngineDownloader) {
        return res.status(404).json({ error: 'No active engine download to pause' });
    }
    _activeEngineDownloader.abort();
    logger.info('engine', `Engine download paused: ${_activeEngineDownloadId}`);
    res.json({ success: true });
});

router.post('/engine/resume', (req, res) => {
    if (!_activeEngineDownloader) {
        return res.status(404).json({ error: 'No paused engine download to resume' });
    }
    _activeEngineDownloader.resume();
    logger.info('engine', `Engine download resumed: ${_activeEngineDownloadId}`);
    res.json({ success: true });
});

module.exports = {
    router,
    cancelAllDownloads,
    broadcastEngineEvent,
    ResumableDownloader,
    registerEngineDownload,
    clearEngineDownload,
    runCustomNodeInstall: _runCustomNodeInstall,
    startUniversalWorkflowInstall,
    finishCustomNodeInstall,
};
