# ComfyUI Backend & Engine Rules (routes/comfy.js & modelRegistry.js)

> **AI INSTRUCTION:** This file contains rules for interacting with the raw python process, managing model dependencies, and route architecture.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves the ComfyUI backend, model registry, or Python engine.

**Platform paths:** All engine paths (Python binary, ComfyUI folder, models, custom nodes) are centralized in `routes/platformEngine.js`. Use `getPythonBin()`, `getComfyPath()`, `COMFY_DIR` — never hardcode `'ComfyUI_windows_portable'`.

**GPU detection + provisioning method:** `resolveDownloadConfig()` in platformEngine.js detects GPU (NVIDIA/AMD/Intel) and returns `{ method, comfy, gpu }`. **Windows** (`method: 'archive'`) selects a prebuilt portable build by **GPU architecture** via `selectNvidiaBuild()` (Comfy-Org: 20-series+/datacenter Turing+ → `_nvidia.7z`; 10-series & older/pre-Turing → `_nvidia_cu126.7z`; plus `_amd.7z`, `_intel.7z`) and sets `comfy: { url, filename }`. **Linux/macOS** (`method: 'uv-bootstrap'`) have no prebuilt portable, so `comfy` is `null` and the engine is built via uv + comfy-cli (see Engine Install below). CUDA version (parsed from a bare `nvidia-smi` header on **stdout**) is informational + a tiebreaker only, never the primary signal. Called once per engine install/upgrade; result cached for session. Result also exposes `gpu: { name, vendor, cudaVersion }` for UI consumption via `GET /system/gpu-info` (routes/system.js) — same cache, single `nvidia-smi` call per session.

**Engine install is platform-branched:** `_runEngineDownload()` in `routes/engine.js` dispatches on `resolveDownloadConfig().method`. Windows → `_provisionWindowsEngine()` (download `.7z` + extract; `7zip-bin`/`node-7z` are required **only** inside that branch, never at module load). Linux/macOS → `_provisionUvEngine()` (`uv venv --python 3.12` → `uv pip install comfy-cli` → `comfy --skip-prompt --workspace <COMFY_DIR> install <gpu-flag> --fast-deps`). uv comes from `resolveUvBin()` (`CUBRIC_UV_BIN` then PATH `uv`). Both branches produce the same layout `getPythonBin()`/`getComfyPath()` expect, so the spawn-based launch in `comfy.js` is platform-agnostic. Accelerators (Triton/SageAttention) are intentionally NOT installed — see kanban MPI-50.

**Model registry source of truth:** `js/data/modelRegistry.js` — all generative models (checkpoints, LoRAs, custom nodes) are defined here. Add new models to `MODELS` or `DEPS` here only.

**Install status:** Never hardcode `installed: true` in the registry. `syncModelInstalled()` in modelRegistry hits `GET /comfy/models/check` and sets `installed` dynamically at runtime.

**No direct Python/pip:** All engine management is via `routes/comfy.js` and `routes/shared.js`. Never spawn Python manually or hardcode binary paths.

**New model checklist:** (1) Add to `MODELS` in modelRegistry, (2) check `DEPS` in `modelConstants/dependencies.js` for dependency array, (3) provide `workflows` map with op→workflowFile entries, (4) **checkpoint filenames must match the actual on-disk path** — do not include subfolder prefixes (e.g. `SDXL/`, `ILL/`, `PONY/`) unless that subfolder actually exists in the models folder. The backend searches using the exact path in `dep.filename` against `customRoot` (or engine default); mismatches cause the model to show as "not installed" despite files being present.

**Extra model folders:** Additive user folders exist only for `loras` and `upscale_models`. They are stored in `extra_model_folders.json` and re-merged into `extra_model_paths.yaml`; do not parse multiline YAML entries as the source of truth. The configured paths are bucket folders, not parent model roots.

