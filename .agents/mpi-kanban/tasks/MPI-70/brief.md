# MPI-70 Brief — RunPod multi-image build (CUDA profiles + accelerators)

> Spun out of MPI-64 (RunPod Remote Engine), Plan Drift 2026-06-12. Dispatchable
> in PARALLEL with MPI-64 app work. This card owns the **images + CI only**; the
> app-side card→image *selection* lives in MPI-64 Step 5.1/5.2.

## Why

The live A4000/L4/4090 session proved the real compatibility wall is
**image-CUDA-floor ≤ host-driver-provided-CUDA**, not card arch. The current
single image (`runpod/pytorch:2.8.0-cuda12.8.1`, cu128) demands host driver ≥12.8
and so was **refused on a 4090 host** with an older driver
(`nvidia-container-cli: requirement error: unsatisfied condition: cuda>=12.8`),
while an L4 host accepted it. Because the network volume is **models-only and
arch-agnostic** (Pattern B, Design A), we can serve a **different image per card
without touching the volume** — same models, right runtime. That converts the
CUDA wall from a mid-create failure into a deterministic pre-flight selection.

Second driver: **speed**. The current image installs NO attention accelerators.
Native-ComfyUI users run `sageattention` (and often flash-attn); without them our
remote gens can be ~30–50% slower than what users already get locally → they drop
the app. The user's own historical install script does
`pip install sageattention` + `pip install bitsandbytes` after the cu129 torch
install. Accelerators belong in the image, per arch.

## Scope (this card)

1. **Two image profiles from one Dockerfile** (`mpi-ci/cubric-vision-pod/Dockerfile`),
   parameterized by a base-image ARG:
   - `cubric-vision-pod:<ver>-cu124` — broad host compat (Ampere/Ada/Hopper). Runs
     on the most RunPod hosts/DCs. NO sm_120.
   - `cubric-vision-pod:<ver>-cu128` — Blackwell (sm_120: RTX 5090, RTX PRO 6000,
     B200). Needs newer-driver hosts (which Blackwell cards have anyway).
   - Keep the universal `installOnEngine` custom-nodes bake + the volume
     `extra_model_paths.yaml` wiring identical across both (already arch-agnostic).
2. **Per-arch accelerators**: install `sageattention` (min) into both images;
   evaluate `flash-attn`; for cu128/Blackwell evaluate fp8/fp4 paths. Verify they
   import + are actually used at runtime (ComfyUI logs the attention backend).
   GUARD: these can pull heavy build deps / fail in the GPU-less buildx runner
   (the existing Frame-Interpolation `install.py` already runs there) — watch the
   build log; pin versions; prefer prebuilt wheels where they exist.
3. **CI matrix** in `.github/workflows/cubric-vision-pod-image.yml`: build both
   tags from the same inputs (`manifest_version`, `wrapper_version`, `comfyui_ref`)
   + a new `cuda_profile` (or a matrix). Push both to GHCR (public). Keep the
   disk-free step (the image is large).
4. **CUDA-version tracking (note, not necessarily this card):** ComfyUI/PyTorch are
   moving toward CUDA 13.0 (cu130) for speed on newer cards. Design the profile
   set + tags so a future cu130 profile is an additive build, not a rewrite.

## Out of scope (stays in MPI-64)

- App-side `POD_IMAGE` becoming a card→image function (Step 5.1).
- GPU-picker auto-filter / warn for unsupported card/host (Step 5.2).
- `NVIDIA_DISABLE_REQUIRE` decision (an app/create-env lever, Step 5.1).

## Constraints / gotchas (from MPI-64)

- Image builds run via the PRIVATE `mpi-ci` repo:
  `gh workflow run cubric-vision-pod-image.yml -f manifest_version=X -f wrapper_version=X -f comfyui_ref=master`.
  A Dockerfile/start.sh/wrapper change needs rebuild + (app-side) POD_IMAGE bump +
  app restart + a fresh Pod.
- Ground-truth live image check = RunPod console → Pod → Logs → **Container** tab
  `create container …:vX`.
- The ComfyUI clone's `requirements.txt` lists `torch` UNPINNED — to GUARANTEE the
  intended CUDA build survives, pin torch explicitly per profile
  (`--index-url https://download.pytorch.org/whl/cu124` or `cu128`) after the
  ComfyUI requirements install. (This is the user's own install-script instinct,
  baked in.)
- NEVER read/grep `cubric-remote-wrapper/.secrets/runpod.env`; NEVER run autonomous
  Pod create/delete — the USER runs live tests.

## Verify

- Both image tags build green in mpi-ci and pull from GHCR.
- A 4090 (or any Ada/Ampere card on an older-driver host) deploys the **cu124**
  image and reaches wrapper `ready` (the failure mode this card exists to kill).
- A Blackwell card deploys the **cu128** image and reaches ready.
- `sageattention` (and any other accelerator added) imports in the running Pod and
  ComfyUI reports it as the active attention backend; a benchmark gen is in the
  ballpark of native-ComfyUI speed for the same card (not ~50% slower).
