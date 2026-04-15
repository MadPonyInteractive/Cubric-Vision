/**
 * routes/shared.js — Shared state and utilities used across multiple route modules.
 *
 * RULES FOR AGENTS:
 * - All cross-cutting server concerns live here (download helper, process refs, path resolver).
 * - Do not copy these into route files — import them.
 * - Process state (activeLlamaProcess, etc.) is exported as a mutable object so all
 *   modules share the same reference.
 */

'use strict';

const fs     = require('fs-extra');
const path   = require('path');
const logger = require('./logger');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream/promises');
const { exec, spawn } = require('child_process');

// ── Shared Constants ──────────────────────────────────────────────────────────

const DEFAULT_PROJECTS_ROOT = path.join(__dirname, '..', 'projects');
const MODELS_ROOT = path.join(__dirname, '..', 'data', 'models');
const LLM_CONFIG_PATH = path.join(__dirname, '..', 'dev_configs', 'llm_models.json');
const LLAMA_ENGINE_ROOT = path.join(__dirname, '..', 'llama_engine');
const COMFY_WORKFLOWS_PATH = path.join(__dirname, '..', 'dev_configs', 'comfy_workflows.json');
const SYS_DEPS_PATH = path.join(__dirname, '..', 'dev_configs', 'system_dependencies.json');
const LLAMA_SERVER_PORT = 8080;
const COMFYUI_PORT = 8188;

// ── Process State ─────────────────────────────────────────────────────────────
// Mutable shared state — all route modules reference the same object.

const processState = {
    activeLlamaProcess: null,
    activeComfyProcess: null,
    activeModelId: null,
    comfyNeedsRestart: false,
};

function stopLlamaServer() {
    if (processState.activeLlamaProcess) {
        logger.info('llm', 'Killing active llama-server process...');
        processState.activeLlamaProcess.kill('SIGINT');
        processState.activeLlamaProcess = null;
    }
    processState.activeModelId = null;
}

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
        if (processState.activeLlamaProcess) processState.activeLlamaProcess.kill('SIGKILL');
        if (processState.activeComfyProcess) processState.activeComfyProcess.kill('SIGKILL');
        if (signal !== 'exit') process.exit();
    });
});

// ── Download Helper ───────────────────────────────────────────────────────────

/**
 * Memory-efficient streaming download with redirect support.
 * Bypasses native fetch/undici buffering to ensure near-zero RAM footprint.
 */
