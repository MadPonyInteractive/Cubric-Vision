# Models Path & `extra_model_paths.yaml` Contract

How the app resolves the ComfyUI models root, the additive-folders system, and
LoRA/upscaler visibility. Split out of [comfy.md](comfy.md) (MPI-170).

## `/comfy/list-files?subDir=<path>`

Recursively walks the requested `subDir` under the resolved models root (custom root from `extra_model_paths.yaml` when set, else engine default). Returns relative paths from `subDir` for files with extensions `.safetensors | .ckpt | .pt | .bin | .pth`. Only scans the requested bucket — does NOT return siblings from other top-level folders (checkpoints, sams, ultralytics, etc).

For `loras` and `upscale_models`, the route also scans user-configured additive
folders from `extra_model_folders.json`. Those extras are bucket folders (for
example, a folder directly containing LoRAs), not parent models roots. Results
from the primary bucket win on same relative filename collisions, and the
response shape stays `{ success: true, files: string[] }`.

## `/comfy/extra-folders`

`GET /comfy/extra-folders` returns the persisted additive folders:

```json
{ "success": true, "folders": { "loras": [], "upscale_models": [] } }
```

`POST /comfy/extra-folders` accepts the same shape without the wrapper,
validates that every path exists, writes `extra_model_folders.json`, and
rewrites `extra_model_paths.yaml`.

Extras are re-merged whenever `/comfy/set-path` rewrites YAML. Clearing the
primary models path removes `extra_model_paths.yaml` only when no extras are
configured; with extras present, YAML is regenerated against the default
models root so ComfyUI still sees the additive folders on restart.

## Default models root

`getDefaultModelsRoot()` (`routes/shared.js`) returns
`CUBRIC_MODELS_ROOT` when set — the portable launchers export it as
`<portable-root>/models`, OUTSIDE the engine folder — falling back to
`<ENGINE_ROOT>/mpi_models` only in dev/no-env runs. `mpi_models` is legacy and
must not be hardcoded; engine install/upgrade write the YAML and create the
folder via `getDefaultModelsRoot()`. The YAML is additive: the active root is the
`comfyui:` block and the default root is always emitted as a separate
`comfyui_default:` block so repointing the folder adds a search location rather
than replacing it.

## LoRA and upscaler visibility

LoRA dropdowns show every file returned from the active models root `loras/`
folder. The app does not filter LoRAs by `model.type` because users control their
own LoRA folder names and conventions.

Upscale model dropdowns still use model-type filtering where appropriate, with
root-level files treated as universal.

`MpiModelSettings` accepts both legacy registry dependency IDs and raw filenames
for `upscaleModel`. Registry defaults still resolve through `DEPS`; user-picked
extra-folder upscalers persist as raw filenames and inject that filename into
the `Upscale_Model` workflow node.

## Gotchas

**YAML is canonical, localStorage is a cache:** Models path lives in TWO places — frontend `localStorage["mpi_comfy_root_path"]` AND backend `engine/ComfyUI/extra_model_paths.yaml` (`base_path:`, read via `getCustomRoot()` in `routes/shared.js`). localStorage can desync (different Electron user-data dirs, manual clears). Any UI surfacing the path MUST hydrate from `GET /comfy/get-path` and write back to localStorage on drift. `MpiSettings` does this via `_hydrateComfyPath()` on panel open. Never trust localStorage alone.

**`base_path` must be absolute:** Relative paths resolve against server cwd in Cubric vs ComfyUI dir (two different folders). `resolveModelsRoot()` in `routes/shared.js` anchors to absolute. YAML must always emit two top-level blocks (`comfyui_default` + `comfyui`) — never delete YAML on revert, rewrite with default block.

**Extra model folders persist separately:** Additive folders for `loras` and `upscale_models` live in `extra_model_folders.json`, NOT inferred from `extra_model_paths.yaml`. YAML builder re-merges them on every `/comfy/set-path` or `/comfy/extra-folders` write. Without the separate config, changing the primary root would silently erase user-added read-only extra folders.

**LoRA/upscale path separator — engine OS, not hardcoded:** ComfyUI builds its enum via `path.relative` against its OWN search roots → separator matches the ENGINE's OS: local = Windows `\`, remote Pod = Linux `/`. `GET /comfy/list-files` MUST emit the engine-native separator or subfolder models 400 with "Value not in list". Saved names in `project.json` may use stale separator — resolve separator-agnostically by unique basename (one match → heal; multiple same-name files → leave `(missing)`, never silently pick wrong file). (MPI-82/MPI-67)
