/**
 * routes/comfy.js — ComfyUI process management and model routes.
 *
 * Routes exposed:
 *   GET  /comfy/status              — is ComfyUI running + ready?
 *   POST /comfy/start               — launch ComfyUI in background
 *   POST /comfy/stop                — stop ComfyUI process
 *   POST /comfy/unload              — unload models / free memory
 *   POST /comfy/set-path            — set custom models root path
 *   GET  /comfy/get-path            — read current custom models root path (from extra_model_paths.yaml)
 *   GET  /comfy/extra-folders       — read additive LoRA/upscale model folders
 *   POST /comfy/extra-folders       — set additive LoRA/upscale model folders
 *   GET  /comfy/list-files          — list model files in a subdirectory
 *   POST /comfy/models/check        — check which models are installed on disk
 */

'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs-extra');
const path = require('path');
const { exec, spawn } = require('child_process');
const logger = require('./logger');
const { isCompleteOnDisk, getPartialBytes } = require('./downloadCompletion');
const {
    COMFYUI_PORT,
    processState,
    stopComfyUI,
    resolveComfyPath,
    cleanEmptyDirs,
    getCustomRoot,
    getDefaultModelsRoot,
    resolveModelsRoot,
    getExtraModelFolders,
    setExtraModelFolders,
    writeExtraModelPathsYaml,
} = require('./shared');
const { getPythonBin, getComfyPath, getEngineRoot, resolveDownloadConfig } = require('./platformEngine');
const remoteModels = require('./remoteModels');

const ENGINE_ROOT = getEngineRoot();
const _comfyEventClients = new Set();
const WORKFLOW_INPUT_DEFAULTS = Object.freeze([
    'ComfyUI_00001_.latent',
]);

function _broadcastComfyEvent(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of _comfyEventClients) {
        try { client.write(payload); } catch (_) { /* client closed */ }
    }
}

function _classifyComfyOutput(defaultLevel, text) {
    if (defaultLevel === 'info') return 'info';

    if (/(^|\n)\s*(Traceback\b|Error\b|Exception\b|Fatal\b|Failed\b)/i.test(text)) {
        return 'error';
    }
    if (/(^|\n)\s*Warning\b/i.test(text)) {
        return 'warn';
    }
    return 'info';
}

function _handleComfyOutput(level, chunk) {
    const text = chunk.toString().trim();
    if (!text) return;

    logger[_classifyComfyOutput(level, text)]('comfy', text);

    if (/Model Initialization complete!/i.test(text)) {
        _broadcastComfyEvent('comfy:model-init-complete', { message: text });
    } else if (/Model Initializing/i.test(text)) {
        _broadcastComfyEvent('comfy:model-initializing', { message: text });
    }
}

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

/**
 * GET /comfy/status
 * Returns whether ComfyUI process is running and ready.
 * Response: { running: boolean, ready?: boolean }
 */
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

router.get('/comfy/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    _comfyEventClients.add(res);
    res.write(`event: connected\ndata: {}\n\n`);

    req.on('close', () => {
        _comfyEventClients.delete(res);
    });
});

/**
 * POST /comfy/prepare-workflow-inputs
 * Copies repo-owned workflow input defaults into the active ComfyUI input folder.
 * Multi-stage workflows can fail validation if LoadLatent has no selectable
 * default, even when Is_Continue=false, so this runs before every _ms submit.
 */
