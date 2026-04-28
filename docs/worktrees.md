# Git Worktrees — Setup & Behavior

> Project name: **Cubric Studio**. Root folder is `CubricStudio/`; paths in this doc reflect the on-disk folder name.

## Purpose

Run multiple working copies of Cubric Studio from a single git repo without duplicating massive engine/model folders. Each worktree is an isolated branch checkout but shares the underlying `.git` object store.

## Why Worktrees Matter Here

The repo has three large directories that should NOT be duplicated per worktree:

| Folder | Approx size | Reason |
|---|---|---|
| `engine/` | ~10 GB | ComfyUI portable + Python + custom nodes |
| `llama_engine/` | ~200 MB | llama-server binary + libs |
| `llama_models/` | multi-GB per model | downloaded GGUF/quant LLM weights |

All three are gitignored. Without sharing, each worktree re-downloads everything.

## Sharing Mechanism — `.engine-config.json`

Gitignored file at repo/worktree root. Optional. Each key independently overrides the default folder location. Missing keys fall back to `<worktree>/<default>`.

### Schema

```json
{
    "enginePath": "C:\\AI\\Mpi\\CubricStudio\\engine",
    "llamaPath": "C:\\AI\\Mpi\\CubricStudio\\llama_engine",
    "llamaModelsPath": "C:\\AI\\Mpi\\CubricStudio\\llama_models"
}
```

| Key | Reads | Default | Helper fn |
|---|---|---|---|
| `enginePath` | ComfyUI engine root | `<repo>/engine` | `getEngineRoot()` |
| `llamaPath` | llama-server binary root | `<repo>/llama_engine` | `getLlamaEngineRoot()` |
| `llamaModelsPath` | LLM model files (GGUF) | `<repo>/llama_models` | `getLlamaModelsRoot()` |

All three helpers live in `routes/platformEngine.js`. Each:
1. Reads `.engine-config.json` from `<worktree>/` (parent of `routes/`)
2. Validates the key's path exists on disk
3. Falls back to default if missing/invalid

### Per-Worktree Workflow

1. `git worktree add ../CubricStudio-feature feature-branch`
2. post-checkout hook fires automatically:
   - Runs `npm ci` to install node_modules
   - Auto-generates `.engine-config.json` pointing back at the main worktree's `engine/`, `llama_engine/`, `llama_models/` folders
3. `cd ../CubricStudio-feature` and launch — engine/models read from main worktree

No manual config edit needed for the standard case. To override, edit or delete `.engine-config.json` in the worktree (deleting reverts to per-worktree defaults).

The main worktree itself doesn't need a config file (defaults match) — the hook detects this and skips bootstrap there.

## post-checkout Hook

Path: `.git/hooks/post-checkout`

Fires after `git checkout` (branch switch) and `git worktree add`. Two responsibilities:

1. **node_modules install** — runs `npm ci` if `node_modules/` missing. Per-worktree, gitignored, platform-specific (cannot be shared safely).
2. **`.engine-config.json` bootstrap** — on new worktree (detected via `git worktree list --porcelain` — current worktree path differs from main worktree path), writes a config file pointing at the main worktree's `engine/`, `llama_engine/`, `llama_models/` folders. Skips if config already exists or if running in the main worktree.

### Behavior

- Hook is shared across all worktrees (lives in `.git/hooks/`, which is the same dir for all worktrees of one repo).
- CWD at fire time is the worktree being checked out — git sets this for us.
- Only acts on branch checkouts (`$3 == 1`), not file checkouts (`$3 == 0`).
- Does NOT clobber an existing `.engine-config.json` — safe to re-run.
- Path escaping: JSON-escapes backslashes for Windows paths.

### Limits

- Silent on `npm ci` failure aside from non-zero exit (`set -e` propagates).
- Does NOT verify the main worktree's engine folders exist before pointing at them — if main hasn't downloaded the engine, the worktree will fall back to defaults at runtime via `getEngineRoot()`'s `existsSync` check.

## Caveats

### Module-Level Constants

`ENGINE_ROOT`, `LLAMA_ENGINE_ROOT`, `MODELS_ROOT` are captured **at import time** in:
- `routes/shared.js`
- `routes/comfy.js`
- `routes/downloadManager.js`
- `routes/engine.js`
- `main.js`

If `.engine-config.json` is created/edited **after** the Node process starts, changes are NOT picked up until restart. Acceptable: app is launched after worktree setup completes.

### localStorage (Models Path UI Setting)

`MpiSettings.js` lets user override ComfyUI models path. Stored in:
- localStorage (Electron `userData` scope) — `Storage.getComfyRootPath()`
- `<engine>/ComfyUI/extra_model_paths.yaml` (written by POST `/comfy/set-path`)

Since the YAML lives inside shared `enginePath`, all worktrees pointing at the same engine inherit the same models path. localStorage may diverge per Electron user-data dir but the YAML is authoritative for ComfyUI.

### Llama Models JSON Config

`dev_configs/llm_models.json` has `"local_storage_path": "data/models"` — appears unused (`routes/llm.js` uses `MODELS_ROOT` from `shared.js`). Cosmetic; update to `llama_models` for consistency if desired.

## Files To Touch If Changing Worktree Behavior

| File | Role |
|---|---|
| `routes/platformEngine.js` | helpers `_readEngineConfig`, `getEngineRoot`, `getLlamaEngineRoot`, `getLlamaModelsRoot` |
| `routes/shared.js` | `ENGINE_ROOT`, `LLAMA_ENGINE_ROOT`, `MODELS_ROOT` consumers |
| `routes/engine.js` | engine download targets |
| `routes/comfy.js` | ComfyUI server spawn paths |
| `routes/downloadManager.js` | model/dep download targets |
| `main.js` | Electron-side engine path resolution |
| `.git/hooks/post-checkout` | npm ci on worktree create |
| `.gitignore` | `.engine-config.json`, `engine/`, `llama_engine/`, `llama_models/` |

## Quick Reference

```bash
# create worktree
git worktree add ../CubricStudio-myfeature myfeature

# list worktrees
git worktree list

# remove worktree
git worktree remove ../CubricStudio-myfeature
```

After `add`: drop `.engine-config.json` in new worktree root, then launch.
