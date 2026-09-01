/**
 * routes/shared.js — Shared state and utilities used across multiple route modules.
 *
 * RULES FOR AGENTS:
 * - All cross-cutting server concerns live here (download helper, process refs, path resolver).
 * - Do not copy these into route files — import them.
 * - Process state is exported as a mutable object so all modules share the same reference.
 */

'use strict';

const fs     = require('fs-extra');
const path   = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');
const logger = require('./logger');
const { isCompleteOnDisk, isNodeInstalledOnDisk } = require('./downloadCompletion');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const { exec, spawn } = require('child_process');
const { COMFY_DIR, getPythonBin, getComfyPath, getEngineRoot } = require('./platformEngine');
const { buildExtraModelPathsYaml } = require('./yamlHelper');

const _require = createRequire(__filename);

const ENGINE_ROOT = getEngineRoot();
const EXTRA_MODEL_FOLDER_KEYS = Object.freeze(['loras', 'upscale_models']);

/**
 * Resolve the default projects root.
 * Priority:
 *   1. .engine-config.json `projectsPath` (worktree share — opt-in)
 *   2. APP_DOCUMENTS env (set by main.js → app.getPath('documents'))
 *      → <Documents>/Cubric Vision/Projects
 *   3. Dev fallback: <repo>/projects
 *
 * Cross-platform: app.getPath('documents') resolves the OS-native Documents
 * folder on Win / macOS / Linux. path.join handles spaces.
 */
function getProjectsRoot() {
    try {
        const configPath = path.join(__dirname, '..', '.engine-config.json');
        if (fs.existsSync(configPath)) {
            const cfg = _require(configPath);
            if (cfg && cfg.projectsPath && fs.existsSync(cfg.projectsPath)) {
                return cfg.projectsPath;
            }
        }
    } catch (_) { /* fall through */ }

    if (process.env.APP_DOCUMENTS) {
        return path.join(process.env.APP_DOCUMENTS, 'Cubric Vision', 'Projects');
    }
    return path.join(__dirname, '..', 'projects');
}

/**
 * Resolve the durable project-paths registry file. Lives next to the default
 * projects root so it survives portable-folder deletion / reinstall, the same
 * way the default Documents projects do.
 *   - Portable / packaged: <Documents>/Cubric Vision/project-paths.json
 *   - Dev fallback: <repo>/project-paths.json
 *
 * This registry is the durable store for *external* project parent dirs the
 * user added. localStorage on the renderer is treated as a cache that
 * self-heals from this file (see routes/projects.js list-projects).
 */
function getProjectPathsRegistryFile() {
    if (process.env.APP_DOCUMENTS) {
        return path.join(process.env.APP_DOCUMENTS, 'Cubric Vision', 'project-paths.json');
    }
    return path.join(__dirname, '..', 'project-paths.json');
}

const _registryQueue = { p: Promise.resolve() };

/** Read the registry. Returns a de-duped array of normalized parent dirs. */
async function readProjectPathsRegistry() {
    try {
        const file = getProjectPathsRegistryFile();
        if (!(await fs.pathExists(file))) return [];
        const data = await fs.readJson(file);
        const list = Array.isArray(data?.paths) ? data.paths : [];
        return [...new Set(list.map(p => String(p).replace(/\\/g, '/')))];
    } catch (err) {
        logger.warn('project', `project-paths registry read failed: ${err.message}`);
        return [];
    }
}

/** Atomically replace the registry contents with the given paths. */
async function writeProjectPathsRegistry(paths) {
    const normalized = [...new Set((paths || []).map(p => String(p).replace(/\\/g, '/')))];
    const run = _registryQueue.p.catch(() => {}).then(async () => {
        const file = getProjectPathsRegistryFile();
        await fs.ensureDir(path.dirname(file));
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, `${JSON.stringify({ paths: normalized }, null, 2)}\n`, 'utf8');
        await fs.rename(tmp, file);
        return normalized;
    });
    _registryQueue.p = run.catch(() => {});
    return run;
}

/** Add one parent dir to the registry. Returns the updated list. */
async function addProjectPathToRegistry(parentDir) {
    const norm = String(parentDir).replace(/\\/g, '/');
    const current = await readProjectPathsRegistry();
    if (current.includes(norm)) return current;
    return writeProjectPathsRegistry([...current, norm]);
}