router.post('/comfy/prepare-workflow-inputs', async (req, res) => {
    try {
        const sourceDir = path.join(__dirname, '..', 'comfy_workflows', 'input');
        const inputDir = getComfyPath(ENGINE_ROOT, 'input');
        await fs.ensureDir(inputDir);

        const copied = [];
        for (const filename of WORKFLOW_INPUT_DEFAULTS) {
            const source = path.join(sourceDir, filename);
            const target = path.join(inputDir, filename);
            if (!(await fs.pathExists(source))) {
                return res.status(500).json({
                    success: false,
                    error: `Workflow input default missing: ${filename}`,
                });
            }
            await fs.copy(source, target, { overwrite: true });
            copied.push(filename);
        }

        res.json({ success: true, copied });
    } catch (err) {
        logger.error('comfy', 'prepare workflow inputs failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /comfy/stage-preview-latent
 * Body: { sourcePath: string, engineInputName: string }
 * Copies a project-owned preview latent into the active ComfyUI input folder so
 * the next `_ms` Continue run can load it via the LoadLatent node. `sourcePath`
 * must point inside a project (decoded /project-file URL or absolute project
 * path). `engineInputName` is the basename written into ComfyUI input/.
 */
router.post('/comfy/stage-preview-latent', async (req, res) => {
    try {
        const { sourcePath, engineInputName } = req.body || {};
        if (!sourcePath || typeof sourcePath !== 'string') {
            return res.status(400).json({ success: false, error: 'sourcePath required' });
        }
        if (!engineInputName || typeof engineInputName !== 'string' || engineInputName.includes('/') || engineInputName.includes('\\')) {
            return res.status(400).json({ success: false, error: 'engineInputName must be a bare filename' });
        }

        const resolvedSource = path.normalize(sourcePath);
        if (!(await fs.pathExists(resolvedSource))) {
            return res.status(404).json({ success: false, error: `Preview latent missing: ${resolvedSource}` });
        }

        const inputDir = getComfyPath(ENGINE_ROOT, 'input');
        await fs.ensureDir(inputDir);
        const target = path.join(inputDir, engineInputName);
        await fs.copy(resolvedSource, target, { overwrite: true });

        res.json({ success: true, copied: engineInputName });
    } catch (err) {
        logger.error('comfy', 'stage-preview-latent failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /comfy/start
 * Launches ComfyUI in the background. Idempotent — returns success if already running.
 */
router.post('/comfy/start', async (req, res) => {
    try {
        const isUserRestart = req.body && req.body.isUserRestart;
        if (isUserRestart) processState.comfyNeedsRestart = false;

        if (processState.activeComfyProcess) return res.json({ success: true, message: 'Already running' });

        const pythonPath = getPythonBin(ENGINE_ROOT);
        const mainPath = getComfyPath(ENGINE_ROOT, 'main.py');

        if (!(await fs.pathExists(pythonPath))) {
            return res.status(500).json({ error: 'ComfyUI Python not found. Provision engine first.' });
        }

        logger.info('comfy', 'Starting ComfyUI background process...');
        const extraConfigPath = getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml');

        // Launch mode must match the installed torch build (see routes/engine.js):
        // a CPU install cannot be started in GPU/--lowvram mode. When no GPU vendor
        // was detected, run ComfyUI with --cpu; otherwise use the GPU path.
        //  - Apple Silicon: the engine installs an MPS/Metal torch (--m-series). Pass
        //    NO mode flag so ComfyUI auto-selects the MPS device; --cpu would force
        //    CPU and --lowvram is an NVIDIA/CUDA-oriented flag, neither correct here.
        const { gpu } = await resolveDownloadConfig();   // cached after first detect
        const vendor = gpu && gpu.vendor;
        const useCpu = !vendor;
        let modeArgs;
        if (vendor === 'apple') {
            // No mode flag → ComfyUI auto-selects the MPS device. --use-pytorch-cross-attention
            // is the recommended attention path on M-series (15-50% faster, no downside).
            // Do NOT force a global VAE precision flag (--fp32-vae / --bf16-vae / --cpu-vae):
            // each workflow authors its own VAE precision (fp8/fp16/bf16/fp32), and a global
            // flag overrides all of them. --fp32-vae also doubled MPS VAE memory and OOM'd
            // single-image generation on a 16 GB M4 (2026-06-10). Banding from a workflow's
            // own fp16 VAE is a per-workflow concern, handled at the workflow level — see MPI-61.
            modeArgs = ['--use-pytorch-cross-attention'];
        } else if (useCpu) {
            modeArgs = ['--cpu'];
        } else {
            modeArgs = ['--lowvram'];
        }
        if (useCpu) logger.info('comfy', 'No GPU detected — starting ComfyUI in CPU mode.');
        else if (vendor === 'apple') logger.info('comfy', 'Apple Silicon — starting ComfyUI with Metal/MPS.');

        const args = [mainPath, '--listen', '127.0.0.1', '--port', COMFYUI_PORT.toString(), ...modeArgs, '--preview-method', 'taesd', '--enable-cors-header'];

        if (await fs.pathExists(extraConfigPath)) {
            logger.info('comfy', `Using extra model paths: ${extraConfigPath}`);
            args.push('--extra-model-paths-config', extraConfigPath);
        }

        // On Apple Silicon, PYTORCH_ENABLE_MPS_FALLBACK lets ops not yet implemented
        // for MPS fall back to CPU instead of throwing — the difference between a
        // graceful slowdown and a hard crash mid-generation.
        const spawnEnv = vendor === 'apple'
            ? { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' }
            : process.env;

        processState.activeComfyProcess = spawn(pythonPath, args, { cwd: path.dirname(mainPath), env: spawnEnv });
        processState.activeComfyProcess.stdout.on('data', (d) => _handleComfyOutput('info', d));
        processState.activeComfyProcess.stderr.on('data', (d) => _handleComfyOutput('warn', d));
        processState.activeComfyProcess.on('exit', () => {
            logger.info('comfy', 'ComfyUI process exited');
            processState.activeComfyProcess = null;
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /comfy/stop
 * Stops the ComfyUI background process.
 */
router.post('/comfy/stop', (req, res) => {
    stopComfyUI();
    res.json({ success: true });
});

/**
 * POST /comfy/needs-restart
 * Body: { value?: boolean }
 * Sets or queries the comfyNeedsRestart flag (set after custom node installs).
 */
router.post('/comfy/needs-restart', (req, res) => {
    processState.comfyNeedsRestart = req.body.value ?? true;
    res.json({ success: true, comfyNeedsRestart: processState.comfyNeedsRestart });
});

/**
 * POST /comfy/unload
 * Body: { deep?: boolean }
 * Calls ComfyUI /free API to unload models and optionally free memory.
 * Also calls ComfyUI-Manager's unload endpoint when deep=true.
 */
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

/**
 * POST /comfy/set-path
 * Body: { path?: string }
 * Sets the custom models root path by writing extra_model_paths.yaml.
 * Without a path argument, removes the config file (reverts to default paths).
 */
router.post('/comfy/set-path', async (req, res) => {
    const { path: customPath } = req.body;
    try {
        const extraConfigPath = getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml');
        await fs.ensureDir(path.dirname(extraConfigPath));
        const extras = await getExtraModelFolders();

        if (!customPath) {
            // Reverting to the default root: always keep the YAML pointing at the
            // default models root (plus any additive extras). Do NOT delete the
            // file — without it ComfyUI would stop searching mpi_models and any
            // models installed there would be orphaned.
            await writeExtraModelPathsYaml(getDefaultModelsRoot(), extras);
            return res.json({ success: true });
        }

        // Always persist an absolute root — a relative path resolves against the
        // server cwd in Cubric but against the ComfyUI dir in ComfyUI, so a model
        // installed via a relative root is invisible to generation.
        const absoluteRoot = resolveModelsRoot(customPath);
        const yamlContentPath = await writeExtraModelPathsYaml(absoluteRoot, extras);
        res.json({ success: true, writtenTo: yamlContentPath, path: absoluteRoot });
    } catch (err) {
        logger.error('comfy', 'set-path failed', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /comfy/get-path
 * Returns: { success: true, path: string|null }
 * Canonical custom models root, read from extra_model_paths.yaml.
 */
router.get('/comfy/get-path', async (_req, res) => {
    try {
        // Return the effective absolute root: the custom YAML root if set (anchored
        // to absolute in case a legacy relative value is on disk), else the default.
        const customPath = await getCustomRoot();
        const effective = customPath ? resolveModelsRoot(customPath) : getDefaultModelsRoot();
        res.json({ success: true, path: effective, isDefault: !customPath });
    } catch (err) {
        logger.error('comfy', 'get-path failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/comfy/extra-folders', async (_req, res) => {
    try {
        const folders = await getExtraModelFolders();
        res.json({ success: true, folders });
    } catch (err) {
        logger.error('comfy', 'extra-folders get failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/comfy/extra-folders', async (req, res) => {
    try {
        const folders = await setExtraModelFolders(req.body || {});
        const primaryRoot = await getCustomRoot();
        // Always (re)write the YAML so removed extra folders are dropped from it
        // (garbage collection) while the default root block is preserved. Never
        // delete the file — that would orphan models under the default root.
        await writeExtraModelPathsYaml(primaryRoot || getDefaultModelsRoot(), folders);
        res.json({ success: true, folders });
    } catch (err) {
        logger.error('comfy', 'extra-folders set failed', err);
        res.status(400).json({ success: false, error: err.message });
    }
});

// ── Model Registry — Runtime Installed Check ─────────────────────────────────

/**
 * POST /comfy/models/check
 * Body: { models: [{ id, deps: [{ type, filename, size?, id? }] }] }
 * Checks which models have all their dependency files present on disk.
 * Returns per-dep installation status for partial-progress computation.
 * Returns: { success: true, results: { [modelId]: { installed: boolean, deps: [{ id, installed: boolean }] } } }
 */
router.post('/comfy/models/check', async (req, res) => {
    const { models } = req.body;
    if (!Array.isArray(models)) return res.status(400).json({ error: 'models array required' });

    // Remote engine: resolve installed-state against the Pod volume via the
    // wrapper instead of the local filesystem. Response shape is identical.
    if (remoteModels.isRemoteActive()) {
        try {
            const out = await remoteModels.remoteModelsCheck(models);
            return res.json(out);
        } catch (err) {
            logger.error('comfy', `remote models/check failed: ${err.message}`);
            return res.status(502).json({ success: false, error: err.message });
        }
    }

    try {
        const customRoot = await getCustomRoot();
        const defaultModelsRoot = getDefaultModelsRoot();
        const defaultCustomNodesRoot = getComfyPath(ENGINE_ROOT, 'custom_nodes');

        const results = {};

        for (const model of models) {
            if (!model.id || !Array.isArray(model.deps)) { results[model.id] = { installed: false, deps: [] }; continue; }

            let allPresent = true;
            const depResults = [];

            for (const dep of model.deps) {
                if (!dep.filename) { depResults.push({ id: dep.id || null, installed: false }); continue; }
                let depPath;
                if (dep.type === 'custom_nodes') {
                    // custom_nodes: YAML does not remap this type — always use engine default
                    depPath = path.join(defaultCustomNodesRoot, dep.filename);
                } else if (customRoot) {
                    const baseFilename = path.basename(dep.filename);
                    const subDir = path.dirname(dep.filename);
                    const directPath = path.join(customRoot, dep.filename);
                    if (await isCompleteOnDisk(directPath)) {
                        depPath = directPath;
                    } else {
                        // Search the custom root, then fall back to the default root:
                        // the YAML keeps the default folder searchable, so engine deps
                        // installed there before a path change must still count as present.
                        const found = await _findFile(path.join(customRoot, subDir.split('/')[0] || ''), baseFilename);
                        depPath = found
                            || (await isCompleteOnDisk(path.join(defaultModelsRoot, dep.filename))
                                ? path.join(defaultModelsRoot, dep.filename)
                                : directPath);
                    }
                } else {
                    depPath = path.join(defaultModelsRoot, dep.filename);
                }

                const isInstalled = await isCompleteOnDisk(depPath);
                const partialBytes = isInstalled ? 0 : await getPartialBytes(depPath);
                if (!isInstalled) allPresent = false;
                depResults.push({ id: dep.id || null, installed: isInstalled, partialBytes });
            }

            results[model.id] = { installed: allPresent, deps: depResults };
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
        } else if (entry === filename && await isCompleteOnDisk(full)) {
            return full;
        }
    }
    return null;
}

// ── Model / Workflow Management ───────────────────────────────────────────────

/**
 * GET /comfy/list-files?subDir=<path>
 * Lists all model files (.safetensors, .ckpt, .pt, .bin, .pth) in a subdirectory.
 * Returns: { success: true, files: string[] }
 */
router.get('/comfy/list-files', async (req, res) => {
    const { subDir } = req.query;
    if (!subDir) return res.status(400).json({ success: false, error: 'subDir required' });

    try {
        const normalizedSubDir = String(subDir).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const bucket = normalizedSubDir.split('/')[0];
        const bucketRemainder = normalizedSubDir.split('/').slice(1).join('/');
        const customRoot = await getCustomRoot();
        const modelsRoot = customRoot || getDefaultModelsRoot();
        const extras = await getExtraModelFolders();

        const getAllFiles = async (dirPath, relativeTo) => {
            let results = [];
            if (!(await fs.pathExists(dirPath))) return results;
            const list = await fs.readdir(dirPath);
            for (const file of list) {
                const fullPath = path.join(dirPath, file);
                const stat = await fs.stat(fullPath);
                if (stat && stat.isDirectory()) {
                    results = results.concat(await getAllFiles(fullPath, relativeTo));
                } else {
                    const ext = path.extname(file).toLowerCase();
                    if (['.safetensors', '.ckpt', '.pt', '.bin', '.pth'].includes(ext)) {
                        results.push(path.relative(relativeTo, fullPath));
                    }
                }
            }
            return results;
        };

        const addFiles = async (dirPath, relativeTo, output, seen) => {
            const files = await getAllFiles(dirPath, relativeTo);
            for (const file of files) {
                const normalized = file.replace(/\\/g, '/');
                const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
                if (seen.has(key)) continue;
                seen.add(key);
                output.push(normalized);
            }
        };

        const output = [];
        const seen = new Set();
        const primaryTarget = path.join(modelsRoot, normalizedSubDir);
        await addFiles(primaryTarget, primaryTarget, output, seen);

        if (bucket === 'loras' || bucket === 'upscale_models') {
            for (const extraFolder of extras[bucket] || []) {
                const extraTarget = bucketRemainder ? path.join(extraFolder, bucketRemainder) : extraFolder;
                await addFiles(extraTarget, extraTarget, output, seen);
            }
        }

        res.json({ success: true, files: output.sort() });
    } catch (err) {
        logger.error('comfy', 'list-files error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
module.exports.setAxios = setAxios;
