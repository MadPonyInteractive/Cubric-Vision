/**
 * routes/engine.js — Engine binary provisioning routes (ComfyUI + llama-server).
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
const { SYS_DEPS_PATH, streamDownload } = require('./shared');
const logger = require('./logger');
const { broadcastEngineEvent } = require('./downloadManager');

router.get('/engine/status', async (req, res) => {
    try {
        const type = req.query.type || 'comfy';
        if (!(await fs.pathExists(SYS_DEPS_PATH))) {
            return res.json({ success: true, exists: false });
        }
        if (type === 'llama') {
            const serverPath = path.posix.join(__dirname, '..', 'llama_engine', 'llama-server.exe');
            res.json({ success: true, exists: await fs.pathExists(serverPath) });
        } else {
            const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
            let pythonPath = path.join(ENGINE_ROOT, 'python_embeded', 'python.exe');
            if (!(await fs.pathExists(pythonPath))) {
                pythonPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
            }
            res.json({ success: true, exists: await fs.pathExists(pythonPath) });
        }
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
 * 3. Patch it (bat flags, settings, server discovery)
 * 4. Write version stamp (.mpi_engine_version)
 * 5. Write extra_model_paths.yaml (ComfyUI only)
 * 6. Broadcast SSE events at key stages
 *
 * @param {string} type - 'comfy' or 'llama' (default: 'comfy')
 */
async function _runEngineDownload(type) {
    try {
        const config = await fs.readJson(SYS_DEPS_PATH);

        let engineInfo, targetDir;
        if (type === 'llama') {
            engineInfo = config.llamaServer;
            targetDir = path.join(__dirname, '..', 'llama_engine');
        } else {
            engineInfo = config.engine || config.comfyUI;
            targetDir = path.join(__dirname, '..', 'engine');
        }

        if (!engineInfo) throw new Error('Engine info not found in configs');

        // ── 1. Download ────────────────────────────────────────────────────────
        broadcastEngineEvent('engine:downloading', {
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 0
        });

        await fs.ensureDir(targetDir);
        const archivePath = path.join(targetDir, engineInfo.filename);

        logger.info('system', `Downloading engine: ${engineInfo.url}`);
        if (!(await fs.pathExists(archivePath)) || (await fs.stat(archivePath)).size === 0) {
            await streamDownload(engineInfo.url, archivePath);
        }

        // ── 2. Extract ─────────────────────────────────────────────────────────
        broadcastEngineEvent('engine:extracting', { status: 'extracting' });
        logger.info('system', 'Extracting engine archive...');

        const sevenBin = require('7zip-bin');
        const { extractFull } = require('node-7z');
        const myStream = extractFull(archivePath, targetDir, { $bin: sevenBin.path7za });

        await new Promise((resolve, reject) => {
            myStream.on('end', resolve);
            myStream.on('error', reject);
        });

        await fs.remove(archivePath);

        // ── 3. Patch ───────────────────────────────────────────────────────────
        broadcastEngineEvent('engine:patching', { status: 'patching' });
        logger.info('system', 'Patching engine...');

        if (type === 'comfy') {
            const batPath = path.join(targetDir, 'ComfyUI_windows_portable', 'run_nvidia_gpu.bat');
            if (await fs.pathExists(batPath)) {
                let content = await fs.readFile(batPath, 'utf8');
                if (!content.includes('--enable-cors-header')) {
                    logger.info('system', 'Patching run_nvidia_gpu.bat with taesd, cors and listen flags...');
                    content = content.replace('ComfyUI\\main.py', 'ComfyUI\\main.py --listen 127.0.0.1 --preview-method taesd --enable-cors-header');
                    await fs.writeFile(batPath, content, 'utf8');
                }
            }
            const settingsPath = path.join(targetDir, 'ComfyUI_windows_portable', 'ComfyUI', 'user', 'default', 'comfy.settings.json');
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
        } else if (type === 'llama') {
            const findServer = async (dir) => {
                const items = await fs.readdir(dir);
                for (const i of items) {
                    const p = path.join(dir, i);
                    if ((await fs.stat(p)).isDirectory()) {
                        const nested = await findServer(p);
                        if (nested) return nested;
                    } else if (i === 'llama-server.exe') {
                        return p;
                    }
                }
                return null;
            };
            const found = await findServer(targetDir);
            if (found && path.resolve(found) !== path.resolve(path.join(targetDir, 'llama-server.exe'))) {
                await fs.copy(found, path.join(targetDir, 'llama-server.exe'));
            }
        }

        // ── 4. Post-install: Write version stamp ───────────────────────────────
        const INSTALLED_ENGINE_VERSION = engineInfo.version;
        await fs.writeFile(
            path.join(targetDir, '.mpi_engine_version'),
            INSTALLED_ENGINE_VERSION,
            'utf8'
        );
        logger.info('engine', `Version stamp written: ${INSTALLED_ENGINE_VERSION}`);

        // ── 5. Post-install: Write extra_model_paths.yaml ──────────────────────
        if (type === 'comfy') {
            const mpiModelsDir = path.join(targetDir, 'mpi_models');
            await fs.ensureDir(mpiModelsDir);

            const extraConfigPath = path.join(
                targetDir,
                'ComfyUI_windows_portable',
                'ComfyUI',
                'extra_model_paths.yaml'
            );

            // For now, generate YAML pointing to mpi_models (Plan A will refine this)
            const yaml = `# MPI AI Suite — Extra Model Paths\nall:\n  base_path: "${mpiModelsDir.replace(/\\/g, '/')}"\n`;
            await fs.writeFile(extraConfigPath, yaml, 'utf8');
            logger.info('engine', `extra_model_paths.yaml written pointing to ${mpiModelsDir}`);
        }

        // ── 6. Complete ────────────────────────────────────────────────────────
        broadcastEngineEvent('engine:complete', { success: true });
        logger.info('engine', `Engine provisioning complete for type: ${type}`);

    } catch (e) {
        logger.error('engine', 'Engine download/install failed', e);
        broadcastEngineEvent('engine:error', { error: e.message });
    }
}

