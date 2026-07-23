# MPI-117 — Resolved pins (2026-06-19)

## ComfyUI core
- Tag `v0.19.3` IS clonable on `comfyanonymous/ComfyUI`. Tag commit `3086026401180c9216bcb6ace442a4e3587d2c66`.
- Pod: pin `COMFYUI_REF=v0.19.3` (was `master`).

## Frontend (from core v0.19.3 requirements.txt)
- `comfyui-frontend-package==1.42.11`
- `comfyui-workflow-templates==0.9.57`
- Core pip-install already resolves these from its requirements.txt; pinning the core tag pins the frontend. Pod gets them automatically once core is tag-pinned. Record both in lock for assertion / MPI-90 manifest.

## 7 universal node packs

| pack | source | value | notes |
|---|---|---|---|
| ComfyUI-MpiNodes | DECISION PENDING | registry 1.1.1 (Flagged) OR git-commit cd951391ae9f5aa068e48cd4252d7549f20550ab | all registry 1.0.5+ are "Flagged"; 1.0.4 last "Active". Own node. |
| ComfyUI-VideoHelperSuite | git-commit | 4ee72c065db22c9d96c2427954dc69e7b908444b | branch main |
| ComfyUI-Impact-Pack | git-commit | 429d0159ad429e64d2b3916e6e7be9c22d025c3c | branch **Main** (capital) |
| comfyui-kjnodes | git-commit | 7f43f2ce910a27971bdbbf3fb5a52081457f32e2 | branch main |
| ComfyUI-UltimateSDUpscale | git-commit | bebd5696fddd61cb0d08949a222c508898ab5577 | branch main |
| ComfyUI-Frame-Interpolation | git-commit | 26545cc2dd95bc3d27f056016300673bdeee78f5 | branch main; needs `python install.py` |
| ComfyUI-Impact-Subpack | git-commit | 50c7b71a6a224734cc9b21963c6d1926816a97f1 | branch main |

## RES4LYF (NEW app dep, add with lock)
- git-commit `419de2d7c78f415dde9aa352a7231820ebfc17a4` (user-validated 2026-06-14). Not in registry, no tags → SHA-pin only.
- reqs: opencv-python, matplotlib, pywavelets, numpy>=1.26.4 → Pod needs requirements install step.

## MpiNodes registry CDN url shape (confirmed)
`https://cdn.comfy.org/mad-pony-interactive/ComfyUi-MpiNodes/1.1.1/node.zip`
