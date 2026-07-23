# MPI-117 Checklist

## Lock mechanism (DONE)
- [x] `dev_configs/node_lock.json` — single source of truth; per-node `source` (registry/git-tag/git-commit); core+frontend block
- [x] Resolved pins: core v0.19.3 (commit 3086026), frontend 1.42.11 / templates 0.9.57, 6 git-commit SHAs, MpiNodes HEAD cd95139, RES4LYF 419de2d
- [x] App consumer: `dependencies.js` imports lock + `lockUrl()` resolver; 7 node urls lock-derived; RES4LYF added (installOnEngine)
- [x] Verified extract/rename logic (downloadManager.js:1089) is commit-archive-safe — no code change needed
- [x] Pod consumer: Dockerfile COPYs lock + python loop clones by source; `COMFYUI_REF` default master→v0.19.3
- [x] Frontend rides core tag (requirements.txt pins 1.42.11) — no separate Pod pin needed
- [x] CI workflow dispatch default comfyui_ref master→v0.19.3
- [x] README: node-lock section + fixed stale `COMFYUI_REF=master` example
- [x] `/build-pod-image` command: derive `<ref>` from lock; step 3a syncs lock into mpi-ci context
- [x] mpi-ci/cubric-vision-pod/node_lock.json copied (in sync with canonical)

## Validated
- [x] lock JSON valid; app DEPS load; all 8 locked urls commit/registry-pinned; Painter still floats (correct)

## Separate step (handoff — brief "Rebuild handoff") — DEFERRED, BATCHED WITH MPI-118
> Decision 2026-06-19: do NOT rebuild for MPI-117 alone. MPI-118 (ComfyUI bump to
> 0.25.0) also needs an image rebuild — finish MPI-118 first, then ONE rebuild covers
> both. Target image version **v0.5.0** (engine change = minor bump). Card parked in
> `doing` until that combined rebuild ships.
- [x] (after MPI-118) Rebuild Pod image (cu124 CI + cu128 local) via `/build-pod-image` — bakes lock at the MPI-118 versions (v0.5.0; mpi-ci be03b86)
- [x] Image version **v0.5.0**; pushed + public (cu124/cpu CI, cu128 local); app POD_IMAGE → v0.5.0 (remoteProxy.js 8c1ec47). 5a pull-verify + 5b boot smoke pass.
- [x] RunPod template image bump → v0.5.0 (USER manual gate) — fresh Pod pulled v0.5.0-cu124
- [x] **VALIDATED 2026-06-21:** live Pod verify (Pod rjjq48dp8pkp6x, no-volume A40) — v0.5.0-cu124 pulled, `/health` ready+comfy_ready wrapper_version 0.2.11, real SDXL t2i gen (1344×768) on remote = node-lock load-verified live

## Constraints honored
- [x] RunPod branch only (current branch = RunPod)
- [x] No version bump (MPI-118 moves version by editing lock alone — built bump-ready)
- [x] No code touched on master