function streamDownload(url, localPath) {
    const request = (targetUrl) => {
        return new Promise((resolve, reject) => {
            const protocol = targetUrl.startsWith('https') ? https : http;
            protocol.get(targetUrl, { headers: { 'User-Agent': 'MpiAiSuite/1.0' } }, async (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const nextUrl = new URL(response.headers.location, targetUrl).href;
                    resolve(request(nextUrl));
                    return;
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
                }
                try {
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

// ── ComfyUI Helpers ───────────────────────────────────────────────────────────

/**
 * Executes a pip command using the embedded Python environment.
 */
async function runPipCommand(args) {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const pythonPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'python_embeded', 'python.exe');
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
 * Checks if a Python package is required by any other installed custom node.
 */
async function isPackageRequiredElsewhere(packageName, excludedNodePath) {
    const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
    const customNodesRoot = path.join(__dirname, '..', config.local_custom_nodes_path || 'engine/ComfyUI_windows_portable/ComfyUI/custom_nodes');
    if (!(await fs.pathExists(customNodesRoot))) return false;

    const nodes = await fs.readdir(customNodesRoot);
    const normalizedPackage = packageName.toLowerCase().replace(/_/g, '-');

    for (const nodeDir of nodes) {
        const nodePath = path.join(customNodesRoot, nodeDir);
        if (nodePath === excludedNodePath) continue;
        const reqPath = path.join(nodePath, 'requirements.txt');
        if (await fs.pathExists(reqPath)) {
            const content = await fs.readFile(reqPath, 'utf8');
            const lines = content.split('\n')
                .map(l => l.trim().toLowerCase())
                .filter(l => l && !l.startsWith('#'))
                .map(l => {
                    let pkg = l.split('==')[0].split('>=')[0].split('<=')[0].split('>')[0].split('<')[0].trim();
                    if (pkg.includes('#egg=')) pkg = pkg.split('#egg=')[1];
                    else if (pkg.startsWith('git+') || pkg.startsWith('http')) return null;
                    return pkg.replace(/_/g, '-');
                })
                .filter(Boolean);
            if (lines.includes(normalizedPackage)) return true;
        }
    }
    return false;
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
    let subDirPrefix = '';

    if (!dep.filename) {
        if (dep.type === 'checkpoint') subDirPrefix = 'checkpoints';
        else if (dep.type === 'lora') subDirPrefix = 'loras';
        else if (dep.type === 'vae') subDirPrefix = 'vae';
        else if (dep.type === 'upscaler' || dep.type === 'upscale_model') subDirPrefix = 'upscale_models';
        else if (dep.type === 'diffusion_model') subDirPrefix = 'diffusion_models';
        else if (dep.type === 'clip') subDirPrefix = 'clip';
        else if (dep.type === 'ultralytics') subDirPrefix = 'ultralytics';
        else if (dep.type === 'sams') subDirPrefix = 'sams';
    }

    if (customRoot && !isCustomNode) {
        const modelsDir = path.join(customRoot, subDirPrefix);
        const directPath = path.join(modelsDir, dep.filename || '');
        if (dep.filename && await fs.pathExists(directPath)) {
            localPath = directPath;
        } else if (dep.filename) {
            const baseFilename = path.basename(dep.filename);
            const found = await findFileRecursive(modelsDir, baseFilename);
            localPath = found || directPath;
        } else {
            localPath = modelsDir;
        }
    } else {
        let baseDir = config.local_models_path || 'engine/ComfyUI_windows_portable/ComfyUI/models';
        if (isCustomNode) {
            baseDir = config.local_custom_nodes_path || 'engine/ComfyUI_windows_portable/ComfyUI/custom_nodes';
        } else {
            baseDir = path.join(baseDir, subDirPrefix);
        }
        localPath = path.join(__dirname, '..', baseDir, dep.filename || '');
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
 * Checks if all dependencies of a workflow exist on disk.
 */
async function isWorkflowInstalled(wf, customRoot, config) {
    if (!wf.dependencies || wf.dependencies.length === 0) return false;
    for (const dep of wf.dependencies) {
        const { localPath } = await resolveComfyPath(dep, customRoot, config);
        if (!(await fs.pathExists(localPath))) return false;
    }
    return true;
}

/**
 * Re-scans all workflows and updates their 'installed' flag in comfy_workflows.json.
 */
async function syncWorkflowStates(customRootOverride = undefined) {
    try {
        const config = await fs.readJson(COMFY_WORKFLOWS_PATH);
        let customRoot = customRootOverride;

        if (customRoot === undefined) {
            const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
            const extraConfigPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'extra_model_paths.yaml');
            if (await fs.pathExists(extraConfigPath)) {
                const content = await fs.readFile(extraConfigPath, 'utf8');
                const match = content.match(/base_path:\s*(.*)/i);
                if (match) customRoot = match[1].trim();
            } else {
                customRoot = null;
            }
        }

        let changed = false;
        for (const wf of config.workflows) {
            const currentlyInstalled = await isWorkflowInstalled(wf, customRoot, config);
            if (wf.installed !== currentlyInstalled) {
                wf.installed = currentlyInstalled;
                changed = true;
                logger.info('comfy', `State Sync: Workflow ${wf.id} is now ${currentlyInstalled ? 'INSTALLED' : 'NOT INSTALLED'}`);
            }
        }

        if (changed) {
            await fs.writeJson(COMFY_WORKFLOWS_PATH, config, { spaces: 2 });
        }
    } catch (err) {
        logger.error('comfy', 'syncWorkflowStates failed', err);
    }
}

/**
 * Helper: read the custom ComfyUI models root from extra_model_paths.yaml if present.
 */
async function getCustomRoot() {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const extraConfigPath = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'extra_model_paths.yaml');
    if (await fs.pathExists(extraConfigPath)) {
        const content = await fs.readFile(extraConfigPath, 'utf8');
        const match = content.match(/base_path:\s*(.*)/i);
        if (match) return match[1].trim();
    }
    return null;
}

/**
 * Empties ComfyUI's input/ and output/ temp folders.
 */
async function cleanComfyUITempFiles() {
    const ENGINE_ROOT = path.join(__dirname, '..', 'engine');
    const inputDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'input');
    const outputDir = path.join(ENGINE_ROOT, 'ComfyUI_windows_portable', 'ComfyUI', 'output');
    for (const dir of [inputDir, outputDir]) {
        if (await fs.pathExists(dir)) {
            await fs.emptyDir(dir);
            logger.info('comfy', `Cleaned temp folder: ${dir}`);
        }
    }
}

module.exports = {
    DEFAULT_PROJECTS_ROOT,
    MODELS_ROOT,
    LLM_CONFIG_PATH,
    LLAMA_ENGINE_ROOT,
    COMFY_WORKFLOWS_PATH,
    SYS_DEPS_PATH,
    LLAMA_SERVER_PORT,
    COMFYUI_PORT,
    processState,
    stopLlamaServer,
    stopComfyUI,
    streamDownload,
    runPipCommand,
    isPackageRequiredElsewhere,
    findFileRecursive,
    resolveComfyPath,
    cleanEmptyDirs,
    isWorkflowInstalled,
    syncWorkflowStates,
    getCustomRoot,
    cleanComfyUITempFiles,
};