router.post('/engine/download', async (req, res) => {
    res.json({ success: true, status: 'started' }); // respond immediately — NEVER block

    _runEngineDownload(req.query.type || 'comfy').catch(e => {
        logger.error('engine', 'Engine download failed', e);
        broadcastEngineEvent('engine:error', { error: e.message });
    });
});

router.get('/engine/version-check', async (req, res) => {
    try {
        const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
        const versionFile = path.join(ENGINE_ROOT, '.mpi_engine_version');
        const config = await fs.readJson(SYS_DEPS_PATH);
        const requiredVersion = config.engine.version; // from system_dependencies.json

        const installedVersion = (await fs.pathExists(versionFile))
            ? (await fs.readFile(versionFile, 'utf8')).trim()
            : null;

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

router.post('/engine/upgrade', async (req, res) => {
    try {
        const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
        const portableDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable');
        const mpiModelsDir = path.join(ENGINE_ROOT, 'mpi_models');
        const extraConfigPath = path.join(portableDir, 'ComfyUI', 'extra_model_paths.yaml');

        // 1. Check if models are inside engine (legacy user)
        const hasCustomRoot = await fs.pathExists(extraConfigPath);
        if (!hasCustomRoot) {
            broadcastEngineEvent('engine:upgrade-status', { status: 'Moving models to safe location...' });
            const defaultModels = path.join(portableDir, 'ComfyUI', 'models');
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
        await _runEngineDownload(req.query.type || 'comfy');

    } catch (e) {
        logger.error('system', 'Engine upgrade failed', e);
        broadcastEngineEvent('engine:error', { error: e.message });
        if (!res.headersSent) res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
