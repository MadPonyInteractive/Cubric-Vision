/**
 * routes/comfy.js — ComfyUI process management and model routes.
 *
 * Routes exposed:
 *   GET  /comfy/status              — is ComfyUI running + ready?
 *   POST /comfy/start               — launch ComfyUI in background
 *   POST /comfy/stop                — stop ComfyUI process
 *   POST /comfy/refresh-models      — reseed ComfyUI filename cache via GET /object_info (file-add; no restart)
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
// Repo-owned defaults staged into the engine input/ before every _ms submit.
// ComfyUI validates EVERY LoadLatent/LoadImage node in a workflow even when its
// output is unreached (e.g. behind an Is_Continue gate), so each model family's
// load-node baked filenames must have a real file here. The engine input/ is
// garbage-collected on shutdown (cleanComfyUITempFiles), but prepare runs every
// submit so the defaults are always re-staged.
//   ComfyUI_00001_.latent       — WAN _ms video latent (legacy default)
//   ltx_video_latent_00001_     — LTX Input_Video_Latent (node 67)
//   ltx_audio_latent_00001_     — LTX Input_Audio_Latent (node 69)
//   placeholder.png             — generic Input_Start_Frame/End_Frame fallback (t2v
//                                 has no real frame; i2v injects over it). Shared by
//                                 any workflow with LoadImage frame nodes (LTX, Wan 5B).
//                                 (was ltx_placeholder.png — renamed generic.)
//   ltx_silence.wav             — LTX Input_Audio_File fallback (a gen with no
//                                 audio input never injects this node; without a
//                                 staged default it dies on Invalid audio file)
const WORKFLOW_INPUT_DEFAULTS = Object.freeze([
    'ComfyUI_00001_.latent',
    'ltx_video_latent_00001_.latent',
    'ltx_audio_latent_00001_.latent',
    'placeholder.png',
    'ltx_silence.wav',
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

// tqdm progress line, e.g.  "14%|█▍ | 1/7 [00:07<00:43, 7.24s/it, ...]".
// ComfyUI redraws with \r, so one stdout chunk can hold several states — we take
// the LAST match (current state). `[` anchors N/M to the bar so we don't match
// stray "1/7" elsewhere. (MPI-147 — the WS progress_state is useless for the
// slow phases; the real per-step + model-init signal is only in stdout.)
const TQDM_RE = /(\d+)\/(\d+)\s*\[/g;

function _handleComfyOutput(level, chunk) {
    const text = chunk.toString().trim();
    if (!text) return;

    logger[_classifyComfyOutput(level, text)]('comfy', text);

    if (/Model Initialization complete!/i.test(text)) {
        _broadcastComfyEvent('comfy:model-init-complete', { message: text });
    } else if (/Model Initializing/i.test(text)) {
        _broadcastComfyEvent('comfy:model-initializing', { message: text });
    }

    // Detailer (MaskDetailerPipe / FaceDetailer) declares how many segments (detail
    // areas) it found, then runs one sampler bar per segment. The count is the stage
    // total ("Detail 2/3"); each per-segment step bar ticks the stage. (MPI-147)
    const segs = /#\s*of\s*Detected\s*SEGS:\s*(\d+)/i.exec(text);
    if (segs) {
        const total = parseInt(segs[1], 10);
        if (total > 0) _broadcastComfyEvent('comfy:segment-total', { total });
        // no return — the line carries no tqdm bar
    }

    // UltimateSDUpscale emits a separate OUTER tile bar prefixed "USDU: t/T"
    // interleaved with the inner step bars. The tile bar is the stage ("Tile 2/4");
    // the inner step bar is the fill. Route them on different channels so the stage
    // counter tracks tiles, not every interleaved bar. (MPI-147)
    const usdu = /USDU:\s*\d+%\|[^|]*\|\s*(\d+)\/(\d+)\s*\[/.exec(text);
    if (usdu) {
        const tile  = parseInt(usdu[1], 10);
        const tiles = parseInt(usdu[2], 10);
        if (tiles > 0) _broadcastComfyEvent('comfy:tile-progress', { tile, tiles });
        return; // a USDU line carries no inner step value worth forwarding
    }

    // Drive the status bar from the tqdm step counter. EVERY bar counts as a stage,
    // including the model-load `0/1`→`1/1` bar (it's stage 1 — the load phase the
    // user waits on). The renderer's stage tracker dedups consecutive ticks of the
    // same bar (same max, rising value) and counts a new bar when max changes or
    // value resets. Take the LAST N/M in the chunk (tqdm redraws with \r).
    let m, last = null;
    TQDM_RE.lastIndex = 0;
    while ((m = TQDM_RE.exec(text)) !== null) last = m;
    if (last) {
        const value = parseInt(last[1], 10);
        const max   = parseInt(last[2], 10);
        if (max > 0) _broadcastComfyEvent('comfy:step-progress', { value, max });
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
    // Server-authoritative restart flag (set by a local custom-node install). Echoed
    // on every status so the gen gate honors it even when the frontend `state` was
    // reset by an app/browser reload after the install. Cleared on a fresh start.
    const needsRestart = processState.comfyNeedsRestart === true;
    try {
        if (!processState.activeComfyProcess) return res.json({ running: false, needsRestart });
        const ax = getAxios();
        if (!ax) return res.json({ running: true, ready: false, needsRestart });
        const ready = await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
            .then(() => true).catch(() => false);
        res.json({ running: true, ready, needsRestart });
    } catch (e) {
        res.json({ running: false, needsRestart });
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
        // MPI-74: a force-local run stages defaults into the LOCAL ComfyUI input dir
        // even while remote-active, so the local _ms run finds them.
        const remoteActive = remoteModels.isRemoteActive() && req.body?.forceLocal !== true;
        const inputDir = remoteActive ? null : getComfyPath(ENGINE_ROOT, 'input');
        if (!remoteActive) await fs.ensureDir(inputDir);

        const copied = [];
        for (const filename of WORKFLOW_INPUT_DEFAULTS) {
            const source = path.join(sourceDir, filename);
            if (!(await fs.pathExists(source))) {
                return res.status(500).json({
                    success: false,
                    error: `Workflow input default missing: ${filename}`,
                });
            }
            // Remote engine: upload the bundled default to the Pod volume input
            // dir (idempotent, overwrite) instead of a local copy. Route by
            // extension — `.latent` via the latent endpoint, image/audio
            // placeholders (LTX ltx_placeholder.png / ltx_silence.wav) via the
            // generic media endpoint. Both land in the same Pod input/ dir, but
            // the latent endpoint may reject non-.latent uploads.
            if (remoteActive) {
                const endpoint = filename.endsWith('.latent')
                    ? '/wrapper/upload/latent'
                    : '/wrapper/upload/media';
                await remoteModels.remoteUploadInput(source, filename, endpoint);
            } else {
                await fs.copy(source, path.join(inputDir, filename), { overwrite: true });
            }
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
        const { sourcePath, engineInputName, forceLocal } = req.body || {};
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

        // Remote engine: upload the project-owned latent to the Pod volume input
        // dir via the wrapper instead of copying into the local ComfyUI input.
        // MPI-74: a force-local run skips the upload and copies into local input below.
        if (remoteModels.isRemoteActive() && forceLocal !== true) {
            await remoteModels.remoteUploadInput(resolvedSource, engineInputName, '/wrapper/upload/latent');
            return res.json({ success: true, copied: engineInputName });
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

        // Already running → do NOT clear comfyNeedsRestart: a node may have been
        // installed against THIS still-running process (its node scan already ran),
        // so the restart is still pending. The gen gate will stop+start it.
        if (processState.activeComfyProcess) return res.json({ success: true, message: 'Already running' });

        // We are about to SPAWN a fresh process → its node scan will pick up any
        // newly-installed custom node, satisfying the restart need. Clear the flag.
        processState.comfyNeedsRestart = false;

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

        // Force UTF-8 for the embedded Python. On Windows, py3.13 still defaults
        // source + stdio to cp1252, so any custom node with a non-Latin-1 char in
        // a string literal (e.g. RES4LYF's "Δ" label) raises a SyntaxError on
        // import AND crashes the traceback printer on the same char — killing the
        // whole ComfyUI process (no server → no prompt box). PYTHONUTF8=1 fixes
        // both. Surfaced by the v0.25.1 engine bump (py3.13). See MPI-118.
        const baseEnv = { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' };

        // On Apple Silicon, PYTORCH_ENABLE_MPS_FALLBACK lets ops not yet implemented
        // for MPS fall back to CPU instead of throwing — the difference between a
        // graceful slowdown and a hard crash mid-generation.
        const spawnEnv = vendor === 'apple'
            ? { ...baseEnv, PYTORCH_ENABLE_MPS_FALLBACK: '1' }
            : baseEnv;

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
 * POST /comfy/refresh-models
 * Calls ComfyUI GET /object_info to reseed the filename cache for model types
 * already registered in folder_names_and_paths (equivalent to the "R" hotkey).
 * Use this after a model FILE is added/removed in an existing root folder — no
 * restart needed for pure file changes. Returns { success, notRunning } when
 * ComfyUI is not running (caller may ignore — model list will reseed on next start).
 */
