# Cross-Platform Engine Constants & GPU Detection

## Context

The ComfyUI engine folder name (`ComfyUI_windows_portable`) and binary paths (`python_embeded/python.exe`) are hardcoded in 20+ places across 5 route files and `main.js`. Additionally, the download URL is hardcoded to one specific CUDA variant (`cu126`) even though ComfyUI ships 4 Windows variants and the right one depends on the user's GPU.

This task centralises all platform-specific engine paths into one constant file AND adds GPU detection so the correct engine build is downloaded automatically. Both concerns live in the same "what to download / where to find it" system.

---

## What ComfyUI Ships (Windows only — no Mac/Linux portable)

| Variant | Filename | When to use |
|---|---|---|
| NVIDIA CUDA 12.8 (latest) | `ComfyUI_windows_portable_nvidia.7z` | RTX 30xx+ with up-to-date drivers |
| NVIDIA CUDA 12.6 | `ComfyUI_windows_portable_nvidia_cu126.7z` | RTX cards needing cu126 specifically |
| AMD (DirectML) | `ComfyUI_windows_portable_amd.7z` | AMD GPU users |
| Intel Arc | `ComfyUI_windows_portable_intel.7z` | Intel Arc GPU users |

URL template: `https://github.com/Comfy-Org/ComfyUI/releases/download/v{VERSION}/{FILENAME}`

## What llama.cpp Ships (Windows CUDA)

| Variant | Filename | When to use |
|---|---|---|
| CUDA 12.4 | `llama-{VER}-bin-win-cuda-12.4-x64.zip` | Older NVIDIA drivers |
| CUDA 13.1 | `llama-{VER}-bin-win-cuda-13.1-x64.zip` | Newer NVIDIA drivers |
| CPU only | `llama-{VER}-bin-win-cpu-x64.zip` | No GPU / fallback |
| AMD HIP | `llama-{VER}-bin-win-hip-radeon-x64.zip` | AMD GPU |

---

## Approach

### 1. Simplify `dev_configs/system_dependencies.json`

Store only version numbers. URLs are constructed at runtime.

```json
{
  "engine": {
    "name": "ComfyUI Portable",
    "version": "0.18.0"
  },
  "llamaServer": {
    "name": "Llama.cpp Backend Server",
    "version": "b8464"
  }
}
```

### 2. Create `routes/platformEngine.js` (new file)

Single source of truth for engine paths, binary locations, and download URL selection.

**Responsibilities:**
- Export `COMFY_DIR` — the engine folder name for the current platform
- Export `getPythonBin(engineRoot)` — full path to Python binary
- Export `getComfyPath(engineRoot, ...parts)` — shorthand for paths inside `engine/COMFY_DIR/ComfyUI/`
- Export `resolveDownloadConfig()` — async function that detects GPU and returns the right download URLs + filenames for both ComfyUI and llama.cpp

**GPU detection logic (inside `resolveDownloadConfig`):**

Run `nvidia-smi --query-gpu=name --format=csv,noheader` to detect NVIDIA GPU presence. Parse CUDA version from `nvidia-smi` output header line (e.g. `CUDA Version: 12.8`).

Decision tree for ComfyUI:
```
Has NVIDIA GPU?
  ├─ CUDA >= 12.7 → ComfyUI_windows_portable_nvidia.7z       (cu128 default)
  ├─ CUDA 12.6.x  → ComfyUI_windows_portable_nvidia_cu126.7z
  └─ CUDA < 12.6  → ComfyUI_windows_portable_nvidia_cu126.7z (safest fallback)
Has AMD GPU? (check via dxdiag or wmic — no nvidia-smi)
  └─ ComfyUI_windows_portable_amd.7z
Has Intel Arc?
  └─ ComfyUI_windows_portable_intel.7z
No GPU detected / nvidia-smi missing
  └─ ComfyUI_windows_portable_nvidia.7z (default, let ComfyUI handle fallback)
```

Decision tree for llama.cpp:
```
CUDA >= 13.0 → llama-{VER}-bin-win-cuda-13.1-x64.zip
CUDA 12.x    → llama-{VER}-bin-win-cuda-12.4-x64.zip
No NVIDIA    → llama-{VER}-bin-win-cpu-x64.zip
```

