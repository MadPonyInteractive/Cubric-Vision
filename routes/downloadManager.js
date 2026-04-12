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
const https = require('https');
const http = require('http');

// ── Job Storage ────────────────────────────────────────────────────────────────
const _depJobs = new Map();       // depId → DepJob
const _modelJobs = new Map();     // modelId → DownloadJob
const _activeDownloaders = new Map(); // depId → ResumableDownloader

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
        partialPath: null,
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

// ── ResumableDownloader ───────────────────────────────────────────────────────

class ResumableDownloader {
    constructor(depJob, localPath) {
        this.depJob = depJob;
        this.localPath = localPath;
        this._aborted = false;
        this.onProgress = null;
    }

    async download() {
        await fs.ensureDir(path.dirname(this.localPath));

        const partialPath = this.localPath + '.partial';
        let startByte = 0;
        if (await fs.pathExists(partialPath)) {
            const meta = await _readPartialMeta(partialPath);
            startByte = meta.downloadedBytes || 0;
            this.depJob.partialPath = partialPath;
        }

        return new Promise((resolve, reject) => {
            const protocol = this.depJob.url.startsWith('https') ? https : http;
            const reqOptions = {
                headers: {
                    'User-Agent': 'MpiAiSuite/1.0',
                    ...(startByte > 0 ? { 'Range': `bytes=${startByte}-` } : {}),
                }
            };

            const req = protocol.get(this.depJob.url, reqOptions, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    this.depJob.url = new URL(response.headers.location, this.depJob.url).href;
                    this.download().then(resolve).catch(reject);
                    return;
                }
                if (response.statusCode !== 200 && response.statusCode !== 206) {
                    return reject(new Error(`HTTP ${response.statusCode}`));
                }

                this.depJob.totalBytes = parseInt(response.headers['content-length'] || '0');
                const writer = fs.createWriteStream(partialPath, { flags: startByte > 0 ? 'a' : 'w' });
                let lastLoggedAt = Date.now();
                let bytesSinceLastLog = 0;

                response.on('data', (chunk) => {
                    if (this._aborted) { response.destroy(); return; }
                    writer.write(chunk);
                    this.depJob.downloadedBytes += chunk.length;
                    bytesSinceLastLog += chunk.length;
                    const now = Date.now();
                    const elapsed = (now - lastLoggedAt) / 1000;
                    if (elapsed >= 1) {
                        const speed = bytesSinceLastLog / elapsed;
                        this.depJob.speed = _formatSpeed(speed);
                        if (this.onProgress) {
                            this.onProgress(this.depJob.downloadedBytes, this.depJob.totalBytes, this.depJob.speed);
                        }
                        bytesSinceLastLog = 0;
                        lastLoggedAt = now;
                        _savePartialMeta(partialPath, this.depJob.downloadedBytes);
                    }
                });

                response.on('end', async () => {
                    if (this._aborted) return reject(new Error('Aborted'));
                    await new Promise((res, rej) => { writer.end(); writer.once('finish', res); writer.once('error', rej); });
                    try {
                        await _verifySha256(partialPath, this.depJob.sha256Expected);
                        await fs.rename(partialPath, this.localPath);
                        this.depJob.status = 'complete';
                        _activeDownloaders.delete(this.depJob.id);
                        resolve(this.localPath);
                    } catch (err) {
                        await fs.remove(partialPath).catch(() => {});
                        this.depJob.status = 'failed';
                        this.depJob.error = err.message;
                        _activeDownloaders.delete(this.depJob.id);
                        reject(err);
                    }
                });

                response.on('error', (err) => {
                    this.depJob.status = 'failed';
                    this.depJob.error = err.message;
                    _activeDownloaders.delete(this.depJob.id);
                    reject(err);
                });

                this._response = response;
            });

            req.on('error', (err) => {
                this.depJob.status = 'failed';
                this.depJob.error = err.message;
                _activeDownloaders.delete(this.depJob.id);
                reject(err);
            });

            this._req = req;
        });
    }

    abort() {
        this._aborted = true;
        this._req?.destroy();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _readPartialMeta(partialPath) {
    const metaPath = partialPath + '.meta';
    if (await fs.pathExists(metaPath)) return await fs.readJson(metaPath);
    return { downloadedBytes: 0 };
}

async function _savePartialMeta(partialPath, downloadedBytes) {
    await fs.writeJson(partialPath + '.meta', { downloadedBytes }, { spaces: 0 });
}

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
        if (_activeDownloaders.has(depJob.id)) continue;

        depJob.status = 'downloading';
        const downloader = new ResumableDownloader(depJob, depJob.localPath);
        _activeDownloaders.set(depJob.id, downloader);

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

        try {
            await downloader.download();
            for (const modelJob of _modelJobs.values()) {
                const myDep = modelJob.deps.find(d => d.id === depJob.id);
                if (myDep) myDep.status = 'complete';
            }
            _broadcast('download:complete', { depId: depJob.id, modelId: null });
            _checkModelJobsComplete();
        } catch (err) {
            if (depJob.status !== 'cancelled') {
                depJob.status = 'failed';
                depJob.error = err.message;
            }
            _broadcast('download:failed', { depId: depJob.id, error: err.message });
            _checkModelJobsComplete();
        }
    }
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
            if (dl) dl.abort();
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
            const dl = _activeDownloaders.get(dep.id);
            if (dl) dl.abort();
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
    for (const [, job] of _modelJobs) {
        job.deps.forEach(d => { d.status = 'cancelled'; });
        job.status = 'cancelled';
    }
    _modelJobs.clear();
    _depJobs.clear();
    _activeDownloaders.clear();
    _broadcast('download:cancelled', { all: true });
}

module.exports = { router, cancelAllDownloads };