router.post('/comfy/refresh-models', async (req, res) => {
    if (!processState.activeComfyProcess) {
        return res.json({ success: true, notRunning: true });
    }
    const ax = getAxios();
    if (!ax) return res.json({ success: true, notRunning: true });
    try {
        await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/object_info`, { timeout: 10000 });
        logger.info('comfy', 'Model cache reseeded via /object_info (no restart needed)');
        res.json({ success: true });
    } catch (err) {
        logger.error('comfy', 'refresh-models /object_info call failed', err);
        res.status(502).json({ success: false, error: err.message });
    }
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

/**
 * GET /comfy/model-folders?bucket=loras|upscale_models
 * Returns the full set of configured drop targets for a bucket: the primary
 * bucket folder + each stored extra. Used by the picker modal to render one
 * named drop zone per folder. { success, folders: [{ path, primary }] }
 */
router.get('/comfy/model-folders', async (req, res) => {
    const bucket = String(req.query.bucket || '');
    try {
        if (bucket !== 'loras' && bucket !== 'upscale_models') {
            return res.status(400).json({ success: false, error: 'bucket must be loras or upscale_models' });
        }
        const customRoot = await getCustomRoot();
        const primaryBucket = path.join(customRoot || getDefaultModelsRoot(), bucket);
        const extras = await getExtraModelFolders();
        const folders = [
            { path: primaryBucket, primary: true },
            ...((extras[bucket]) || []).map(p => ({ path: p, primary: false })),
        ];
        res.json({ success: true, folders });
    } catch (err) {
        logger.error('comfy', 'model-folders get failed', err);
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
        const results = await _localModelsCheck(models);
        res.json({ success: true, results });
    } catch (err) {
        logger.error('comfy', 'models/check failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * MPI-74: local-filesystem model presence, IGNORING remote mode. The normal
 * /comfy/models/check forks to the Pod wrapper when remote-active; a force-local
 * run needs to know whether the model is on LOCAL disk (the engine that will run
 * it) regardless of the remote connection. Same response shape as the local
 * branch of /comfy/models/check.
 */
router.post('/comfy/models/check-local', async (req, res) => {
    const { models } = req.body;
    if (!Array.isArray(models)) return res.status(400).json({ error: 'models array required' });
    try {
        const results = await _localModelsCheck(models);
        res.json({ success: true, results });
    } catch (err) {
        logger.error('comfy', 'models/check-local failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Resolve installed-state for each model's deps against the LOCAL filesystem
 * (primary/custom root + default root + engine custom_nodes). Shared by
 * /comfy/models/check (local branch) and /comfy/models/check-local.
 */
async function _localModelsCheck(models) {
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

    return results;
}

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
/**
 * POST /comfy/import-model
 * Copy a dropped LoRA / upscale model file from its absolute local path into one
 * of the user's CONFIGURED folders for that bucket (primary root or a stored
 * extra). Copies (does not move) — the original stays. Refuses to overwrite an
 * existing same-name file unless { overwrite: true }.
 *
 * Body: { sourcePath, targetFolder, bucket: 'loras'|'upscale_models', overwrite? }
 * Returns: { success, filename } | 409 { success:false, error:'exists', filename }
 */
const _MODEL_EXTS = new Set(['.safetensors', '.ckpt', '.pt', '.bin', '.pth']);

router.post('/comfy/import-model', async (req, res) => {
    const { sourcePath, targetFolder, bucket, overwrite } = req.body || {};
    try {
        if (!sourcePath || !targetFolder || !bucket) {
            return res.status(400).json({ success: false, error: 'sourcePath, targetFolder and bucket are required' });
        }
        if (bucket !== 'loras' && bucket !== 'upscale_models') {
            return res.status(400).json({ success: false, error: 'bucket must be loras or upscale_models' });
        }
        if (!(await fs.pathExists(sourcePath))) {
            return res.status(400).json({ success: false, error: 'source file not found' });
        }
        const ext = path.extname(sourcePath).toLowerCase();
        if (!_MODEL_EXTS.has(ext)) {
            return res.status(400).json({ success: false, error: `unsupported file type: ${ext}` });
        }

        // Build the allow-list of configured folders for this bucket: primary
        // bucket folder (custom root or default) + each stored extra. Reject any
        // target outside it — no arbitrary writes / path traversal.
        const customRoot = await getCustomRoot();
        const primaryBucket = path.join(customRoot || getDefaultModelsRoot(), bucket);
        const extras = await getExtraModelFolders();
        const allowed = [primaryBucket, ...((extras[bucket]) || [])]
            .map(p => path.resolve(p));
        const resolvedTarget = path.resolve(targetFolder);
        if (!allowed.includes(resolvedTarget)) {
            return res.status(400).json({ success: false, error: 'target folder is not a configured model folder' });
        }

        await fs.ensureDir(resolvedTarget);
        const filename = path.basename(sourcePath);
        const dest = path.join(resolvedTarget, filename);

        if (!overwrite && await fs.pathExists(dest)) {
            return res.status(409).json({ success: false, error: 'exists', filename });
        }

        await fs.copy(sourcePath, dest, { overwrite: Boolean(overwrite) });
        logger.info('comfy', `imported model ${filename} into ${bucket}`);
        res.json({ success: true, filename });
    } catch (err) {
        logger.error('comfy', 'import-model failed', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

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

        // ComfyUI builds its LoRA/upscale enum from path.relative against ITS OWN
        // search roots, so the separator it expects matches the ENGINE's OS:
        // local engine = this host (Windows → '\\'), remote engine = Linux Pod
        // ('/'). We emit the engine-native separator so the dropdown value matches
        // ComfyUI's enum exactly (forward-slash here would 400 "value not in list"
        // for subfolder models on Windows). Dedupe key stays forward-slash so it's
        // stable regardless of the emitted separator.
        const remoteActive = remoteModels.isRemoteActive();
        const engineSep = remoteActive ? '/' : path.sep;
        const toEngineSep = (s) => engineSep === '/' ? s.replace(/\\/g, '/') : s.replace(/\//g, '\\');

        const addFiles = async (dirPath, relativeTo, output, seen) => {
            const files = await getAllFiles(dirPath, relativeTo);
            for (const file of files) {
                const fwd = file.replace(/\\/g, '/');
                const key = process.platform === 'win32' ? fwd.toLowerCase() : fwd;
                if (seen.has(key)) continue;
                seen.add(key);
                output.push(toEngineSep(fwd));
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
