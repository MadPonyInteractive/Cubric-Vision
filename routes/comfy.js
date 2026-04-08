/**
 * routes/comfy.js — ComfyUI process management and workflow/model routes.
 *
 * Routes exposed:
 *   GET  /comfy/status
 *   POST /comfy/start
 *   POST /comfy/stop
 *   POST /comfy/unload
 *   POST /comfy/set-path
 *   GET  /comfy/list-files
 *   GET  /comfy/workflows
 *   POST /comfy/model/download
 *   POST /comfy/workflow/delete
 *   POST /comfy/workflow/install-complete
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { exec, spawn } = require('child_process');
const logger = require('./logger');
const {
    COMFY_WORKFLOWS_PATH,
    COMFYUI_PORT,
    processState,
    stopLlamaServer,
    stopComfyUI,
    streamDownload,
    runPipCommand,
    isPackageRequiredElsewhere,
    resolveComfyPath,
    cleanEmptyDirs,
    isWorkflowInstalled,
    syncWorkflowStates,
    getCustomRoot,
} = require('./shared');

// ── Helper ────────────────────────────────────────────────────────────────────

function _parseSizeToBytes(sizeStr) {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    const multipliers = { 'GB': 1024 ** 3, 'MB': 1024 ** 2, 'KB': 1024, 'B': 1 };
    return val * (multipliers[unit] || 0);
}

let _axios = null;
function getAxios() { return _axios; }
function setAxios(ax) { _axios = ax; }

// ── Process Management ────────────────────────────────────────────────────────

router.get('/comfy/status', async (req, res) => {
    try {
        if (!processState.activeComfyProcess) return res.json({ running: false });
        const ax = getAxios();
        if (!ax) return res.json({ running: true, ready: false });
        const ready = await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
            .then(() => true).catch(() => false);
        res.json({ running: true, ready });
    } catch (e) {
        res.json({ running: false });
    }
});

router.post('/comfy/start', async (req, res) => {
    try {
        if (processState.activeComfyProcess) return res.json({ success: true, message: 'Already running' });

        const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
        const pythonPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
        const mainPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'main.py');

        if (!(await fs.pathExists(pythonPath))) {
            return res.status(500).json({ error: 'ComfyUI Python not found. Provision engine first.' });
        }

        logger.info('comfy', 'Starting ComfyUI background process...');
        const extraConfigPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'extra_model_paths.yaml');
        const args = [mainPath, '--listen', '127.0.0.1', '--port', COMFYUI_PORT.toString(), '--lowvram', '--preview-method', 'taesd', '--enable-cors-header'];

        if (await fs.pathExists(extraConfigPath)) {
            logger.info('comfy', `Using extra model paths: ${extraConfigPath}`);
            args.push('--extra-model-paths-config', extraConfigPath);
        }

        processState.activeComfyProcess = spawn(pythonPath, args, { cwd: path.dirname(mainPath) });
        processState.activeComfyProcess.stdout.on('data', (d) => logger.info('comfy', d.toString().trim()));
        processState.activeComfyProcess.stderr.on('data', (d) => logger.warn('comfy', d.toString().trim()));
        processState.activeComfyProcess.on('exit', () => {
            logger.info('comfy', 'ComfyUI process exited');
            processState.activeComfyProcess = null;
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/comfy/stop', (req, res) => {
    stopComfyUI();
    res.json({ success: true });
});

router.post('/comfy/unload', async (req, res) => {
    const { deep } = req.body;
    try {
        if (!processState.activeComfyProcess) return res.json({ success: true, message: 'Not running' });
        const ax = getAxios();
        if (ax) {
            const isDeep = !!deep;
            // ComfyUI /free API: unload_models removes models from VRAM,
            // free_memory flushes the cache. Both are needed for a deep clean.
            await ax.post(`http://127.0.0.1:${COMFYUI_PORT}/free`, {
                unload_models: true,
                free_memory: isDeep,
            }, { timeout: 2000 }).catch(() => null);

            // Also hit ComfyUI-Manager's unload endpoint if installed
            if (isDeep) {
                await ax.post(`http://127.0.0.1:${COMFYUI_PORT}/manager/unload_models`, {}, { timeout: 1000 }).catch(() => null);
            }
        }
        res.json({ success: true, deep: !!deep });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/comfy/set-path', async (req, res) => {
    const { path: customPath } = req.body;
    try {
        const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
        const comfyDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI');
        const extraConfigPath = path.join(comfyDir, 'extra_model_paths.yaml');
        await fs.ensureDir(comfyDir);

        if (!customPath) {
            if (await fs.pathExists(extraConfigPath)) await fs.remove(extraConfigPath);
            await syncWorkflowStates(null);
            return res.json({ success: true });
        }

        const normalizedPath = customPath.replace(/\\/g, '/');
        const yamlContent = `
comfyui:
    base_path: ${normalizedPath}
    checkpoints: checkpoints/
    clip: clip/
    clip_vision: clip_vision/
    configs: configs/
    controlnet: controlnet/
    embeddings: embeddings/
    loras: loras/
    upscale_models: upscale_models/
    vae: vae/
    unet: unet/
    diffusers: diffusers/
    vae_approx: vae_approx/
    gligen: gligen/
    hypernetworks: hypernetworks/
    photomaker: photomaker/
    classifiers: classifiers/
    style_models: style_models/
    face_models: face_models/
    ipadapter: ipadapter/
    diffusion_models: diffusion_models/
`;
        await fs.writeFile(extraConfigPath, yamlContent, 'utf8');
        await syncWorkflowStates(customPath);
        res.json({ success: true, writtenTo: extraConfigPath });
    } catch (err) {
        logger.error('comfy', 'set-path failed', err);
        res.status(500).json({ error: err.message });
    }
});

// ── Model Registry — Runtime Installed Check ─────────────────────────────────

/**
 * POST /comfy/models/check
 *
 * Body: { models: ModelDef[] }  — the full MODELS array from modelRegistry.js,
 *       each entry having { id, dependencies: string[] } where dependencies are
 *       dep ids, and { deps: Record<id, { type, filename }> } for resolution.
 *
 * Actually simpler: client sends pre-resolved dep filenames per model:
 *   { models: [{ id, deps: [{ type: 'checkpoint'|'custom_nodes'|..., filename: string }] }] }
 *
 * Returns: { results: { [modelId]: boolean } }
 * A model is installed if every dep exists on disk.
 */
