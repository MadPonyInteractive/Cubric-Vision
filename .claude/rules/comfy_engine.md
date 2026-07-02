# ComfyUI Backend & Engine Rules (routes/comfy.js & modelRegistry.js)

> **AI INSTRUCTION:** This file contains rules for interacting with the raw python process, managing model dependencies, and route architecture.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves the ComfyUI backend, model registry, or Python engine.

**Platform paths:** All engine paths (Python binary, ComfyUI folder, models, custom nodes) are centralized in `routes/platformEngine.js`. Use `getPythonBin()`, `getComfyPath()`, `COMFY_DIR` — never hardcode `'ComfyUI_windows_portable'`.

**Adding a custom-node dep — `installOnEngine` decision (do NOT copy the adjacent entry's flag):** `installOnEngine: true` = UNIVERSAL-workflow node (every workflow needs it, e.g. kjnodes/VHS/Impact) → installs with the engine always. A MODEL-SPECIFIC node (only one model uses it, e.g. `ComfyUI-PainterI2Vadvanced`/Wan, `ComfyUI-GGUF`/LTX-2.3) → **NO `installOnEngine`**; list it in that model's `dependencies[]` in `models.js` and it installs via `getInstalledModelNodeDeps()` when the model's weights are present + node missing. `installRequirements: true` is orthogonal — set it whenever the node has a real `requirements.txt`.

**GPU detection + provisioning method:** `resolveDownloadConfig()` in platformEngine.js detects GPU (NVIDIA/AMD/Intel) and returns `{ method, comfy, gpu }`. **Windows** (`method: 'archive'`) selects a prebuilt portable build by **GPU architecture** via `selectNvidiaBuild()` (Comfy-Org: 20-series+/datacenter Turing+ → `_nvidia.7z`; 10-series & older/pre-Turing → `_nvidia_cu126.7z`; plus `_amd.7z`, `_intel.7z`) and sets `comfy: { url, filename }`. **Linux/macOS** (`method: 'uv-bootstrap'`) have no prebuilt portable, so `comfy` is `null` and the engine is built via uv + comfy-cli (see Engine Install below). CUDA version (parsed from a bare `nvidia-smi` header on **stdout**) is informational + a tiebreaker only, never the primary signal. Called once per engine install/upgrade; result cached for session. Result also exposes `gpu: { name, vendor, cudaVersion }` for UI consumption via `GET /system/gpu-info` (routes/system.js) — same cache, single `nvidia-smi` call per session.

**Engine install is platform-branched:** `_runEngineDownload()` in `routes/engine.js` dispatches on `resolveDownloadConfig().method`. Windows → `_provisionWindowsEngine()` (download `.7z` + extract; `7zip-bin`/`node-7z` are required **only** inside that branch, never at module load). Linux/macOS → `_provisionUvEngine()` (`uv venv --python 3.12` → `uv pip install comfy-cli` → `comfy --skip-prompt --workspace <COMFY_DIR> install <gpu-flag> --fast-deps`). uv comes from `resolveUvBin()` (`CUBRIC_UV_BIN` then PATH `uv`). Both branches produce the same layout `getPythonBin()`/`getComfyPath()` expect, so the spawn-based launch in `comfy.js` is platform-agnostic. Accelerators (Triton/SageAttention) are intentionally NOT installed — see kanban MPI-50.

**Model registry source of truth:** `js/data/modelRegistry.js` is the import surface for all generative models. Add new model entries to `MODELS` in `js/data/modelConstants/models.js` and dependency entries to `DEPS` in `js/data/modelConstants/dependencies.js`; `modelRegistry.js` re-exports them.

**Engine split — ONE `engines:` block + ONE resolver, engine resolved ONCE per gen (MPI-165):** a model whose deps/workflow differ by where it runs (LTX-2.3: bf16 transformer local-only, Q8 GGUF transformer + `ComfyUI-GGUF` node Pod-only) declares the variance STRUCTURALLY in a single block: `engines: { local: { extraDeps: [...], workflowSuffix: '' }, remote: { extraDeps: [...], workflowSuffix: '_gguf' } }`. NEVER add a per-dep `engine` tag, a `localDeps`/`remoteDeps`/`ggufWhenRemote` field, or a `_toGgufFilename` helper — those are the DELETED smear that caused repeated half-wires. ALL resolution goes through `js/data/modelConstants/resolveModelDeps.js`: `resolveDeps(model, ops, depExists, engine)` adds `engines[engine].extraDeps`; `resolveWorkflowFile(model, op, engine, {stage2})` applies the suffix (order: `_stage2` THEN engine suffix → `..._stage2_gguf.json`, matching `generate_ltx.py`); `resolve(model, ops, engine, {stage2, op, isNode})` returns `{depIds, workflowFile, nodeIds}` in one call. The resolver is browser/DOM-free (node-tested: `tests/resolve-model-deps.test.cjs`). **Resolve-engine-ONCE:** every consumer must receive a concrete `'local'|'remote'` string resolved ONCE per generation AFTER `remoteEngineClient.refresh()` — never let two consumers call `isRemote()` independently (a read before vs after refresh disagrees; that race sent the bf16 workflow to a Pod). `commandExecutor.js runCommand` resolves it once and threads it. **Two orthogonal axes:** the OPERATION axis (`commonDeps` + `operations{}`, e.g. `ComfyUI-PainterI2Vadvanced` is i2v-only) and the ENGINE axis are independent and UNION inside `resolveDeps` — a model may have neither, one, or both. `engine === null` resolves the UNION of both engines' extraDeps (shared-dep PROTECTION only — never delete a weight the other engine needs); every real install/status/uninstall path passes a concrete engine.

**Install status:** Never hardcode `installed: true` in the registry. `syncModelInstalled()` in modelRegistry hits `GET /comfy/models/check` and sets `installed` dynamically at runtime.

**No direct Python/pip:** All engine management is via `routes/comfy.js` and `routes/shared.js`. Never spawn Python manually or hardcode binary paths.

**New model checklist:** (1) Add to `MODELS` in `js/data/modelConstants/models.js`, (2) check `DEPS` in `modelConstants/dependencies.js` for dependency array, (3) provide `workflows` map with op→workflowFile entries, (4) **checkpoint filenames must match the actual on-disk path** — do not include subfolder prefixes (e.g. `SDXL/`, `ILL/`, `PONY/`) unless that subfolder actually exists in the models folder. The backend searches using the exact path in `dep.filename` against `customRoot` (or engine default); mismatches cause the model to show as "not installed" despite files being present.

**`installOnEngine` is ONLY for UNIVERSAL-WORKFLOW deps — NOT for model-specific custom nodes.** When adding a NEW custom-node dep, decide by ROLE, not by copying the adjacent entry's shape:
- **Universal (every workflow needs it, e.g. `comfyui-kjnodes`, `ComfyUI-VideoHelperSuite`, `ComfyUI-Impact-Pack`)** → `installOnEngine: true`. `getUniversalWorkflowDepIds()` (shared.js:481) filters on this flag and installs it WITH the engine, always, regardless of which models are present.
- **Model-specific (only one model's workflow uses it, e.g. `ComfyUI-PainterI2Vadvanced` for Wan I2V, `ComfyUI-GGUF` for LTX-2.3 GGUF)** → **NO `installOnEngine`**. List it in that model's `dependencies[]` array in `models.js` instead. It installs via `getInstalledModelNodeDeps()` (shared.js:524) when the model's WEIGHTS are present on disk but its node is missing. Setting `installOnEngine: true` on a model-specific node wrongly forces it onto EVERY engine install (bloat) and mis-signals intent.
- `installRequirements: true` is ORTHOGONAL — set it whenever the node ships a real `requirements.txt` (e.g. `ComfyUI-GGUF` needs `gguf>=0.13.0`), independent of the `installOnEngine` decision.

**Extra model folders:** Additive user folders exist only for `loras` and `upscale_models`. They are stored in `extra_model_folders.json` and re-merged into `extra_model_paths.yaml`; do not parse multiline YAML entries as the source of truth. The configured paths are bucket folders, not parent model roots.

**Windows ComfyUI launch MUST force UTF-8 (`PYTHONUTF8=1`):** the embedded Python on Windows defaults source + stdio to cp1252. A custom node with a non-Latin-1 char in a string literal raises a `SyntaxError` on import AND crashes the traceback printer on the same char → the whole ComfyUI process exits (no server → no prompt box). `routes/comfy.js` sets `PYTHONUTF8: '1'` + `PYTHONIOENCODING: 'utf-8'` on the spawn env (all platforms); `engine.js` prepends `set PYTHONUTF8=1` to the patched `run_nvidia_gpu.bat`. Do NOT remove these. (MPI-118; Linux/Builder never hits it.)

**Engine upgrade/wipe MUST preserve the custom models root:** any op that wipes the engine folder (`/engine/upgrade`) destroys `extra_model_paths.yaml`. Capture the root FIRST with `getCustomRoot()` (shared.js — reads `base_path:`) and pass it to `_runEngineDownload(preservedRoot)`, which re-writes it at step 6. `hasCustomRoot` is a boolean flag, NOT the value — never rely on it for preservation. Otherwise the user's custom folder (e.g. `D:\CubricModels`) silently resets to the default `mpi_models` → 0 models → no prompt box. (MPI-118.)

**Engine reinstall MUST restore installed-model-specific node deps:** the UW reinstall set only covers `installOnEngine: true` deps. A model-specific custom node (e.g. `ComfyUI-PainterI2Vadvanced` for Wan I2V) is dropped on engine wipe. `getInstalledModelNodeDeps()` (shared.js) returns the custom-node deps of models whose weights are present on disk but whose nodes are missing; `_runEngineDownload` merges these into `missingDepIds`. Without it, the model shows "partially installed" after upgrade. (MPI-118.)

**Models-path / folder change needs a ComfyUI restart:** ComfyUI builds `folder_names_and_paths` from `extra_model_paths.yaml` at startup ONLY — stock v0.25.1 has no runtime path-reload route. After a Settings path/folder change, `_setComfyPath` sets `state.comfyNeedsRestart = true`; `comfyController.js` then stops/starts ComfyUI at next generation so it re-reads the YAML. A running process keeps a stale (often empty) checkpoint list otherwise → `ckpt_name not in []`. A lighter `/object_info` refresh suffices ONLY for file add/remove in an already-registered folder, not a root change (see kanban MPI-121).

See `docs/comfy.md` for the ComfyUI integration overview and `docs/data.md` for the registry structure.

## 🔴 CRITICAL "NEVER FORGET" RULES
1. **Path Centralization:** Never hardcode `'ComfyUI_windows_portable'`, `'python_embeded'`, or platform paths. Use `routes/platformEngine.js` helpers: `getPythonBin()`, `getComfyPath()`, `COMFY_DIR`.
2. **Source of Truth:** `js/data/modelConstants/models.js` is where `MODELS` entries are added; `js/data/modelConstants/dependencies.js` holds `DEPS`. `js/data/modelRegistry.js` re-exports them and is the import surface for consumers.
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
When adding a new model to the application, add an entry to `MODELS` in `js/data/modelConstants/models.js`. Check `DEPS` in `modelConstants/dependencies.js` first for existing dependency entries.
```javascript
// Adding a model to models.js (example)
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

### 2.5 Engine Split — one `engines:` block, one resolver (MPI-165)

Some models need different weights AND a different workflow depending on the
ENGINE the gen runs on. The canonical case is **LTX-2.3**: locally it uses the
bf16 transformer (faster per-step at high res); on a RunPod Pod it uses the Q8
GGUF transformer (sidesteps the aimdo cold tax) loaded by the Pod-only
`ComfyUI-GGUF` node, and a different workflow file (`LTX_t2v_gguf.json`).

This variance lives in **ONE block on the model**, resolved by **ONE resolver**,
with the engine resolved **ONCE per generation**. This replaced an earlier smear
(`localDeps`/`remoteDeps` + `ggufWhenRemote`/`_toGgufFilename` + per-consumer
`isRemote()` reads) that caused repeated half-wire bugs — including a live gen
where the bf16 workflow reached a Pod and ComfyUI rejected
`unet_name ...bf16... not in []`.

```js
// models.js — the engine axis in ONE block
{
  id: 'ltx-23',
  dependencies: [ /* shared by both engines */ ],
  workflows: { t2v_ms: 'LTX_t2v.json', i2v_ms: 'LTX_i2v.json' },
  engines: {
    local:  { extraDeps: ['ltx23-transformer-bf16'],                  workflowSuffix: '' },
    remote: { extraDeps: ['ltx23-transformer-gguf', 'ComfyUI-GGUF'],  workflowSuffix: '_gguf' },
  },
}
```

**The resolver (`js/data/modelConstants/resolveModelDeps.js`) is the only place
that reads the split.** Three entry points, all browser/DOM-free
(node-tested in `tests/resolve-model-deps.test.cjs`):

- `resolveDeps(model, selectedOps, depExists, engine)` — common/op deps **+**
  `engines[engine].extraDeps`, deduped. `engine: 'local'|'remote'` picks one set;
  `null` returns the UNION of both (shared-dep PROTECTION only — so cross-model
  garbage-collection never deletes a weight the other engine needs).
- `resolveWorkflowFile(model, op, engine, {stage2})` — `workflows[op]` then
  `_stage2` (if stage2) then `engines[engine].workflowSuffix`. Suffix order MUST
  yield `..._stage2_gguf.json`, matching `generate_ltx.py`'s output.
- `resolve(model, ops, engine, {stage2, op, isNode})` — one-call façade →
  `{ depIds, workflowFile, nodeIds }`.

**Resolve-engine-ONCE (the core rule):** resolve a concrete `'local'|'remote'`
string ONCE per gen, AFTER `remoteEngineClient.refresh()`, then thread it.
`commandExecutor.js runCommand` does this and passes it to `resolveWorkflowFile`.
NEVER let two consumers call `isRemote()` independently — a read milliseconds
before vs after `refresh()` disagrees, and that smear is what every half-wire
came from. UI consumers that judge install state per engine
(`isModelUsable`/`isOperationInstalled` in `modelRegistry.js`,
`_installedOpsOf`/`_confirmWholeUninstall`/`_opUninstallDepIds` in
`MpiModelManager.js`, `_ctxWithInstalledOps` in `MpiPromptBox.js`) each resolve
the current engine and pass it to `deriveInstalledOps`/`resolveDeps` so a Pod
never reads "not installed" because the local bf16 is absent (and vice-versa).

**Two orthogonal axes that COMPOSE:** the OPERATION axis (`commonDeps` +
`operations{}` — which deps depend on *what the user does*, e.g.
`ComfyUI-PainterI2Vadvanced` is i2v-only) and the ENGINE axis (which deps/workflow
depend on *where it runs*) are independent. A model may have neither, one, or
both. `resolveDeps` unions them — op deps and engine extraDeps are both appended,
never collide. The `engineDepsOf` helper is engine-only by design; the union
happens in `resolveDeps`.

**Authoring a new engine-split model:** add an `engines:` block (NOT `localDeps`/
`remoteDeps`/`ggufWhenRemote`); list each engine's unique weights in its
`extraDeps`; set `workflowSuffix` to the suffix your build script appends to that
engine's workflow files (`''` for the default/local files). The Pod-only node
(like `ComfyUI-GGUF`) goes in `engines.remote.extraDeps`, NOT `installOnEngine:
true` (it has no local use). The generated workflow files must reference ONLY
weights/media that exist on the TARGET engine — ComfyUI eager-validates every
node's file inputs at PROMPT time (a lazy `MpiIfElse` defers EXECUTION, not
VALIDATION), so a file carrying both engines' loaders rejects on the engine that
lacks one. That one-loader-per-file split lives in the BUILD script
(`comfy_workflows/scripts/workflow_generation/generate_ltx.py`) — see § 2.5
"Engine Split" above for the full contract.

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
