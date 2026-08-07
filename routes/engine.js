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
const { SYS_DEPS_PATH, checkUniversalWorkflowDepsStatus, getUniversalWorkflowDepsTotalSize, processState, stopComfyUI, getExtraModelFolders, getDefaultModelsRoot, resolveModelsRoot, getCustomRoot, resolveComfyPath, getUniversalWorkflowDeps, runPipCommand, NODE_COMMIT_MARKER } = require('./shared');
const logger = require('./logger');
const { broadcastEngineEvent, FileDownloader, registerEngineDownload, clearEngineDownload, startUniversalWorkflowInstall, finishCustomNodeInstall } = require('./downloadManager');
const { COMFY_DIR, COMFY_VENV_DIR, COMFY_VERSION, TORCH_MAC, getPythonBin, getComfyPath, resolveDownloadConfig, resolveUvBin, getEngineRoot } = require('./platformEngine');
const { ensureGit } = require('./gitProvision');
const { buildExtraModelPathsYaml } = require('./yamlHelper');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const ENGINE_ROOT = getEngineRoot();

// ── MPI-387: Windows MAX_PATH preflight ──────────────────────────────────────
// A clean Windows 11 install died mid-pip with
// `OSError: [Errno 2] No such file or directory` on a deep `diffusers` file —
// 266 characters against the 260-char MAX_PATH. The engine tree is what's deep:
// the longest file pip writes under ENGINE_ROOT measured 171 chars
//   \ComfyUI_windows_portable\python_embeded\Lib\site-packages\diffusers\pipelines
//   \deprecated\stable_diffusion_attend_and_excite
//   \pipeline_stable_diffusion_attend_and_excite.py
// so any install root over 260 - 171 = 89 chars CANNOT complete an install, no
// matter how the archive is packed. Fail here — before multi-GB of downloads —
// with a path the user can act on. The old behaviour downloaded everything,
// failed pip, reported "extractions failed", and re-downloaded the whole engine
// on every Retry (see the retry-loop note in the MPI-387 brief).
const WIN_MAX_PATH = 260;
const DEEPEST_ENGINE_REL_LEN = 171; // measured, MPI-387
const INSTALL_ROOT_BUDGET = WIN_MAX_PATH - DEEPEST_ENGINE_REL_LEN;

/**
 * Pure depth check — platform-agnostic so it is testable anywhere.
 * @param {string} engineRoot
 * @returns {string|null} user-facing reason, or null when the root fits
 */
function installPathDepthError(engineRoot) {
    if (engineRoot.length <= INSTALL_ROOT_BUDGET) return null;
    return `Install folder is too deep for Windows. The engine path is ${engineRoot.length} characters and must be `
        + `${INSTALL_ROOT_BUDGET} or fewer, because Windows limits a full file path to ${WIN_MAX_PATH}. Move the `
        + `Cubric Vision folder closer to the drive root (C:\\CubricVision works) and press Install again. `
        + `Current path: ${engineRoot}`;
}

async function isWindowsLongPathEnabled() {
    try {
        const { stdout } = await promisify(execFile)(
            'reg',
            ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', '/v', 'LongPathsEnabled'],
            { windowsHide: true }
        );
        return /LongPathsEnabled\s+REG_DWORD\s+0x1/i.test(stdout);
    } catch {
        return false; // key absent / reg unavailable → assume the classic limit
    }
}

/**
 * Throw before any download when the install root cannot fit a full engine tree
 * within Windows' MAX_PATH. No-op off win32, and skipped when the machine has
 * Long Path support turned on.
 * @param {string} engineRoot
 */
async function assertInstallPathDepth(engineRoot = ENGINE_ROOT) {
    if (process.platform !== 'win32') return;
    const reason = installPathDepthError(engineRoot);
    if (!reason) {
        if (engineRoot.length > INSTALL_ROOT_BUDGET - 20) {
            logger.warn('engine', `Install path near the Windows limit: ${engineRoot.length} of ${INSTALL_ROOT_BUDGET} chars — ${engineRoot}`);
        }
        return;
    }
    if (await isWindowsLongPathEnabled()) {
        logger.warn('engine', `Install path is ${engineRoot.length} chars (over the ${INSTALL_ROOT_BUDGET} budget) but Windows Long Path support is enabled — continuing`);
        return;
    }
    throw new Error(reason);
}

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
/**
 * Windows engine provisioning: download the prebuilt portable archive and
 * extract it with 7-Zip, firing UW deps downloads in parallel.
 *
 * @param {string} targetDir   engine root
 * @param {object} engineInfo  { version, filename, url }
 * @param {string[]} missingDepIds  UW deps to install in parallel
 * @returns {Promise<{ uwModelJob: object|null }>}
 */
/**
 * Remove stale Windows engine artifacts left by a killed or failed run:
 *   - the partial archive (node-downloader-helper writes straight to the final
 *     name with no `.part`, so a killed download leaves a truncated <filename>)
 *   - OS-renamed download duplicates ("<base> (1).7z", etc.)
 *   - a partial extract folder that has no embedded Python
 * Keeps a complete, valid engine folder untouched (handled by version-check).
 *
 * The engine deliberately re-downloads from scratch after an app close (no
 * cross-restart resume) — the partial archive is scrubbed here. Models DO get
 * cross-restart resume (separate path); see the resumable-downloads handoff.
 *
 * @param {string} targetDir   engine root
 * @param {string} filename    the GPU-variant archive filename being fetched
 */