See `docs/comfy.md` for the ComfyUI integration overview and `docs/data.md` for the registry structure.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Path Centralization:** Never hardcode `'ComfyUI_windows_portable'`, `'python_embeded'`, or platform paths. Use `routes/platformEngine.js` helpers: `getPythonBin()`, `getComfyPath()`, `COMFY_DIR`.
2. **Source of Truth:** `js/data/modelRegistry.js` is the single source of truth for ALL generative models. If you need to add a checkpoint, LoRA, or custom node, you add it to the `MODELS` or `DEPS` dictionary here.
3. **Never Hardcode Install Status:** Never hardcode `installed: true` in the registry. Model presence is dynamically resolved at runtime by the backend `GET /comfy/models/check`.
4. **No Direct Python Exec:** Do not attempt to spawn Python or run `pip` manually from arbitrary files. All engine management is strictly handled by `routes/comfy.js` and `routes/shared.js`.
5. **GPU Detection + Platform Branch at Install Time:** Provisioning is resolved at runtime via `resolveDownloadConfig()` in `_runEngineDownload()`, which branches on `.method`: Windows extracts a prebuilt `.7z` (`_provisionWindowsEngine`, 7z required only there), Linux/macOS bootstrap via uv + comfy-cli (`_provisionUvEngine`). GPU detection happens once per install/upgrade; never hardcode specific builds in `system_dependencies.json`. Do NOT require `7zip-bin`/`node-7z` at module load — keep them inside the Windows branch.
6. **Extra Folder Contract:** Only `loras` and `upscale_models` support additive external folders. Keep extras outside dependency registry, install, uninstall, and garbage-collection flows.

---

## 🛠️ Architecture

### 1. Platform Engine & Path Centralization

**`routes/platformEngine.js`** is the single source of truth for all platform-specific engine paths and GPU detection:

- **`COMFY_DIR`** — engine folder name (`'ComfyUI_windows_portable'` on Windows, etc.)
- **`getPythonBin(engineRoot)`** — full path to Python executable
- **`getComfyPath(engineRoot, ...parts)`** — shorthand for paths inside ComfyUI folder
- **`resolveDownloadConfig()`** — async GPU detection + provisioning method
  - Detects NVIDIA (via `nvidia-smi`), AMD (via WMI), Intel Arc (via WMI)
  - Windows: selects prebuilt NVIDIA build by GPU architecture (`selectNvidiaBuild`); CUDA version (bare `nvidia-smi` stdout header) is informational/tiebreaker only
  - Returns: `{ method: 'archive'|'uv-bootstrap', comfy: { url, filename }|null, gpu }` — `comfy` is null on Linux/macOS (uv-bootstrap)
  - Cached per session — called once during engine install/upgrade
- **`resolveUvBin()`** — resolves the uv binary for Linux/macOS bootstrap: `CUBRIC_UV_BIN` (zip-local `<root>/uv/uv`) then PATH `uv`

**Usage:** Import from platformEngine.js in `routes/shared.js`, `routes/engine.js`, `routes/comfy.js`, `main.js`, `routes/system.js`. Never hardcode path strings or binary names.

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
- ComfyUI stdout/stderr phase lines may drive renderer lifecycle via `/comfy/events/stream`. Preserve `Model Initializing ...` and `Model Initialization complete!` parsing in `routes/comfy.js`; StatusBar timing depends on those events for model-initialization-sensitive sampler/upscale nodes.

### 3. Engine Installation Flow (Fresh Install)

The engine installation is now **parallel-optimized** with aggregated progress reporting and **automatic GPU detection**:

**Order of operations:**
1. **GPU Detection** — `resolveDownloadConfig()` detects GPU (NVIDIA/AMD/Intel) and selects the engine build by GPU architecture (`selectNvidiaBuild`); CUDA version is informational/tiebreaker only
2. Pre-calculate combined size: engine archive (selected variant) + all deps with `installOnEngine: true` in `dependencies.js`
3. **Start engine download** (of GPU-specific variant; progress fed to frontend)
4. **Immediately fire engine-deps download in parallel** with `skipCustomNodeInstall=true` (progress also fed to frontend)
5. **Extract engine** (while deps continue downloading)
6. **Patch engine** and write `extra_model_paths.yaml` (critical: YAML must exist before model checker runs)
7. **Wait for engine-deps downloads to complete**
8. **Finish custom node installation** via `finishCustomNodeInstall()` (now Python is available)
9. **Stop any running ComfyUI and reset `comfyNeedsRestart`** — `stopComfyUI()` + `processState.comfyNeedsRestart = false` called before broadcast, ensuring a clean start on next generation
10. Emit `engine:complete`

