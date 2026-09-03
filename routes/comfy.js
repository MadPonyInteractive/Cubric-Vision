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
const { isDepInstalledOnDisk, getPartialBytes } = require('./downloadCompletion');
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
    ensureCuratedPythonDeps,
    curatedDepsPending,
    curatedDepsFailure,
} = require('./shared');
const { getPythonBin, getComfyPath, getEngineRoot, resolveDownloadConfig } = require('./platformEngine');
const remoteModels = require('./remoteModels');

const ENGINE_ROOT = getEngineRoot();
const _comfyEventClients = new Set();
// Repo-owned LATENT defaults staged into the engine input/ before every _ms submit.
function _broadcastComfyEvent(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify({ ...data, engine: 'local' })}\n\n`;
    for (const client of _comfyEventClients) {
        try { client.write(payload); } catch (_) { /* client closed */ }
    }
}

/** Register / unregister an SSE response with the local broadcast set.
 *  Used by the remote-mode relay (remoteProxyForward.js) so that merged-stream
 *  clients still receive local-engine frames tagged engine:'local'. */
function addComfyEventClient(res) { _comfyEventClients.add(res); }
function removeComfyEventClient(res) { _comfyEventClients.delete(res); }

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

// MPI-415: rolling tail of the engine child's most recent output. ComfyUI prints its
// traceback immediately before dying, so the last handful of lines IS the crash
// reason. Kept in memory only, and only long enough to attach to an exit record.
const COMFY_TAIL_MAX = 15;
const _comfyOutputTail = [];

// MPI-674: the engine announces its OWN import failures, twice per pack — a
// `Cannot import <path> module for custom nodes: <reason>` warning where it happens,
// and an `(IMPORT FAILED): <path>` row in the import-times summary that closes node
// loading. That is the ground truth `checkUniversalWorkflowDepsStatus` cannot reach:
// it answers from the folder and its commit marker, both of which are correct for a
// pack that is on disk at the right commit and fails to import. So the disk check
// calls the engine healthy for ever while every graph touching those packs is
// rejected with a raw missing-class name — the whole of issue #2.
//
// Read from stdout rather than diffing /object_info against the shipped graphs'
// `class_type`s: a workflow for a model the user has never installed legitimately
// names classes from a pack that is not on disk, so that diff false-positives on a
// perfectly healthy engine. A pack that was never installed is never imported and
// never prints either line — the signal is exactly the packs that SHOULD have loaded.
//
// Both patterns are matched because they are printed at different points by different
// code paths; either alone is enough to know, and needing both to survive a chunk
// boundary is what `_importScanCarry` removes.
const CANNOT_IMPORT_RE = /Cannot import\s+(\S+)\s+module for custom nodes:/g;
const IMPORT_FAILED_RE = /\(IMPORT FAILED\):\s*(\S+)/g;
let _importScanCarry = '';

/**
 * Scans raw engine output for node packs that failed to import, recording their names
 * on `processState.comfyImportFailures`.
 *
 * Runs on the RAW chunk, before `_handleComfyOutput` trims it: the trim would eat the
 * trailing newline this scanner uses to tell a complete line from a split one. Only
 * whole lines are matched, and the trailing partial is carried into the next chunk —
 * ComfyUI prints this block in large bursts, but "large" is not "atomic", and a pack
 * silently dropped at a chunk boundary is the same invisible failure this card exists
 * to remove. The carry is bounded so a stream with no newline cannot grow it forever.
 * @param {string} raw
 * @private
 */
function _scanForImportFailures(raw) {
    const buf = _importScanCarry + raw;
    const cut = buf.lastIndexOf('\n');
    if (cut === -1) {
        _importScanCarry = buf.slice(-4096);
        return;
    }
    const complete = buf.slice(0, cut);
    _importScanCarry = buf.slice(cut + 1).slice(-4096);

    const seen = processState.comfyImportFailures;
    for (const re of [CANNOT_IMPORT_RE, IMPORT_FAILED_RE]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(complete)) !== null) {
            // The captured token is an absolute path to the pack folder; the folder
            // name is what a user (and a log reader) recognises.
            const name = m[1].replace(/[\\/]+$/, '').split(/[\\/]/).pop();
            if (name && !seen.includes(name)) {
                seen.push(name);
                logger.error('comfy', `custom node pack failed to import: ${name}`);
            }
        }
    }
}

/**
 * The degraded-engine reason drawn from import failures, or null when the engine we
 * own imported everything.
 *
 * ponytail: only an engine THIS process spawned has been scanned. An attached
 * instance (MPI-484 — another app instance owns the engine on the shared port) was
 * never our child, so we saw none of its stdout and answer "unknown", not "healthy".
 * The instance that spawned it did the scan and shows the dialog.
 * @private
 */
function _importFailureWarning() {
    if (!processState.activeComfyProcess) return null;
    const failed = processState.comfyImportFailures;
    if (!failed?.length) return null;
    return `custom node packs failed to import: ${failed.join(', ')}`;
}

function _handleComfyOutput(level, chunk) {
    const raw = chunk.toString();
    _scanForImportFailures(raw);
    const text = raw.trim();
    if (!text) return;

    _comfyOutputTail.push(text);
    if (_comfyOutputTail.length > COMFY_TAIL_MAX) _comfyOutputTail.shift();

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
    // MPI-415: when the process is gone, say WHY it is gone. Callers that only look
    // at `ready` are unaffected; the readiness poll uses this to stop waiting on a
    // process that has already died.
    const lastExit = processState.lastComfyExit || null;
    // MPI-673: `depsWarning` rides EVERY branch below. It is the only signal that the
    // engine on the other end came up degraded, and the frontend reads it from status
    // rather than from the /comfy/start response — which the reader may never have
    // made (attached instance) or may have made in a previous page life (reload).
    //
    // MPI-674: two reasons feed it now, and the pip one is checked first because it is
    // the CAUSE — "the install failed" is a better thing to be told than the packs that
    // fell over downstream of it. The import scan is what catches the case with no
    // failed install to report at all: a marker stamped by an earlier successful pass
    // makes `ensureCuratedPythonDeps` skip, so the packages can go missing afterwards
    // and every start reports a clean install over an engine that imports nothing.
    //
    // MPI-685: and a third, on disk, LAST — because the two above are live readings and
    // this one is a record. It is what a cold app has: both memory sources are empty until
    // the engine has been started in THIS process (`_importFailureWarning` returns null
    // without a child at all), so a user who opened Settings before pressing anything saw
    // no Engine health row on a provably broken install and reported the Repair button
    // missing (GitHub issue #2, 1.4.3). A successful pass removes the marker, so this
    // cannot outlive the breakage.
    const flags = {
        needsRestart,
        depsWarning: processState.lastDepsWarning || _importFailureWarning() || await curatedDepsFailure(),
    };
    try {
        const ax = getAxios();
        // Same ownership-is-not-availability split as /comfy/start (MPI-484): with no
        // child of our own the engine may still be up, started by another app instance
        // on the shared 48188. Ask the port before reporting it down, or an attached
        // instance shows a dead engine over a live one.
        if (!processState.activeComfyProcess) {
            const alive = ax && await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
                .then(() => true).catch(() => false);
            if (!alive) return res.json({ running: false, ...flags, lastExit });
            return res.json({ running: true, ready: true, ...flags });
        }
        if (!ax) return res.json({ running: true, ready: false, ...flags });
        const ready = await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
            .then(() => true).catch(() => false);
        res.json({ running: true, ready, ...flags });
    } catch (e) {
        res.json({ running: false, ...flags, lastExit });
    }
});

/**
 * GET /comfy/deps-pending
 * -> { pending: boolean } — whether the next /comfy/start will run the curated pip
 * pass. That pass runs INSIDE the start request with the engine down (MPI-459), so
 * the frontend reads this BEFORE starting and names the phase on the blocking
 * startup modal (MPI-525). Only the first start after a moved pin pays it; every
 * later start hash-matches and skips in milliseconds.
 */
router.get('/comfy/deps-pending', async (req, res) => {
    res.json({ pending: await curatedDepsPending() });
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
 * POST /comfy/stage-media-data-url
 * Body: { dataUrl: string }
 * Writes a `data:<mime>;base64,<...>` payload to a file in the LOCAL engine
 * input dir and returns its absolute path. MPI-272: media inputs are now
 * path-reading nodes (`MpiLoadImageFromPath` — `os.path.isfile`), but some
 * inputs still arrive as data URLs (the auto-mask editor's painted mask), which
 * a path node cannot read. Stage it to a real file so the path system can. The
 * caller injects the returned path; a remote run then uploads it via
 * `_uploadRemoteMedia` (which needs a local file), so we always write locally.
 */
router.post('/comfy/stage-media-data-url', async (req, res) => {
    try {
        const { dataUrl } = req.body || {};
        const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/s);
        if (!match) {
            return res.status(400).json({ success: false, error: 'body.dataUrl must be a base64 data URL' });
        }
        const ext = (match[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
        // Content-hash the name so identical masks reuse one file and repeat runs
        // don't leak the input dir. ponytail: crypto.hash, no cleanup job — the
        // input dir is engine-scratch and small; add a sweep if it ever grows.
        const hash = require('crypto').createHash('sha256').update(match[2]).digest('hex').slice(0, 16);
        const inputDir = getComfyPath(ENGINE_ROOT, 'input');
        await fs.ensureDir(inputDir);
        const target = path.join(inputDir, `mpi_staged_${hash}.${ext}`);
        await fs.writeFile(target, Buffer.from(match[2], 'base64'));
        res.json({ success: true, path: target });
    } catch (err) {
        logger.error('comfy', 'stage media data url failed', err);
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

// ── Cross-instance engine restart (MPI-484) ─────────────────────────────────
// ENGINE_ROOT is repo-scoped and COMFYUI_PORT is fixed, so every app instance shares
// ONE engine — but only the instance that spawned it holds the process handle, and
// stopComfyUI() deliberately cannot reach anyone else's. A non-owner that installs a
// custom node therefore needs a restart it is not able to perform: its stop is a
// no-op, so before this it "restarted" into silence and the node never registered.
//
// It leaves a request on disk instead, and the owner performs the restart. A FILE and
// not the broker: the broker is best-effort (absent → the responder simply never
// starts) and every instance registers under the same `cubric.vision` appId, so it
// cannot address the one holding the process. The shared engine root is the only
// thing both sides are guaranteed to agree on, and it is already the thing they are
// fighting over.
const RESTART_REQUEST_FILE = path.join(ENGINE_ROOT, '.engine-restart-request.json');

/** Ask whichever instance owns the engine to restart it. Returns false if it cannot be written. */
function requestEngineRestart(reason) {
    try {
        fs.writeJsonSync(RESTART_REQUEST_FILE, { at: Date.now(), reason: reason || 'unspecified' });
        return true;
    } catch (err) {
        logger.error('comfy', 'Could not write the engine restart request', err);
        return false;
    }
}

let _restartWatch = null;

/** Owner-side: watch for another instance's restart request. `spawnedAt` dates OUR process. */
function _watchForRestartRequests(spawnedAt) {
    clearInterval(_restartWatch);
    _restartWatch = setInterval(async () => {
        if (!processState.activeComfyProcess) return;   // not ours to restart any more
        let request;
        try {
            if (!fs.existsSync(RESTART_REQUEST_FILE)) return;
            request = fs.readJsonSync(RESTART_REQUEST_FILE);
        } catch {
            return;   // mid-write or malformed — the next tick reads it whole
        }
        // A request older than this process was aimed at the engine we already
        // replaced. Honouring it would restart on every tick, forever.
        const stale = !request || !(request.at > spawnedAt);
        try { fs.removeSync(RESTART_REQUEST_FILE); } catch { /* it will be retried */ }
        if (stale) return;

        logger.info('comfy', `Restart requested by another app instance (${request.reason}) — restarting the shared engine`);
        stopComfyUI();
        // Same 2s the client-side restart waits: let the process fully exit, or the
        // start below races it and finds the port still occupied.
        await new Promise((r) => setTimeout(r, 2000));
        const ax = getAxios();
        const ownPort = Number(process.env.CUBRIC_PORT) || 3000;
        if (!ax) return;
        await ax.post(`http://127.0.0.1:${ownPort}/comfy/start`, { isUserRestart: true }, { timeout: 30000 })
            .catch((err) => logger.error('comfy', 'Delegated engine restart could not start it again', err));
    }, 2000);
    // Never hold the event loop open on this — it is a background courtesy.
    if (_restartWatch.unref) _restartWatch.unref();
}

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

        // ATTACH, don't refuse (MPI-484). `activeComfyProcess` answers "did I spawn
        // it", not "is an engine up" — it is module-level in this server fork — so an
        // app instance that did not spawn the engine reaches here even when a healthy
        // one is serving. 48188 is a SHARED port: every instance uses the one engine.
        //
        // This replaces MPI-434's 409 ("most likely another ComfyUI — close it"), which
        // was correct while the engine sat on ComfyUI's default 8188 alongside the
        // G:\ComfyUi bench and an occupant really was foreign. The engine now owns a
        // private 48188, and MPI-458's `npm run app:isolated` made a second instance
        // routine, so the guard's normal case became its false positive — an agent was
        // told to close the user's own engine mid-run.
        //
        // Do NOT simply delete this branch: without it, control falls through to
        // spawn() below, a second ComfyUI fails to bind the occupied port and exits,
        // and the instance is left with a DEAD engine and a lastExit — strictly worse
        // than the dialog. Stopping stays the spawner's alone: stopComfyUI() only ever
        // kills a handle it owns (routes/shared.js — no kill-by-port, no PID lookup)
        // and /comfy/unload returns early on a null handle, so an ATTACHED instance
        // cannot kill the owner's engine. Availability is shared; ownership is not.
        const probeAx = getAxios();
        if (probeAx) {
            const occupied = await probeAx.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
                .then(() => true).catch(() => false);
            if (occupied) {
                logger.info('comfy', `Engine already serving on ${COMFYUI_PORT} (started by another app instance) — attaching`);
                if (isUserRestart) {
                    // Our stop was a no-op — we do not own the process — so attaching
                    // alone would report a clean success while nothing restarted and
                    // the newly installed node stayed unregistered. Delegate it.
                    const queued = requestEngineRestart(req.body && req.body.reason);
                    if (queued) {
                        logger.info('comfy', 'Restart delegated to the instance that owns the engine');
                        return res.json({ success: true, message: 'Restart requested', delegated: true });
                    }
                    logger.warn('comfy', 'Restart needed but this instance does not own the engine and the request could not be written — restart from the instance that started it');
                }
                return res.json({ success: true, message: 'Already running' });
            }
        }

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

        // The curated Python set installs HERE, with the engine down (MPI-459). This is
        // the only point in the app where that is guaranteed: we hold no child process
        // and the port probe above proved nothing else answers, so no site-packages file
        // is open and Windows cannot refuse the overwrite. A no-op whenever the marker
        // matches, which is every start except the one after a release moves a pin.
        //
        // A failure does NOT abort the start. Before this moved, a failed pass left a
        // working engine (only the install reported failure), and refusing to boot over
        // e.g. an offline pip would be a worse regression than the bug being fixed. The
        // nodes needing a moved pin fail to import and say so in the engine log; the
        // reason is returned to the caller and recorded here.
        let depsWarning = null;
        try {
            await ensureCuratedPythonDeps();
        } catch (err) {
            depsWarning = `curated python deps FAILED: ${err.message}`;
            logger.error('comfy', `${depsWarning} — starting anyway, custom nodes may fail to import`);
        }
        // MPI-673: outlive the response. Returning the reason to this one caller was
        // not enough — nothing read it, and the engine this start is about to spawn
        // stays degraded for its whole life, across every app/browser reload. Written
        // on BOTH outcomes: a success writes null, which is exactly what a retry of a
        // previously failed pass is (no marker was stamped, so it ran again here).
        processState.lastDepsWarning = depsWarning;

        // Fresh start → forget the previous life's output and exit record, so a stale
        // crash can never be reported against this run (MPI-415).
        _comfyOutputTail.length = 0;
        processState.lastComfyExit = null;
        processState.comfyStopRequested = false;
        // MPI-674: and forget the previous engine's import failures, so a repaired
        // engine is not still reported broken by the one it replaced. The carry goes
        // with them — a partial line from a dead process can only mis-match here.
        processState.comfyImportFailures = [];
        _importScanCarry = '';

        // windowsHide: the server.js fork owns no console, so without it Windows
        // gives the embedded python its own conhost — a terminal window sitting on
        // the user's desktop for the whole life of the engine (MPI-637).
        processState.activeComfyProcess = spawn(pythonPath, args, { cwd: path.dirname(mainPath), env: spawnEnv, windowsHide: true });
        // We own the engine now, so we are the one that can honour another
        // instance's restart request (MPI-484).
        _watchForRestartRequests(Date.now());
        processState.activeComfyProcess.stdout.on('data', (d) => _handleComfyOutput('info', d));
        processState.activeComfyProcess.stderr.on('data', (d) => _handleComfyOutput('warn', d));
        processState.activeComfyProcess.on('exit', (code, signal) => {
            logger.info('comfy', `ComfyUI process exited (code=${code}, signal=${signal || 'none'})`);
            // MPI-415: record WHY. The readiness poll reads this to fail fast with the
            // real reason instead of waiting out its timeout and blaming the clock.
            processState.lastComfyExit = {
                code,
                signal,
                at: Date.now(),
                deliberate: processState.comfyStopRequested === true,
                tail: _comfyOutputTail.slice(),
            };
            processState.comfyStopRequested = false;
            processState.activeComfyProcess = null;
            // We no longer own an engine, so we can no longer honour a restart request
            // for one. Whoever spawns next arms their own watcher (MPI-484).
            clearInterval(_restartWatch);
            _restartWatch = null;
        });

        res.json({ success: true, ...(depsWarning ? { depsWarning } : {}) });
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

        // Log the root change BEFORE it happens. This route rewrites the single
        // source of truth for where every model lives, and it used to log only on
        // error — so a wrong root left no trace at all and cost an investigation
        // to attribute (MPI-392).
        const previousRoot = await getCustomRoot();
        const effectiveBefore = previousRoot ? resolveModelsRoot(previousRoot) : getDefaultModelsRoot();

        if (!customPath) {
            // Reverting to the default root: always keep the YAML pointing at the
            // default models root (plus any additive extras). Do NOT delete the
            // file — without it ComfyUI would stop searching mpi_models and any
            // models installed there would be orphaned.
            await writeExtraModelPathsYaml(getDefaultModelsRoot(), extras);
            logger.info('comfy', `set-path: models root ${effectiveBefore} -> ${getDefaultModelsRoot()} (reverted to default)`);
            return res.json({ success: true });
        }

        // Always persist an absolute root — a relative path resolves against the
        // server cwd in Cubric but against the ComfyUI dir in ComfyUI, so a model
        // installed via a relative root is invisible to generation.
        const absoluteRoot = resolveModelsRoot(customPath);
        const yamlContentPath = await writeExtraModelPathsYaml(absoluteRoot, extras);
        logger.info('comfy', `set-path: models root ${effectiveBefore} -> ${absoluteRoot}`);
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