/** Remove one parent dir from the registry. Returns the updated list. */
async function removeProjectPathFromRegistry(parentDir) {
    const norm = String(parentDir).replace(/\\/g, '/');
    const current = await readProjectPathsRegistry();
    if (!current.includes(norm)) return current;
    return writeProjectPathsRegistry(current.filter(p => p !== norm));
}
const SYS_DEPS_PATH = path.join(__dirname, '..', 'dev_configs', 'system_dependencies.json');
// NOT 8188 (MPI-434). 8188 is ComfyUI's own default, so any user with their own
// ComfyUI install is already sitting on it — and our readiness check only asks
// whether ANYTHING answers on this port, so we adopted the stranger and dispatched
// into an engine with none of our custom nodes. Every generation then died with
// "Node 'Input_Seed' not found" (MpiInt, from ComfyUI-MpiNodes), which reads as a
// broken install. 48188 is below the Windows ephemeral floor (49152) and is not
// where a hand-run second ComfyUI lands (8189/8190/8288 all are). Do not "tidy"
// this back to the default. THREE other files carry this port as a literal and must
// change with it — js/services/comfyController.js (serverAddress), js/shell/memoryOps.js,
// and main.js (the Origin spoof; missing that one 403s every ComfyUI call).
// tests/comfy-port-lockstep.test.cjs enforces the agreement.
const COMFYUI_PORT = 48188;

// ── Process State ─────────────────────────────────────────────────────────────
// Mutable shared state — all route modules reference the same object.

const processState = {
    activeComfyProcess: null,
    comfyNeedsRestart: false,
    // MPI-415: why the engine child last died, so a crash can be REPORTED instead of
    // waited out. The readiness poll used to watch only for "ready" and never for
    // "gone", so a process that died in under a second still cost the user the full
    // timeout and then blamed the clock ("failed to become ready in time") — the
    // actual traceback only ever reached app.log. Shape:
    //   { code, signal, at, deliberate, tail: [...last output lines] }
    lastComfyExit: null,
    // Set while WE are killing it, so a user-initiated Stop is not reported as a crash.
    comfyStopRequested: false,
    // MPI-673: why the curated pip pass failed on the start that spawned the engine
    // we are serving, or null when it succeeded. The engine comes up DEGRADED after a
    // failure (custom nodes fail to import) but reports `success: true`, so the reason
    // has to outlive the /comfy/start response — a UI that reloaded, or one that never
    // made that request, still has to learn the engine cannot run a graph. Echoed on
    // /comfy/status. A failed pass stamps no marker, so the next spawn retries and
    // clears this by writing null.
    lastDepsWarning: null,
    // MPI-674: node packs the engine we spawned reported as failing to import, read
    // from its own stdout (routes/comfy.js `_scanForImportFailures`). This is the half
    // `lastDepsWarning` cannot cover: the curated pass is marker-gated, so once a pass
    // HAS stamped its marker a later loss of those packages skips reinstall silently
    // and the pip pass reports nothing to fail. The packs still do not import, and this
    // is the only place that says so. Reset on every fresh spawn.
    comfyImportFailures: [],
};

function stopComfyUI() {
    if (processState.activeComfyProcess) {
        logger.info('comfy', 'Killing active ComfyUI process...');
        processState.comfyStopRequested = true;
        processState.activeComfyProcess.kill('SIGKILL');
        processState.activeComfyProcess = null;
    }
}

// Ensure child processes die if the node server shuts down
['exit', 'SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        if (processState.activeComfyProcess) processState.activeComfyProcess.kill('SIGKILL');
        if (signal !== 'exit') process.exit();
    });
});

// ── Download Helper ───────────────────────────────────────────────────────────

/**
 * Memory-efficient streaming download with redirect support.
 * Bypasses native fetch/undici buffering to ensure near-zero RAM footprint.
 *
 * NOTE: For managed model/engine downloads (cancel, sha256, progress wiring),
 * use FileDownloader from downloadManager.js instead. This is for simple
 * one-shot downloads.
 */
