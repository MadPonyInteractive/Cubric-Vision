# MPI-141 — Remote subfolder-model parity

## Fixes (both shipped)
- [x] Fix #1a (app) — `splitDepFilename` splits on FIRST `/`, preserves subpath. `routes/remoteModels.js` (RunPod b4d928a).
- [x] Fix #1b (wrapper) — `_model_dest` uses `_safe_relpath` (subfolders OK, traversal rejected). `mpi-ci/cubric-vision-pod/wrapper/wrapper.py` (mpi-ci c9edf0b). Wrapper 0.2.11 → 0.2.12.
- [x] Fix #2 (app) — remote-only baked-workflow separator heal (`\` → `/`) on path-bearing loader inputs after param injection. `js/services/comfyController.js` (RunPod b4d928a).
- [x] App pins bumped — `POD_IMAGE_VERSION v0.7.0`, `WRAPPER_VERSION 0.2.12` in `routes/remoteProxy.js` (needs app restart).
- [x] Unit self-test — split + normalize + `_safe_relpath` traversal guard all pass.

## Image v0.7.0 build (Flow A — Product Pod)
- [x] Dockerfile `WRAPPER_VERSION` default → 0.2.12.
- [x] node_lock synced into pod build context (no-op, core ref v0.25.1 unchanged).
- [x] mpi-ci committed LF-clean + pushed (CI builds pushed ref).
- [x] CI cu124+cpu pushed (run 28207560520, success).
- [ ] Local cu128 built + pushed (bg bwm176dx8 — long pole, in flight).
- [x] 5a pull-verify — cu124 OK, cpu OK (cu128 pending its push).
- [x] 5b boot smoke — cpu `/wrapper/stats` 200, `/health` wrapper_version 0.2.12, no-token 401.

## Manual gates (USER-only)
- [ ] GHCR package public (if first push of new tag — it's not a new package, stays public).
- [ ] `wsl --shutdown` after local build (free VM RAM).
- [ ] Live Pod verify — fresh v0.7.0 Pod, app-log image line + `/health` `wrapper_version` 0.2.12.
- [ ] Remote LTX t2v (no audio) + i2v — LoraLoader validates, NO value_not_in_list.
- [ ] Nested same-name lora in two subdirs does NOT collide on volume.

## On full pass
- [ ] Remove "Pending for NEXT rebuild" block in `mpi-ci/cubric-vision-pod/README.md`; set current shipped tag v0.7.0.
- [ ] Card → done.
