# MPI-244 Validation — Pod image v0.15.0 (bake comfyui_controlnet_aux)

## Shipped
- App `POD_IMAGE_VERSION` + `POD_IMAGE_VERSION_CPU`: `v0.14.0` → `v0.15.0` (commit `a4a8e18a`, branch 1.2.0). Needs app restart to take effect (pins bake at Express-child boot).
- mpi-ci commit `cc008bd` (pushed): node_lock synced (adds `comfyui_controlnet_aux` installRequirements:true + code-only `ComfyUI-Krea2-ControlNet`); Dockerfile gains a post-node-bake cu130 re-assert guard; README shipped-tag block refreshed.
- CI run `29134840449` — both legs **success** (cu130 → Docker Hub, cpu → GHCR).

## Auto-verified (PASSED)
1. **cu130 build assert** — the build's own `assert '+cu130' in torch.__version__` (Dockerfile:128) passed = torch trio intact after ComfyUI's unpinned requirements.
2. **NEW post-node-bake re-assert** (Dockerfile, after kornia pin, MPI-244) — passed = `comfyui_controlnet_aux`'s bare `torch`/`torchvision` requirement did NOT drift torch off `+cu130`. This is the card's core torch-trap acceptance, and the build passing proves it.
3. **5a pull-verify** — `docker manifest inspect` OK for both `v0.15.0-cu130` (Docker Hub) + `v0.15.0-cpu` (GHCR). Both public.
4. **5b cpu boot smoke** — `/health` 200, `ready:true`, `wrapper_version:"0.2.33"`.
5. **App guard test** — `tests/controlnet-aux-torch-guard.test.cjs` passed.

## OUTSTANDING — user-only live verify (before `done`)
- Deploy a fresh Pod on `v0.15.0-cu130` and confirm the app-log image line + `/health` `wrapper_version:0.2.33`.
- **The real acceptance test:** run a **Krea2 t2i generation on the REMOTE engine**. Before v0.15.0 it could not run at all (ComfyUI validates every node class before `MpiIfElse` branches; `comfyui_controlnet_aux` was missing on the Pod). A successful remote Krea2 gen = card done.
- Optional belt: `docker run --rm --entrypoint python <cu130 tag> -c "import torch;print(torch.__version__)"` MUST print `+cu130` (the build already asserts this, but a manual check is the card's stated acceptance).

## Notes
- controlnet_aux pulls a heavy transitive set (mediapipe, fvcore, omegaconf, onnxruntime-gpu, trimesh, albumentations, scikit-learn, matplotlib) — image-size delta not separately measured; CI built without disk overflow.
- Boogu batching precondition was DROPPED by the user (Boogu added later by another agent, which accepts a possible 2nd rebuild).