function streamDownload(url, localPath, onProgress) {
    const request = (targetUrl) => {
        return new Promise((resolve, reject) => {
            const protocol = targetUrl.startsWith('https') ? https : http;
            protocol.get(targetUrl, { headers: { 'User-Agent': 'CubricVision/1.0' } }, async (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const nextUrl = new URL(response.headers.location, targetUrl).href;
                    resolve(request(nextUrl));
                    return;
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                }
                try {
                    const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
                    let downloadedBytes = 0;
                    let lastReportTime = Date.now();
                    let lastReportedBytes = 0;

                    // Track progress if callback provided
                    if (onProgress) {
                        response.on('data', (chunk) => {
                            downloadedBytes += chunk.length;
                            const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

                            // Calculate speed every 500ms to avoid excessive updates
                            const now = Date.now();
                            const timeDeltaMs = now - lastReportTime;
                            if (timeDeltaMs >= 500) {
                                const bytesDelta = downloadedBytes - lastReportedBytes;
                                const speedBytesPerSec = (bytesDelta / timeDeltaMs) * 1000;
                                const speed = _formatSpeed(speedBytesPerSec);

                                lastReportTime = now;
                                lastReportedBytes = downloadedBytes;

                                onProgress({ progress, downloadedBytes, totalBytes, speed });
                            }
                        });
                    }

                    const writer = fs.createWriteStream(localPath);
                    await pipeline(response, writer);
                    resolve(localPath);
                } catch (err) {
                    fs.remove(localPath).catch(() => {});
                    reject(err);
                }
            }).on('error', (err) => {
                fs.remove(localPath).catch(() => {});
                reject(err);
            });
        });
    };
    return request(url);
}

/**
 * Strip ComfyUI provenance metadata from a saved PNG in place.
 *
 * ComfyUI's SaveImage writes the entire API graph into a `tEXt` chunk keyed
 * `prompt` (plus `workflow` when the browser UI saves), so every output image
 * we hand the user leaks the full node graph, prompts and model names. We drop
 * every text/EXIF chunk instead of re-encoding through Sharp: the pixel bytes
 * stay bit-identical (a Sharp round-trip re-compresses and typically GROWS the
 * file) and it costs ~0ms.
 *
 * Non-PNG files and unreadable/malformed inputs are left untouched — this is a
 * privacy scrub, never a reason to fail a save.
 */
async function stripImageMetadata(localPath) {
    if (!/\.png$/i.test(localPath)) return;
    try {
        const buf = await fs.readFile(localPath);
        // PNG signature guard — bail on anything that isn't really a PNG.
        if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return;

        const STRIP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf']);
        const keep = [buf.subarray(0, 8)];
        let stripped = false;
        let offset = 8;
        while (offset + 12 <= buf.length) {
            const length = buf.readUInt32BE(offset);
            const type = buf.toString('latin1', offset + 4, offset + 8);
            const end = offset + 12 + length;
            if (end > buf.length) return; // truncated/corrupt — leave the file alone
            if (STRIP.has(type)) stripped = true;
            else keep.push(buf.subarray(offset, end));
            offset = end;
            if (type === 'IEND') break;
        }
        if (!stripped) return;
        await fs.writeFile(localPath, Buffer.concat(keep));
    } catch (err) {
        logger.warn('project', `metadata strip failed for ${localPath}: ${err.message}`);
    }
}

// Format bytes/second to human-readable speed (e.g., "2.5 MB/s")
function _formatSpeed(bytesPerSec) {
    if (bytesPerSec < 1024) {
        return `${Math.round(bytesPerSec)} B/s`;
    } else if (bytesPerSec < 1024 * 1024) {
        return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    } else {
        return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
    }
}

// ── ComfyUI Helpers ───────────────────────────────────────────────────────────

/**
 * Executes a pip command using the embedded Python environment.
 */