**Key file locations:**
- Platform engine + GPU detection: `routes/platformEngine.js` (all path and GPU detection logic)
- Engine download orchestration: `routes/engine.js` `_runEngineDownload()` — calls `resolveDownloadConfig()` first
- Engine-deps source: `dependencies.js` (`installOnEngine: true` flag) — no per-workflow tracking needed
- Engine-deps download: `routes/downloadManager.js` (`startUniversalWorkflowInstall` with `skipCustomNodeInstall` param)
- Custom node finish: `routes/downloadManager.js` (`finishCustomNodeInstall`)
- Frontend aggregation: `js/components/Compounds/MpiEngineInstall/MpiEngineInstall.js` (`el.setProgress`)

**Important:** UW deps custom nodes must NOT run their pip install until **after** engine extraction completes and Python is available. The `skipCustomNodeInstall` flag delays this until `finishCustomNodeInstall()` is called in step 7.

**Progress bar behavior:** Aggregates both engine and UW deps download progress into a single unified bar showing combined bytes downloaded / combined total bytes.

### 4. Model Registry Timing Issue

**Model detection now waits for engine:ready event** (shell.js `_initDataRegistries`):
- On fresh install, the app checks for installed models **after** the engine:ready signal, not before
- This ensures `extra_model_paths.yaml` exists and has been parsed by the time model detection runs
- Without this timing fix, models would show "0 MB / total MB" on first boot, then correct themselves after app restart

### 5. Extra LoRA and Upscale Model Folders

Users may add read-only additive folders for only `loras` and `upscale_models`.
The primary models root still comes from `extra_model_paths.yaml` `base_path:`
via `getCustomRoot()` or falls back to the **default models root**
(`getDefaultModelsRoot()` in `routes/shared.js`). That default is
`CUBRIC_MODELS_ROOT` when set — the portable launchers export it as
`<portable-root>/models` (OUTSIDE the engine folder) — and only falls back to
`<ENGINE_ROOT>/mpi_models` in dev/no-env runs. **`mpi_models` is legacy:** never
hardcode it or `ensureDir` it on install/upgrade; always use
`getDefaultModelsRoot()` so the folder lands where the launcher points. Extra
folders are stored separately in `extra_model_folders.json` and written back into
`extra_model_paths.yaml` as multiline values for only those two keys.

Backend contract:
- `GET /comfy/extra-folders` returns `{ loras: string[], upscale_models: string[] }`.
- `POST /comfy/extra-folders` validates that each path exists and is a directory, persists the separate config, and rewrites YAML.
- `POST /comfy/set-path` must always re-merge stored extras when rewriting YAML; clearing the primary path removes YAML only when no extras are configured.
- `GET /comfy/list-files` unions the primary bucket folder with matching extras and preserves `{ success: true, files: string[] }`. Emits the ENGINE-OS path separator (local Windows `\`, remote `/`) so values match ComfyUI's loader enum; forcing forward slash 400s subfolder models on Windows.
- `GET /comfy/model-folders?bucket=loras|upscale_models` returns `{ folders: [{ path, primary }] }` (primary bucket folder + extras) — used to render drag-drop zones.
- `POST /comfy/import-model` `{ sourcePath, targetFolder, bucket, overwrite? }` copies a local model file into a CONFIGURED folder (allow-list = primary + extras); refuses overwrite without `overwrite:true` (409). Used by `MpiFolderDrop`.
- `POST /comfy/models/uninstall` must only trash non-custom-node model files inside the managed primary models root; custom nodes stay guarded by the default custom-nodes root.

### 6. Download Manager Router
See `.claude/rules/downloads.md` for full download system rules (IPC/SSE, ResumableDownloader, job shapes, event lifecycle, engine pause/resume).
