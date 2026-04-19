# ComfyUI Backend & Engine Rules (routes/comfy.js & modelRegistry.js)

> **AI INSTRUCTION:** This file contains rules for interacting with the raw python process, managing model dependencies, and route architecture.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves the ComfyUI backend, model registry, or Python engine.

**Platform paths:** All engine paths (Python binary, ComfyUI folder, models, custom nodes) are centralized in `routes/platformEngine.js`. Use `getPythonBin()`, `getComfyPath()`, `COMFY_DIR` — never hardcode `'ComfyUI_windows_portable'`.

**GPU detection:** `resolveDownloadConfig()` in platformEngine.js detects GPU (NVIDIA/AMD/Intel) and CUDA version to automatically select correct engine build (`_nvidia.7z`, `_nvidia_cu126.7z`, `_amd.7z`, `_intel.7z`). Called once per engine install/upgrade; result cached for session.

**Model registry source of truth:** `js/data/modelRegistry.js` — all generative models (checkpoints, LoRAs, custom nodes) are defined here. Add new models to `MODELS` or `DEPS` here only.

**Install status:** Never hardcode `installed: true` in the registry. `syncModelInstalled()` in modelRegistry hits `GET /comfy/models/check` and sets `installed` dynamically at runtime.

**No direct Python/pip:** All engine management is via `routes/comfy.js` and `routes/shared.js`. Never spawn Python manually or hardcode binary paths.

**New model checklist:** (1) Add to `MODELS` in modelRegistry, (2) check `DEPS` in `modelConstants/dependencies.js` for dependency array, (3) provide `workflows` map with op→workflowFile entries.

See `docs/comfy.md` for the ComfyUI integration overview and `docs/data.md` for the registry structure.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Path Centralization:** Never hardcode `'ComfyUI_windows_portable'`, `'python_embeded'`, or platform paths. Use `routes/platformEngine.js` helpers: `getPythonBin()`, `getComfyPath()`, `COMFY_DIR`, `getLlamaBin()`.
2. **Source of Truth:** `js/data/modelRegistry.js` is the single source of truth for ALL generative models. If you need to add a checkpoint, LoRA, or custom node, you add it to the `MODELS` or `DEPS` dictionary here.
3. **Never Hardcode Install Status:** Never hardcode `installed: true` in the registry. Model presence is dynamically resolved at runtime by the backend `GET /comfy/models/check`.
4. **No Direct Python Exec:** Do not attempt to spawn Python or run `pip` manually from arbitrary files. All engine management is strictly handled by `routes/comfy.js` and `routes/shared.js`.
5. **GPU Detection at Download Time:** Engine download URLs are resolved at runtime via `resolveDownloadConfig()` in `_runEngineDownload()`. GPU detection happens once per install/upgrade; never hardcode specific builds in `system_dependencies.json`.

---

## 🛠️ Architecture

### 1. Platform Engine & Path Centralization

**`routes/platformEngine.js`** is the single source of truth for all platform-specific engine paths and GPU detection:

- **`COMFY_DIR`** — engine folder name (`'ComfyUI_windows_portable'` on Windows, etc.)
- **`getPythonBin(engineRoot)`** — full path to Python executable
- **`getComfyPath(engineRoot, ...parts)`** — shorthand for paths inside ComfyUI folder
- **`getLlamaBin()`** — llama-server binary name for current platform
- **`resolveDownloadConfig()`** — async GPU detection + returns correct download URLs + filenames
  - Detects NVIDIA (via `nvidia-smi`), AMD (via WMI), Intel Arc (via WMI)
  - Parses CUDA version from `nvidia-smi` header
  - Returns: `{ comfy: { url, filename }, llama: { url, filename } }`
  - Cached per session — called once during engine install/upgrade

**Usage:** Import from platformEngine.js in `routes/shared.js`, `routes/engine.js`, `routes/comfy.js`, `routes/llm.js`, `main.js`, `routes/system.js`. Never hardcode path strings or binary names.

**Why:** Enables cross-platform builds and automatic GPU variant selection without configuration.

### 2. Model Registry
When adding a new model to the application, it requires a dependency array. Check `DEPS` in `modelConstants/dependencies.js` first.
```javascript
// Adding a model to the registry (example)
{
    id: "flux_dev",
    name: "Flux Dev Base",
    mediaType: "image",
    dependencies: ["flux_dev_checkpoint", "custom_node_flux_manager"],
    workflows: {
        "generator": "flux_base_gen.json"
    }
}
```

### 2. ComfyUI Process State
The Node.js backend tracks the active python process in memory (`processState.activeComfyProcess`). 
- Do not add random CLI arguments to the spawn command without checking if they break compatibility with portable installs.
- Any new routes that communicate with ComfyUI's internal API (`/manager/unload_models`, etc.) must account for deep vs. shallow memory cleaning.

### 3. Engine Installation Flow (Fresh Install)

The engine installation is now **parallel-optimized** with aggregated progress reporting and **automatic GPU detection**:

**Order of operations:**
1. **GPU Detection** — `resolveDownloadConfig()` detects GPU (NVIDIA/AMD/Intel) and CUDA version to determine correct engine build
2. Pre-calculate combined size: engine archive (selected variant) + all missing UW deps (models + custom nodes)
3. **Start engine download** (of GPU-specific variant; progress fed to frontend)
4. **Immediately fire UW deps download in parallel** with `skipCustomNodeInstall=true` (progress also fed to frontend)
5. **Extract engine** (while UW deps continue downloading)
6. **Patch engine** and write `extra_model_paths.yaml` (critical: YAML must exist before model checker runs)
7. **Wait for UW deps downloads to complete**
8. **Finish custom node installation** via `finishCustomNodeInstall()` (now Python is available)
9. Emit `engine:complete`

**Key file locations:**
- Platform engine + GPU detection: `routes/platformEngine.js` (all path and GPU detection logic)
- Engine download orchestration: `routes/engine.js` `_runEngineDownload()` — calls `resolveDownloadConfig()` first
- UW deps separation: `routes/downloadManager.js` (`startUniversalWorkflowInstall` with `skipCustomNodeInstall` param)
- Custom node finish: `routes/downloadManager.js` (`finishCustomNodeInstall`)
- Frontend aggregation: `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` (`el.setProgress`)

**Important:** UW deps custom nodes must NOT run their pip install until **after** engine extraction completes and Python is available. The `skipCustomNodeInstall` flag delays this until `finishCustomNodeInstall()` is called in step 7.

**Progress bar behavior:** Aggregates both engine and UW deps download progress into a single unified bar showing combined bytes downloaded / combined total bytes.

### 4. Model Registry Timing Issue

**Model detection now waits for engine:ready event** (shell.js `_initDataRegistries`):
- On fresh install, the app checks for installed models **after** the engine:ready signal, not before
- This ensures `extra_model_paths.yaml` exists and has been parsed by the time model detection runs
- Without this timing fix, models would show "0 MB / total MB" on first boot, then correct themselves after app restart

### 5. Download Manager Router
See `.claude/rules/downloads.md` for full download system rules (IPC/SSE, ResumableDownloader, job shapes, event lifecycle, engine pause/resume).
