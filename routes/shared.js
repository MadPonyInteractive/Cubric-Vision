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
const { createRequire } = require('module');
const logger = require('./logger');
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
const SYS_DEPS_PATH = path.join(__dirname, '..', 'dev_configs', 'system_dependencies.json');
const COMFYUI_PORT = 8188;

// ── Process State ─────────────────────────────────────────────────────────────
// Mutable shared state — all route modules reference the same object.

const processState = {
    activeComfyProcess: null,
    comfyNeedsRestart: false,
};

function stopComfyUI() {
    if (processState.activeComfyProcess) {
        logger.info('comfy', 'Killing active ComfyUI process...');
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
 * NOTE: For downloads that need resumable support, use ResumableDownloader
 * from downloadManager.js instead. This is for simple one-shot downloads.
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
        } else if (file === filename) {
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

    if (customRoot && !isCustomNode) {
        const directPath = path.join(customRoot, dep.filename || '');
        if (dep.filename && await fs.pathExists(directPath)) {
            localPath = directPath;
        } else if (dep.filename) {
            const baseFilename = path.basename(dep.filename);
            const found = await findFileRecursive(customRoot, baseFilename);
            localPath = found || directPath;
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
                : getComfyPath(ENGINE_ROOT, 'models');
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
    return getComfyPath(ENGINE_ROOT, 'models');
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
    return fs.realpath(resolved).catch(() => resolved);
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
    await fs.writeFile(extraConfigPath, buildExtraModelPathsYaml(root, normalizedExtras), 'utf8');
    return extraConfigPath;
}

/**
 * Returns all DEPS ids marked for installation with the engine (installOnEngine: true).
 * These cover all universal workflow dependencies — no need to track them per-workflow.
 */
function getUniversalWorkflowDepIds() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    return Object.entries(DEPS)
        .filter(([, dep]) => dep.installOnEngine === true)
        .map(([id]) => id);
}

/**
 * Checks which universal workflow dependencies are missing from disk.
 * Returns { needsDepsInstall, missingDeps } where missingDeps is an array of dep ids.
 *
 * Uses resolveComfyPath so custom root and type→subdir mapping are respected.
 */
async function checkUniversalWorkflowDepsStatus() {
    const { DEPS } = _require('../js/data/modelConstants/dependencies.js');
    const customRoot = await getCustomRoot();
    const config = {};
    const depIds = getUniversalWorkflowDepIds();
    const missing = [];

    for (const depId of depIds) {
        const dep = DEPS[depId];
        if (!dep) {
            logger.warn('comfy', `checkUniversalWorkflowDepsStatus: unknown dep id "${depId}"`);
            continue;
        }
        const { localPath } = await resolveComfyPath(dep, customRoot, config);
        if (!(await fs.pathExists(localPath))) {
            missing.push(depId);
        }
    }

    return { needsDepsInstall: missing.length > 0, missingDeps: missing };
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
    SYS_DEPS_PATH,
    COMFYUI_PORT,
    processState,
    stopComfyUI,
    streamDownload,
    runPipCommand,
    runCustomCommand,
    findFileRecursive,
    resolveComfyPath,
    cleanEmptyDirs,
    getCustomRoot,
    getDefaultModelsRoot,
    normalizeExtraModelFolders,
    getExtraModelFolders,
    setExtraModelFolders,
    hasExtraModelFolders,
    writeExtraModelPathsYaml,
    cleanComfyUITempFiles,
    getUniversalWorkflowDepIds,
    checkUniversalWorkflowDepsStatus,
    getUniversalWorkflowDepsTotalSize,
};
