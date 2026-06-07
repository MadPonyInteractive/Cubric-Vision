# Explore Triton + SageAttention accelerator builds

## Why this card exists

Split out of MPI-8 (portable distribution) on 2026-06-07. During Linux engine
bootstrap work, the user (who used SageAttention on RunPod via a trailing
`pip install sageattention`) asked whether to bake it into the install. Research
showed it is **not** a safe default add-on.

## The danger

SageAttention/Triton are not just packages to install per platform. They also
**impose new/different nodes in the workflows**. Forcing them into the base
install would break every existing workflow and every unsupported install at
once.

Hard constraints found in research:

- **Build fragility:** `pip install sageattention --no-build-isolation` needs
  Triton (`pip install triton`) and, when no prebuilt wheel matches, a CUDA
  toolkit / `nvcc` to compile. RunPod worked because its image had nvcc + matching
  CUDA preinstalled; a portable end-user box will not.
- **GPU gate:** Ampere / Ada / Hopper / Blackwell only. Legacy NVIDIA (the
  `cu126` build path), AMD, Intel, and CPU users cannot use it.
- **Version coupling:** torch >= 2.3, Triton >= 3.0, CUDA >= 12.0 (Ampere) up to
  >= 12.8 (Blackwell). Wrong combo = compile fail or silent fallback.
- **Workflow coupling:** enabling it changes the attention backend
  (`--use-sage-attention` launch flag) and KJ-Nodes-style custom nodes, i.e.
  the workflows themselves differ.

## Direction to explore (not now)

To offer these accelerators, ship them as **separate optional builds** that:

1. Include Triton + SageAttention pinned to a known-good CUDA/torch matrix.
2. Ship **their own workflows** authored for the sage attention backend.
3. Are GPU-arch gated (Ampere+), with the base build remaining the safe default
   for everyone else.
4. Add `--use-sage-attention` to the launch args only in those builds.

This is a **future build track**, not part of MPI-8. The base engine bootstrap
(uv + comfy-cli) ships without any accelerator.

## Research links

- SageAttention: https://github.com/thu-ml/SageAttention
- ComfyUI `--use-sage-attention` flag discussion:
  https://github.com/comfyanonymous/ComfyUI/issues/7484
