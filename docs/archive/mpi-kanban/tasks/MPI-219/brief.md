# MPI-219 — Extra LoRA/upscale folder never reloads ComfyUI paths

Surfaced 2026-07-07 while testing Chroma (MPI-217) LoRAs. NOT Chroma-specific — hits
ANY model when a user adds a new LoRA/upscale folder mid-session.

## Symptom

1. User adds an extra LoRA folder in Model Settings (e.g. `C:/AI/loras/CHROMA`).
2. Folder + files show correctly in the app's LoRA dropdown (app scans disk itself).
3. Selecting one of those LoRAs and generating → ComfyUI `/prompt` returns **400
   `Prompt outputs failed validation`**.
4. Log shows: `MpiLoraModel <id>: Value not in list: lora_name: '<file>' not in
   [<the OLD list, missing the new folder>]`. The downstream `strength_model, None`
   error on the output node is a CASCADE from this primary rejection, not a 2nd bug.

## Root cause

`POST /comfy/extra-folders` (`routes/comfy.js` ~L548) does exactly three things:
`setExtraModelFolders()` → `writeExtraModelPathsYaml()` → `res.json()`. **It never
tells the running ComfyUI to re-read the new path.**

ComfyUI loads `extra_model_paths.yaml` **only at boot** — `main.py` L122-128
(`utils.extra_config.load_extra_path_config(...)`) + the `--extra-model-paths-config`
arg passed at spawn (`routes/comfy.js` ~L354). So a folder added after boot is not in
`folder_paths.folder_names_and_paths` → its files never enter the lora list → `/prompt`
validation rejects them.

`POST /comfy/refresh-models` (calls `/object_info`) is NOT sufficient: `/object_info`
only re-lists dirs ALREADY registered in `folder_names_and_paths`; it does not re-read
the yaml or register a brand-new path.

## Fix direction — RELOAD, not restart

ComfyUI can reload paths at RUNTIME without killing the process (user's point —
reload ≠ restart). `engine/.../ComfyUI/folder_paths.py` exposes:
- `add_model_folder_path(folder_name, full_folder_path, is_default=False)` (L289)
- `cache_helper` (L98) — the filename-list cache; must be invalidated after adding a path
- `main.py` uses `utils.extra_config.load_extra_path_config(yaml_path)` (L124) — the
  same call that loads the yaml at boot; re-invoking it at runtime re-reads the file.

There is **no reload/refresh HTTP route in core `server.py`**, and **no ComfyUI-Manager
installed** in the engine. So the reload must be EXPOSED as a route. Options:
- **(A) Add a small route** (in MpiNodes — `ComfyUI-MpiNodes`, already an engine dep —
  or a tiny custom node) that calls `load_extra_path_config(<yaml>)` + invalidates
  `cache_helper` for `loras`/`upscale_models`, then have `POST /comfy/extra-folders`
  hit it after writing the yaml. This is the true "reload all paths" fix.
- **(B) Fallback:** if a clean runtime reload proves unreliable, set the existing
  `comfyNeedsRestart` flag (`routes/comfy.js` L400 `/comfy/needs-restart`) and surface
  the restart prompt the node-install flow already uses. Restart is heavier but the
  infra exists. Prefer (A).

After reload, also call `/object_info` so the frontend's cached node schema reseeds.

## Fix BOTH engine paths

Shared-engine bug → check the REMOTE (Pod) path too. Remote loras live on the Pod
volume; adding an extra folder there needs the equivalent reload via the wrapper.
See `remoteModels.js` / `routes/remote*`. (Repo forgets the twin — MPI-216 precedent.)

## Files

- `routes/comfy.js` — `POST /comfy/extra-folders` (~L548), `POST /comfy/refresh-models`
  (~L406), spawn args (~L354), `comfyNeedsRestart` (~L400).
- `routes/shared.js` — `setExtraModelFolders`, `writeExtraModelPathsYaml`, `getExtraModelFolders`.
- `engine/.../ComfyUI/folder_paths.py` — `add_model_folder_path` (L289), `cache_helper` (L98).
- `engine/.../ComfyUI/main.py` — `load_extra_path_config` (L122-128).
- `ComfyUI-MpiNodes` repo (`MadPonyInteractive/ComfyUi-MpiNodes`) — candidate host for the reload route.

## Evidence (frozen — read this first, don't grep the live log)

`research/log-evidence.txt` holds the exact validation-failure lines from the
2026-07-07 Chroma test (app.log ~L2494-2500). The rejected lora list contains
`ltx-2.3\`, `sdxl\`, `wan-2.2\` but NO `chroma` entry — proving ComfyUI's path set
is stale (the added `C:/AI/loras/CHROMA` never registered). Use this instead of
re-scanning the noisy live log (KJNodes triton ImportError + Electron dev warnings
repeat every boot and bury real errors — `Read logs/app.log` with an offset for the
tail, don't grep the whole file).

## Repro

1. Boot engine. 2. Model Settings → add a new LoRA folder with a LoRA not previously
on any known path. 3. Select that LoRA, generate → 400 `Prompt outputs failed
validation`, log `Value not in list: lora_name`. 4. Restart engine → same gen passes
(proves it's the missing reload, not a path/file problem).