async function runPipCommand(args) {
    const pythonPath = getPythonBin(ENGINE_ROOT);
    if (!(await fs.pathExists(pythonPath))) {
        throw new Error('Embedded Python not found. Cannot run pip.');
    }
    logger.info('system', `Running: python -m pip ${args.join(' ')}`);
    return new Promise((resolve, reject) => {
        const pip = spawn(pythonPath, ['-m', 'pip', ...args]);
        pip.stdout.on('data', (data) => logger.info('system', `[pip] ${data.toString().trim()}`));
        pip.stderr.on('data', (data) => logger.warn('system', `[pip-err] ${data.toString().trim()}`));
        pip.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Pip command failed with code ${code}`));
        });
    });
}

// ── Curated Python dependency set (MPI-413) ───────────────────────────────────
// The engine installs the set WE chose, in ONE pass, instead of letting each custom
// node resolve its own requirements.txt on the user's machine. That old shape meant 13
// separate pip resolves re-deriving the same shared graph (measured on a warm-cache
// macOS install: 400 "Requirement already satisfied" lines, numpy re-resolved 18x,
// torch 10x, and 4 packages installed then uninstalled and replaced), with whichever
// node ran last deciding the version of every shared library.
//
// `--no-deps` is load-bearing, not an optimisation. python_deps.txt is the complete
// resolved closure MINUS the engine-owned torch stack and the duplicate cv2 builds, so:
//   - torch, triton, the nvidia-* wheels and cuda-toolkit CANNOT be touched by this
//     install. They are not in the file, and without --deps pip would re-derive them
//     from diffusers/ultralytics/kornia and stomp the +cpu or +cu130 build the engine
//     deliberately placed (MPI-413 Evidence A: several GB of CUDA wheels on a CPU-only
//     Linux box with no NVIDIA driver).
//   - the three transitive opencv variants stay out, so `import cv2` is not decided by
//     whichever pip ran last.
// Regenerate the file with `node scripts/compile-node-deps.mjs`; see dev_configs/python_deps.in.
//
// MPI-459 — WHY THIS LIVES HERE AND NOT IN THE INSTALL PATH. The pass used to run from
// `_runCustomNodeInstall` (routes/downloadManager.js), i.e. mid-model-install, with no
// regard for whether the engine process was up. The moment a release MOVES a pin, pip
// must REPLACE a package the running ComfyUI has already imported — and Windows refuses
// to overwrite a loaded binary: `OSError [WinError 5] Access is denied` on
// python_embeded/Lib/site-packages/cv2/cv2.pyd, pip exits 1, the model install reports
// `Download Failed`. It never self-heals: the marker is stamped only on success, so every
// later install repeats it identically while the engine runs (a fresh engine is immune —
// cv2.pyd does not exist yet, so nothing is locked). The only place the engine is provably
// DOWN is `/comfy/start`, just before the spawn, and that is now the sole caller. Nothing
// is later for the deps: a custom-node install already requires a restart before the nodes
// register (`comfyNeedsRestart` → the gen gate's stop+start), so they land on exactly the
// boot that first loads the nodes needing them.
const PYTHON_DEPS_PATH = path.join(__dirname, '..', 'dev_configs', 'python_deps.txt');

/**
 * Install the curated set once per engine, gated on a content-hash marker so an engine
 * that already has it is a no-op and one that predates it (or drifted) self-heals.
 * Throws on failure: a node whose deps are missing fails to import, and this is the
 * only step that installs them. Call ONLY with the engine process down.
 */
/**
 * Where the curated-deps marker lives: NEXT TO THE INTERPRETER it describes, never at
 * the engine root.
 *
 * The marker is a claim about site-packages, so it has to share that directory's fate.
 * At ENGINE_ROOT it did not: `/engine/upgrade`'s full reinstall removes
 * `<root>/<COMFY_DIR>` — which on Windows CONTAINS `python_embeded/Lib/site-packages` —
 * while the marker one level up survived. The next `/comfy/start` read a matching hash,
 * skipped the install, and ComfyUI came up with `No module named 'cv2'` / `'pywt'`:
 * comfyui_controlnet_aux, RES4LYF, both Impact packs and LTXVideo all IMPORT FAILED,
 * 17 shipped `class_type`s gone, no error shown to the user. Measured on the MPI-457
 * proving run, 2026-08-07 — and the wipe was the ONLY upgrade path before that card.
 *
 * Anchoring on `getPythonBin` gets both platforms right for the same reason rather than
 * by coincidence: on Windows it resolves inside the portable, so a wipe takes the marker
 * with site-packages; on Linux/macOS it resolves into the `comfy-venv` sibling, which a
 * wipe does NOT remove — and there the deps really do survive, so the marker should too.
 * @returns {string}
 */
function curatedDepsMarkerPath() {
    return path.join(path.dirname(getPythonBin(ENGINE_ROOT)), '.cubric_python_deps');
}

async function ensureCuratedPythonDeps() {
    if (!(await fs.pathExists(PYTHON_DEPS_PATH))) {
        throw new Error(`curated python deps missing at ${PYTHON_DEPS_PATH} — the build is incomplete`);
    }
    const contents = await fs.readFile(PYTHON_DEPS_PATH);
    const hash = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 16);
    const markerPath = curatedDepsMarkerPath();

    try {
        if ((await fs.readFile(markerPath, 'utf8')).trim() === hash) {
            logger.info('download', `curated python deps already installed (${hash})`);
            return;
        }
    } catch { /* no marker, or unreadable — install */ }

    logger.info('download', `installing curated python deps (${hash}) in one pass`);
    await runPipCommand(['install', '-r', PYTHON_DEPS_PATH, '--no-deps', '--no-warn-script-location']);
    await fs.writeFile(markerPath, `${hash}\n`);
    logger.info('download', `curated python deps installed, marker stamped (${hash})`);
}

/**
 * Executes a custom command (e.g. `python install.py`) in a specified working directory.
 * Automatically replaces `python` with the embedded Python path.
 */
async function runCustomCommand(commandStr, cwd) {
    const pythonPath = getPythonBin(ENGINE_ROOT);
    const parts = commandStr.split(' ');
    const exe = parts[0].toLowerCase() === 'python' ? pythonPath : parts[0];
    const args = parts.slice(1);
    logger.info('system', `Running custom command: ${commandStr} (cwd: ${cwd})`);
    return new Promise((resolve, reject) => {
        const proc = spawn(exe, args, { cwd });
        proc.stdout.on('data', (d) => logger.info('system', `[custom-cmd] ${d.toString().trim()}`));
        proc.stderr.on('data', (d) => logger.warn('system', `[custom-cmd-err] ${d.toString().trim()}`));
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Custom command "${commandStr}" failed with exit code ${code}`));
        });
    });
}