router.post('/comfy/models/check', async (req, res) => {
    const { models } = req.body;
    if (!Array.isArray(models)) return res.status(400).json({ error: 'models array required' });

    try {
        const customRoot = await getCustomRoot();
        const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
        const defaultModelsRoot = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'models');
        const defaultCustomNodesRoot = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'custom_nodes');

        const results = {};

        for (const model of models) {
            if (!model.id || !Array.isArray(model.deps)) { results[model.id] = false; continue; }

            let allPresent = true;
            for (const dep of model.deps) {
                if (!dep.filename) continue;
                let depPath;
                if (dep.type === 'custom_nodes') {
                    depPath = path.join(defaultCustomNodesRoot, dep.filename);
                } else if (customRoot) {
                    // Custom root — strip sub-type prefix from filename if present, search flexibly
                    const baseFilename = path.basename(dep.filename);
                    const subDir = path.dirname(dep.filename);
                    const directPath = path.join(customRoot, dep.filename);
                    if (await fs.pathExists(directPath)) {
                        depPath = directPath;
                    } else {
                        const found = await _findFile(path.join(customRoot, subDir.split('/')[0] || ''), baseFilename);
                        depPath = found || directPath;
                    }
                } else {
                    depPath = path.join(defaultModelsRoot, dep.filename);
                }

                if (!(await fs.pathExists(depPath))) { allPresent = false; break; }
            }

            results[model.id] = allPresent;
        }

        res.json({ success: true, results });
    } catch (err) {
        logger.error('comfy', 'models/check failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

async function _findFile(dir, filename) {
    if (!(await fs.pathExists(dir))) return null;
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
        const full = path.join(dir, entry);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
            const found = await _findFile(full, filename);
            if (found) return found;
        } else if (entry === filename) {
            return full;
        }
    }
    return null;
}

// ── Model / Workflow Management ───────────────────────────────────────────────

