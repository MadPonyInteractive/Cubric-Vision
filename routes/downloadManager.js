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
const crypto = require('crypto');
const logger = require('./logger');
const { runPipCommand, resolveComfyPath, getCustomRoot } = require('./shared');
const { DownloaderHelper } = require('node-downloader-helper');

// ── Job Storage ────────────────────────────────────────────────────────────────
const _depJobs = new Map();       // depId → DepJob
const _modelJobs = new Map();     // modelId → DownloadJob
const _activeDownloaders = new Map(); // depId → ResumableDownloader (actively downloading)
const _pausedDownloaders = new Map(); // depId → ResumableDownloader (paused, kept for resume)

function _createDepJob(dep) {
    return {
        id: dep.id,
        url: dep.url,
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
                this.depJob.status = 'complete';
                _broadcast('download:complete', { depId: this.depJob.id, modelId: null });
                _checkModelJobsComplete();
            } catch (err) {
                // SHA256 mismatch — clean up and mark failed
                await fs.remove(this.localPath).catch(() => {});
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

        this._downloader = new DownloaderHelper(this.depJob.url, destDir, {
            fileName: fileName,
            override: true,
            resume: true,
        });

        this._bindEvents();
    }

    async download() {
        await this._ensureDownloader();
        this._downloader.start();
    }

    abort() {
        if (this._downloader) {
            this._downloader.pause().catch(() => {});
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

// ── Start Endpoint ────────────────────────────────────────────────────────────

router.post('/comfy/models/download/start', async (req, res) => {
    const { modelId, dependencies } = req.body;
    if (!modelId || !Array.isArray(dependencies)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

    let modelJob = _modelJobs.get(modelId);
    if (!modelJob) {
        modelJob = _createModelJob(modelId, dependencies);
        _modelJobs.set(modelId, modelJob);
    }

    const customRoot = await getCustomRoot();
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const defaultModelsRoot = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'models');
    const defaultCustomNodesRoot = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'custom_nodes');

    for (const dep of dependencies) {
        let localPath;
        if (dep.type === 'custom_nodes') {
            localPath = path.join(defaultCustomNodesRoot, dep.filename);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        if (await fs.pathExists(localPath)) continue;

        let depJob = _depJobs.get(dep.id);
        if (!depJob) {
            depJob = _createDepJob(dep);
            depJob.localPath = localPath;
            _depJobs.set(dep.id, depJob);
        }
        depJob.refCount += 1;

        if (!modelJob.deps.find(d => d.id === dep.id)) {
            modelJob.deps.push(depJob);
            modelJob.totalBytes += _parseSizeToBytes(dep.size);
        }
    }

    modelJob.status = 'downloading';
    _broadcast('download:started', { modelId, status: 'downloading', progress: modelJob.progress });

    _startPendingDeps();

    res.json({ success: true, jobId: modelId });
});

// ── Pending Deps Launcher ──────────────────────────────────────────────────────

async function _startPendingDeps() {
    const pending = Array.from(_depJobs.values()).filter(d => d.status === 'queued' && d.refCount > 0);
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
        downloader.download().catch(() => {});
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
                downloadedBytes,
                totalBytes,
                speed,
                progress: modelJob.progress,
            });
        }
    };
}

// ── Model Job Completion ──────────────────────────────────────────────────────

function _checkModelJobsComplete() {
    for (const modelJob of _modelJobs.values()) {
        if (modelJob.status !== 'downloading') continue;
        const anyFailed = modelJob.deps.some(d => d.status === 'failed');
        const allComplete = modelJob.deps.every(d => d.status === 'complete');
        const allDone = modelJob.deps.every(d => ['complete', 'failed', 'cancelled'].includes(d.status));

        if (anyFailed) {
            modelJob.status = 'failed';
            _broadcast('download:failed', { modelId: modelJob.modelId });
        } else if (allDone && !allComplete) {
            modelJob.status = 'failed';
            _broadcast('download:failed', { modelId: modelJob.modelId });
        } else if (allComplete) {
            if (modelJob.installCustomNodes) {
                modelJob.status = 'installing';
                _broadcast('download:installing', { modelId: modelJob.modelId });
                _runCustomNodeInstall(modelJob);
            } else {
                modelJob.status = 'complete';
                _broadcast('download:complete', { modelId: modelJob.modelId });
            }
        }
    }
}

async function _runCustomNodeInstall(modelJob) {
    const customDeps = modelJob.deps.filter(d =>
        d.status === 'complete' && d.localPath && (d.id.includes('custom_nodes') || d.type === 'custom_nodes')
    );
    for (const dep of customDeps) {
        const reqPath = path.join(dep.localPath, 'requirements.txt');
        if (await fs.pathExists(reqPath)) {
            try {
                await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
            } catch (err) {
                logger.error('comfy', `pip install failed for ${dep.id}`, err);
            }
        }
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
    _broadcast('download:paused', { modelId });
    res.json({ success: true });
});

router.post('/comfy/models/download/resume', (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    job.status = 'downloading';
    job.deps.forEach(d => { if (d.status === 'paused') d.status = 'queued'; });
    _broadcast('download:resumed', { modelId });
    _startPendingDeps();
    res.json({ success: true });
});

router.post('/comfy/models/download/cancel', (req, res) => {
    const { modelId } = req.body;
    const job = _modelJobs.get(modelId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    for (const dep of job.deps) {
        dep.refCount -= 1;
        if (dep.refCount <= 0) {
            const dl = _activeDownloaders.get(dep.id) || _pausedDownloaders.get(dep.id);
            if (dl) {
                dl.abort();
                _activeDownloaders.delete(dep.id);
                _pausedDownloaders.delete(dep.id);
            }
            dep.status = 'cancelled';
            _depJobs.delete(dep.id);
        }
    }

    _modelJobs.delete(modelId);
    _broadcast('download:cancelled', { modelId });
    res.json({ success: true });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────

function cancelAllDownloads() {
    for (const [, downloader] of _activeDownloaders) {
        downloader.abort();
    }
    for (const [, downloader] of _pausedDownloaders) {
        downloader.abort();
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

module.exports = { router, cancelAllDownloads };