/**
 * Recursively search for a filename within a directory.
 */
async function findFileRecursive(dir, filename) {
    if (!(await fs.pathExists(dir))) return null;
    const files = await fs.readdir(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            const found = await findFileRecursive(fullPath, filename);
            if (found) return found;
        } else if (file === filename && await isCompleteOnDisk(fullPath)) {
            return fullPath;
        }
    }
    return null;
}

/**
 * Helper to resolve the absolute path for a ComfyUI asset.
 * Handles internal engine paths vs custom external roots.
 */
async function resolveComfyPath(dep, customRoot, config) {
    const isCustomNode = dep.type === 'custom_nodes';
    let localPath;

    // MPI-222: a weight whose consuming node HARD-CODES an in-folder scan path
    // (e.g. RIFE VFI reads only <node>/ckpts/rife/) can't live under mpi_models/ —
    // the node never looks there. `targetPath` pins such a weight to a dir under the
    // ComfyUI repo root (custom_nodes/...), bypassing the type->subdir mapping. It is
    // always anchored on the engine (never the user's custom models root, which only
    // holds mpi_models weights). filename is the bare basename here.
    if (dep.targetPath) {
        localPath = getComfyPath(ENGINE_ROOT, ...dep.targetPath.split(/[\\/]+/), dep.filename || '');
        return { localPath, isCustomNode };
    }

    if (customRoot && !isCustomNode) {
        const directPath = path.join(customRoot, dep.filename || '');
        if (dep.filename && await isCompleteOnDisk(directPath)) {
            localPath = directPath;
        } else if (dep.filename) {
            const baseFilename = path.basename(dep.filename);
            const found = await findFileRecursive(customRoot, baseFilename);
            if (found) {
                localPath = found;
            } else {
                // Not in the custom root — fall back to the default root, which the
                // YAML keeps searchable. A dep the engine installed under the default
                // mpi_models must resolve to that existing file (so status checks see
                // it as installed) rather than a phantom path under the custom root.
                // For a brand-new download neither exists, so this returns directPath
                // under the custom root and the file lands there as intended.
                const defaultPath = path.join(getDefaultModelsRoot(), dep.filename);
                localPath = (await isCompleteOnDisk(defaultPath)) ? defaultPath : directPath;
            }
        } else {
            localPath = customRoot;
        }
    } else {
        let baseDir;
        if (isCustomNode) {
            baseDir = config.local_custom_nodes_path
                ? config.local_custom_nodes_path
                : getComfyPath(ENGINE_ROOT, 'custom_nodes');
        } else {
            baseDir = config.local_models_path
                ? config.local_models_path
                : getDefaultModelsRoot();
        }
        localPath = path.join(baseDir, dep.filename || '');
    }

    return { localPath, isCustomNode };
}

/**
 * Clean empty parent directories after file deletion.
 */
async function cleanEmptyDirs(filePath, stopAt) {
    let dir = path.dirname(filePath);
    while (dir.length > stopAt.length && dir.startsWith(stopAt)) {
        try {
            const files = await fs.readdir(dir);
            if (files.length === 0) {
                await fs.remove(dir);
                dir = path.dirname(dir);
            } else {
                break;
            }
        } catch (e) {
            break;
        }
    }
}

/**
 * Helper: read the custom ComfyUI models root from extra_model_paths.yaml if present.
 */
