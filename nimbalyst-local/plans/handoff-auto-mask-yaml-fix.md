# Handoff: Auto Mask YAML Fix + Sustainable Model Path System
**Tracker:** bug_mo6k8jfhx5n774  
**Status:** in-review — needs validation

---

## What Was Wrong

Auto Mask Tool failed because `extra_model_paths.yaml` was missing folder entries for `sams`, `ultralytics`, `ultralytics_bbox`, `ultralytics_segm`. These are registered by custom nodes (comfyui-impact-pack / ComfyUI-Impact-Subpack) relative to ComfyUI's own `models_dir`. Without entries in the YAML, ComfyUI only searched the engine's internal models folder — not the user's custom root (`D:/CubricModels`).

**ComfyUI YAML parser (`utils/extra_config.py`) has no wildcard/catch-all.** Every folder type must be listed explicitly.

---

## Root Cause Analysis

1. `routes/comfy.js` `POST /comfy/set-path` — hardcoded inline YAML template was missing `sams`, `ultralytics*`, `onnx`, `text_encoders`, `model_patches`, `audio_encoders`, `latent_upscale_models`
2. `routes/engine.js` fresh install (step 6) — wrote a completely broken minimal YAML: `all:\n  base_path: mpi_models` with no folder keys. Zero paths would register.
3. `routes/shared.js` `resolveComfyPath` — had a dead `subDirPrefix` block (type→folder mapping) that was unreachable since all deps have `filename`. Legacy code carried over.
4. `dependencies.js` — non-`custom_nodes` deps had redundant `type:` field (e.g. `type: 'checkpoint'`, `type: 'sams'`) that served no purpose since `filename` already encodes the folder.

---

## Changes Made

### `js/data/modelConstants/dependencies.js`
Removed `type:` from all **non-`custom_nodes`** deps. `custom_nodes` type retained — backend still needs it to route to `custom_nodes/` folder vs `models/`.

Affected deps (type field removed):
- `sdxl-realistic`, `ill-anime`, `ill-anime-beauty`, `pony-mix` (were `checkpoint`)
- `wan-22-t2v-high`, `wan-22-t2v-low`, `wan-22-i2v-high`, `wan-22-i2v-low` (were `checkpoint`)
- `wan_2.1_vae` (was `vae`)
- `umt5_xxl_fp8_e4m3fn_scaled` (was `text_encoders`)
- `4x-NMKD-Siax`, `4x-AnimeSharp` (were `upscale_model`)
- `face-yolov8n`, `hand-yolov8n`, `person-yolov8n-seg` (were `ultralytics`)
- `sam-vit-b` (was `sams`)

### `routes/yamlHelper.js` *(new file)*
Single source of truth for YAML generation. `buildExtraModelPathsYaml(basePath)` works by:
1. Scanning all non-`custom_nodes` deps in `DEPS` — extracts first path segment of `filename` as the folder key (e.g. `sams/sam_vit_b.pth` → `sams`)
2. Adding static extras for Impact Pack sub-types not derivable from filenames: `onnx`, `ultralytics`, `ultralytics_bbox: ultralytics/bbox/`, `ultralytics_segm: ultralytics/segm/`
3. Adding core ComfyUI folder types not covered by current deps (clip, controlnet, embeddings, etc.)

**Adding a new dep with a new folder type in `dependencies.js` now auto-includes it in the YAML** on next engine install or path set — no manual edits needed.

### `routes/comfy.js`
- Added `require('./yamlHelper')`
- Replaced 30-line hardcoded YAML template in `POST /comfy/set-path` with single call: `buildExtraModelPathsYaml(customPath)`

### `routes/engine.js`
- Added `require('./yamlHelper')`
- Replaced broken minimal YAML in fresh install (step 6) with `buildExtraModelPathsYaml(mpiModelsDir)`
- Removed `mpiModelsDir` creation from before the path-exists guard (now only created when YAML is actually written)

### `routes/shared.js`
- `resolveComfyPath` — deleted dead `subDirPrefix` block (9 lines of type→folder mapping never reached since all deps have `filename`). Now joins `customRoot` directly with `dep.filename` which already contains the full relative path (e.g. `sams/sam_vit_b.pth`).
- `getUniversalWorkflowDepIds` — switched from `Object.values(DEPS).map(dep => dep.id)` to `Object.entries(DEPS).map(([id]) => id)` — cleaner, no dep.id needed.

### `engine/ComfyUI_windows_portable/ComfyUI/extra_model_paths.yaml`
Updated on-disk YAML to match the new comprehensive format with all folder types. Base path remains `D:/CubricModels`.

---

## Validation Checklist

- [ ] `routes/yamlHelper.js` exists and exports `buildExtraModelPathsYaml`
- [ ] `routes/comfy.js` imports yamlHelper, `POST /comfy/set-path` uses it
- [ ] `routes/engine.js` imports yamlHelper, fresh install step 6 uses it
- [ ] `routes/shared.js` — `resolveComfyPath` has no `subDirPrefix` block; `getUniversalWorkflowDepIds` uses `Object.entries`
- [ ] `dependencies.js` — grep for `type:` returns only `custom_nodes` entries
- [ ] On-disk YAML includes `sams`, `ultralytics`, `ultralytics_bbox`, `ultralytics_segm`, `onnx`
- [ ] Auto Mask workflow runs successfully in app (SAM loader + Ultralytics detector nodes)
- [ ] Setting a new custom models path via app settings rewrites YAML correctly
- [ ] No regressions: model install/check still works for normal checkpoint models

---

## Key Invariant

`resolveComfyPath` and the YAML must agree on where files live. Both now use `filename` as the full relative path from the models root (e.g. `sams/sam_vit_b.pth`). The YAML maps `sams → sams/` so ComfyUI searches `<base>/sams/`. `resolveComfyPath` does `path.join(customRoot, dep.filename)` = `<base>/sams/sam_vit_b.pth`. They are consistent.

---

## Files Touched

| File | Change |
|---|---|
| `js/data/modelConstants/dependencies.js` | Removed `type:` from 15 non-custom-node deps |
| `routes/yamlHelper.js` | **New file** — YAML generator |
| `routes/comfy.js` | Import yamlHelper; replace inline YAML template |
| `routes/engine.js` | Import yamlHelper; fix fresh install YAML |
| `routes/shared.js` | Delete dead subDirPrefix block; fix getUniversalWorkflowDepIds |
| `engine/ComfyUI_windows_portable/ComfyUI/extra_model_paths.yaml` | Updated on-disk YAML |
