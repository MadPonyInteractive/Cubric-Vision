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
const { runPipCommand, runCustomCommand, resolveComfyPath, getCustomRoot, cleanEmptyDirs, getUniversalWorkflowDepIds, getDefaultModelsRoot } = require('./shared');
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
    return MODELS
        .filter(m => m.id !== excludeModelId && m.installed === true && Array.isArray(m.dependencies) && m.dependencies.includes(depId))
        .map(m => ({ modelId: m.id, modelName: m.name }));
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
        refCount: 0,
        error: null,
        sha256Expected: dep.sha256 || null,
    };
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
            if (this.onProgress) {
                this.onProgress(stats.downloaded, stats.total, this.depJob.speed);
            }
        });

        // Download finished successfully
        this._downloader.on('end', async () => {
            _activeDownloaders.delete(this.depJob.id);
            try {
                await _verifySha256(this.localPath, this.depJob.sha256Expected);
                await clearDownloadMarker(this.localPath);
                this.depJob.status = 'complete';
                _broadcast('download:complete', { depId: this.depJob.id, modelId: null });
                _checkModelJobsComplete();
            } catch (err) {
                // SHA256 mismatch — clean up and mark failed
                await fs.remove(this.localPath).catch(() => {});
                await clearDownloadMarker(this.localPath).catch(() => {});
                this.depJob.status = 'failed';
                this.depJob.error = err.message;
                _broadcast('download:failed', { depId: this.depJob.id, error: err.message });
                _checkModelJobsComplete();
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
        });

        this._bindEvents();
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

    // Remote engine: install onto the Pod volume via the wrapper instead of
    // downloading to the local filesystem. Same modelJob/SSE shape, so the
    // renderer download UI is unchanged.
    if (remoteModels.isRemoteActive()) {
        return _startRemoteDownload(modelId, dependencies, res);
    }

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, dependencies);
        _modelJobs.set(modelId, modelJob);
    }

    const customRoot = await getCustomRoot();
    const defaultModelsRoot = getDefaultModelsRoot();
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    // Pre-sum totalBytes from ALL deps (including already-installed ones)
    const allDepsSize = dependencies.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0);
    modelJob.totalBytes += allDepsSize;

    for (const dep of dependencies) {
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

    modelJob.status = 'downloading';
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });

    _startPendingDeps();

    res.json({ success: true, jobId: modelId });
});

// ── Pending Deps Launcher ──────────────────────────────────────────────────────

async function _startPendingDeps() {
    const pending = Array.from(_depJobs.values()).filter(d => d.status === 'queued' && d.refCount > 0);
    logger.info('download', `_startPendingDeps: found ${pending.length} queued deps to download`);
    for (const depJob of pending) {
        // Resume a paused downloader (same instance — node-downloader-helper picks up from .part file)
        if (_pausedDownloaders.has(depJob.id)) {
            const downloader = _pausedDownloaders.get(depJob.id);
            _pausedDownloaders.delete(depJob.id);
            _activeDownloaders.set(depJob.id, downloader);
            depJob.status = 'downloading';
            // Re-wire progress in case the same dep is shared across model jobs
            _wireProgress(depJob, downloader);
            downloader.resume();
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
    }
}

function _wireProgress(depJob, downloader) {
    downloader.onProgress = (downloadedBytes, totalBytes, speed) => {
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depJob.id);
            if (!myDep) continue;
            myDep.downloadedBytes = downloadedBytes;
            myDep.totalBytes = totalBytes;
            modelJob.downloadedBytes = modelJob.deps.reduce((sum, d) => sum + (d.downloadedBytes || 0), 0);
            modelJob.speed = speed;
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId: depJob.id,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed,
                progress: modelJob.progress,
            });
        }
    };
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

function _ensureRemoteEventStream() {
    if (_remoteEventStream) return;
    _remoteEventStream = remoteModels.openInstallEventStream((evt) => {
        _onRemoteInstallEvent(evt);
    });
}

