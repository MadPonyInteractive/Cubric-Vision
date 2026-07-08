# ComfyUI Backend & Engine Rules (routes/comfy.js & modelRegistry.js)

> **AI INSTRUCTION:** This file contains rules for interacting with the raw python process, managing model dependencies, and route architecture.

## Sub-Agent Briefing
> Copy this section verbatim into any sub-agent prompt that involves the ComfyUI backend, model registry, or Python engine.

**Platform paths:** All engine paths (Python binary, ComfyUI folder, models, custom nodes) are centralized in `routes/platformEngine.js`. Use `getPythonBin()`, `getComfyPath()`, `COMFY_DIR` — never hardcode `'ComfyUI_windows_portable'`.

**Adding a custom-node dep — nodes are UNIVERSAL by TYPE (MPI-222):** every `type: 'custom_nodes'` dep is in the universal set — there is no longer a model-specific node class (the old `installOnEngine` flag + `getInstalledModelNodeDeps()` are DELETED). `getUniversalWorkflowDepIds()` selects `type==='custom_nodes' || engineAsset===true`, so every node installs with the engine and every `engineAsset` weight (upscalers, yolo/sam, RIFE) comes with it. The ONE knob on a node entry is **`installRequirements: true/false`** — orthogonal to universality — set it whenever the node ships a real `requirements.txt` (it also gates Pod BAKE vs VOLUME, see below). A node's pinned commit lives in `dev_configs/node_lock.json` (`source: git-commit|git-tag|registry`); bumping it there triggers the drift ladder (marker `.mpi_node_commit`) on both engines — no other edit needed.

**GPU detection + provisioning method:** `resolveDownloadConfig()` in platformEngine.js detects GPU (NVIDIA/AMD/Intel) and returns `{ method, comfy, gpu }`. **Windows** (`method: 'archive'`) selects a prebuilt portable build by **GPU architecture** via `selectNvidiaBuild()` (Comfy-Org: 20-series+/datacenter Turing+ → `_nvidia.7z`; 10-series & older/pre-Turing → `_nvidia_cu126.7z`; plus `_amd.7z`, `_intel.7z`) and sets `comfy: { url, filename }`. **Linux/macOS** (`method: 'uv-bootstrap'`) have no prebuilt portable, so `comfy` is `null` and the engine is built via uv + comfy-cli (see Engine Install below). CUDA version (parsed from a bare `nvidia-smi` header on **stdout**) is informational + a tiebreaker only, never the primary signal. Called once per engine install/upgrade; result cached for session. Result also exposes `gpu: { name, vendor, cudaVersion }` for UI consumption via `GET /system/gpu-info` (routes/system.js) — same cache, single `nvidia-smi` call per session.

**Engine install is platform-branched:** `_runEngineDownload()` in `routes/engine.js` dispatches on `resolveDownloadConfig().method`. Windows → `_provisionWindowsEngine()` (download `.7z` + extract; `7zip-bin`/`node-7z` are required **only** inside that branch, never at module load). Linux/macOS → `_provisionUvEngine()` (`uv venv --python 3.12` → `uv pip install comfy-cli` → `comfy --skip-prompt --workspace <COMFY_DIR> install <gpu-flag> --fast-deps`). uv comes from `resolveUvBin()` (`CUBRIC_UV_BIN` then PATH `uv`). Both branches produce the same layout `getPythonBin()`/`getComfyPath()` expect, so the spawn-based launch in `comfy.js` is platform-agnostic. Accelerators (Triton/SageAttention) are intentionally NOT installed — see kanban MPI-50.

**Model registry source of truth:** `js/data/modelRegistry.js` is the import surface for all generative models. Add new model entries to `MODELS` in `js/data/modelConstants/models.js` and dependency entries to `DEPS` in `js/data/modelConstants/dependencies.js`; `modelRegistry.js` re-exports them.

