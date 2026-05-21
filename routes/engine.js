/**
 * routes/engine.js — Engine binary provisioning routes (ComfyUI).
 *
 * Routes exposed:
 *   GET  /engine/status    — check if engine binary exists
 *   POST /engine/download  — download and extract engine archive
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { SYS_DEPS_PATH, checkUniversalWorkflowDepsStatus, getUniversalWorkflowDepsTotalSize, processState, stopComfyUI } = require('./shared');
const logger = require('./logger');
const { broadcastEngineEvent, ResumableDownloader, registerEngineDownload, clearEngineDownload, startUniversalWorkflowInstall, finishCustomNodeInstall } = require('./downloadManager');
const { COMFY_DIR, COMFY_VERSION, getPythonBin, getComfyPath, resolveDownloadConfig, getEngineRoot } = require('./platformEngine');
const { buildExtraModelPathsYaml } = require('./yamlHelper');

const ENGINE_ROOT = getEngineRoot();

router.get('/engine/status', async (req, res) => {
    try {
        if (!(await fs.pathExists(SYS_DEPS_PATH))) {
            return res.json({ success: true, exists: false });
        }
        const pythonPath = getPythonBin(ENGINE_ROOT);
        res.json({ success: true, exists: await fs.pathExists(pythonPath) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * Async implementation of engine download logic.
 * Called without awaiting from the router so response goes immediately.
 *
 * Steps:
 * 1. Download the binary archive from system_dependencies.json
 * 2. Extract it to the target directory
 * 3. Patch it (bat flags, settings)
 * 4. Write version stamp (.mpi_engine_version)
 * 5. Write extra_model_paths.yaml
 * 6. Broadcast SSE events at key stages
 */