function _teardownRemoteEventStreamIfIdle() {
    if (_remoteDepIds.size > 0) return;
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
            // `total` (line above), but modelJob.totalBytes was seeded ONCE from
            // rounded registry sizes and never updated — so the real bytes in the
            // numerator outran the rounded denominator and snapped the bar to ~80%
            // on the first tick. Summing depJob.totalBytes here keeps the
            // denominator honest as each dep's real total arrives.
            modelJob.totalBytes = modelJob.deps.reduce((s, d) => s + (d.totalBytes || 0), 0);
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
        // MPI-95 (revised, post-live-test): the wrapper finished downloading this
        // dep and is now hashing it (sha256 re-reads the whole file). The earlier
        // fix flipped the bar to an indeterminate "Verifying…" sweep here, which
        // read as LESS informative than the determinate bar parked at its last %.
        // So: count the dep as fully downloaded in the aggregate (bytes==total) and
        // re-broadcast a DETERMINATE tick — the bar holds at the real %, no sweep.
        // The wrapper event stays emitted (useful seam) but the app no longer turns
        // it into an indeterminate phase.
        const total = Number(data.total) || depJob.totalBytes || 0;
        if (total) depJob.totalBytes = total;
        depJob.downloadedBytes = total || depJob.downloadedBytes;
        for (const modelJob of _modelJobs.values()) {
            const myDep = modelJob.deps.find(d => d.id === depId);
            if (!myDep) continue;
            modelJob.totalBytes = modelJob.deps.reduce((s, d) => s + (d.totalBytes || 0), 0);
            modelJob.downloadedBytes = modelJob.deps.reduce((s, d) => s + (d.downloadedBytes || 0), 0);
            modelJob.progress = modelJob.totalBytes > 0 ? modelJob.downloadedBytes / modelJob.totalBytes : 0;
            _broadcast('download:progress', {
                modelId: modelJob.modelId,
                depId,
                downloadedBytes: modelJob.downloadedBytes,
                totalBytes: modelJob.totalBytes,
                speed: '',
                progress: modelJob.progress,
                indeterminate: false,
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

        // remoteModelsCheck already reports universal (image-resident) nodes as
        // installed and per-model nodes/weights by their real volume state, so
        // trust `installed`: anything not present is installed via the wrapper
        // (per-model custom_nodes now install onto the volume — Design B+).
        const alreadyInstalled = !!(statusResults[dep.id] && statusResults[dep.id].installed);
        if (alreadyInstalled) {
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
    modelJob.totalBytes = modelJob.deps.reduce((sum, d) => sum + (d.totalBytes || 0), 0) || modelJob.totalBytes;
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

        // If the extracted folder already exists (installed by engine install or a prior run),
        // skip extraction entirely — no failure, just move on.
        if (await fs.pathExists(targetDir)) {
            logger.info('download', `Custom node already extracted: ${targetDir}, skipping`);
            continue;
        }

        // Extract GitHub archive zip (extracts to custom_nodes/owner-repo-main/)
        // Do this FIRST so we can scan for the extracted folder AFTER it's created
        let extractionSucceeded = false;
        try {
            if (await fs.pathExists(zipPath)) {
                logger.info('download', `Extracting zip: ${zipPath}`);
                await _extractZipArchive(zipPath, extractDir);
                await fs.remove(zipPath); // clean up zip after successful extraction
                logger.info('download', `Zip extracted and removed: ${zipPath}`);
                extractionSucceeded = true;
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

        // Install requirements: custom command or pip
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
    }

    if (anyFailure) {
        modelJob.status = 'failed';
        _broadcast('download:failed', { modelId: modelJob.modelId, error: 'One or more custom node extractions failed' });
        throw new Error('One or more custom node extractions failed — see logs');
    }

    modelJob.status = 'complete';
    _broadcast('download:complete', { modelId: modelJob.modelId });
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
        if (dep.refCount <= 0) {
            // Remote install in flight on the Pod — cancel via the wrapper.
            if (_remoteDepIds.has(dep.id)) {
                _remoteDepIds.delete(dep.id);
                await remoteModels.remoteCancelInstall(dep.id);
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
        let anyUnsupported = false;

        for (const dep of dependencies) {
            if (_universalIds.has(dep.id)) {
                keptUniversal.push({ depId: dep.id, depName: dep.name || dep.id });
                continue;
            }
            const sharedWith = _findOtherModelsUsingDep(dep.id, modelId);
            if (sharedWith.length > 0) {
                keptShared.push({ depId: dep.id, depName: dep.name || dep.id, sharedWith: sharedWith.map(m => m.modelName) });
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

        logger.info('download', `remote uninstall ${modelId}: removed ${removed.length}, kept ${keptUniversal.length} universal, ${keptShared.length} shared`);
        _modelJobs.delete(modelId);
        _broadcast('download:uninstalled', { modelId, removed, keptUniversal, keptShared, keptModelFiles: [], keptPipInstalls: [], remote: true });
        return res.json({ success: true, removed, keptUniversal, keptShared, remote: true, partialUnsupported: anyUnsupported });
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