async function _clearStaleWindowsEngineArtifacts(targetDir, filename) {
    // Partial archive at the final name (NDH 2.x has no `.part`); the `.part`
    // entry is belt-and-suspenders in case a future lib version reintroduces it.
    for (const p of [path.join(targetDir, filename), path.join(targetDir, `${filename}.part`)]) {
        if (await fs.pathExists(p)) {
            logger.warn('engine', `Removing stale engine artifact: ${p}`);
            await fs.remove(p).catch(() => {});
        }
    }

    // OS-renamed download duplicates: "<base> (1).7z", "<base> (2).7z", plus
    // their `.part` siblings. node-downloader-helper appends " (n)" when it
    // cannot resume/override an existing final-named file.
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const entries = await fs.readdir(targetDir).catch(() => []);
    const dupRe = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+\\)${ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\.part)?$`);
    for (const name of entries) {
        if (dupRe.test(name)) {
            const dup = path.join(targetDir, name);
            logger.warn('engine', `Removing stale engine download duplicate: ${dup}`);
            await fs.remove(dup).catch(() => {});
        }
    }

    // Partial extract folder with no embedded Python — unusable, must be cleared
    // so a fresh extract does not merge onto a broken tree.
    const comfyDir = path.join(targetDir, COMFY_DIR);
    if (await fs.pathExists(comfyDir) && !(await fs.pathExists(getPythonBin(targetDir)))) {
        logger.warn('engine', `Removing partial engine folder (no embedded Python): ${comfyDir}`);
        await fs.remove(comfyDir).catch(() => {});
    }
}

async function _provisionWindowsEngine(targetDir, engineInfo, missingDepIds) {
    const type = 'comfy';

    // ── Download engine using FileDownloader ────────────────────────────────
    let engineArchiveSize = 0;
    broadcastEngineEvent('engine:downloading', { progress: 0, downloadedBytes: 0, totalBytes: 0 });

    await fs.ensureDir(targetDir);
    const archivePath = path.join(targetDir, engineInfo.filename);

    // ── Clear stale artifacts from a killed/failed prior run ────────────────
    // A process killed mid-download (e.g. app closed during the engine fetch)
    // leaves a truncated archive and/or a partial ComfyUI_windows_portable
    // folder. Without this scrub, the extractor would read the junk archive and
    // produce a folder missing python_embeded ("embedded python not found").
    // Mirrors the Linux stale-workspace guard in _provisionUvEngine.
    await _clearStaleWindowsEngineArtifacts(targetDir, engineInfo.filename);

    logger.info('system', `Downloading engine: ${engineInfo.url}`);

    const downloadId = `engine-${type}`;
    const depJob = {
        id: downloadId,
        url: engineInfo.url,
        localPath: archivePath,
        status: 'downloading',
        downloadedBytes: 0,
        totalBytes: 0,
        error: null,
        sha256Expected: null
    };

    const downloader = new FileDownloader(depJob, archivePath);

    downloader.onProgress = (downloaded, total, speed) => {
        engineArchiveSize = total;
        const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        broadcastEngineEvent('engine:downloading', { progress, downloadedBytes: downloaded, totalBytes: total, speed });
    };

    await downloader._ensureDownloader();
    registerEngineDownload(downloader, downloadId);

    // Fire UW deps download immediately (parallel with engine download, skip custom node install for now)
    let uwModelJob = null;
    let uwDepsPromise = Promise.resolve();
    if (missingDepIds.length > 0) {
        logger.info('engine', `Firing ${missingDepIds.length} UW deps downloads (parallel)...`);
        uwDepsPromise = startUniversalWorkflowInstall(missingDepIds, true, true)  // true = skip custom node install
            .then(modelJob => { uwModelJob = modelJob; return modelJob; })
            .catch(err => {
                // MPI-427: keep the job. The deps that DID download are on it, and the
                // custom-node install below is the only thing that extracts them. Losing
                // it here left a blocked-host user with an engine and zero custom nodes,
                // re-failing identically on every launch.
                uwModelJob = err.modelJob || null;
                logger.error('engine', `UW deps download error: ${err.message}`);
                broadcastEngineEvent('engine:uw-installing', {
                    status: 'Some dependencies could not be installed. You can repair them later.'
                });
            });
    }

    await new Promise((resolve, reject) => {
        downloader._downloader.on('end', () => { clearEngineDownload(); resolve(); });
        downloader._downloader.on('error', (err) => { clearEngineDownload(); reject(err); });
        downloader._downloader.start();
    });

    // ── Extract ─────────────────────────────────────────────────────────────
    broadcastEngineEvent('engine:extracting', { status: 'extracting', progress: 0 });
    logger.info('system', 'Extracting engine archive...');

    const sevenBin = require('7zip-bin');
    const { extractFull } = require('node-7z');
    const myStream = extractFull(archivePath, targetDir, { $bin: sevenBin.path7za });

    await new Promise((resolve, reject) => {
        myStream.on('data', (data) => {
            if (data && data.status) {
                broadcastEngineEvent('engine:extracting', { status: 'extracting', file: data.file || '', progress: 0 });
            }
        });
        myStream.on('end', resolve);
        myStream.on('error', reject);
    });

    // ── Verify the extract actually produced a usable engine ────────────────
    // A truncated/corrupt archive can extract "successfully" yet leave the
    // embedded Python missing. Catch that here so it surfaces as a clear,
    // retryable download-phase error instead of a later "cannot run pip".
    const pythonBin = getPythonBin(targetDir);
    if (!(await fs.pathExists(pythonBin))) {
        await fs.remove(archivePath).catch(() => {});
        await _clearStaleWindowsEngineArtifacts(targetDir, engineInfo.filename);
        throw new Error('Engine archive extracted without an embedded Python — the download was incomplete or corrupt. Press Retry to download it again.');
    }

    await fs.remove(archivePath);

    // ── Wait for UW deps downloads to finish ────────────────────────────────
    logger.info('engine', 'Waiting for UW deps downloads to complete...');
    await uwDepsPromise;
    return { uwModelJob };
}

/** Promisified spawn that streams stdout/stderr lines into engine SSE + log. */
function _runStreaming(cmd, args, { cwd, env, stage } = {}) {
    return new Promise((resolve, reject) => {
        logger.info('engine', `${stage}: ${cmd} ${args.join(' ')}`);
        const child = spawn(cmd, args, { cwd, env: env || process.env });
        const onLine = (level, buf) => {
            const text = buf.toString();
            for (const raw of text.split(/\r?\n/)) {
                const line = raw.trim();
                if (!line) continue;
                logger[level === 'err' ? 'warn' : 'info']('engine', `[${stage}] ${line}`);
                broadcastEngineEvent('engine:extracting', { status: stage, file: line, progress: 0 });
            }
        };
        child.stdout.on('data', (d) => onLine('out', d));
        child.stderr.on('data', (d) => onLine('err', d));
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${stage} failed (exit ${code}): ${cmd} ${args.join(' ')}`));
        });
    });
}

