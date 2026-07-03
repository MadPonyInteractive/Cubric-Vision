# MPI-186 — Checklist

## Phase 0 — SPIKE (gate; USER-run on live GPU Pod)
- [ ] Clone ComfyUI v0.27.0 to a throwaway volume dir
- [ ] `pip --target` deps to volume, torch trio EXCLUDED
- [ ] Import probe: `import comfy_aimdo; import comfy_kitchen` from PYTHONPATH-only — no error
- [ ] Boot ComfyUI from volume + image torch; boot log shows `aimdo inited` (NOT legacy fallback)
- [ ] `torch.__version__` from PYTHONPATH is the image's `+cu126`/`+cu128` build (not shadowed)
- [ ] One real gen (LTX/video) completes clean, no OOM
- [ ] Result recorded in validation.md → PASS proceeds / FAIL closes wontfix

## Phase 1 — start.sh volume-install flow
- [ ] Sentinel compare vs `$CUBRIC_COMFYUI_REF`
- [ ] Ephemeral guard (`CUBRIC_EPHEMERAL=1` → keep baked)
- [ ] Atomic install (`.tmp` → mv, sentinel written LAST, clean prior `.tmp`)
- [ ] torch trio excluded from `--target`
- [ ] Fallback to baked on clone/pip failure (no crash-loop)
- [ ] Export CUBRIC_COMFY_MAIN + PYTHONPATH to volume paths
- [ ] Ship via `publish-runtime.sh stable` (no rebuild) + live-verify fresh + warm boot

## Phase 2 — extra_model_paths.yaml baked-nodes stanza
- [ ] Add `/opt/ComfyUI/custom_nodes` absolute stanza
- [ ] Live: all 7 baked packs load; LTX gen + video gen both succeed

## Phase 3 — Dockerfile
- [ ] Remove baked `pip install -r requirements.txt` (the 5GB); keep torch/sage/nodes/weights
- [ ] Decide baked-ComfyUI fallback (recommend keep small clone, drop deps layer only)
- [ ] Rebuild via build-pod-image skill; measure new size vs current
- [ ] Anon-pull-verify tags; fresh-volume + warm-volume live gen

## Phase 4 — bumps + docs
- [ ] Bump POD_IMAGE_VERSION (routes/remotePodLifecycle.js) + app restart
- [ ] Update docs/runpod-remote-engine.md §6 + docs/builder/02-image-and-rebuild.md
