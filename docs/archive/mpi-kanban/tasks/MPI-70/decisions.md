# MPI-70 Decisions

> User-confirmed 2026-06-12. Two findings from primary-source research reshaped the brief's
> "install accelerators into the image" assumption. Recorded here; also to be relayed to the
> MPI-64 session (image tags + accelerator behavior affect app-side POD_IMAGE→card mapping).

## D1 — sageattention: runtime-install + volume cache (NOT baked in CI)

**Why:** sageattention 2.x compiles CUDA kernels from source at `pip install` time and needs a
GPU + `CUDA_HOME` present. Our image build runs in a **GPU-less buildx CI runner** → baking it in
is impossible. No trustworthy prebuilt linux/py3.11 wheel exists (only Windows / Blackwell-nightly /
semi-official community wheels).

**How:** `start.sh` installs sageattention on first Pod boot (GPU present), `pip install --target`
into a volume dir so it persists across Pod delete/recreate:
- `/workspace/cubric/pylibs` on `PYTHONPATH` (compiled `.so` persist; arch-specific)
- `TRITON_CACHE_DIR=/workspace/cubric/triton_cache` (JIT kernel cache; arch-specific)
- GPU-arch stamp sentinel → reinstall only on arch change (correct: `.so`/Triton cache are per-sm).

**Cost:** one-time ~5-15 min per GPU arch on first boot; near-zero after.
**Volume impact:** adds 2 dirs under `/workspace/cubric/` ONLY. Does NOT touch the models layout
(`mpi_models/<type>`) or `extra_model_paths.yaml` wiring — stays models-only/arch-agnostic per the
MPI-64 Pattern-B lock.

## D2 (REVISED 2026-06-12 after build #1/#2) — Backends: sageattention RUNTIME + SDPA fallback; NO flash-attn

**Original D2 was "flash-attn baked + sage runtime." REVERSED.** Two builds proved baked flash-attn is
both fragile and pointless:

- **Fragile:** the prebuilt flash-attn wheel is locked to a `torch_version × CUDA × cxx11-ABI` triple
  and broke on BOTH bases with `ImportError: undefined symbol`. cu128 base ships a torch *nightly*
  (ABI/symbol drift); cu124's conda `pytorch/pytorch` torch is built `_GLIBCXX_USE_CXX11_ABI=0` while
  the `cxx11abiTRUE` wheel needs ABI=1 (and the cu124 pip wheel is *also* ABI=0, so no force-reinstall
  fixes it — only the `cxx11abiFALSE` wheel variant would, a per-base guess).
- **Pointless:** for diffusion (SDXL/Flux/Wan, head_dim=128) flash-attn is ~7% SLOWER than PyTorch
  SDPA (it's tuned for LLM long-seq), and ComfyUI's attention selector bypasses flash-attn entirely
  when `--use-sage-attention` is active. So a *working* flash-attn import would add nothing.

**Revised stack:** PREFERRED = sageattention (runtime, per D1) → FALLBACK = PyTorch SDPA (built into
torch; for diffusion on par with / better than flash-attn). No baked accelerator. This also removes the
failing build step and shrinks the image. `--use-sage-attention` still passed when sage is present;
otherwise ComfyUI auto-uses SDPA. (Source: SageAttention benchmarks; ComfyUI attention selector code.)

## Image / base decisions (from research, not a user toggle)

- **cu128 profile base:** `runpod/pytorch:2.8.0-py3.11-cuda12.8.1-cudnn-devel-ubuntu22.04` (unchanged;
  torch 2.8 already baked → skip torch reinstall). Host-driver floor `cuda>=12.8` (Blackwell hosts).
- **cu124 profile base:** `pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel`. No recent `runpod/pytorch`
  cu124 tag exists; RunPod runs any OCI image via our custom template + start.sh (nothing RunPod-
  specific needed). Lowers the host-driver floor (`cuda>=12.4`) → kills the 4090-on-old-driver refusal.
  After ComfyUI requirements, pin `torch==2.6.0+cu124 torchvision==0.21.0+cu124 torchaudio==2.6.0+cu124
  --index-url https://download.pytorch.org/whl/cu124`. Covers Ampere sm_80/86, Ada sm_89, Hopper sm_90;
  NO Blackwell sm_120 (that's cu128's job).
- **flash-attn wheel is torch-ABI-pinned:** cu124 profile → `...torch2.6...` wheel; cu128 → `...torch2.8...`
  wheel (matched per profile from Dao-AILab/flash-attention releases).
- **fp8/fp4 (cu128):** fp8 already works via ComfyUI native (`torch.float8_e4m3fn`) — no package needed.
  fp4/NVFP4 needs CUDA 13 → defer to a future additive `-cu130` profile. Note only.
- **Tag shape:** `cubric-vision-pod:v<ver>-cu124` / `-cu128`, leaving room for additive `-cu130` later.

## Agreed build params (MPI-64 sign-off 2026-06-12, msg c0be349b)

GREEN LIGHT to build. First multi-image build params for the USER's `workflow_dispatch`:

- `manifest_version = 0.3.0` → tags `:v0.3.0-cu124` + `:v0.3.0-cu128` (0.2.x was the single-image
  line ending at 0.2.2; the profile-split + accelerators + base-image change warrants a minor bump
  and signals "multi-image era starts here").
- `comfyui_ref = master`.
- `wrapper_version = 0.2.2` — **wrapper.py UNCHANGED this build** (verified: `git status` clean on
  `cubric-vision-pod/wrapper/`). Image TAG version (0.3.0) and `CUBRIC_WRAPPER_VERSION` (0.2.2) are
  independent; the app keeps `WRAPPER_VERSION='0.2.2'`. Only bump if wrapper.py actually changes.

App coupling is a single seam (MPI-64 confirmed by grep): the only image-tag reference app-side is
`routes/remoteProxy.js:48` `const POD_IMAGE`. That becomes their Step 5.1 card→image function
(Blackwell→cu128, else cu124). Until they ship it, the running app still creates `:v0.2.2` Pods — the
new tags don't disturb it. `WRAPPER_VERSION` (line 49) is a separate const, unaffected by the suffix.

USER action after green light: trigger the build, make the GHCR package PUBLIC, then ping MPI-64 with
the final tags so they wire Step 5.1 + warmup messaging.

## Relay to MPI-64 (app side)

- Two image tags now, suffixed `-cu124` / `-cu128` — `POD_IMAGE` becomes card→image (their Step 5.1).
- First Pod boot on a fresh volume pays a one-time sage compile (~5-15 min) — surface as engine-warmup
  messaging, distinct from the cold image-pull. Subsequent boots near-zero.
- A GPU-arch switch re-triggers the sage compile (volume cache is per-sm by design).