/**
 * Linux/macOS engine provisioning: bootstrap ComfyUI via uv + comfy-cli.
 *
 * No prebuilt portable exists for these platforms. comfy-cli clones ComfyUI
 * directly into the workspace it is given, so the workspace IS the ComfyUI repo
 * root (`<engine>/<COMFY_DIR>`, matching getComfyPath on these platforms). The uv
 * venv lives in a sibling dir (`<engine>/comfy-venv`, matching getPythonBin) so it
 * is not inside the dir comfy-cli must clone into; VIRTUAL_ENV points comfy-cli at
 * it so it reuses that venv as ComfyUI's runtime instead of making its own.
 * Accelerators (Triton/SageAttention) are intentionally NOT installed — see MPI-50.
 *
 * @param {string} targetDir   engine root
 * @param {string[]} missingDepIds  UW deps to install after the venv exists
 * @param {object} downloadConfig  resolveDownloadConfig() result (for GPU vendor)
 * @returns {Promise<{ uwModelJob: object|null }>}
 */
async function _provisionUvEngine(targetDir, missingDepIds, downloadConfig) {
    const uvBin = resolveUvBin();
    if (!uvBin) {
        throw new Error('uv not found. Stage a uv binary at <root>/uv/uv (CUBRIC_UV_BIN) or install uv on PATH.');
    }

    // comfy-cli clones ComfyUI DIRECTLY into the workspace it is given and
    // refuses a pre-existing non-git dir, so the workspace IS the ComfyUI repo
    // root and must not exist (or be a valid clone) before `comfy install`. The
    // uv venv therefore lives in a SIBLING dir, not inside the workspace.
    const workspace = path.join(targetDir, COMFY_DIR);          // <engine>/ComfyUI_linux (ComfyUI repo root)
    const venvDir = path.join(targetDir, COMFY_VENV_DIR);       // <engine>/comfy-venv (sibling)
    const venvPython = getPythonBin(targetDir);                  // <engine>/comfy-venv/bin/python3
    const comfyBin = path.join(venvDir, 'bin', 'comfy');

    await fs.ensureDir(targetDir);
    broadcastEngineEvent('engine:downloading', { progress: 0, downloadedBytes: 0, totalBytes: 0, status: 'Bootstrapping ComfyUI environment…' });

    // ── 0. Ensure git (comfy-cli clones ComfyUI + nodes via GitPython) ──────
    // Use host git if present, else install it (pkexec/brew). The resolved path
    // is passed to comfy-install via GIT_PYTHON_GIT_EXECUTABLE so GitPython does
    // not depend on PATH. Windows never reaches here (prebuilt archive path).
    broadcastEngineEvent('engine:extracting', { status: 'Checking for git…', progress: 0 });
    const gitPath = await ensureGit({
        onStatus: (status) => broadcastEngineEvent('engine:extracting', { status, progress: 0 }),
    });

    // ── 0b. Clear a stale workspace from a failed prior run ─────────────────
    // comfy-cli aborts if the workspace exists but is not a valid ComfyUI clone
    // (e.g. an interrupted earlier attempt). Remove it so retries start clean.
    if (await fs.pathExists(workspace) && !(await fs.pathExists(path.join(workspace, '.git')))) {
        logger.warn('engine', `Removing stale ComfyUI workspace (no .git): ${workspace}`);
        await fs.remove(workspace);
    }

    // A workspace that IS a valid clone survives 0b — and comfy-cli refuses that
    // one too, exiting 1 with "ComfyUI is already installed at the specified
    // path" and naming --restore. That is the COMMON interrupted-install shape,
    // not an edge case: the clone finishes in seconds and the dependency install
    // is the long part, so anything that dies mid-setup almost always leaves a
    // complete .git behind. Without --restore, Retry stays impossible on
    // Linux/macOS in exactly the way MPI-408 was meant to end — the same hole,
    // one step later (MPI-411, measured on Linux 2026-07-30). Restoring beats
    // deleting and re-cloning: the clone is the cheap half, and these are the
    // machines least able to spare the download.
    const workspaceIsClone = await fs.pathExists(path.join(workspace, '.git'));
    if (workspaceIsClone) {
        logger.warn('engine', `ComfyUI workspace already cloned — installing with --restore: ${workspace}`);
    }

    // ── 1. uv venv (uv fetches Python 3.12 if the host lacks it) ────────────
    // --seed installs pip into the venv. uv venvs are pip-less by default, but
    // comfy-cli's DependencyCompiler runs `python -m pip install ... uv` against
    // the active VIRTUAL_ENV, which fails with "No module named pip" without it.
    //
    // --clear is what makes RETRY WORK (MPI-408). `uv venv` hard-errors with
    // "A virtual environment already exists at: comfy-venv" (exit 2) whenever the
    // target exists — a COMPLETE venv, not just a broken one. Without --clear the
    // first attempt that gets past this step poisons every later one, so the
    // Installation Failed dialog's Retry button could never succeed again on
    // Linux/macOS regardless of what originally failed. Measured on Linux
    // 2026-07-30 after a mid-install power cut. Rebuilding the venv costs seconds;
    // step 0b already takes the same "make retries start clean" approach for the
    // ComfyUI workspace, and this closes the same hole for its sibling dir.
    broadcastEngineEvent('engine:extracting', { status: 'Creating Python environment…', progress: 0 });
    await _runStreaming(uvBin, ['venv', '--clear', '--seed', '--python', '3.12', venvDir], { cwd: targetDir, stage: 'uv-venv' });

    // ── 2. Install comfy-cli into the venv ──────────────────────────────────
    await _runStreaming(uvBin, ['pip', 'install', '--python', venvPython, 'comfy-cli'], { cwd: targetDir, stage: 'install-comfy-cli' });

    // ── 2b. macOS: install the PINNED torch BEFORE comfy-cli can install one ─
    // comfy-cli's MAC_M_SERIES branch runs `pip install --pre torch torchvision
    // torchaudio --extra-index-url .../whl/nightly/cpu` — the only one of its GPU
    // branches on the nightly channel, and unversioned, so the engine a Mac user
    // got depended on the calendar. It shipped broken: nightly dev20260731 renders
    // SDXL on MPS as grey noise, silently (see TORCH_MAC in platformEngine.js).
    // Installing the pin first means ComfyUI's own requirements.txt then reports
    // torch as "already satisfied" and leaves it alone; step 3 passes
    // --skip-torch-or-directml so comfy-cli's nightly branch never runs at all.
    // Belt and braces on purpose — either one alone would still leave a path to a
    // nightly wheel.
    if (process.platform === 'darwin') {
        broadcastEngineEvent('engine:extracting', { status: 'Installing PyTorch…', progress: 0 });
        await _runStreaming(
            uvBin,
            ['pip', 'install', '--python', venvPython,
                `torch==${TORCH_MAC.torch}`,
                `torchvision==${TORCH_MAC.torchvision}`,
                `torchaudio==${TORCH_MAC.torchaudio}`],
            { cwd: targetDir, stage: 'install-torch' },
        );
        logger.info('engine', `macOS torch pinned: torch==${TORCH_MAC.torch} torchvision==${TORCH_MAC.torchvision} torchaudio==${TORCH_MAC.torchaudio}`);
    }

    // ── 3. comfy install into the workspace (non-interactive) ───────────────
    // Flag names verified against comfy-cli source: --skip-prompt/--workspace are
    // global (before `install`); --nvidia/--amd/--m-series/--cpu are install opts.
    // The install build is vendor-driven; the launch (routes/comfy.js) mirrors
    // the same vendor so a CPU install is launched in CPU mode (and an NVIDIA
    // install in GPU mode) — the two must stay consistent.
    const vendor = downloadConfig?.gpu?.vendor;
    let gpuFlag = '--cpu';
    if (vendor === 'nvidia') gpuFlag = '--nvidia';
    else if (vendor === 'amd') gpuFlag = '--amd';
    else if (process.platform === 'darwin') gpuFlag = '--m-series';  // Apple Silicon
    // --fast-deps (comfy-cli DependencyCompiler) resolves generic PyPI torch and
    // IGNORES the vendor flag, so it is only safe when that generic resolve is
    // the one we want — i.e. NVIDIA. Everything else must take comfy-cli's
    // standard, vendor-aware install:
    //   --m-series: moot since step 2b — we install the pinned torch ourselves and
    //               pass --skip-torch-or-directml, so no comfy-cli torch branch runs
    //   --cpu:      --fast-deps pulls the whole CUDA stack — measured on Linux
    //               2026-07-30, requirements.compiled resolved torch==2.13.0 with
    //               no +cpu tag plus triton and 14 nvidia-* wheels, several GB a
    //               CPU-only box can never execute (MPI-406)
    //   --amd:      same fall-through risk (generic PyPI torch, not ROCm)
    //
    // --version PINS THE CORE. comfy-cli defaults to `nightly` (= whatever is on
    // master), so without this flag the engine we ship is whatever ComfyUI cut
    // last — a version we never chose and cannot support. It broke live: a Mac
    // installed 0.29.0 while we were pinned to 0.28.0, and our pinned
    // ComfyUI-LTXVideo could not import against it (MPI-419, 2026-07-31). The
    // Windows archive path has always been genuinely pinned; this closes the
    // same hole on the two platforms that build from source. The flag applies
    // even alongside --restore (comfy-cli checks out the tag straight after the
    // clone step, fetching tags when absent), so a retry onto an existing
    // workspace lands on the pin too.
    const installArgs = ['--skip-prompt', '--workspace', workspace, 'install', gpuFlag, '--version', COMFY_VERSION];
    if (gpuFlag === '--nvidia') installArgs.push('--fast-deps');
    // macOS torch is ours now (step 2b) — keep comfy-cli off its nightly branch.
    if (process.platform === 'darwin') installArgs.push('--skip-torch-or-directml');
    if (workspaceIsClone) installArgs.push('--restore');
    await _runStreaming(
        comfyBin,
        installArgs,
        {
            cwd: targetDir,
            env: {
                ...process.env,
                VIRTUAL_ENV: venvDir,
                // Point GitPython at the resolved git and silence its noisy
                // import-time banner (the "Bad git executable" warning block).
                GIT_PYTHON_GIT_EXECUTABLE: gitPath,
                GIT_PYTHON_REFRESH: 'quiet',
            },
            stage: 'comfy-install',
        },
    );

    if (!(await fs.pathExists(venvPython))) {
        throw new Error(`uv bootstrap finished but Python not found at ${venvPython}`);
    }
    if (!(await fs.pathExists(getComfyPath(targetDir, 'main.py')))) {
        throw new Error(`uv bootstrap finished but main.py is missing at ${getComfyPath(targetDir, 'main.py')}`);
    }

    // ── 4. UW deps (sequential — venv must exist before pip installs) ────────
    let uwModelJob = null;
    if (missingDepIds.length > 0) {
        logger.info('engine', `Installing ${missingDepIds.length} UW deps...`);
        try {
            uwModelJob = await startUniversalWorkflowInstall(missingDepIds, true, true);
        } catch (err) {
            // MPI-427: same as the Windows path — the job carries the deps that landed,
            // and finishCustomNodeInstall is what extracts them.
            uwModelJob = err.modelJob || null;
            logger.error('engine', `UW deps install error: ${err.message}`);
            broadcastEngineEvent('engine:uw-installing', {
                status: 'Some dependencies could not be installed. You can repair them later.'
            });
        }
    }
    return { uwModelJob };
}

