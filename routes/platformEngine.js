/**
 * routes/platformEngine.js — Cross-platform engine constants and GPU detection.
 *
 * Single source of truth for:
 * - Engine folder names (ComfyUI_windows_portable, etc.)
 * - Binary paths (python.exe)
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
const COMFY_BASE = `https://github.com/Comfy-Org/ComfyUI/releases/download/v${COMFY_VERSION}`;

// Platform-specific engine folder name (only Windows has portable build)
const COMFY_DIR_MAP = {
    win32: 'ComfyUI_windows_portable',
    darwin: 'ComfyUI_macos',      // placeholder — no portable release yet
    linux: 'ComfyUI_linux',        // placeholder — no portable release yet
};
const COMFY_DIR = COMFY_DIR_MAP[process.platform] ?? COMFY_DIR_MAP.win32;

// Engine layout differs by platform:
//  - Windows ships a prebuilt portable archive whose ComfyUI tree lives at
//    <engine>/<COMFY_DIR>/ComfyUI and whose Python is the embedded interpreter.
//  - Linux/macOS bootstrap via comfy-cli, which clones ComfyUI DIRECTLY into the
//    workspace it is given. We make <engine>/<COMFY_DIR> that workspace (so it IS
//    the ComfyUI repo root — no extra ComfyUI/ subdir) and keep the uv venv in a
//    sibling dir so it does not sit inside the dir comfy-cli must clone into.
const USES_COMFY_CLI = process.platform === 'linux' || process.platform === 'darwin';

// uv venv directory name for the comfy-cli bootstrap (sibling of the workspace).
const COMFY_VENV_DIR = 'comfy-venv';

// Python binary paths relative to engine root
const PYTHON_BIN_PARTS_MAP = {
    win32: [COMFY_DIR_MAP.win32, 'python_embeded', 'python.exe'],
    darwin: [COMFY_VENV_DIR, 'bin', 'python3'],
    linux: [COMFY_VENV_DIR, 'bin', 'python3'],
};

// Cached GPU detection result for the session
let _gpuDetectionCache = null;

function _resolveEnvPath(name) {
    const value = process.env[name];
    if (typeof value !== 'string' || value.trim() === '') return null;
    return path.resolve(value.trim());
}

/**
 * Root of an extracted portable distribution, when launched from one.
 * @returns {string|null}
 */
function getPortableRoot() {
    return _resolveEnvPath('CUBRIC_PORTABLE_ROOT');
}

/**
 * Resource root for portable/packaged binaries such as ffmpeg.
 * @returns {string|null}
 */
function getPortableResourcesPath() {
    const explicit = _resolveEnvPath('MPI_RESOURCES_PATH') || _resolveEnvPath('CUBRIC_RESOURCES_PATH');
    if (explicit) return explicit;

    const portableRoot = getPortableRoot();
    return portableRoot ? path.join(portableRoot, 'resources') : null;
}

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
 * Get a path inside the ComfyUI repository root.
 *
 * Windows: the portable archive nests ComfyUI at <engine>/<COMFY_DIR>/ComfyUI.
 * Linux/macOS: comfy-cli clones ComfyUI directly into <engine>/<COMFY_DIR>, so
 * that dir IS the repo root (no extra ComfyUI/ segment).
 *
 * @param {string} engineRoot - root directory containing engine folder
 * @param {...string} parts - path segments relative to the ComfyUI repo root
 * @returns {string} full path
 */
function getComfyPath(engineRoot, ...parts) {
    return path.join(engineRoot, ...getComfyRepoRel(), ...parts);
}

/**
 * ComfyUI repo root relative to the engine root, as path segments.
 * Windows nests it at <COMFY_DIR>/ComfyUI; Linux/macOS (comfy-cli) make
 * <COMFY_DIR> itself the repo root. Single source of truth for both the
 * server path helpers and the client (via /system/platform-config).
 * @returns {string[]}
 */
function getComfyRepoRel() {
    return USES_COMFY_CLI ? [COMFY_DIR] : [COMFY_DIR, 'ComfyUI'];
}

