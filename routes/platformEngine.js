/**
 * routes/platformEngine.js — Cross-platform engine constants and GPU detection.
 *
 * Single source of truth for:
 * - Engine folder names (ComfyUI_windows_portable, etc.)
 * - Binary paths (python.exe, llama-server.exe)
 * - Download URL construction based on detected GPU
 *
 * GPU detection runs once during engine install/upgrade, results cached for the session.
 */

'use strict';

const { execFile } = require('child_process');
const path = require('path');
const deps = require('../dev_configs/system_dependencies.json');
const logger = require('./logger');

const COMFY_VERSION = deps.engine.version;
const LLAMA_VERSION = deps.llamaServer.version;
const COMFY_BASE = `https://github.com/Comfy-Org/ComfyUI/releases/download/v${COMFY_VERSION}`;
const LLAMA_BASE = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}`;

// Platform-specific engine folder name (only Windows has portable build)
const COMFY_DIR_MAP = {
    win32: 'ComfyUI_windows_portable',
    darwin: 'ComfyUI_macos',      // placeholder — no portable release yet
    linux: 'ComfyUI_linux',        // placeholder — no portable release yet
};
const COMFY_DIR = COMFY_DIR_MAP[process.platform] ?? COMFY_DIR_MAP.win32;

// Python binary paths relative to engine root
const PYTHON_BIN_PARTS_MAP = {
    win32: [COMFY_DIR_MAP.win32, 'python_embeded', 'python.exe'],
    darwin: ['ComfyUI_macos', 'venv', 'bin', 'python3'],
    linux: ['ComfyUI_linux', 'venv', 'bin', 'python3'],
};

// Llama binary names by platform
const LLAMA_BIN_MAP = {
    win32: 'llama-server.exe',
    darwin: 'llama-server',
    linux: 'llama-server',
};

// Cached GPU detection result for the session
let _gpuDetectionCache = null;

/**
 * Get the full path to the Python binary.
 * @param {string} engineRoot - root directory containing engine folder
 * @returns {string} full path to python executable
 */
function getPythonBin(engineRoot) {
    const parts = PYTHON_BIN_PARTS_MAP[process.platform] ?? PYTHON_BIN_PARTS_MAP.win32;
    return path.join(engineRoot, ...parts);
}

/**
 * Get a path inside the ComfyUI folder.
 * @param {string} engineRoot - root directory containing engine folder
 * @param {...string} parts - path segments relative to ComfyUI/
 * @returns {string} full path
 */
function getComfyPath(engineRoot, ...parts) {
    return path.join(engineRoot, COMFY_DIR, 'ComfyUI', ...parts);
}

/**
 * Get the llama binary name for the current platform.
 * @returns {string} binary filename (e.g., 'llama-server.exe' on Windows)
 */
function getLlamaBin() {
    return LLAMA_BIN_MAP[process.platform] ?? LLAMA_BIN_MAP.win32;
}

/**
 * Detect NVIDIA GPU and parse CUDA version from nvidia-smi output.
 * @returns {Promise<{hasGPU: boolean, cudaVersion: string|null}>}
 */
async function detectNvidiaGPU() {
    return new Promise((resolve) => {
        const cmd = process.platform === 'win32' ? 'nvidia-smi' : 'which';
        const args = process.platform === 'win32'
            ? ['--query-gpu=name', '--format=csv,noheader']
            : ['nvidia-smi'];

        execFile(cmd, args, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                logger.info('gpu-detect', 'nvidia-smi not found or failed');
                return resolve({ hasGPU: false, cudaVersion: null });
            }

            // Parse CUDA version from nvidia-smi header line (e.g., "CUDA Version: 12.8")
            let cudaVersion = null;
            const headerMatch = stderr.match(/CUDA Version:\s+([\d.]+)/);
            if (headerMatch) {
                cudaVersion = headerMatch[1];
            }

            const gpuName = stdout.trim();
            const hasGPU = gpuName.length > 0;

            logger.info('gpu-detect', `NVIDIA GPU detected: ${hasGPU ? gpuName : 'none'}, CUDA: ${cudaVersion || 'unknown'}`);
            resolve({ hasGPU, cudaVersion });
        });
    });
}

/**
 * Detect AMD GPU via WMI (Windows only).
 * @returns {Promise<boolean>}
 */
async function detectAmdGPU() {
    if (process.platform !== 'win32') return false;

    return new Promise((resolve) => {
        execFile('wmic', ['path', 'win32_videocontroller', 'get', 'name'], { timeout: 5000 }, (error, stdout) => {
            if (error) return resolve(false);
            const hasAmd = /AMD|Radeon/i.test(stdout);
            if (hasAmd) logger.info('gpu-detect', 'AMD GPU detected via WMI');
            resolve(hasAmd);
        });
    });
}

/**
 * Detect Intel Arc GPU via WMI (Windows only).
 * @returns {Promise<boolean>}
 */
async function detectIntelArcGPU() {
    if (process.platform !== 'win32') return false;

    return new Promise((resolve) => {
        execFile('wmic', ['path', 'win32_videocontroller', 'get', 'name'], { timeout: 5000 }, (error, stdout) => {
            if (error) return resolve(false);
            const hasIntel = /Intel.*Arc|Intel.*Data\s+Center\s+GPU/i.test(stdout);
            if (hasIntel) logger.info('gpu-detect', 'Intel Arc GPU detected via WMI');
            resolve(hasIntel);
        });
    });
}

/**
 * Resolve GPU-specific download configuration.
 * Returns the correct engine and llama-server URLs + filenames.
 * Result is cached for the session.
 *
 * @returns {Promise<{comfy: {url: string, filename: string}, llama: {url: string, filename: string}}>}
 */
async function resolveDownloadConfig() {
    // Return cached result if available
    if (_gpuDetectionCache) {
        logger.info('gpu-detect', 'Using cached GPU detection result');
        return _gpuDetectionCache;
    }

    logger.info('gpu-detect', 'Starting GPU detection...');

    // Detect GPUs in parallel
    const [nvidiaResult, hasAmd, hasIntel] = await Promise.all([
        detectNvidiaGPU(),
        detectAmdGPU(),
        detectIntelArcGPU(),
    ]);

    let comfyFilename = 'ComfyUI_windows_portable_nvidia.7z';  // default
    let llamaFilename = `llama-${LLAMA_VERSION}-bin-win-cpu-x64.zip`; // default

    // ComfyUI variant selection
    if (nvidiaResult.hasGPU) {
        // NVIDIA GPU detected — parse CUDA version
        if (nvidiaResult.cudaVersion) {
            const cudaMajor = parseInt(nvidiaResult.cudaVersion.split('.')[0], 10);
            const cudaMinor = parseInt(nvidiaResult.cudaVersion.split('.')[1], 10);

            if (cudaMajor > 12 || (cudaMajor === 12 && cudaMinor >= 7)) {
                comfyFilename = 'ComfyUI_windows_portable_nvidia.7z';
                llamaFilename = `llama-${LLAMA_VERSION}-bin-win-cuda-13.1-x64.zip`;
            } else if (cudaMajor === 12 && cudaMinor === 6) {
                comfyFilename = 'ComfyUI_windows_portable_nvidia_cu126.7z';
                llamaFilename = `llama-${LLAMA_VERSION}-bin-win-cuda-12.4-x64.zip`;
            } else {
                // CUDA < 12.6 — use cu126 as safest fallback
                comfyFilename = 'ComfyUI_windows_portable_nvidia_cu126.7z';
                llamaFilename = `llama-${LLAMA_VERSION}-bin-win-cuda-12.4-x64.zip`;
            }
        } else {
            // CUDA version unknown — use cu126 as safe fallback
            comfyFilename = 'ComfyUI_windows_portable_nvidia_cu126.7z';
            llamaFilename = `llama-${LLAMA_VERSION}-bin-win-cuda-12.4-x64.zip`;
        }
    } else if (hasAmd) {
        comfyFilename = 'ComfyUI_windows_portable_amd.7z';
        llamaFilename = `llama-${LLAMA_VERSION}-bin-win-hip-radeon-x64.zip`;
    } else if (hasIntel) {
        comfyFilename = 'ComfyUI_windows_portable_intel.7z';
        llamaFilename = `llama-${LLAMA_VERSION}-bin-win-cpu-x64.zip`; // Intel Arc uses CPU variant
    }
    // else: default to NVIDIA build, ComfyUI will handle fallback if no GPU

    const result = {
        comfy: {
            url: `${COMFY_BASE}/${comfyFilename}`,
            filename: 'ComfyUI_windows_portable.7z',
        },
        llama: {
            url: `${LLAMA_BASE}/${llamaFilename}`,
            filename: 'llama_server_engine.zip',
        },
    };

    logger.info('gpu-detect', `Resolved config: ComfyUI=${comfyFilename}, Llama=${llamaFilename}`);

    // Cache for session
    _gpuDetectionCache = result;
    return result;
}

module.exports = {
    COMFY_DIR,
    COMFY_VERSION,
    LLAMA_VERSION,
    getPythonBin,
    getComfyPath,
    getLlamaBin,
    resolveDownloadConfig,
};
