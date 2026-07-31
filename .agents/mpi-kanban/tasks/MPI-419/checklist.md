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

- [x] Rebuild in CI, fresh extract, fresh engine install — mpi-ci run 30625478488, extracted to a separate root so the old build stayed as the before-picture
- [x] `comfy install` lands 0.29.2 exactly (proves the `--version` pin; Windows cannot) — stamp, `comfyui_version.py` and `/engine/version-check` all read 0.29.2
- [x] LTX node imports on the uv engine — 6.1s, zero `IMPORT FAILED`, all 14 nodes in
- [x] UW deps install clean on a from-scratch engine — zero missing, zero drifted; both darwin requirement filters fired
- [x] A generation completes on Apple silicon at 0.29.2 — SDXL Realistic 768x768, image written and inspected

## Pod image (leg 3) — ran only after both local legs passed, per the user's sequencing

- [x] `node_lock.json` synced into the mpi-ci build context and pushed (73f4514) — also caught MpiNodes + krea2edit drift
- [x] Dev-line image built on CI, both legs (run 30626614008): `v0.18.0-dev-cu130` + `v0.18.0-dev-cpu`
- [x] In-image node-import smoke OK — every baked node imports on 0.29.2
- [x] Both tags pull-verified public; cpu boot smoke `/health` 200, wrapper 0.2.40
- [x] App dev pins moved to `v0.18.0-dev` (411f6cd6); stable pins deliberately left on v0.17.0
- [ ] **USER-ONLY: live Pod verify** — deploy a dev-mode Pod, confirm the image line + `wrapper_version`

## Not done on purpose

- Stable pins stay on ComfyUI 0.28.0 until the live Pod verify. The bumped LTXVideo
  commit is backwards compatible, so the shipped Pod keeps working meanwhile.
