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

router.post('/engine/download', async (req, res) => {
    try {
        const type = req.query.type || 'comfy';
        const config = await fs.readJson(SYS_DEPS_PATH);

        let engineInfo, targetDir;
        if (type === 'llama') {
            engineInfo = config.llamaServer;
            targetDir = path.join(__dirname, '..', 'llama_engine');
        } else {
            engineInfo = config.engine || config.comfyUI;
            targetDir = path.join(__dirname, '..', 'engine');
        }

        if (!engineInfo) return res.status(404).json({ error: 'Engine info not found in configs' });

        await fs.ensureDir(targetDir);
        const archivePath = path.join(targetDir, engineInfo.filename);

        logger.info('system', `Downloading engine: ${engineInfo.url}`);
        if (!(await fs.pathExists(archivePath)) || (await fs.stat(archivePath)).size === 0) {
            await streamDownload(engineInfo.url, archivePath);
        }

        logger.info('system', 'Extracting engine archive...');
        const sevenBin = require('7zip-bin');
        const { extractFull } = require('node-7z');
        const myStream = extractFull(archivePath, targetDir, { $bin: sevenBin.path7za });

        await new Promise((resolve, reject) => {
            myStream.on('end', resolve);
            myStream.on('error', reject);
        });

        await fs.remove(archivePath);

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

        res.json({ success: true });
    } catch (e) {
        logger.error('system', 'Engine provisioning failed', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