/**
 * MPI-219 helper: wait for ComfyUI to answer /history (ready), then POST the
 * MpiNodes runtime path-reload so a freshly-added extra folder registers without
 * a restart. Bounded retries cover the boot window (socket refuses / booting).
 * Fire-and-forget: callers must not await this — it's a background reconcile.
 */
async function reloadExtraPathsWhenReady(yamlPath, { attempts = 20, delayMs = 1000 } = {}) {
    const ax = getAxios();
    if (!ax) return;
    for (let i = 0; i < attempts; i++) {
        if (!processState.activeComfyProcess) return; // engine went away — nothing to reload
        const ready = await ax.get(`http://127.0.0.1:${COMFYUI_PORT}/history`, { timeout: 1000 })
            .then(() => true).catch(() => false);
        if (ready) {
            try {
                await ax.post(`http://127.0.0.1:${COMFYUI_PORT}/mpi/reload-extra-paths`,
                    { yaml_path: yamlPath }, { timeout: 10000 });
                logger.info('comfy', 'extra-folders: engine reloaded extra model paths (no restart)');
            } catch (reloadErr) {
                logger.warn('comfy', `extra-folders: runtime path reload failed (${reloadErr.message}) — restart engine to pick up new folders`);
            }
            return;
        }
        await new Promise(r => setTimeout(r, delayMs));
    }
    logger.warn('comfy', 'extra-folders: engine did not become ready — new folders will apply on next restart');
}