async function getCustomRoot() {
    const extraConfigPath = getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml');
    if (await fs.pathExists(extraConfigPath)) {
        const content = await fs.readFile(extraConfigPath, 'utf8');
        // Match both formats: "base_path: value" and "base_path: value" (quoted or unquoted)
        const match = content.match(/base_path:\s*([^\n]+)/i);
        if (match) {
            let value = match[1].trim();
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            return value;
        }
    }
    return null;
}

function getDefaultModelsRoot() {
    if (process.env.CUBRIC_MODELS_ROOT) {
        return path.resolve(process.env.CUBRIC_MODELS_ROOT);
    }
    return path.join(ENGINE_ROOT, 'mpi_models');
}

/**
 * Resolve a user/UI-supplied models-root path to an absolute path.
 *
 * The path stored in extra_model_paths.yaml MUST be absolute: Cubric resolves it
 * against the server cwd while ComfyUI resolves it against its own dir, so a
 * relative value lands in two different folders (model installed but invisible to
 * generation). Empty input falls back to the default models root. Relative input
 * is anchored on ENGINE_ROOT (so legacy "engine/mpi_models" → "<root>/engine/mpi_models").
 *
 * @param {string|null|undefined} input
 * @returns {string} absolute models root
 */
function resolveModelsRoot(input) {
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed) return getDefaultModelsRoot();
    if (path.isAbsolute(trimmed)) return path.resolve(trimmed);
    // Legacy relative defaults like "engine/mpi_models/" were authored assuming
    // cwd === repo root. Anchor on the portable root (parent of ENGINE_ROOT) so
    // "engine/mpi_models" maps to the same place in dev and portable.
    return path.resolve(path.dirname(ENGINE_ROOT), trimmed);
}

function getExtraModelFoldersPath() {
    return getComfyPath(ENGINE_ROOT, 'extra_model_folders.json');
}

function _emptyExtraModelFolders() {
    return { loras: [], upscale_models: [] };
}

function hasExtraModelFolders(extras) {
    return EXTRA_MODEL_FOLDER_KEYS.some(key => Array.isArray(extras?.[key]) && extras[key].length > 0);
}

async function _normalizeExtraFolderPath(folderPath, validateExists) {
    if (typeof folderPath !== 'string' || !folderPath.trim()) return null;
    const resolved = path.resolve(folderPath.trim());
    if (validateExists) {
        const stat = await fs.stat(resolved).catch(() => null);
        if (!stat || !stat.isDirectory()) {
            throw new Error(`Extra model folder does not exist: ${folderPath}`);
        }
    }
    // .native, NOT plain realpath (MPI-444). `fs` here is fs-extra, whose realpath
    // comes from graceful-fs's JS reimplementation — it resolves symlinks but leaves
    // an 8.3 short name untouched (measured: C:/PROGRA~1 -> C:\PROGRA~1, where
    // realpath.native and node:fs/promises both give C:\Program Files). A canonicaliser
    // that returns two spellings of one folder defeats the lowercase dedupe below, so
    // the same folder can be added twice. Short names reach here whenever a path comes
    // from %TEMP% under a >8-char username — which is every Windows CI runner.
    return fs.realpath.native(resolved).catch(() => resolved);
}

async function normalizeExtraModelFolders(input = {}, { validateExists = false } = {}) {
    const normalized = _emptyExtraModelFolders();
    for (const key of EXTRA_MODEL_FOLDER_KEYS) {
        const seen = new Set();
        const values = Array.isArray(input[key]) ? input[key] : [];
        for (const value of values) {
            const resolved = await _normalizeExtraFolderPath(value, validateExists);
            if (!resolved) continue;
            const dedupeKey = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            normalized[key].push(resolved);
        }
    }
    return normalized;
}

async function getExtraModelFolders() {
    const configPath = getExtraModelFoldersPath();
    if (!(await fs.pathExists(configPath))) return _emptyExtraModelFolders();
    try {
        const raw = await fs.readJson(configPath);
        return normalizeExtraModelFolders(raw, { validateExists: false });
    } catch (err) {
        logger.warn('comfy', `Failed to read extra model folders config: ${err.message}`);
        return _emptyExtraModelFolders();
    }
}

async function setExtraModelFolders(input = {}) {
    const normalized = await normalizeExtraModelFolders(input, { validateExists: true });
    const configPath = getExtraModelFoldersPath();
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, normalized, { spaces: 2 });
    return normalized;
}