/** Promisified execFile that resolves stdout/stderr and never rejects. */
function _run(cmd, args, timeout = 5000) {
    return new Promise((resolve) => {
        execFile(cmd, args, { timeout }, (error, stdout, stderr) => {
            resolve({ error, stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

/**
 * Detect NVIDIA GPU name and the driver's max-supported CUDA version.
 *
 * Two nvidia-smi calls: `--query-gpu=name` (machine-readable model name) and a
 * bare `nvidia-smi` (the `CUDA Version:` header is printed to STDOUT, not stderr,
 * and only appears without `--query-gpu`). The CUDA version is informational and
 * a tiebreaker only — build selection is driven by GPU architecture, see
 * `selectNvidiaBuild()`.
 * @returns {Promise<{hasGPU: boolean, gpuName: string|null, cudaVersion: string|null}>}
 */
async function detectNvidiaGPU() {
    const nameRes = await _run('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader']);
    if (nameRes.error) {
        logger.info('gpu-detect', 'nvidia-smi not found or failed');
        return { hasGPU: false, gpuName: null, cudaVersion: null };
    }

    const gpuName = nameRes.stdout.trim().split('\n')[0].trim();
    const hasGPU = gpuName.length > 0;

    // Driver max-supported CUDA from the bare-call header (stdout).
    let cudaVersion = null;
    const headerRes = await _run('nvidia-smi', []);
    const headerMatch = headerRes.stdout.match(/CUDA Version:\s+([\d.]+)/);
    if (headerMatch) cudaVersion = headerMatch[1];

    logger.info('gpu-detect', `NVIDIA GPU detected: ${hasGPU ? gpuName : 'none'}, CUDA: ${cudaVersion || 'unknown'}`);
    return { hasGPU, gpuName: hasGPU ? gpuName : null, cudaVersion };
}

/**
 * Pick the ComfyUI portable NVIDIA build from the GPU model name.
 *
 * Per Comfy-Org guidance (github.com/Comfy-Org/ComfyUI): the default
 * `nvidia.7z` supports "20 series and above" (includes 30/40/50-series Blackwell
 * and datacenter cards); `nvidia_cu126.7z` is the legacy build for "10 series and
 * older". So the rule is: 20-series+ → default build, 10-series/older → cu126.
 *
 * Build-name strings are stable across engine versions; only the release tag in
 * the URL changes (from system_dependencies.json). Do not version-gate these names.
 *
 * @param {string|null} gpuName  Raw nvidia-smi model name.
 * @param {string|null} cudaVersion  Driver CUDA (tiebreaker when name is unknown).
 * @returns {string} portable build filename
 */
function selectNvidiaBuild(gpuName, cudaVersion) {
    const NVIDIA_DEFAULT = 'ComfyUI_windows_portable_nvidia.7z';
    const NVIDIA_LEGACY = 'ComfyUI_windows_portable_nvidia_cu126.7z';
    const name = (gpuName || '').toLowerCase();

    // GeForce consumer cards: "rtx 4060", "gtx 1080", "gtx 1660", "rtx 5090".
    const geforce = name.match(/\b(?:rtx|gtx)\s*(\d{3,4})/);
    if (geforce) {
        const model = parseInt(geforce[1], 10);
        // RTX series (20xx+) are always >= 2000. GTX 16xx (Turing) are modern too.
        // Legacy = GTX 10xx and older, i.e. model < 1600.
        return model >= 1600 ? NVIDIA_DEFAULT : NVIDIA_LEGACY;
    }

    // Datacenter / pro cards (A100, H100, L40, RTX A6000, Tesla T4, etc.) are
    // all Turing+; the default build covers them.
    if (/\b(a\d{2,3}|h\d{2,3}|l\d{2,3}|t4|t40|rtx a\d{3,4}|ada|hopper|blackwell|ampere|turing)\b/.test(name)) {
        return NVIDIA_DEFAULT;
    }

    // Old datacenter (Tesla P/V/K series, Quadro pre-Turing) → legacy.
    if (/\b(tesla [pvk]\d|quadro [pmk]\d|kepler|maxwell|pascal)/.test(name)) {
        return NVIDIA_LEGACY;
    }

    // Name unrecognized: fall back on driver CUDA. CUDA 12.8+ ships on drivers
    // for modern arches; below that, or unknown, prefer the safe modern default
    // (Comfy-Org default targets 20-series+, the common case today).
    if (cudaVersion) {
        const [maj, min] = cudaVersion.split('.').map((n) => parseInt(n, 10));
        if (maj < 11) return NVIDIA_LEGACY; // ancient driver → old card
    }
    return NVIDIA_DEFAULT;
}

// Arch classifier: the SINGLE source of truth is the browser-safe ESM module
// js/data/modelConstants/gpuArch.js (shared with the client, which classifies the
// remote pod's gpuType). Loaded via createRequire since this route file is CJS and
// the shared module is ESM (same interop downloadManager.js uses for the data modules).
const { gpuArch } = require('module').createRequire(__filename)('../js/data/modelConstants/gpuArch.js');

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
 * Returns the correct ComfyUI engine URL + filename for the detected GPU.
 * Result is cached for the session.
 *
 * @returns {Promise<{comfy: {url: string, filename: string}}>}
 */
async function resolveDownloadConfig() {
    // Return cached result if available. No log here: /system/stats calls this on
    // every poll (~0.5 Hz), so logging each cache hit floods app.log. The initial
    // (uncached) detection below still logs once.
    if (_gpuDetectionCache) {
        return _gpuDetectionCache;
    }

    logger.info('gpu-detect', 'Starting GPU detection...');

    // Detect GPUs in parallel
    const [nvidiaResult, hasAmd, hasIntel] = await Promise.all([
        detectNvidiaGPU(),
        detectAmdGPU(),
        detectIntelArcGPU(),
    ]);

    // Apple Silicon has no nvidia-smi / AMD / Intel-Arc signal — the three probes
    // above all return empty on a Mac. Detect it from the platform/arch directly so
    // the launch path uses Metal/MPS instead of falling through to --cpu. (Intel
    // Macs stay vendor:null → --cpu, which is correct: no MPS torch exists for x86.)
    const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';

    const gpu = {
        name: nvidiaResult.gpuName || (hasAmd ? 'AMD GPU' : hasIntel ? 'Intel Arc GPU' : isAppleSilicon ? 'Apple Silicon GPU' : null),
        vendor: nvidiaResult.hasGPU ? 'nvidia' : hasAmd ? 'amd' : hasIntel ? 'intel' : isAppleSilicon ? 'apple' : null,
        cudaVersion: nvidiaResult.cudaVersion || null,
        // Arch token for the generic runtime-variant axis (MPI-200); null for
        // non-NVIDIA. Consumed as variantTokens.arch by the dep/workflow resolver.
        arch: nvidiaResult.hasGPU ? gpuArch(nvidiaResult.gpuName, nvidiaResult.cudaVersion) : null,
    };

    let result;
    if (process.platform === 'win32') {
        // Windows ships a prebuilt portable archive selected by GPU architecture.
        let comfyFilename = 'ComfyUI_windows_portable_nvidia.7z';  // default
        if (nvidiaResult.hasGPU) {
            comfyFilename = selectNvidiaBuild(nvidiaResult.gpuName, nvidiaResult.cudaVersion);
        } else if (hasAmd) {
            comfyFilename = 'ComfyUI_windows_portable_amd.7z';
        } else if (hasIntel) {
            comfyFilename = 'ComfyUI_windows_portable_intel.7z';
        }
        // else: default to NVIDIA build, ComfyUI will handle fallback if no GPU
        result = {
            method: 'archive',
            comfy: {
                url: `${COMFY_BASE}/${comfyFilename}`,
                filename: 'ComfyUI_windows_portable.7z',
            },
            gpu,
        };
        logger.info('gpu-detect', `Resolved config: ComfyUI=${comfyFilename} (CUDA ${nvidiaResult.cudaVersion || 'unknown'})`);
    } else {
        // Linux/macOS have no prebuilt portable — bootstrap via uv + comfy-cli.
        result = { method: 'uv-bootstrap', comfy: null, gpu };
        logger.info('gpu-detect', `Resolved config: uv-bootstrap (vendor ${gpu.vendor || 'none'}, CUDA ${nvidiaResult.cudaVersion || 'unknown'})`);
    }

    // Cache for session
    _gpuDetectionCache = result;
    return result;
}

/**
 * Resolve the `uv` binary for non-Windows engine bootstrap.
 *
 * Prefers the zip-local uv staged in a portable artifact (CUBRIC_UV_BIN, set by
 * the launchers when `$ROOT/uv/uv` exists), then falls back to `uv` on PATH.
 * Returns null if neither is available so the caller can surface a clear error.
 * @returns {string|null} absolute path or bare `uv` command, or null
 */
function resolveUvBin() {
    const explicit = _resolveEnvPath('CUBRIC_UV_BIN');
    if (explicit && require('fs').existsSync(explicit)) return explicit;
    // Fall back to PATH — `uv` resolved by the shell at exec time.
    return 'uv';
}

/**
 * Read .engine-config.json (gitignored, per-worktree). Returns parsed config or null.
 * Lets git worktrees share the engine folder instead of duplicating.
 */
function _readEngineConfig() {
    try {
        const configPath = path.join(__dirname, '..', '.engine-config.json');
        if (require('fs').existsSync(configPath)) {
            return require(configPath);
        }
    } catch (error) {
        // Ignore — fall back to defaults
    }
    return null;
}

/**
 * Get the configured engine root path, with fallback to default.
 * Reads `enginePath` key from .engine-config.json.
 * @returns {string} engine root directory path
 */
function getEngineRoot() {
    const envRoot = _resolveEnvPath('CUBRIC_ENGINE_ROOT');
    if (envRoot) {
        return envRoot;
    }

    const portableRoot = getPortableRoot();
    if (portableRoot) {
        return path.join(portableRoot, 'engine');
    }

    const config = _readEngineConfig();
    if (config && config.enginePath && require('fs').existsSync(config.enginePath)) {
        return config.enginePath;
    }
    return path.join(__dirname, '..', 'engine');
}

module.exports = {
    COMFY_DIR,
    COMFY_VENV_DIR,
    COMFY_VERSION,
    getPythonBin,
    getComfyPath,
    getComfyRepoRel,
    resolveDownloadConfig,
    selectNvidiaBuild,
    gpuArch,
    resolveUvBin,
    getEngineRoot,
    COMFY_DIR_MAP,
    getPortableRoot,
    getPortableResourcesPath,
};