**Skeleton:**
```js
const { execFile } = require('child_process');
const path = require('path');
const deps = require('../dev_configs/system_dependencies.json');

const COMFY_VERSION = deps.engine.version;
const LLAMA_VERSION = deps.llamaServer.version;
const COMFY_BASE = `https://github.com/Comfy-Org/ComfyUI/releases/download/v${COMFY_VERSION}`;
const LLAMA_BASE  = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}`;

// Platform-specific engine folder name
const COMFY_DIR_MAP = {
  win32:  'ComfyUI_windows_portable',
  darwin: 'ComfyUI_macos',   // placeholder — no portable release yet
  linux:  'ComfyUI_linux',   // placeholder — no portable release yet
};
const COMFY_DIR = COMFY_DIR_MAP[process.platform] ?? COMFY_DIR_MAP.win32;

// Python binary relative to engine root
const PYTHON_BIN_PARTS_MAP = {
  win32:  [COMFY_DIR_MAP.win32, 'python_embeded', 'python.exe'],
  darwin: ['ComfyUI_macos', 'venv', 'bin', 'python3'],
  linux:  ['ComfyUI_linux',  'venv', 'bin', 'python3'],
};

const getPythonBin = (engineRoot) =>
  path.join(engineRoot, ...(PYTHON_BIN_PARTS_MAP[process.platform] ?? PYTHON_BIN_PARTS_MAP.win32));

const getComfyPath = (engineRoot, ...parts) =>
  path.join(engineRoot, COMFY_DIR, 'ComfyUI', ...parts);

// Async GPU detection — returns { comfy, llama } download configs
async function resolveDownloadConfig() { ... }

module.exports = { COMFY_DIR, getPythonBin, getComfyPath, resolveDownloadConfig };
```

### 3. Replace all 20+ hardcoded references

| File | Count | Changes |
|------|-------|---------|
| `routes/shared.js` | 9 | `COMFY_DIR` / `getPythonBin()` / `getComfyPath()` |
| `routes/engine.js` | 7 | Same + fix `path.posix` → `path.join` + replace download URL with `resolveDownloadConfig()` |
| `routes/comfy.js` | 6 | `getComfyPath()` / `getPythonBin()` |
| `routes/downloadManager.js` | 3 | `getComfyPath()` |
| `main.js` | 2 | `getComfyPath()` in `before-quit` handler |
| `routes/llm.js` | 2 | Fix `path.posix` + replace `llama-server.exe` with platform binary name from `resolveDownloadConfig()` |
| `js/data/modelRegistry.js` | 2 | Client-side strings — expose `COMFY_DIR` via a `GET /system/platform-config` endpoint, client reads on init |

### 4. Where `resolveDownloadConfig()` is called

Only called during engine installation/upgrade flow in `routes/engine.js` — not on every app boot. Result can be cached in memory for the session.

---

## Verification

1. App boots and ComfyUI starts correctly on Windows — existing behaviour unchanged
2. Engine paths in logs still resolve to `engine/ComfyUI_windows_portable/...`
3. Grep confirms zero remaining `'ComfyUI_windows_portable'` hardcoded strings in route files
4. On a machine with NVIDIA GPU: `resolveDownloadConfig()` returns the `_nvidia.7z` or `_nvidia_cu126.7z` URL based on detected CUDA version
5. Bumping only the version number in `system_dependencies.json` produces correct updated URLs

---

## Critical Files

| File | Action |
|------|--------|
| `routes/platformEngine.js` | **Create** |
| `dev_configs/system_dependencies.json` | Simplify to version numbers only |
| `routes/shared.js` | Replace 9 hardcoded paths |
| `routes/engine.js` | Replace 7 paths + fix path.posix + wire `resolveDownloadConfig()` |
| `routes/comfy.js` | Replace 6 paths |
| `routes/downloadManager.js` | Replace 3 paths |
| `main.js` | Replace 2 paths |
| `js/data/modelRegistry.js` | Replace 2 client-side strings via `/system/platform-config` |
| `routes/llm.js` | Fix path.posix + replace llama binary name |
