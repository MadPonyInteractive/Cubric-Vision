# Git Worktrees — Setup & Behavior

> Project name: **Cubric Vision**. Root folder is `Cubric-Vision/`; paths in this doc reflect the on-disk folder name.

## Purpose

Run multiple working copies of Cubric Vision from a single git repo without duplicating massive engine/model folders. Each worktree is an isolated branch checkout but shares the underlying `.git` object store.

## Why Worktrees Matter Here

The repo has one large directory that should NOT be duplicated per worktree:

| Folder | Approx size | Reason |
|---|---|---|
| `engine/` | ~10 GB | ComfyUI portable + Python + custom nodes |

It is gitignored. Without sharing, each worktree re-downloads the full engine.

## Sharing Mechanism — `.engine-config.json`

Gitignored file at repo/worktree root. Optional. Each key independently overrides the default folder location. Missing keys fall back to `<worktree>/<default>`.

### Schema

```json
{
    "enginePath": "C:\\AI\\Mpi\\Cubric-Vision\\engine"
}
```

| Key | Reads | Default | Helper fn |
|---|---|---|---|
| `enginePath` | ComfyUI engine root | `<repo>/engine` | `getEngineRoot()` |

The helper lives in `routes/platformEngine.js`. It:
1. Reads `.engine-config.json` from `<worktree>/` (parent of `routes/`)
2. Validates the key's path exists on disk
3. Falls back to default if missing/invalid

### Per-Worktree Workflow

1. `git worktree add ../Cubric-Vision-feature feature-branch`
2. post-checkout hook fires automatically:
   - Runs `npm ci` to install node_modules
   - Auto-generates `.engine-config.json` pointing back at the main worktree's `engine/` folder
3. `cd ../Cubric-Vision-feature` and launch — engine read from main worktree

No manual config edit needed for the standard case. To override, edit or delete `.engine-config.json` in the worktree (deleting reverts to per-worktree defaults).

The main worktree itself doesn't need a config file (defaults match) — the hook detects this and skips bootstrap there.

## post-checkout Hook

Path: `.git/hooks/post-checkout`

Fires after `git checkout` (branch switch) and `git worktree add`. Two responsibilities:

1. **node_modules install** — runs `npm ci` if `node_modules/` missing. Per-worktree, gitignored, platform-specific (cannot be shared safely).
2. **`.engine-config.json` bootstrap** — on new worktree (detected via `git worktree list --porcelain` — current worktree path differs from main worktree path), writes a config file pointing at the main worktree's `engine/` folder. Skips if config already exists or if running in the main worktree.

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

`ENGINE_ROOT` is captured **at import time** in:
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

## Files To Touch If Changing Worktree Behavior

| File | Role |
|---|---|
| `routes/platformEngine.js` | helpers `_readEngineConfig`, `getEngineRoot` |
| `routes/shared.js` | `ENGINE_ROOT` consumer |
| `routes/engine.js` | engine download targets |
| `routes/comfy.js` | ComfyUI server spawn paths |
| `routes/downloadManager.js` | model/dep download targets |
| `main.js` | Electron-side engine path resolution |
| `.git/hooks/post-checkout` | npm ci on worktree create |
| `.gitignore` | `.engine-config.json`, `engine/`, `llama_engine/`, `llama_models/` |

## Quick Reference

```bash
# create worktree
git worktree add ../Cubric-Vision-myfeature myfeature

# list worktrees
git worktree list

# remove worktree
git worktree remove ../Cubric-Vision-myfeature
```

After `add`: drop `.engine-config.json` in new worktree root, then launch.