async function _runEngineDownload() {
    const type = 'comfy';
    logger.info('engine', `_runEngineDownload started`);
    try {
        logger.info('engine', `Reading system dependencies from ${SYS_DEPS_PATH}`);
        const config = await fs.readJson(SYS_DEPS_PATH);
        logger.info('engine', `System dependencies loaded successfully`);

        // Detect GPU and resolve download URLs
        const downloadConfig = await resolveDownloadConfig();

        const engineInfo = {
            version: config.engine.version,
            filename: downloadConfig.comfy.filename,
            url: downloadConfig.comfy.url,
        };
        const targetDir = ENGINE_ROOT;

        if (!engineInfo) throw new Error('Engine info not found in configs');

        // ── 1. Pre-calculate combined size (engine + UW deps) ────────────────────
        let uwDepsTotalBytes = 0;
        let missingDepIds = [];

        const { missingDeps } = await checkUniversalWorkflowDepsStatus();
        missingDepIds = missingDeps;
        if (missingDeps.length > 0) {
            logger.info('engine', `Calculating size for ${missingDeps.length} UW deps...`);
            uwDepsTotalBytes = await getUniversalWorkflowDepsTotalSize(missingDeps);
            logger.info('engine', `UW deps total size: ${(uwDepsTotalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
        }

        // ── 2. Download engine using ResumableDownloader ────────────────────────
        let engineArchiveSize = 0;
        broadcastEngineEvent('engine:downloading', {
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 0
        });

        await fs.ensureDir(targetDir);
        const archivePath = path.join(targetDir, engineInfo.filename);

        logger.info('system', `Downloading engine: ${engineInfo.url}`);

        const downloadId = `engine-${type}`;
        const depJob = {
            id: downloadId,
            url: engineInfo.url,
            localPath: archivePath,
            status: 'downloading',
            downloadedBytes: 0,
            totalBytes: 0,
            refCount: 1,
            error: null,
            sha256Expected: null
        };

        const downloader = new ResumableDownloader(depJob, archivePath);

        downloader.onProgress = (downloaded, total, speed) => {
            engineArchiveSize = total;
            const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
            broadcastEngineEvent('engine:downloading', {
                progress,
                downloadedBytes: downloaded,
                totalBytes: total,
                speed
            });
        };

        await downloader._ensureDownloader();
        registerEngineDownload(downloader, downloadId);

        // Fire UW deps download immediately (parallel with engine download, skip custom node install for now)
        let uwModelJob = null;
        let uwDepsPromise = Promise.resolve();
        if (missingDepIds.length > 0) {
            logger.info('engine', `Firing ${missingDepIds.length} UW deps downloads (parallel)...`);
            uwDepsPromise = startUniversalWorkflowInstall(missingDepIds, true, true)  // true = skip custom node install
                .then(modelJob => {
                    uwModelJob = modelJob;
                    return modelJob;
                })
                .catch(err => {
                    logger.error('engine', `UW deps download error: ${err.message}`);
                    broadcastEngineEvent('engine:uw-installing', {
                        status: 'Some dependencies could not be installed. You can repair them later.'
                    });
                });
        }

        await new Promise((resolve, reject) => {
            downloader._downloader.on('end', () => {
                clearEngineDownload();
                resolve();
            });
            downloader._downloader.on('error', (err) => {
                clearEngineDownload();
                reject(err);
            });
            downloader._downloader.start();
        });

        // ── 3. Extract ─────────────────────────────────────────────────────────
        broadcastEngineEvent('engine:extracting', { status: 'extracting', progress: 0 });
        logger.info('system', 'Extracting engine archive...');

        const sevenBin = require('7zip-bin');
        const { extractFull } = require('node-7z');
        const myStream = extractFull(archivePath, targetDir, { $bin: sevenBin.path7za });

        await new Promise((resolve, reject) => {
            myStream.on('data', (data) => {
                if (data && data.status) {
                    broadcastEngineEvent('engine:extracting', {
                        status: 'extracting',
                        file: data.file || '',
                        progress: 0
                    });
                }
            });
            myStream.on('end', resolve);
            myStream.on('error', reject);
        });

        await fs.remove(archivePath);

        // ── Wait for UW deps downloads, then finish custom node install ─────────
        logger.info('engine', 'Waiting for UW deps downloads to complete...');
        await uwDepsPromise;

        let uwInstallFailed = false;
        if (uwModelJob) {
            logger.info('engine', 'Engine ready, finishing custom node installation...');
            try {
                await finishCustomNodeInstall(uwModelJob, true);
            } catch (err) {
                logger.error('engine', `Custom node install error: ${err.message}`);
                uwInstallFailed = true;
                // Do NOT re-throw — engine itself is fine; user can repair UW deps later
            }
        }

        // ── 4. Patch ───────────────────────────────────────────────────────────
        broadcastEngineEvent('engine:patching', { status: 'patching' });
        logger.info('system', 'Patching engine...');

        const batPath = path.join(targetDir, COMFY_DIR, 'run_nvidia_gpu.bat');
        if (await fs.pathExists(batPath)) {
            let content = await fs.readFile(batPath, 'utf8');
            if (!content.includes('--enable-cors-header')) {
                logger.info('system', 'Patching run_nvidia_gpu.bat with taesd, cors and listen flags...');
                content = content.replace('ComfyUI\\main.py', 'ComfyUI\\main.py --listen 127.0.0.1 --preview-method taesd --enable-cors-header');
                await fs.writeFile(batPath, content, 'utf8');
            }
        }
        const settingsPath = getComfyPath(targetDir, 'user', 'default', 'comfy.settings.json');
        try {
            await fs.ensureDir(path.dirname(settingsPath));
            let settings = {};
            if (await fs.pathExists(settingsPath)) settings = await fs.readJson(settingsPath);
            settings['Comfy.Execution.PreviewMethod'] = 'taesd';
            settings['Comfy.PreviewMethod'] = 'taesd';
            await fs.writeJson(settingsPath, settings, { spaces: 4 });
            logger.info('system', 'ComfyUI settings updated to use TAESD previews.');
        } catch (err) {
            logger.warn('system', `Failed to update ComfyUI settings: ${err}`);
        }

        // ── 5. Post-install: Write version stamp ───────────────────────────────
        const INSTALLED_ENGINE_VERSION = engineInfo.version;
        await fs.writeFile(
            path.join(targetDir, '.mpi_engine_version'),
            INSTALLED_ENGINE_VERSION,
            'utf8'
        );
        logger.info('engine', `Version stamp written: ${INSTALLED_ENGINE_VERSION}`);

        // ── 6. Post-install: Write extra_model_paths.yaml (if needed) ────────────
        const extraConfigPath = getComfyPath(targetDir, 'extra_model_paths.yaml');

        if (!(await fs.pathExists(extraConfigPath))) {
            const mpiModelsDir = path.join(targetDir, 'mpi_models');
            await fs.ensureDir(mpiModelsDir);
            await fs.writeFile(extraConfigPath, buildExtraModelPathsYaml(mpiModelsDir), 'utf8');
            logger.info('engine', `extra_model_paths.yaml written with default: ${mpiModelsDir}`);
        } else {
            logger.info('engine', `extra_model_paths.yaml already exists, preserving existing configuration`);
        }

        // ── 7. Complete engine (UW deps fully done) ─────────────────────────────
        if (uwInstallFailed) {
            broadcastEngineEvent('engine:error', {
                error: 'UW deps installation failed. Press Retry to re-attempt.'
            });
        } else {
            // Stop any running ComfyUI and clear restart flag — fresh install needs a clean start
            stopComfyUI();
            processState.comfyNeedsRestart = false;
            broadcastEngineEvent('engine:complete', { success: true });
            logger.info('engine', `Engine provisioning complete for type: ${type}`);
        }

    } catch (e) {
        logger.error('engine', 'Engine download/install failed', e);
        broadcastEngineEvent('engine:error', { error: e.message });
    }
}

router.post('/engine/download', async (req, res) => {
    logger.info('engine', `Download request received`);

    res.json({ success: true, status: 'started' }); // respond immediately — NEVER block

    logger.info('engine', `Starting async engine download`);
    _runEngineDownload().catch(e => {
        logger.error('engine', 'Uncaught engine download error (already handled)', e);
    });
});

router.get('/engine/version-check', async (req, res) => {
    try {
        const versionFile = path.join(ENGINE_ROOT, '.mpi_engine_version');
        const requiredVersion = COMFY_VERSION; // from platformEngine.js (reads system_dependencies.json)

        let installedVersion = (await fs.pathExists(versionFile))
            ? (await fs.readFile(versionFile, 'utf8')).trim()
            : null;

        // Verify that engine binaries actually exist, not just the version stamp
        if (installedVersion !== null) {
            const pythonPath = getPythonBin(ENGINE_ROOT);
            const engineExists = await fs.pathExists(pythonPath);
            if (!engineExists) {
                logger.warn('engine', 'Version stamp found but engine binaries missing — treating as fresh install');
                await fs.remove(versionFile).catch(() => {});
                installedVersion = null;
            }
        }

        res.json({
            installed: installedVersion,
            required: requiredVersion,
            needsInstall: installedVersion === null,
            needsUpgrade: installedVersion !== null && installedVersion !== requiredVersion,
        });
    } catch (e) {
        logger.error('system', 'Version check failed', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.get('/engine/deps-status', async (req, res) => {
    try {
        const result = await checkUniversalWorkflowDepsStatus();
        res.json({
            success: true,
            ...result,
        });
    } catch (e) {
        logger.error('system', 'Deps status check failed', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

router.post('/engine/repair-deps', async (req, res) => {
    logger.info('engine', 'UW deps repair requested');
    res.json({ success: true, status: 'repair-started' });

    try {
        const { missingDeps } = await checkUniversalWorkflowDepsStatus();
        if (!missingDeps.length) {
            broadcastEngineEvent('engine:uw-installing', { status: 'All dependencies already present' });
            broadcastEngineEvent('engine:complete', { success: true });
            return;
        }
        await startUniversalWorkflowInstall(missingDeps, true);
        broadcastEngineEvent('engine:complete', { success: true });
    } catch (err) {
        logger.error('engine', `UW deps repair failed: ${err.message}`);
        broadcastEngineEvent('engine:error', { error: err.message });
    }
});

router.post('/engine/upgrade', async (req, res) => {
    try {
        const portableDir = path.join(ENGINE_ROOT, COMFY_DIR);
        const mpiModelsDir = path.join(ENGINE_ROOT, 'mpi_models');
        const extraConfigPath = getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml');

        // 1. Check if models are inside engine (legacy user)
        const hasCustomRoot = await fs.pathExists(extraConfigPath);
        if (!hasCustomRoot) {
            broadcastEngineEvent('engine:upgrade-status', { status: 'Moving models to safe location...' });
            const defaultModels = getComfyPath(ENGINE_ROOT, 'models');
            if (await fs.pathExists(defaultModels)) {
                logger.info('engine', 'Migrating legacy models from engine to mpi_models');
                await fs.move(defaultModels, mpiModelsDir, { overwrite: false });
            }
        }

        // 2. Wipe old engine (models are safe now)
        broadcastEngineEvent('engine:upgrade-status', { status: 'Removing old engine...' });
        logger.info('engine', 'Removing old ComfyUI portable');
        await fs.remove(portableDir);

        // Respond immediately — frontend listens on SSE
        res.json({ success: true, status: 'upgrade-started' });

        // 3. Download + install new version async (SSE reports progress)
        await _runEngineDownload();

    } catch (e) {
        logger.error('system', 'Engine upgrade failed', e);
        broadcastEngineEvent('engine:error', { error: e.message });
        if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