**Engine split — ONE `engines:` block + ONE resolver, engine resolved ONCE per gen (MPI-165):** a model whose deps/workflow differ by where it runs (LTX-2.3: bf16 transformer local-only, Q8 GGUF transformer + `ComfyUI-GGUF` node Pod-only) declares the variance STRUCTURALLY in a single block: `engines: { local: { extraDeps: [...], workflowSuffix: '' }, remote: { extraDeps: [...], workflowSuffix: '_gguf' } }`. NEVER add a per-dep `engine` tag, a `localDeps`/`remoteDeps`/`ggufWhenRemote` field, or a `_toGgufFilename` helper — those are the DELETED smear that caused repeated half-wires. ALL resolution goes through `js/data/modelConstants/resolveModelDeps.js`: `resolveDeps(model, ops, depExists, engine)` adds `engines[engine].extraDeps`; `resolveWorkflowFile(model, op, engine, {stage2})` applies the suffix (order: `_stage2` THEN engine suffix → `..._stage2_gguf.json`, matching `generate_ltx.py`); `resolve(model, ops, engine, {stage2, op, isNode})` returns `{depIds, workflowFile, nodeIds}` in one call. The resolver is browser/DOM-free (node-tested: `tests/resolve-model-deps.test.cjs`). **Resolve-engine-ONCE:** every consumer must receive a concrete `'local'|'remote'` string resolved ONCE per generation AFTER `remoteEngineClient.refresh()` — never let two consumers call `isRemote()` independently (a read before vs after refresh disagrees; that race sent the bf16 workflow to a Pod). `commandExecutor.js runCommand` resolves it once and threads it. **Two orthogonal axes:** the OPERATION axis (`commonDeps` + `operations{}`, e.g. `ComfyUI-PainterI2Vadvanced` is i2v-only) and the ENGINE axis are independent and UNION inside `resolveDeps` — a model may have neither, one, or both. `engine === null` resolves the UNION of both engines' extraDeps (shared-dep PROTECTION only — never delete a weight the other engine needs); every real install/status/uninstall path passes a concrete engine.

**Install status:** Never hardcode `installed: true` in the registry. `syncModelInstalled()` in modelRegistry hits `GET /comfy/models/check` and sets `installed` dynamically at runtime.

**No direct Python/pip:** All engine management is via `routes/comfy.js` and `routes/shared.js`. Never spawn Python manually or hardcode binary paths.

**New model checklist:** (1) Add to `MODELS` in `js/data/modelConstants/models.js`, (2) check `DEPS` in `modelConstants/dependencies.js` for dependency array, (3) provide `workflows` map with op→workflowFile entries, (4) **checkpoint filenames must match the actual on-disk path** — do not include subfolder prefixes (e.g. `SDXL/`, `ILL/`, `PONY/`) unless that subfolder actually exists in the models folder. The backend searches using the exact path in `dep.filename` against `customRoot` (or engine default); mismatches cause the model to show as "not installed" despite files being present.