/**
 * Read the ComfyUI version that actually landed on disk, from the repo's own
 * `comfyui_version.py` (`__version__ = "0.29.2"`). Present in both layouts —
 * the Windows portable archive and the comfy-cli clone — because getComfyPath
 * resolves the repo root for each.
 * @param {string} engineRoot
 * @returns {Promise<string|null>} the version, or null when it cannot be read
 */
async function _readInstalledComfyVersion(engineRoot) {
    const versionPy = getComfyPath(engineRoot, 'comfyui_version.py');
    try {
        const src = await fs.readFile(versionPy, 'utf8');
        const match = src.match(/__version__\s*=\s*["']([^"']+)["']/);
        if (match) return match[1].trim();
        logger.warn('engine', `No __version__ line in ${versionPy} — falling back to the pinned version`);
    } catch (err) {
        logger.warn('engine', `Could not read ${versionPy} (${err.message}) — falling back to the pinned version`);
    }
    return null;
}

async function _runEngineDownload(chosenModelsRoot) {
    const type = 'comfy';
    logger.info('engine', `_runEngineDownload started`);
    try {
        // Before anything is downloaded — a too-deep root cannot finish an install.
        await assertInstallPathDepth();

        logger.info('engine', `Reading system dependencies from ${SYS_DEPS_PATH}`);
        const config = await fs.readJson(SYS_DEPS_PATH);
        logger.info('engine', `System dependencies loaded successfully`);

        // Detect GPU and resolve provisioning method
        const downloadConfig = await resolveDownloadConfig();
        const targetDir = ENGINE_ROOT;

        // ── Pre-calculate combined size (engine + UW deps) ──────────────────────
        // Every custom_node is now universal (MPI-222: no model-specific node class),
        // so the UW set already covers all nodes an engine reinstall must restore.
        const { missingDeps } = await checkUniversalWorkflowDepsStatus();
        const missingDepIds = missingDeps;
        if (missingDeps.length > 0) {
            logger.info('engine', `Calculating size for ${missingDeps.length} UW deps...`);
            const uwDepsTotalBytes = await getUniversalWorkflowDepsTotalSize(missingDeps);
            logger.info('engine', `UW deps total size: ${(uwDepsTotalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
        }

        // ── Provision engine binaries (platform-specific) ───────────────────────
        let uwModelJob = null;
        if (downloadConfig.method === 'uv-bootstrap') {
            ({ uwModelJob } = await _provisionUvEngine(targetDir, missingDepIds, downloadConfig));
        } else {
            const engineInfo = {
                version: config.engine.version,
                filename: downloadConfig.comfy.filename,
                url: downloadConfig.comfy.url,
            };
            ({ uwModelJob } = await _provisionWindowsEngine(targetDir, engineInfo, missingDepIds));
        }

        // ── Finish custom node install (shared) ─────────────────────────────────
        let uwInstallError = null;
        if (uwModelJob) {
            logger.info('engine', 'Engine ready, finishing custom node installation...');
            try {
                await finishCustomNodeInstall(uwModelJob, true);
            } catch (err) {
                logger.error('engine', `Custom node install error: ${err.message}`);
                uwInstallError = err.message;
                // Do NOT re-throw — engine itself is fine; user can repair UW deps later
            }
        }

        // ── Patch (Windows-only run_nvidia_gpu.bat; Linux/mac launch via spawn) ──
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
            // Force UTF-8 so a user running the .bat directly gets the same crash
            // protection as the app spawn (py3.13 cp1252 default — see comfy.js /
            // MPI-118). Idempotent: only insert once.
            if (!content.includes('PYTHONUTF8')) {
                content = await fs.readFile(batPath, 'utf8');
                content = 'set PYTHONUTF8=1\r\n' + content;
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
        // Stamp what ACTUALLY landed, never the pin. Stamping config.engine.version
        // blindly made version drift SELF-CONCEALING: /engine/version-check compares
        // this stamp against COMFY_VERSION, so an unpinned comfy-cli install of
        // 0.29.0 read back as a healthy 0.28.0 forever and no repair was ever
        // offered — while the pinned LTXVideo node had already stopped importing
        // (MPI-419, measured on macOS 2026-07-31). Falling back to the pin keeps a
        // missing version file from failing the whole install, but it logs loudly.
        const INSTALLED_ENGINE_VERSION = (await _readInstalledComfyVersion(targetDir)) || config.engine.version;
        await fs.writeFile(
            path.join(targetDir, '.mpi_engine_version'),
            INSTALLED_ENGINE_VERSION,
            'utf8'
        );
        logger.info('engine', `Version stamp written: ${INSTALLED_ENGINE_VERSION}`);

        // ── 6. Post-install: Write extra_model_paths.yaml ────────────────────────
        // The extract scrub wipes any pre-download /comfy/set-path YAML, so this is
        // the authoritative write for a fresh install. The user's chosen root
        // arrives via the /engine/download body (chosenModelsRoot) — honour it here
        // rather than always reverting to the default, which silently discarded the
        // folder the user picked before pressing Install.
        const extraConfigPath = getComfyPath(targetDir, 'extra_model_paths.yaml');
        const defaultModelsDir = getDefaultModelsRoot();

        if (chosenModelsRoot && chosenModelsRoot.trim()) {
            // Explicit user choice — always write it (absolute, additive extras),
            // overwriting any stale default that survived the scrub.
            const chosenRoot = resolveModelsRoot(chosenModelsRoot);
            await fs.ensureDir(chosenRoot);
            await fs.writeFile(extraConfigPath, buildExtraModelPathsYaml(chosenRoot, await getExtraModelFolders(), defaultModelsDir), 'utf8');
            logger.info('engine', `extra_model_paths.yaml written with chosen root: ${chosenRoot}`);
        } else if (!(await fs.pathExists(extraConfigPath))) {
            // No explicit choice and no surviving YAML — write the env-aware default
            // root (portable launcher sets CUBRIC_MODELS_ROOT=<root>/models). The
            // default lives OUTSIDE the engine folder.
            await fs.ensureDir(defaultModelsDir);
            await fs.writeFile(extraConfigPath, buildExtraModelPathsYaml(defaultModelsDir, await getExtraModelFolders(), defaultModelsDir), 'utf8');
            logger.info('engine', `extra_model_paths.yaml written with default: ${defaultModelsDir}`);
        } else {
            logger.info('engine', `extra_model_paths.yaml already exists, preserving existing configuration`);
        }

        // ── 7. Complete engine (UW deps fully done) ─────────────────────────────
        if (uwInstallError) {
            // MPI-387: carry the real reason (which deps, which phase) instead of a
            // generic "installation failed" — the old wording sent users into a Retry
            // loop against deterministic failures.
            broadcastEngineEvent('engine:error', {
                error: `${uwInstallError}. Press Retry to re-attempt.`
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

    // The pre-download /comfy/set-path YAML lives inside the comfy dir and is
    // wiped by the fresh-install extract scrub, so carry the user's chosen models
    // root through the request body to the post-extract step 6 (see _runEngineDownload).
    const chosenModelsRoot = req.body && typeof req.body.modelsRoot === 'string'
        ? req.body.modelsRoot
        : '';

    res.json({ success: true, status: 'started' }); // respond immediately — NEVER block

    logger.info('engine', `Starting async engine download`);
    _runEngineDownload(chosenModelsRoot).catch(e => {
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

/**
 * Install every universal-workflow dep that is missing or drifted, pre-wiping the
 * drifted node folders first. Shared by /engine/repair-deps and the in-place
 * upgrade path — a core bump usually moves pinned node commits in the same lock
 * change, and that is drift to repair, not a reason to wipe the engine.
 * @returns {Promise<number>} how many deps were (re)installed; 0 = nothing outstanding
 */
async function _installOutstandingUwDeps() {
    const { missingDeps, driftedDeps = [] } = await checkUniversalWorkflowDepsStatus();
    const repairSet = [...new Set([...missingDeps, ...driftedDeps])];
    if (!repairSet.length) return 0;

    // Pre-wipe drifted node folders: startUniversalWorkflowInstall skips folders
    // that already exist (isCompleteOnDisk), so a drifted node (folder PRESENT, wrong
    // commit) would be marked complete and never reinstalled. Removing the folder first
    // forces a clean re-extract at the pinned commit. Missing deps have no folder to wipe.
    if (driftedDeps.length) {
        const { DEPS } = require('../js/data/modelConstants/dependencies.js');
        const customRoot = await getCustomRoot();
        for (const depId of driftedDeps) {
            const dep = DEPS[depId];
            if (!dep) continue;
            const { localPath } = await resolveComfyPath(dep, customRoot, {});
            await fs.remove(localPath);
            logger.info('engine', `pre-wiped drifted node folder: ${depId} (${localPath})`);
        }
    }

    await startUniversalWorkflowInstall(repairSet, true);
    return repairSet.length;
}

router.post('/engine/repair-deps', async (req, res) => {
    logger.info('engine', 'UW deps repair requested');
    res.json({ success: true, status: 'repair-started' });

    try {
        // Same MAX_PATH wall as a fresh install — repair runs the identical pip
        // steps, so tell the user the real reason instead of failing again.
        await assertInstallPathDepth();

        // Refuse to "repair" an engine that was never fully installed. This route
        // only installs custom nodes and their requirements; it never runs
        // `comfy install`, so on a half-provisioned engine it used to broadcast
        // engine:complete over a ComfyUI that cannot boot (no core requirements,
        // no stamp) and leave the user with a success toast and a dead app. The
        // stamp is written only after a successful `comfy install`, so its absence
        // means the engine half is unfinished and the FULL install is the only
        // thing that can fix it. Hand off rather than error: this is the user's
        // only in-app recovery. (MPI-414)
        if (!(await fs.pathExists(path.join(ENGINE_ROOT, '.mpi_engine_version')))) {
            logger.warn('engine', 'Repair requested on an engine with no version stamp — running the full install instead');
            await _runEngineDownload('');
            return;
        }

        if (!(await _installOutstandingUwDeps())) {
            broadcastEngineEvent('engine:uw-installing', { status: 'All dependencies already present' });
        }
        broadcastEngineEvent('engine:complete', { success: true });
    } catch (err) {
        logger.error('engine', `UW deps repair failed: ${err.message}`);
        // MPI-427: "some deps failed" is not the same as "the engine is unusable". The
        // custom nodes are github.com zips and the engineAsset weights are on the model
        // host, so a user who can reach only one of those hosts ends up here with every
        // node installed and only weights outstanding. This runs on the BOOT gate, which
        // releases on engine:complete and NOT on engine:error — so reporting an error
        // here locked such a user out of the app entirely, behind a Retry that failed
        // identically every time. Nodes present = ComfyUI can run; let them in. The
        // failed weights already surface per-dep as a download:failed toast naming the
        // host, so nothing is being hidden.
        let nodesOutstanding = ['unknown'];
        try {
            const { missingDeps, driftedDeps = [] } = await checkUniversalWorkflowDepsStatus();
            const { DEPS } = require('../js/data/modelConstants/dependencies.js');
            nodesOutstanding = [...missingDeps, ...driftedDeps].filter(id => DEPS[id]?.type === 'custom_nodes');
        } catch (statusErr) {
            logger.warn('engine', `Post-failure deps re-check failed (${statusErr.message}) — treating as node-outstanding`);
        }
        if (nodesOutstanding.length) {
            broadcastEngineEvent('engine:error', { error: err.message });
        } else {
            logger.warn('engine', `UW repair finished with weights outstanding but every custom node installed — releasing the boot gate: ${err.message}`);
            broadcastEngineEvent('engine:complete', { success: true, warning: err.message });
        }
    }
});

// ── In-place engine upgrade (MPI-457) ────────────────────────────────────────
// /engine/upgrade used to delete the whole ~11 GB engine tree and re-download the
// ~1 GB portable plus every custom node and pip dep. Measured on the 0.29.2 → 0.30.0
// bump, the real delta was ONE git checkout and THREE pip packages.
//
// Both engine layouts ship ComfyUI as a real git checkout — the Windows portable's
// ComfyUI folder has remote Comfy-Org/ComfyUI at exactly the pinned sha and bundles
// its own update/update.py, and the uv path is a comfy-cli clone — so in-place is the
// mechanism upstream supports, not a hack. The one difference: Comfy's own updater
// pulls master; ours checks out the PINNED sha and never anything else.
//
// The wipe is NOT deleted. It is reached by a DETECTED signal (_fullReinstallReason)
// or by any in-place failure, because a moved portable can only arrive by re-extract.

/**
 * Packages the PORTABLE owns, not pip. A ComfyUI requirement line moving one of
 * these means the portable itself moved, and pip-installing them into the embedded
 * python is exactly the stomp `--no-deps` exists to prevent (shared.js § curated
 * python deps) — so that routes to the full reinstall instead.
 */
const ENGINE_OWNED_PKG = /^(torch|torchvision|torchaudio|triton|nvidia-.+|cuda-.+)$/i;

/**
 * Package name from a requirement spec (`comfy-kitchen==0.2.26` → `comfy-kitchen`),
 * normalised the way pip does — `_` and `-` name the same distribution, so
 * `nvidia_cudnn_cu13` must not slip past a rule written against `nvidia-*`.
 */
function _pkgName(spec) {
    const m = String(spec).match(/^([A-Za-z0-9._-]+)/);
    return m ? m[1].toLowerCase().replace(/_/g, '-') : '';
}

/**
 * Requirement lines present in the target `requirements.txt` but absent from the
 * current one, verbatim so pip gets the exact pin ComfyUI asks for. Comments, blanks
 * and `-r`/`--flag` lines are not installable specs. A line that only DISAPPEARS is
 * ignored on purpose: leaving a spare package installed is harmless, uninstalling one
 * out from under a custom node is not. Pure — unit-tested.
 * @param {string} currentTxt
 * @param {string} targetTxt
 * @returns {string[]}
 */
function changedRequirements(currentTxt, targetTxt) {
    const specs = (txt) => String(txt).split(/\r?\n/)
        .map((l) => l.replace(/\s+#.*$/, '').trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('-'));
    const have = new Set(specs(currentTxt));
    return specs(targetTxt).filter((l) => !have.has(l));
}

/**
 * The first engine-owned package in a changed-requirement set, or null. Pure — unit-tested.
 * @param {string[]} changed
 * @returns {string|null}
 */
function engineOwnedChange(changed) {
    return changed.map(_pkgName).find((n) => ENGINE_OWNED_PKG.test(n)) || null;
}

/**
 * Would ComfyUI actually LOAD this custom_nodes folder? It skips anything ending in
 * `.disabled` — that is upstream's own opt-out, and it is what a node gets renamed to
 * when it is set aside rather than removed. A folder ComfyUI will not import cannot
 * break a generation, so it is never evidence of anything. Pure — unit-tested.
 *
 * Learned the expensive way (MPI-457 proving run): a leftover
 * `ComfyUI-MpiNodes.stale-aaa1d2d9.disabled` on the dev machine carried a real
 * `.mpi_node_commit` marker from when it was a live install, matched no registry id,
 * and sent an 11 GB engine to the wipe.
 * @param {string} folderName
 * @returns {boolean}
 */
function comfyLoadsNodeFolder(folderName) {
    return !/\.disabled$/i.test(folderName);
}

/**
 * A custom-node folder WE installed — it carries the `.mpi_node_commit` marker — that
 * ComfyUI will LOAD and whose name the registry no longer knows. That is a real
 * deprecation, and the in-place path cannot resolve it: a checkout leaves the dead node
 * importing forever. Two things keep this from firing on innocent folders: the marker
 * (a folder the user dropped in by hand has none) and the load check above.
 * @returns {Promise<string|null>} folder name, or null
 */
async function _findDeprecatedNode() {
    const customNodesDir = getComfyPath(ENGINE_ROOT, 'custom_nodes');
    if (!(await fs.pathExists(customNodesDir))) return null;
    const known = new Set(getUniversalWorkflowDeps()
        .filter((d) => d && d.type === 'custom_nodes')
        .map((d) => d.filename));
    for (const entry of await fs.readdir(customNodesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || known.has(entry.name)) continue;
        if (!comfyLoadsNodeFolder(entry.name)) continue;
        if (await fs.pathExists(path.join(customNodesDir, entry.name, NODE_COMMIT_MARKER))) {
            return entry.name;
        }
    }
    return null;
}

/**
 * Why the full wipe-and-redownload is REQUIRED, or null when the engine can move in
 * place. Every signal here is detected on disk — none is assumed from the version
 * numbers. (The engine-owned python/torch signal is detected later, from the target's
 * own requirements.txt, because it is only knowable after the checkout.)
 * @returns {Promise<string|null>}
 */
async function _fullReinstallReason() {
    if (!(await fs.pathExists(getPythonBin(ENGINE_ROOT)))) return 'the engine python is missing';
    if (!(await fs.pathExists(getComfyPath(ENGINE_ROOT, 'comfyui_version.py')))) return 'the ComfyUI tree is incomplete';
    if (!(await fs.pathExists(getComfyPath(ENGINE_ROOT, '.git')))) return 'ComfyUI is not a git checkout';
    const deprecated = await _findDeprecatedNode();
    if (deprecated) return `custom node "${deprecated}" is no longer in the registry`;
    return null;
}

/**
 * Move the installed engine to the pinned version without re-downloading it: fetch,
 * check out the pinned sha, pip-install only the requirement lines that actually
 * changed, restamp `.mpi_engine_version`, then repair any node the same bump drifted.
 * Throws on ANY failure — the caller falls back to the full reinstall. (MPI-457)
 */
async function _upgradeEngineInPlace() {
    const comfyRepo = getComfyPath(ENGINE_ROOT);
    const lock = require('../dev_configs/node_lock.json');
    const targetRef = lock.comfyui?.core?.commit || lock.comfyui?.core?.tag;
    if (!targetRef) throw new Error('node_lock.json has no comfyui.core commit or tag');

    // pip cannot overwrite a binary the running engine has loaded (Windows: WinError 5
    // on cv2.pyd — see shared.js § curated python deps), and git cannot check out files
    // python holds open. Stop it before touching either.
    stopComfyUI();

    const gitPath = await ensureGit({
        onStatus: (status) => broadcastEngineEvent('engine:upgrade-status', { status }),
    });

    const reqPath = path.join(comfyRepo, 'requirements.txt');
    const requirementsBefore = await fs.readFile(reqPath, 'utf8').catch(() => '');

    broadcastEngineEvent('engine:upgrade-status', { status: 'Fetching ComfyUI updates...' });
    await _runStreaming(gitPath, ['fetch', '--tags', 'origin'], { cwd: comfyRepo, stage: 'git fetch' });
    broadcastEngineEvent('engine:upgrade-status', { status: `Switching engine to ${COMFY_VERSION}...` });
    await _runStreaming(gitPath, ['checkout', '--force', targetRef], { cwd: comfyRepo, stage: 'git checkout' });

    // Believe the checkout only when the TREE agrees. Restamping a version the code
    // did not actually move to is the self-concealing drift of MPI-419 — the stamp
    // reads healthy forever while a pinned node has already stopped importing.
    const landed = await _readInstalledComfyVersion(ENGINE_ROOT);
    if (landed !== COMFY_VERSION) {
        throw new Error(`checkout landed on ${landed || 'an unreadable version'}, expected ${COMFY_VERSION}`);
    }

    const changed = changedRequirements(requirementsBefore, await fs.readFile(reqPath, 'utf8'));
    const engineOwned = engineOwnedChange(changed);
    if (engineOwned) {
        throw new Error(`${COMFY_VERSION} moves the engine-owned package "${engineOwned}" — only a full reinstall can deliver it`);
    }
    if (changed.length) {
        broadcastEngineEvent('engine:upgrade-status', { status: `Updating ${changed.length} python package(s)...` });
        logger.info('engine', `In-place upgrade pip set: ${changed.join(' ')}`);
        await runPipCommand(['install', ...changed]);
    } else {
        logger.info('engine', 'In-place upgrade: no requirement line changed — no pip work');
    }

    await fs.writeFile(path.join(ENGINE_ROOT, '.mpi_engine_version'), landed, 'utf8');
    logger.info('engine', `In-place upgrade landed ${landed}; version stamp written`);

    broadcastEngineEvent('engine:upgrade-status', { status: 'Checking custom nodes...' });
    const repaired = await _installOutstandingUwDeps();
    if (repaired) logger.info('engine', `In-place upgrade repaired ${repaired} outstanding dep(s)`);
}

/**
 * The original upgrade: preserve the models root, wipe the portable tree, download
 * and reinstall everything. Still the only path that can deliver a moved portable.
 */
async function _fullEngineReinstall() {
    const portableDir = path.join(ENGINE_ROOT, COMFY_DIR);
    // Migrate legacy in-engine models to the env-aware default root (portable
    // launcher sets CUBRIC_MODELS_ROOT=<root>/models), NOT a stray mpi_models.
    const defaultModelsDir = getDefaultModelsRoot();
    const extraConfigPath = getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml');

    // 1. Check if models are inside engine (legacy user)
    const hasCustomRoot = await fs.pathExists(extraConfigPath);
    // Capture the user's configured models root from the existing YAML BEFORE
    // wiping the engine — step 2 removes the YAML and the fresh-install extract
    // scrubs it, so without this the upgrade silently resets the path to the
    // default mpi_models (user's D:\CubricModels etc. is lost → 0 models → no
    // prompt box). getCustomRoot returns null if no custom YAML exists. (MPI-118)
    const preservedRoot = await getCustomRoot();
    if (!hasCustomRoot) {
        broadcastEngineEvent('engine:upgrade-status', { status: 'Moving models to safe location...' });
        const defaultModels = getComfyPath(ENGINE_ROOT, 'models');
        if (await fs.pathExists(defaultModels)) {
            logger.info('engine', `Migrating legacy models from engine to ${defaultModelsDir}`);
            await fs.move(defaultModels, defaultModelsDir, { overwrite: false });
        }
    }

    // 2. Wipe old engine (models are safe now).
    //
    // Stop ComfyUI FIRST. A running engine holds its own working directory open, so
    // `rmdir` on it returns EBUSY — and by then the recursive delete has already taken
    // out whatever it reached before the lock. Measured on the MPI-457 proving run: the
    // portable's `update/` folder and every `.bat` launcher were gone, the error was
    // `EBUSY: resource busy or locked, rmdir '...\ComfyUI'`, and what was left was a
    // half-deleted engine plus an error toast. A wipe that cannot finish must not start.
    // (The in-place path already stopped it; this is the other branch.)
    broadcastEngineEvent('engine:upgrade-status', { status: 'Removing old engine...' });
    stopComfyUI();
    logger.info('engine', 'Removing old ComfyUI portable');
    // Retries cover the gap between "process asked to stop" and "Windows released the
    // handles", which is not instant and has no event to wait on.
    await fs.rm(portableDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });

    // 3. Download + install new version (SSE reports progress). Pass the preserved
    // models root so the post-extract step 6 re-writes the YAML with the user's path
    // instead of falling back to the default.
    if (preservedRoot) logger.info('engine', `Preserving custom models root across upgrade: ${preservedRoot}`);
    await _runEngineDownload(preservedRoot || undefined);
}

router.post('/engine/upgrade', async (req, res) => {
    // `mode` forces a path for testing/recovery; 'auto' (the default) decides. (MPI-457)
    const mode = (req.body && req.body.mode) || 'auto';
    // Respond immediately — every phase below is long and the frontend listens on SSE.
    res.json({ success: true, status: 'upgrade-started' });

    try {
        let wipeReason = mode === 'full' ? 'a full reinstall was requested' : await _fullReinstallReason();

        if (!wipeReason) {
            try {
                logger.info('engine', `Upgrading engine in place to ${COMFY_VERSION}`);
                await _upgradeEngineInPlace();
                processState.comfyNeedsRestart = false;
                broadcastEngineEvent('engine:complete', { success: true });
                return;
            } catch (err) {
                if (mode === 'in-place') throw err;   // caller opted out of the fallback
                // The wipe is the backstop for everything in-place cannot do — a moved
                // portable, a tree that will not check out, a node that will not repair.
                wipeReason = `the in-place upgrade failed (${err.message})`;
            }
        }

        logger.warn('engine', `Full engine reinstall — ${wipeReason}`);
        await _fullEngineReinstall();
    } catch (e) {
        logger.error('system', 'Engine upgrade failed', e);
        broadcastEngineEvent('engine:error', { error: e.message });
    }
});

module.exports = router;
module.exports.installPathDepthError = installPathDepthError; // MPI-387 — exported for unit test
module.exports.changedRequirements = changedRequirements;     // MPI-457 — exported for unit test
module.exports.engineOwnedChange = engineOwnedChange;         // MPI-457 — exported for unit test
module.exports.comfyLoadsNodeFolder = comfyLoadsNodeFolder;   // MPI-457 — exported for unit test