async function writeExtraModelPathsYaml(primaryRoot, extras = null) {
    const root = primaryRoot || getDefaultModelsRoot();
    const normalizedExtras = extras || await getExtraModelFolders();
    const extraConfigPath = getComfyPath(ENGINE_ROOT, 'extra_model_paths.yaml');
    await fs.ensureDir(path.dirname(extraConfigPath));
    await fs.writeFile(extraConfigPath, buildExtraModelPathsYaml(root, normalizedExtras, getDefaultModelsRoot()), 'utf8');
    return extraConfigPath;
}

/**
 * Marker filename stamped into a custom_node folder recording WHICH pinned commit
 * was installed. Mirrors the engine's `.mpi_engine_version` precedent
 * (routes/engine.js). A missing/mismatched marker = drift (MPI-222).
 */
const NODE_COMMIT_MARKER = '.mpi_node_commit';

/**
 * The pinned commit for a locked custom_node, read straight from the node-lock
 * (the same single source of truth `lockUrl()` builds URLs from). Returns null
 * for a node that is not commit-pinned (registry/tag source) or not in the lock —
 * such nodes have no stable commit to diff, so they never drift-check.
 * @param {string} depId dependencies.js id === node_lock key
 * @returns {string|null} 40-char SHA or null
 */
function getPinnedNodeCommit(depId) {
    const nodeLock = _require('../dev_configs/node_lock.json');
    const e = nodeLock.nodes?.[depId];
    return e && e.source === 'git-commit' ? e.commit : null;
}

/**
 * Stamp the pinned-commit marker into an installed node folder. Trimmed UTF-8,
 * same shape as `.mpi_engine_version`. No-op (returns false) when the node has no
 * pinned commit — nothing to record.
 * @param {string} nodeFolder absolute path to the installed custom_node folder
 * @param {string} depId dependencies.js id
 * @returns {Promise<boolean>} true if a marker was written
 */
async function writeNodeCommitMarker(nodeFolder, depId) {
    const commit = getPinnedNodeCommit(depId);
    if (!commit) return false;
    await fs.writeFile(path.join(nodeFolder, NODE_COMMIT_MARKER), commit.trim(), 'utf8');
    return true;
}

/**
 * Returns all DEPS ids that install WITH the engine and are never GC'd with a model:
 * every custom_node (all nodes are universal — MPI-222) plus the engine WEIGHTS flagged
 * `engineAsset: true` (upscalers, detector/SAM models). These cover all universal workflow
 * dependencies — no need to track them per-workflow.
 */
function getUniversalWorkflowDepIds() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    return Object.entries(DEPS)
        .filter(([, dep]) => dep.type === 'custom_nodes' || dep.engineAsset === true)
        .map(([id]) => id);
}

/**
 * The same set as `getUniversalWorkflowDepIds()` but as DEP OBJECTS. MPI-438 needs the
 * objects, not the ids: the REMOTE side has to read `type` / `filename` / `url` and ask
 * `_isImageResident` which of them the Pod image already bakes.
 */
function getUniversalWorkflowDeps() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    return getUniversalWorkflowDepIds().map((id) => DEPS[id]);
}

/**
 * Checks which universal workflow dependencies are missing OR drifted on disk.
 * Missing = folder absent. Drifted = custom_node folder present but its stamped
 * `.mpi_node_commit` marker does not match the node_lock pinned commit (MPI-222) —
 * i.e. a node bump left an old install in place. Both route to the same boot-repair
 * ladder (repair-deps pre-wipes drifted folders, then reinstalls at the pinned commit).
 * Returns { needsDepsInstall, missingDeps, driftedDeps }.
 *
 * Uses resolveComfyPath so custom root and type→subdir mapping are respected.
 */