**Custom nodes are universal by TYPE; weights opt in with `engineAsset` (MPI-222 — replaced the old `installOnEngine` flag).** When adding a NEW dep:
- **Any `type: 'custom_nodes'`** → in the universal set automatically, no flag. `getUniversalWorkflowDepIds()` (shared.js) selects `type==='custom_nodes' || engineAsset===true` and installs it WITH the engine, always. There is no model-specific node class anymore (`installOnEngine` + `getInstalledModelNodeDeps()` deleted) — a model that needs a node just installs it as a universal node when its weights land; a node folder's presence + commit are what matter, not a per-model tie.
- **A WEIGHT that must ship with the engine** (upscalers, yolo/sam detectors, RIFE) → `engineAsset: true`. This is the ONLY weight flag; it pulls the file into the universal install set + (on remote) marks it image-resident.
- **`installRequirements: true/false`** → set `true` when the node ships a real `requirements.txt`. Orthogonal to universality, but it ALSO drives the Pod split: `installRequirements: true` nodes BAKE into the Pod image (pip cost paid at build); `false` nodes install onto the volume at connect (no rebuild to bump them). See § "Node commit-drift ladder" below.
- **In-folder weights** (a node that hard-codes its own scan dir, e.g. RIFE's `ckpts/rife/`) → add a `targetPath: 'custom_nodes/<node>/<subdir>'` to the weight dep so the resolver installs it INSIDE the node folder instead of `mpi_models/`. See § "Node commit-drift ladder".

**Extra model folders:** Additive user folders exist only for `loras` and `upscale_models`. They are stored in `extra_model_folders.json` and re-merged into `extra_model_paths.yaml`; do not parse multiline YAML entries as the source of truth. The configured paths are bucket folders, not parent model roots.

**Windows ComfyUI launch MUST force UTF-8 (`PYTHONUTF8=1`):** the embedded Python on Windows defaults source + stdio to cp1252. A custom node with a non-Latin-1 char in a string literal raises a `SyntaxError` on import AND crashes the traceback printer on the same char → the whole ComfyUI process exits (no server → no prompt box). `routes/comfy.js` sets `PYTHONUTF8: '1'` + `PYTHONIOENCODING: 'utf-8'` on the spawn env (all platforms); `engine.js` prepends `set PYTHONUTF8=1` to the patched `run_nvidia_gpu.bat`. Do NOT remove these. (MPI-118; Linux/Builder never hits it.)

**Engine upgrade/wipe MUST preserve the custom models root:** any op that wipes the engine folder (`/engine/upgrade`) destroys `extra_model_paths.yaml`. Capture the root FIRST with `getCustomRoot()` (shared.js — reads `base_path:`) and pass it to `_runEngineDownload(preservedRoot)`, which re-writes it at step 6. `hasCustomRoot` is a boolean flag, NOT the value — never rely on it for preservation. Otherwise the user's custom folder (e.g. `D:\CubricModels`) silently resets to the default `mpi_models` → 0 models → no prompt box. (MPI-118.)

**Engine reinstall restores ALL nodes (MPI-222):** every `custom_nodes` dep is universal now, so the UW reinstall set already covers every node an engine wipe drops — `_runEngineDownload` just uses `missingDeps` directly (the old `getInstalledModelNodeDeps()` model-specific merge is deleted; it returned `[]` once all nodes went universal). A former model-specific node like `ComfyUI-PainterI2Vadvanced` is now restored the same as any universal node. (MPI-118/222.)

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

### 2.5a SSE engine-tagging law + the generation store (MPI-208)

The engine split extends to the **event transport**. Every generation SSE frame
carries an `engine: 'local'|'remote'` tag in its payload (`routes/comfy.js`
`_broadcastComfyEvent`). In remote mode `routes/remoteProxyForward.js` **MERGES**
the two sources onto `/comfy/events/stream` (local stdout tagged `local`, Pod
wrapper relay tagged `remote`) instead of REPLACING the stream with an unfiltered
Pod relay. Each in-flight gen reacts ONLY to frames matching its FROZEN engine —
`commandExecutor._frameEngineMatches(e)` drops foreign frames (a force-local gen
ignores Pod install/relay noise; a remote gen ignores local stdout). Untagged
frames match (backward-compat). This kills the cross-engine contamination where
Pod activity poisoned a local gen's model-load phase.

`js/services/generationStore.js` is the **single source of truth** for generation
lifecycle: one job record per gen with a phase state machine + per-lane accounting
(max 1 active on each of `local`/`remote` + FIFO pending) + an abort token. Stop =
`store.cancel(jobId)` → aborts the token + fires the FROZEN engine interrupt
(`interrupt()` + `deleteQueueItem(promptId)`, never re-resolved at cancel time) +
releases the lane. All generation UI (statusBar, Cue count, QueuePanel) DERIVES
from `generation-store:changed` — the store emits the legacy `tool:*`/`generation:*`
events from its transitions so consumers migrate incrementally. Full contract:
`research/requirements-archaeology.md` in the MPI-208 task workspace.

### 2.5b Runtime Variant Axis — the generic `variants:` block (MPI-200)

The ENGINE axis (§2.5) is the special case of a broader pattern: a model whose
deps/workflow vary by a RUNTIME signal. The FIRST additional case is **GPU
architecture** — LTX-2.3 balanced ships a `mxfp8_block32` transformer on Blackwell
(native tensor path) and `fp8_scaled` on Ada/Ampere/Turing, both ~24-25GB (fit
32GB, kill the bf16 eviction floor MPI-197 traced). Rather than bolt on a bespoke
arch axis, this is a **generic, card-declared variant axis** so future runtime
axes (an arch-dependent node, a per-card LoRA, anything keyed on a runtime token)
need NO new resolver code — declare the axis on the card and the resolver composes
it. Built ADDITIVE: the `engines:` axis is untouched; the resolver merges engine
deps + variant deps + suffixes.

```js
// models.js — any card declares named variant axes. Same shape as engines:.
{
  id: 'ltx-23-balanced',
  dependencies: [ /* shared, MINUS the arch-specific transformer */ ],
  workflows: { t2v_ms: 'LTX_t2v.json', i2v_ms: 'LTX_i2v.json' },  // base names
  variants: {
    arch: {                                  // axis key === the runtime token name
      options: {
        blackwell: { extraDeps: ['ltx23-transformer-mxfp8'], workflowSuffix: '_mxfp8' },
        modern:    { extraDeps: ['ltx23-transformer-fp8'],   workflowSuffix: '_fp8'   },
      },
    },
  },
}
```

**Resolver (`resolveModelDeps.js`) — the only place that reads the block.** Every
entry point takes a trailing `variantTokens` map (e.g. `{ arch: 'blackwell' }`),
defaulting to `{}` (so every pre-existing engine-only caller is byte-unchanged):
- `resolveDeps(model, ops, depExists, engine, variantTokens)` — adds the chosen
  option's `extraDeps`. A PROVIDED token picks one option; a MISSING token unions
  ALL options' deps (shared-dep PROTECTION — never GC a weight another arch needs).
- `resolveWorkflowFile(model, op, engine, { stage2, variantTokens })` — suffix
  order is **base → variant suffix(es) → `_stage2` → engine suffix**
  (`LTX_t2v_mxfp8_stage2_remote.json`), matching `generate_ltx.py`'s output. A
  missing token adds NO suffix (union is for dep protection, not file selection).
- `deriveInstalledOps(model, depStatus, engine, variantTokens)` — the status gate
  requires the CONCRETE arch's weight (pass the real token, not the union), so a
  balanced card reads "installed" only when THIS machine's transformer is on disk.
- `resolveFullUniverse` / `resolve` thread it identically.

**Arch token source + resolve-ONCE.** The classifier is the browser-safe ESM
`js/data/modelConstants/gpuArch.js` — the SINGLE source, imported by BOTH the
server (`platformEngine.js` via `createRequire`, classifies the local nvidia-smi
name → `/system/gpu-info` `gpu.arch`) and the client. The renderer resolves the
token via `remoteEngineClient.arch(engine)` (async: `remote` = the pod's `gpuType`
id classified sync, `local` = one cached `/system/gpu-info` fetch), with
`archSync()` for sync render-path gates and `warmLocalArch()` fired in
`syncModelInstalled`. Resolve the token ONCE per gen, AFTER engine (arch is the
TARGET machine's GPU), then thread it — same discipline as resolve-engine-once.
`commandExecutor.runCommand` does this. Tokens: `blackwell` (RTX 50xx / B-series),
`modern` (RTX 20-40xx / Ada·Ampere·Turing datacenter), `legacy`, `null`.

**Backend stays union.** `downloadManager` / shared-dep guards resolve the FULL
universe with NO token — correct: the client already picked the arch-correct dep,
the backend filter is permissive (membership check), and cross-model protection
must see every arch weight. There is deliberately NO server-side variant heal (the
engine heal exists for the stale-mirror race; arch has none — it's resolved once
from stable state). Don't add one.

**Authoring:** put arch-invariant deps in `dependencies`; put each variant's unique
weight/node/LoRA in `variants.<axis>.options.<token>.extraDeps`; set
`workflowSuffix` to what the build script appends for that token (`''` = base
files). The build script emits one file PER (mode/stage × every variant token) —
only the arch-specific loader node differs. Contract test: `testVariantAxis` in
`tests/resolve-model-deps.test.cjs`.

### 2.5c Node commit-drift ladder — `.mpi_node_commit` marker (MPI-222)

A pinned custom-node commit bump (edit in `dev_configs/node_lock.json` only) used
to leave installed nodes silently STALE — the install-check was folder-exists only,
so a folder at the wrong commit read as installed forever. The fix records WHICH
commit is on disk and reinstalls on mismatch, **both engines**.

- **Marker:** after a node installs, its pinned commit is stamped into
  `<node>/.mpi_node_commit` (written LAST, so the marker doubles as a success
  sentinel). `getPinnedNodeCommit(depId)` / `writeNodeCommitMarker()` live in
  `routes/shared.js`.
- **Detection (local):** `checkUniversalWorkflowDepsStatus` (shared.js) drift-checks
  every folder-present `custom_nodes` dep — marker ≠ pinned (or absent) → returns it
  in `driftedDeps`. **Detection (remote):** `remoteModelsCheck` reads the Pod
  manifest's `nodes[]` (schema v2); a VOLUME node at the wrong commit → `installed:false`
  + `drifted:true`; a BAKED node at the wrong commit → `bakedDrift[]` (warn-only, never
  unset — an image node can't be volume-healed, it needs a rebuild).
- **Heal (local):** `/engine/repair-deps` (engine.js) unions missing+drifted and
  **pre-wipes** each drifted folder (`fs.remove`) before reinstall — else
  `startUniversalWorkflowInstall` skips it as already-on-disk. **Heal (remote):** a
  drifted volume node installs WITH `force:true` (downloadManager → `remoteInstallDep`)
  so the wrapper `rmtree`s + re-clones at the pinned commit; without force it
  short-circuits `already_installed` on folder-exists → an endless install loop.
- **Bake vs volume = `installRequirements`:** `true` nodes bake into the Pod image at
  build (drift on a baked node → the warn-only toast, needs a rebuild); `false` nodes
  install on the volume at connect (drift heals in place, no rebuild). Bumping a
  volume node = node_lock edit only; bumping a baked node = node_lock edit + Pod image
  rebuild + `POD_IMAGE_VERSION` bump + app restart.
- **Dev-symlink escape hatch:** on a source/dev run (`BUILD_HASH === 'dev'`) the drift
  check SKIPS `ComfyUI-MpiNodes` — it's the one node symlinked into `custom_nodes` for
  live editing, always at/ahead of the pin, and a "repair" would `fs.remove` the
  symlink. Release builds (no symlink) drift-repair it normally.
- **`targetPath` in-folder weights:** a weight whose node hard-codes its scan dir
  (RIFE → `custom_nodes/comfyui-frame-interpolation/ckpts/rife/`) declares
  `targetPath: 'custom_nodes/<node>/<subdir>'` + `engineAsset: true`. The resolver
  (`resolveComfyPath`, shared.js) installs it under the ComfyUI repo root, bypassing the
  `mpi_models/` type→subdir map. On remote it's image-resident (baked inside the node
  folder). **Trap (MPI-222):** the DOWNLOAD path (downloadManager.js, 3 resolve sites)
  has its own resolve — pass the FULL dep so `targetPath` survives; a stripped
  `{type,filename}` falls back to `mpi_models/`. The drift pre-wipe nukes the whole node
  folder incl. in-folder weights, but a `targetPath` weight self-heals (it's a tracked
  dep → boot-install re-fetches it). Guard tests: `tests/node-drift.test.cjs`.

### 2. ComfyUI Process State
The Node.js backend tracks the active python process in memory (`processState.activeComfyProcess`). 
- Do not add random CLI arguments to the spawn command without checking if they break compatibility with portable installs.
- Any new routes that communicate with ComfyUI's internal API (`/manager/unload_models`, etc.) must account for deep vs. shallow memory cleaning.
- ComfyUI stdout/stderr phase lines may drive renderer lifecycle via `/comfy/events/stream`. Preserve `Model Initializing ...` and `Model Initialization complete!` parsing in `routes/comfy.js`; StatusBar timing depends on those events for model-initialization-sensitive sampler/upscale nodes.

### 3. Engine Installation Flow (Fresh Install)

The engine installation is now **parallel-optimized** with aggregated progress reporting and **automatic GPU detection**:

**Order of operations:**
1. **GPU Detection** — `resolveDownloadConfig()` detects GPU (NVIDIA/AMD/Intel) and selects the engine build by GPU architecture (`selectNvidiaBuild`); CUDA version is informational/tiebreaker only
2. Pre-calculate combined size: engine archive (selected variant) + the universal dep set (every `type: 'custom_nodes'` + every `engineAsset: true` weight) in `dependencies.js`
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
- Engine-deps source: `dependencies.js` (the universal set: `type: 'custom_nodes'` + `engineAsset: true` weights) — no per-workflow tracking needed
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
