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
const { createRequire } = require('module');
const logger = require('./logger');
const { runPipCommand, runCustomCommand, resolveComfyPath, getCustomRoot } = require('./shared');
const { getComfyPath } = require('./platformEngine');
const { DownloaderHelper } = require('node-downloader-helper');
const { extractFull } = require('node-7z');
const sevenBin = require('7zip-bin');

const _require = createRequire(__filename);

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
    const defaultModelsRoot = getComfyPath(ENGINE_ROOT, 'models');
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    // Pre-sum totalBytes from ALL deps (including already-installed ones)
    const allDepsSize = dependencies.reduce((sum, d) => sum + _parseSizeToBytes(d.size), 0);
    modelJob.totalBytes += allDepsSize;

    for (const dep of dependencies) {
        let localPath;
        if (dep.type === 'custom_nodes') {
            // GitHub archives download as .zip
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        const isInstalled = await fs.pathExists(localPath);

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

        // Extract GitHub archive zip (extracts to custom_nodes/owner-repo-main/)
        // Do this FIRST so we can scan for the extracted folder AFTER it's created
        try {
            if (await fs.pathExists(zipPath)) {
                logger.info('download', `Extracting zip: ${zipPath}`);
                const stream = extractFull(zipPath, extractDir, { $bin: sevenBin.path7za });
                await new Promise((resolve, reject) => {
                    stream.on('end', resolve);
                    stream.on('error', reject);
                });
                await fs.remove(zipPath); // clean up zip after extraction
                logger.info('download', `Zip extracted and removed: ${zipPath}`);
            } else {
                logger.warn('download', `Zip not found at ${zipPath} — skipping extract`);
                continue;
            }
        } catch (err) {
            logger.error('download', `zip extract FAILED for ${dep.id}: ${err.message}`);
            continue;
        }

        // Now scan for the extracted folder — it will be named 'something-main'
        // GitHub archives preserve repo casing which may differ from dep.filename
        // e.g. repo is 'ComfyUI_UltimateSDUpscale' but dep.filename is 'comfyui_ultimatesdupscale'
        let extractedMainDir = null;
        try {
            const entries = await fs.readdir(extractDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                // Match any '-main' folder whose base name matches dep.filename (case-insensitive)
                const entryLower = entry.name.toLowerCase();
                const targetLower = (dep.filename || '').toLowerCase();
                if (entryLower === targetLower + '-main') {
                    extractedMainDir = path.join(extractDir, entry.name);
                    break;
                }
            }
        } catch (err) {
            logger.error('download', `scan for extracted folder failed for ${dep.id}: ${err.message}`);
        }

        if (!extractedMainDir) {
            // Folder not found — try scanning for ANY -main folder that matches dep.id (exact or close match)
            try {
                const entries = await fs.readdir(extractDir, { withFileTypes: true });
                const depIdLower = (dep.id || '').toLowerCase();
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const entryLower = entry.name.toLowerCase();
                    if (entryLower === depIdLower + '-main') {
                        extractedMainDir = path.join(extractDir, entry.name);
                        logger.info('download', `Found extracted folder via dep.id fallback: ${extractedMainDir}`);
                        break;
                    }
                }
            } catch (err) { /* ignore */ }
        }

        if (!extractedMainDir) {
            logger.warn('download', `Could not find extracted folder for ${dep.id} in ${extractDir}`);
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

// ── Uninstall ─────────────────────────────────────────────────────────────────

router.post('/comfy/models/uninstall', async (req, res) => {
    const { modelId, dependencies } = req.body;
    if (!modelId || !Array.isArray(dependencies)) {
        return res.status(400).json({ error: 'modelId + dependencies required' });
    }

    const customRoot = await getCustomRoot();
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const defaultModelsRoot = getComfyPath(ENGINE_ROOT, 'models');
    const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

    for (const dep of dependencies) {
        let localPath;
        if (dep.type === 'custom_nodes') {
            // GitHub archives download as .zip
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        try {
            if (dep.type === 'custom_nodes') {
                await fs.remove(localPath);
            } else {
                await fs.remove(localPath);
            }
        } catch (err) {
            logger.error('download', `uninstall: failed to remove ${localPath}`, err);
        }
    }

    // Remove the model job from tracking
    _modelJobs.delete(modelId);
    _broadcast('download:uninstalled', { modelId });
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
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const defaultModelsRoot = getComfyPath(ENGINE_ROOT, 'models');
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
        if (dep.type === 'custom_nodes') {
            const zipName = (dep.filename || '').endsWith('.zip') ? dep.filename : `${dep.filename}.zip`;
            localPath = path.join(defaultCustomNodesRoot, zipName);
        } else if (customRoot) {
            const { localPath: lp } = await resolveComfyPath({ type: dep.type, filename: dep.filename }, customRoot, {});
            localPath = lp;
        } else {
            localPath = path.join(defaultModelsRoot, dep.filename);
        }

        const isInstalled = await fs.pathExists(localPath);
        logger.info('download', `startUniversalWorkflowInstall: dep ${depId} resolved to ${localPath}, exists=${isInstalled}`);

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
            logger.info('download', `startUniversalWorkflowInstall: skipping already installed: ${depId} -> ${localPath}`);
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
