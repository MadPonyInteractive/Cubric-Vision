# MPI-121 Brief — Lighter model-folder refresh (avoid full ComfyUI restart)

## Goal

When the user changes model folders in Settings, only do a full ComfyUI restart
when the **folder registry** actually changed. For a **file-only** change (a model
dropped into / removed from an already-registered folder), use ComfyUI's lighter
in-place refresh instead — no ~5-10s restart.

## Background (verified 2026-06-20, MPI-118)

ComfyUI reads `extra_model_paths.yaml` and builds `folder_names_and_paths`
(the dict mapping `checkpoints` → [folders]) **only at process startup**
(`folder_paths.py` + `utils/extra_config.py::load_extra_path_config`, called once
at boot; `add_model_folder_path` registers each root). There is **NO HTTP route**
in stock ComfyUI v0.25.1 to re-parse the YAML or add a folder path at runtime
(grepped `server.py` — none exists; ComfyUI-Manager is not in the app node set).

The filename cache (`folder_paths.get_filename_list` / `cached_filename_list_`)
DOES invalidate on **mtime change of a folder ALREADY in the registry**, and
`GET /object_info` re-seeds it (`asset_seeder.start(roots=("models",...))` +
`with folder_paths.cache_helper`). This is what ComfyUI's **"R" hotkey** triggers.

**So two distinct cases:**

| Settings change | What changed | Correct action |
|---|---|---|
| Models ROOT path changed; extra FOLDER added/removed | `folder_names_and_paths` registry (boot-only) | **Restart** ComfyUI (registry rebuild). No runtime route exists. |
| Model FILE added/removed in an ALREADY-registered folder | folder contents only | **`GET /object_info`** (cache reseed) — no restart |

## Current state (the MPI-118 fix this refines)

`_setComfyPath` in `MpiSettings.js` now sets `state.comfyNeedsRestart = true` on
ANY path change → `comfyController.js:230` does `/comfy/stop` + `/comfy/start` at
next generation. CORRECT for root/folder changes, but HEAVIER than needed for a
pure file add/remove. This card adds the lighter path for the file-only case.

## Scope

1. Add a backend route `POST /comfy/refresh-models` (or similar) that, when
   ComfyUI is running, does `GET http://127.0.0.1:<port>/object_info` to force the
   model-folder cache reseed. Return success/failure. (No-op if not running.)
2. In Settings, distinguish:
   - ROOT path change OR extra-folder add/remove → keep `comfyNeedsRestart = true`
     (registry rebuild needs restart).
   - File-only change (if/when Settings can detect one) → call the refresh route
     instead.
   - NOTE: today Settings only changes the ROOT + extra FOLDERS, both of which are
     registry changes. The file-only case mainly matters for the **download/install
     flow** (a model finishes downloading into an existing root while ComfyUI is
     up). Audit whether post-install already refreshes, or also restarts.
3. Verify: drop a checkpoint into the active root with ComfyUI running → call
   refresh → the model appears in `CheckpointLoaderSimple` list WITHOUT a restart.

## Out of scope
- Building a runtime YAML-reload (would require patching ComfyUI core or a custom
  node — not worth it; restart on root change is acceptable).

## Related
- MPI-118 (the restart fix this refines).
- Memory: `project_comfy_models_path_source` (YAML on disk canonical),
  `project_comfy_extra_model_folders` (additive folders).
