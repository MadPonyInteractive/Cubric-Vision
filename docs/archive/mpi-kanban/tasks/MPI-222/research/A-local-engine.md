# A — Local Engine (findings)

## Key hooks
- `startUniversalWorkflowInstall(depIds, broadcastProgress=true, skipCustomNodeInstall=false)` @ routes/downloadManager.js:1951
  - callers: engine.js:156 (win provision, skip=true), engine.js:340 (uv provision, skip=true), engine.js:571 (repair-deps, skip=false)
  - per-dep: custom_nodes folder = getComfyPath(ENGINE_ROOT,'custom_nodes')/dep.filename ; zip = same+'.zip'
  - `_runCustomNodeInstall` @ downloadManager.js:1438-1613: extract → rename GitHub archive folder → dep.filename (L1543) → reqs (installRequirementsCommand OR pip -r --upgrade L1565) → pipPins AFTER (L1581) → comfyNeedsRestart.
  - STAMP `.mpi_node_commit` after rename L1543 (folder canonical) at path.join(targetDir,'.mpi_node_commit').

## checkUniversalWorkflowDepsStatus @ routes/shared.js:491-511
- loops getUniversalWorkflowDepIds(), resolveComfyPath, fs.pathExists only. Returns {needsDepsInstall, missingDeps}.
- consumers: engine.js:364 (_runEngineDownload size), engine.js:549 (GET deps-status), engine.js:565 (repair-deps), js/shell.js:261 (needsDepsInstall→'repairing').
- DRIFT slots in the else-branch (folder exists → compare marker vs pinned). Add driftedDeps to return; set needsDepsInstall=true when drifted → folds into boot flow with ZERO frontend change.

## Pinned commit availability
- lockUrl(id) @ dependencies.js:19-31 buries commit inside URL only. DEPS entries have NO commit field. Exports = {lockUrl, DEPS}.
- node_lock.json imported ESM @ dependencies.js:13. Server reads via _require. 
- FIX: add helper getPinnedNodeCommit(depId) in shared.js reading dev_configs/node_lock.json directly (fs.readJson), return nodeLock.nodes[id]?.commit ?? null. Guard source==='git-commit'. Precedent: routes/platformEngine.js:16 requires dev_configs json directly.
- ALL 8 installOnEngine nodes = git-commit (have commit). RES4LYF=git-commit too but installOnEngine:false.

## GET /engine/deps-status @ routes/engine.js:547-558
- spreads checkUniversalWorkflowDepsStatus() → auto-forwards driftedDeps if added.
- repair-deps L565 destructures missingDeps only → change to union [...missingDeps,...driftedDeps].

## CRITICAL TRAP
- startUniversalWorkflowInstall skips folders already present: isCompleteOnDisk(installedCheckPath) L1999 returns true for drifted node (folder there, no .cubricdl) → marked complete, extraction SKIPPED (L2014-2019).
- => drifted node NOT reinstalled by current code. MUST pre-wipe the drifted folder before repair (surgical, not engine wipe). This is THE key implementation gotcha.

## getInstalledModelNodeDeps @ routes/shared.js:524-599 (MPI-118)
- restores model-specific nodes on engine upgrade (missing-only), resolveFullUniverse local.
- SOLE active caller: engine.js:369 (_runEngineDownload merges into missingDepIds). Import engine.js:15, export shared.js:694.
- Clean delete: body + export + import + engine.js:369-372 merge. No other call sites.

## Node folder on disk
- getComfyPath(ENGINE_ROOT,'custom_nodes'); getComfyRepoRel(): win=[COMFY_DIR,'ComfyUI'], linux/mac=[COMFY_DIR].
- folder = dep.filename, NO subdir. filenames vary case: comfyui-videohelpersuite, comfyui-impact-pack, comfyui_ultimatesdupscale. node_lock filename matches DEPS filename.
- marker: path.join(customNodesRoot, dep.filename, '.mpi_node_commit').

## Marker precedent
- .mpi_engine_version @ engine.js:444-448 (write) / 517-522 (read). Plain UTF-8 trimmed string. MIRROR exactly for .mpi_node_commit.
- .cubricdl = in-flight download marker (different purpose).

## CONTRADICTIONS / FLAGS
1. commit not in DEPS → need getPinnedNodeCommit reading node_lock directly.
2. skip-if-folder-exists → MUST pre-wipe drifted folder.
3. registry-source nodes have no commit → guard source==='git-commit' (future-safe; none today).
4. RES4LYF model-specific (installOnEngine:false) → moving to one class = add installOnEngine OR it won't get drift.
5. PainterI2Vadvanced url hardcoded refs/heads/main.zip @ dependencies.js:450 — NO pinned commit, NOT in node_lock. CANNOT stamp a commit marker. Needs a node_lock entry (pin it) OR excluded from drift. **Plan gap.**