router.post('/comfy/extra-folders', async (req, res) => {
    try {
        const folders = await setExtraModelFolders(req.body || {});
        const primaryRoot = await getCustomRoot();
        // Always (re)write the YAML so removed extra folders are dropped from it
        // (garbage collection) while the default root block is preserved. Never
        // delete the file — that would orphan models under the default root.
        const yamlPath = await writeExtraModelPathsYaml(primaryRoot || getDefaultModelsRoot(), folders);

        // MPI-219: ComfyUI reads extra_model_paths.yaml only at boot, so a folder
        // added mid-session is invisible to /prompt validation → 400 "Value not in
        // list: lora_name". Ask the running engine to re-read the yaml at runtime
        // (MpiNodes POST /mpi/reload-extra-paths) so the new path registers without
        // a restart. Fire-and-forget with a boot-race guard: a user can add a folder
        // while ComfyUI is still booting (socket not listening → ECONNREFUSED, or
        // boot already passed its own load_extra_path_config before the yaml was
        // rewritten). Wait for the engine to answer /history, THEN reload the now-
        // current yaml. Don't block the HTTP response on it — the yaml is already
        // written and correct for next boot regardless.
        if (processState.activeComfyProcess) {
            reloadExtraPathsWhenReady(yamlPath);
        }

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
            // MPI-211: during the Pod-ready-polling window the wrapper HTTP
            // endpoint isn't up yet (404 / connection refused). That's a
            // transient boot state, not a failure — answer 200 with an empty
            // not-ready result so the renderer doesn't log a hard 502. Every
            // subsequent check reconciles clean once the Pod is ready.
            const booting = /wrapper status 404\b/.test(err.message)
                || /ECONNREFUSED|ENOTFOUND|socket hang up|fetch failed/i.test(err.message);
            if (booting) {
                logger.info('comfy', `remote models/check deferred — Pod wrapper still booting (${err.message})`);
                return res.json({ success: true, results: {}, pending: true });
            }
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

    const results = {};

    for (const model of models) {
        if (!model.id || !Array.isArray(model.deps)) { results[model.id] = { installed: false, deps: [] }; continue; }

        let allPresent = true;
        const depResults = [];

        for (const dep of model.deps) {
            if (!dep.filename) { depResults.push({ id: dep.id || null, installed: false }); continue; }

            // MPI-654: ONE resolver for both readers. This function used to carry its own
            // copy of the targetPath / custom_nodes / custom-root / default-root ladder,
            // and every copy drifted: MPI-607 was the missing `targetPath` branch (flow
            // deps read not-installed FOREVER), and the search scope drifted next — this
            // copy searched the dep's bucket while resolveComfyPath searched the whole
            // custom root, so a same-named weight in another bucket read installed to the
            // installer and not-installed here. Both are fixed by there being one ladder.
            const { localPath: depPath } = await resolveComfyPath(dep, customRoot, {});

            // MPI-387 F1: type-aware — a custom_nodes folder holding only a `targetPath`
            // weight's subdir is not an installed node, and must not report as one.
            const isInstalled = await isDepInstalledOnDisk(dep, depPath);
            const partialBytes = isInstalled ? 0 : await getPartialBytes(depPath);
            if (!isInstalled) allPresent = false;
            depResults.push({ id: dep.id || null, installed: isInstalled, partialBytes });
        }

        results[model.id] = { installed: allPresent, deps: depResults };
    }

    return results;
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
module.exports.addComfyEventClient = addComfyEventClient;
module.exports.removeComfyEventClient = removeComfyEventClient;
// Exposed for the local shared-dep guard in downloadManager (MPI-216): the local
// uninstall must protect deps still complete on disk for ANOTHER model, the same
// way the remote path checks the Pod volume. Reuses the exact custom-root +
// default-root + recursive-search + completeness logic used by /comfy/models/check.
module.exports.localModelsCheck = _localModelsCheck;
module.exports.scanForImportFailures = _scanForImportFailures;   // MPI-674 — exported for unit test
