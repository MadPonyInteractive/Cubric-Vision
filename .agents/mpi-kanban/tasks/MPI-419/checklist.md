# MPI-419 Checklist

## Code fixes

- [x] Pin the installer — pass `--version <COMFY_VERSION>` to `comfy install` (routes/engine.js `_provisionUvEngine`)
- [x] Stamp the truth — write `.mpi_engine_version` from the installed tree's `comfyui_version.py`, not the pin (routes/engine.js `_runEngineDownload` step 5)

## Version bumps

- [x] `dev_configs/system_dependencies.json` engine.version 0.28.0 -> 0.29.2
- [x] `dev_configs/node_lock.json` comfyui.core tag + commit -> v0.29.2
- [x] `dev_configs/node_lock.json` frontend pins -> comfyui-frontend-package 1.47.11, comfyui-workflow-templates 0.11.20
- [x] `dev_configs/node_lock.json` ComfyUI-LTXVideo commit -> 3b9c5cde (upstream PR #532, the 0.29 rope fix)

## Sweep

- [x] Other 13 pinned nodes checked for a 0.29 adaptation — none shipped one, no bumps (see validation.md)

## Test — Windows dev PC (user's order, leg 1)

- [x] Engine core moved to 0.29.2 in place (git clone + 4 pip pins) — full reinstall de-scoped by the user
- [x] ComfyUI starts with zero failed node imports (all 14); the 2 tracebacks are the pre-existing no-triton gap
- [x] Drift ladder repaired LTXVideo to the new pin on its own; the rope fix is on disk
- [x] `.mpi_engine_version` reads the version actually on disk — reader function verified directly (an in-place checkout never runs the install path)
- [x] A generation completes — ILL_Anime 768x768 8 steps, image written and inspected

## Test — rented Mac (leg 2)

- [ ] Rebuild in CI, fresh extract, fresh engine install
- [ ] `comfy install` lands 0.29.2 exactly (proves the `--version` pin; Windows cannot)
- [ ] LTX node imports on the uv engine

## Deferred — decided with the user 2026-07-31

- Pod image rebuild happens AFTER local is proven good, so the image is built with
  whatever node fixes local testing turns up. Do not rebuild first.