router.get('/comfy/list-files', async (req, res) => {
    const { subDir } = req.query;
    if (!subDir) return res.status(400).json({ success: false, error: 'subDir required' });

    try {
        const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
        const customRoot = await getCustomRoot();
        const type = subDir.includes('checkpoint') ? 'checkpoint' :
                     subDir.includes('lora') ? 'lora' :
                     subDir.includes('vae') ? 'vae' :
                     subDir.includes('upscale') ? 'upscaler' :
                     subDir.includes('diffusion') ? 'diffusion_model' : 'checkpoint';

        const { localPath: targetPath } = await resolveComfyPath({ type, filename: '' }, customRoot, config);

        if (!targetPath || !(await fs.pathExists(targetPath))) {
            return res.json({ success: true, files: [] });
        }

        const getAllFiles = async (dirPath, relativeTo) => {
            let results = [];
            const list = await fs.readdir(dirPath);
            for (const file of list) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.stat(fullPath);
                if (stat && stat.isDirectory()) {
                    results = results.concat(await getAllFiles(fullPath, relativeTo));
                } else {
                    const ext = path.extname(file).toLowerCase();
                    if (['.safetensors', '.ckpt', '.pt', '.bin', '.pth'].includes(ext)) {
                        results.push(path.relative(relativeTo, fullPath).replace(/\\/g, '/'));
                    }
                }
            }
            return results;
        };

        const files = await getAllFiles(targetPath, targetPath);
        res.json({ success: true, files: files.sort() });
    } catch (err) {
        logger.error('comfy', 'list-files error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/comfy/workflows', async (req, res) => {
    try {
        if (!(await fs.pathExists(COMFY_WORKFLOWS_PATH))) return res.json({ success: true, workflows: [] });
        const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
        const customRoot = await getCustomRoot();

        const workflows = await Promise.all(config.workflows.map(async (wf) => {
            let maxVramRequired = 0;
            let totalRequiredSize = 0;
            let totalSizeOnDisk = 0;

            const deps = await Promise.all(wf.dependencies.map(async (dep) => {
                const { localPath } = await resolveComfyPath(dep, customRoot, config);
                const exists = await fs.pathExists(localPath);
                let sizeOnDisk = 0;
                if (exists) {
                    try {
                        const stats = await fs.stat(localPath);
                        sizeOnDisk = stats.isFile() ? stats.size : 0;
                        totalSizeOnDisk += sizeOnDisk;
                    } catch (e) {}
                }
                totalRequiredSize += _parseSizeToBytes(dep.size);
                const vramNum = parseInt(dep.vram) || 0;
                if (vramNum > maxVramRequired) maxVramRequired = vramNum;
                return { ...dep, exists, sizeOnDisk };
            }));

            const isInstalled = wf.installed || deps.every(d => d.exists);
            return {
                ...wf,
                isInstalled,
                installed: wf.installed || false,
                maxVramRequired: `${maxVramRequired}GB`,
                totalSizeOnDisk,
                totalRequiredSize,
                dependencies: deps
            };
        }));

        res.json({ success: true, workflows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/comfy/model/download', async (req, res) => {
    const { modelId } = req.body;
    try {
        const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
        let model = null;
        for (const wf of config.workflows) {
            model = wf.dependencies.find(d => d.id === modelId);
            if (model) break;
        }
        if (!model) return res.status(404).json({ error: 'Model not found in workflow configs' });

        const customRoot = await getCustomRoot();
        const { localPath, isCustomNode } = await resolveComfyPath(model, customRoot, config);
        await fs.ensureDir(path.dirname(localPath));

        if (isCustomNode) {
            stopComfyUI();
            logger.info('comfy', `Cloning custom node ${model.name} from ${model.url}...`);
            if (await fs.pathExists(localPath)) await fs.remove(localPath);

            try {
                await new Promise((resolve, reject) => {
                    exec(`git clone ${model.url} "${localPath}"`, (err, stdout, stderr) => {
                        if (err) return reject(new Error('Git clone failed: ' + stderr));
                        resolve();
                    });
                });
                logger.info('comfy', `Successfully cloned ${model.name}`);

                if (model.install_requirements) {
                    const reqPath = path.join(localPath, 'requirements.txt');
                    if (await fs.pathExists(reqPath)) {
                        logger.info('comfy', `Installing requirements for ${model.name}...`);
                        await runPipCommand(['install', '-r', reqPath, '--upgrade', '--no-warn-script-location']);
                    }
                }
                res.json({ success: true, path: localPath });
            } catch (err) {
                logger.error('comfy', 'Custom node setup failed', err);
                res.status(500).json({ success: false, error: err.message });
            }
            return;
        }

        logger.info('comfy', `Starting download for ComfyUI model ${model.name}...`);
        await streamDownload(model.url, localPath);
        res.json({ success: true, path: localPath });
    } catch (err) {
        logger.error('comfy', 'Asset download failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/comfy/workflow/delete', async (req, res) => {
    const { id, deleteModels } = req.body;
    try {
        const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
        const targetWf = config.workflows.find(wf => wf.id === id);
        if (!targetWf) return res.status(404).json({ success: false, error: 'Workflow not found' });

        const otherWfs = config.workflows.filter(wf => wf.id !== id);
        const customRoot = await getCustomRoot();
        const deleted = [];
        const skipped = [];

        for (const dep of targetWf.dependencies) {
            const isCustomNode = dep.type === 'custom_nodes';
            const usedByInstalledWf = otherWfs.some(wf =>
                wf.installed && wf.dependencies.some(d => d.filename === dep.filename)
            );

            if (usedByInstalledWf) { skipped.push(dep.filename); continue; }

            if (isCustomNode || deleteModels) {
                const { localPath } = await resolveComfyPath(dep, customRoot, config);
                if (await fs.pathExists(localPath)) {
                    if (isCustomNode) {
                        stopComfyUI();
                        const reqPath = path.join(localPath, 'requirements.txt');
                        if (await fs.pathExists(reqPath)) {
                            try {
                                const content = await fs.readFile(reqPath, 'utf8');
                                const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                                const coreProtected = [
                                    'comfyui-frontend-package', 'comfyui-workflow-templates', 'comfyui-embedded-docs',
                                    'torch', 'torchsde', 'torchvision', 'torchaudio', 'numpy', 'einops', 'transformers',
                                    'tokenizers', 'sentencepiece', 'safetensors', 'aiohttp', 'yarl', 'pyyaml', 'Pillow',
                                    'scipy', 'tqdm', 'psutil', 'alembic', 'SQLAlchemy', 'filelock', 'av', 'comfy-kitchen',
                                    'comfy-aimdo', 'requests', 'simpleeval', 'blake3', 'kornia', 'spandrel', 'pydantic',
                                    'pydantic-settings', 'PyOpenGL', 'glfw', 'accelerate', 'diffusers'
                                ];
                                for (const line of lines) {
                                    let pkg = line.split('==')[0].split('>=')[0].split('<=')[0].split('>')[0].split('<')[0].trim();
                                    if (pkg.includes('#egg=')) pkg = pkg.split('#egg=')[1];
                                    else if (pkg.startsWith('git+') || pkg.startsWith('http')) continue;
                                    const isProtected = coreProtected.some(p => pkg.toLowerCase() === p.toLowerCase() || pkg.toLowerCase().replace(/_/g, '-') === p.toLowerCase());
                                    if (isProtected) continue;
                                    const isRequiredElsewhere = await isPackageRequiredElsewhere(pkg, localPath);
                                    if (!isRequiredElsewhere) {
                                        await runPipCommand(['uninstall', pkg, '-y']).catch(e => logger.error('comfy', `Failed to uninstall ${pkg}`, e));
                                    }
                                }
                            } catch (e) {
                                logger.error('comfy', `Pruning logic failed for ${dep.filename}`, e);
                            }
                        }
                    }

                    await fs.remove(localPath);
                    deleted.push(dep.filename);

                    if (!isCustomNode && customRoot) {
                        await cleanEmptyDirs(localPath, customRoot);
                    } else if (!isCustomNode) {
                        await cleanEmptyDirs(localPath, path.join(__dirname, '..', 'engine'));
                    }
                }
            }
        }

        targetWf.installed = false;
        await fs.writeJson(COMFY_WORKFLOWS_PATH, config, { spaces: 2 });
        res.json({ success: true, deleted, skipped });
    } catch (err) {
        logger.error('comfy', 'Workflow delete failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/comfy/workflow/install-complete', async (req, res) => {
    const { id } = req.body;
    try {
        const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
        const targetWf = config.workflows.find(wf => wf.id === id);
        if (!targetWf) return res.status(404).json({ success: false, error: 'Workflow not found' });
        targetWf.installed = true;
        await fs.writeJson(COMFY_WORKFLOWS_PATH, config, { spaces: 2 });
        res.json({ success: true });
    } catch (err) {
        logger.error('comfy', 'Workflow install-complete failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
module.exports.setAxios = setAxios;