async function checkUniversalWorkflowDepsStatus() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const customRoot = await getCustomRoot();
    const config = {};
    const depIds = getUniversalWorkflowDepIds();
    const missing = [];
    const drifted = [];

    for (const depId of depIds) {
        const dep = DEPS[depId];
        if (!dep) {
            logger.warn('comfy', `checkUniversalWorkflowDepsStatus: unknown dep id "${depId}"`);
            continue;
        }
        const { localPath } = await resolveComfyPath(dep, customRoot, config);
        // MPI-387 F1: a custom_nodes folder can exist as a weight-only shell (a
        // `targetPath` weight lands under it before the node extracts), so pathExists
        // alone reads a never-installed node as present. A commit-pinned node was
        // rescued by the drift check below (no marker → drifted → re-extract); an
        // UNPINNED one was silently skipped forever.
        const present = dep.type === 'custom_nodes'
            ? await isNodeInstalledOnDisk(localPath)
            : await fs.pathExists(localPath);
        if (!present) {
            missing.push(depId);
            continue;
        }
        // Folder present — for a commit-pinned custom_node, check the marker for drift.
        if (dep.type === 'custom_nodes') {
            // NOTE: ComfyUI-MpiNodes has NO dev-mode escape hatch (it had one until the
            // junction below it was removed). Live node editing happens on the standalone
            // authoring bench, which keeps its own symlink to the node repo; the app engine
            // is a USER REPLICA and tracks the pin like every other node, on a dev run too.
            // That is the point: a node change that was not committed, pushed and pinned
            // fails here exactly as it would for a user, instead of passing on dev only.
            const pinned = getPinnedNodeCommit(depId);
            if (pinned) {
                let installed = null;
                try {
                    installed = (await fs.readFile(path.join(localPath, NODE_COMMIT_MARKER), 'utf8')).trim();
                } catch { /* marker absent = pre-MPI-222 install → treat as drifted */ }
                if (installed !== pinned) {
                    drifted.push(depId);
                    logger.info('comfy', `node drift: ${depId} installed=${installed ?? 'none'} pinned=${pinned}`);
                }
            }
        }
    }

    return {
        needsDepsInstall: missing.length > 0 || drifted.length > 0,
        missingDeps: missing,
        driftedDeps: drifted,
    };
}

/**
 * Calculates total size in bytes for all missing universal workflow dependencies.
 * Returns the sum of dep file sizes. Falls back to registry size string if HEAD request fails.
 */
async function getUniversalWorkflowDepsTotalSize(missingDepIds) {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    let totalBytes = 0;

    for (const depId of missingDepIds) {
        const dep = DEPS[depId];
        if (!dep) continue;

        // Try to get exact size from Content-Length header
        let depBytes = 0;
        try {
            const http = require('http');
            const https = require('https');
            const protocol = dep.url.startsWith('https') ? https : http;
            depBytes = await new Promise((resolve) => {
                const request = protocol.request(dep.url, { method: 'HEAD' }, (res) => {
                    const size = parseInt(res.headers['content-length'], 10);
                    resolve(isNaN(size) ? 0 : size);
                });
                request.on('error', () => resolve(0));
                request.setTimeout(5000, () => {
                    request.abort();
                    resolve(0);
                });
                request.end();
            });
        } catch (err) {
            logger.warn('comfy', `Failed to get size for ${depId}: ${err.message}`);
        }

        // Fall back to registry size string if HEAD request failed
        if (depBytes === 0 && dep.size) {
            const match = dep.size.match(/^([\d\.]+)\s*(GB|MB|KB|B)$/i);
            if (match) {
                const val = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                const multipliers = { 'GB': 1024 ** 3, 'MB': 1024 ** 2, 'KB': 1024, 'B': 1 };
                depBytes = val * (multipliers[unit] || 0);
            }
        }

        totalBytes += depBytes;
    }

    return totalBytes;
}

/**
 * Empties ComfyUI's input/ and output/ temp folders.
 */
async function cleanComfyUITempFiles() {
    const inputDir = getComfyPath(ENGINE_ROOT, 'input');
    const outputDir = getComfyPath(ENGINE_ROOT, 'output');
    for (const dir of [inputDir, outputDir]) {
        if (await fs.pathExists(dir)) {
            await fs.emptyDir(dir);
            logger.info('comfy', `Cleaned temp folder: ${dir}`);
        }
    }
}

module.exports = {
    getProjectsRoot,
    getProjectPathsRegistryFile,
    readProjectPathsRegistry,
    addProjectPathToRegistry,
    removeProjectPathFromRegistry,
    SYS_DEPS_PATH,
    COMFYUI_PORT,
    processState,
    stopComfyUI,
    streamDownload,
    stripImageMetadata,
    runPipCommand,
    ensureCuratedPythonDeps,
    curatedDepsMarkerPath,
    runCustomCommand,
    findFileRecursive,
    resolveComfyPath,
    cleanEmptyDirs,
    getCustomRoot,
    getDefaultModelsRoot,
    resolveModelsRoot,
    normalizeExtraModelFolders,
    getExtraModelFolders,
    setExtraModelFolders,
    hasExtraModelFolders,
    writeExtraModelPathsYaml,
    cleanComfyUITempFiles,
    getUniversalWorkflowDepIds,
    getUniversalWorkflowDeps,
    checkUniversalWorkflowDepsStatus,
    getUniversalWorkflowDepsTotalSize,
    getPinnedNodeCommit,
    writeNodeCommitMarker,
    NODE_COMMIT_MARKER,
};
