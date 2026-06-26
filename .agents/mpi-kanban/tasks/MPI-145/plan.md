# Pod perf sub-plan — bake sage-attention (MPI-145) + per-card VRAM mode (MPI-146)

> **REORDERED 2026-06-26 → this is now PHASE 2 of the MPI-139 batch.** The full batch
> plan (floor-first) lives at `.agents/mpi-kanban/tasks/MPI-139/plan.md`. Do Phase 1
> (ComfyUI v0.25.1→v0.26.0 floor) FIRST; bake sage + VRAM here on the STABLE v0.26 stack
> (the perf fixes recompile against v0.26's torch + tune against its new memory manager).
> This file holds the Phase-2 detail; the version label below is now **v0.10.0**, not v0.9.0.

Owner card: **MPI-145**. Co-shipped: **MPI-146**. One image rebuild ships both;
they cannot be verified independently (same Pod).

## Current State

- Remote LTX-2.3 fully works on RunPod as of image v0.8.1 / wrapper 0.2.14 (t2v,
  i2v, 4K i2v verified on 5090-cu128 + 4090-cu124). App `routes/remoteProxy.js`
  points at `v0.8.1` / `0.2.14`.
- **Sage is broken on the Pod.** start.sh:104 runtime-installs
  `sageattention==2.2.0` to the volume via `pip --target=$PYLIBS
  --no-build-isolation` with **NO `TORCH_CUDA_ARCH_LIST`**. On live Pods this
  produced empty pylibs, `import sageattention` → ModuleNotFoundError, no
  `--use-sage-attention` in cmdline → every remote LTX ran on SDPA (slower).
- **The Builder image source-build WORKS** and is the reference pattern —
  but it lives in `cubric-vision-builder/Dockerfile:91-99`, NOT install_nodes.sh
  (handoff said the wrong file). It does:
  `TORCH_CUDA_ARCH_LIST="8.6;8.9;12.0" MAX_JOBS=4 pip install --no-build-isolation
  git+https://github.com/thu-ml/SageAttention.git`.
- **Both Pod bases are `-devel`** (cu124: `pytorch:2.6.0-cuda12.4-cudnn9-devel`,
  cu128: `runpod/pytorch:2.8.0-...-devel`) → **nvcc is present** → the Pod CAN
  compile sage at image-build time. The runtime bootstrap was the wrong place.
- VRAM: wrapper `_build_cmd` (wrapper.py:209-221) hardcodes `--lowvram` for ALL
  cards (MPI-144, matches local). Fixes the 24GB 4090 OOM but the 32GB 5090 ran
  4K i2v fine WITHOUT lowvram on v0.7.0 → blanket lowvram likely slows big cards.
- The wrapper already reads `CUBRIC_USE_SAGE` from env (set by start.sh) — same
  env-handoff pattern is the clean way to pass a per-card VRAM mode.
- Gotcha sanity: sage 2× SLOWDOWN is **Windows-embedded-python only** (Triton JIT,
  no Python.h). Linux Pods compile triton fine → sage helps. Not a Blackwell issue.
- **🔑 TRITON LEAD (MPI-131 reply 42f1d692, from logs/app.log):** the only unavailable
  backend in the engine probe is triton — `ImportError: No module named 'triton'`.
  **sage-attention REQUIRES triton** (its kernels are triton-compiled). So a Pod with no
  triton installed CANNOT build/run sage → silent SDPA fallback. The baked-sage Dockerfile
  step MUST also ensure `triton` is installed (the Builder image does `pip install ... triton`
  right alongside the sage build — Dockerfile:94). VERIFY triton imports on the Pod as a
  precondition for sage. (This is likely a second reason the runtime bootstrap produced nothing:
  no arch-list AND no triton.) NOTE: the app.log line is the LOCAL engine — but local also runs
  SDPA for the same triton-missing reason; the Pod must not repeat it.

## Decisions (locked with user)

1. **Sage: BAKE into the Pod Dockerfile** per CUDA profile (not the runtime
   bootstrap). cu124 → `TORCH_CUDA_ARCH_LIST="8.6;8.9"` (Ampere+Ada, no Blackwell),
   cu128 → `TORCH_CUDA_ARCH_LIST="12.0"` (Blackwell only). Faster boot, reliable,
   per-arch correct.
2. **Enable sage on BOTH profiles**, verify live on a real 4090 (cu124) and 5090
   (cu128). Gate sage off per-profile ONLY if a live test shows a real regression
   — do not pre-disable Blackwell on a guess.
3. **VRAM: per-card mode.** `<=24GB → --lowvram`, `>=32GB → --normalvram`.
   Verify the 5090-normalvram-is-faster regression is real before trusting it.
4. **Scope: v0.9.0 = MPI-145 + MPI-146 ONLY.** MPI-139 (v0.26.0 + new image
   models) is a separate v0.10.0 cycle.

## Implementation

- [ ] **Sage (MPI-145):** In `cubric-vision-pod/Dockerfile`, add a per-profile
  baked sage source-build (port the Builder block, but split the arch list by
  `CUDA_PROFILE`: cu124=`8.6;8.9`, cu128=`12.0`, cpu=skip). Use `git+...thu-ml/
  SageAttention.git` + `--no-build-isolation` + `MAX_JOBS=4`. Then GUT the
  start.sh sage bootstrap (start.sh:83-112): replace the compile branch with a
  cheap `import sageattention` probe that sets `USE_SAGE=1` if the baked module
  imports for the live arch, else SDPA — no runtime compile, no `--target`
  pylibs. Keep `CUBRIC_USE_SAGE` env handoff to the wrapper unchanged.
- [ ] **VRAM (MPI-146):** Make wrapper `_build_cmd` (wrapper.py:209) pick the
  VRAM flag from the live card. Detect VRAM in `ComfyManager` boot (the wrapper
  has GPU access — query `torch.cuda.get_device_properties(0).total_memory`, or
  reuse start.sh's existing torch probe and export `CUBRIC_VRAM_MODE`). Map
  `<=24GB → --lowvram`, `>=32GB → --normalvram`. Replace the hardcoded
  `"--lowvram"` with the resolved mode. Default to `--lowvram` if detection
  fails (safe — the current behavior).
- [ ] **Version bumps:** Bump `WRAPPER_VERSION` in `wrapper.py` (0.2.14 →
  0.2.15) + `cubric-vision-pod/Dockerfile` WRAPPER_VERSION ARG. Bump the app's
  `POD_IMAGE_VERSION` (v0.8.1 → v0.9.0) + `WRAPPER_VERSION` in
  `routes/remoteProxy.js`. Update `cubric-vision-pod/README.md` version history.
- [ ] **Build + verify:** Build image v0.9.0 (cu124+cpu via CI, cu128 LOCAL via
  the `build-pod-image` skill — user-gated). On a FRESH Pod each arch: confirm
  (a) `.sage_arch`/import OK + cmdline shows `--use-sage-attention`, (b) sampling
  measurably faster than SDPA, (c) 4090 picks `--lowvram` & survives, 5090 picks
  `--normalvram` & is faster than its lowvram baseline. **Verify:** see below.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Bake sage per-profile + simplify start.sh probe (MPI-145).
- Per-card VRAM mode in the wrapper (MPI-146).
- Version bumps (wrapper + Dockerfile + app remoteProxy + README).
- Image build v0.9.0 + live verify on fresh 4090 (cu124) and 5090 (cu128) Pods.

## Plan Drift

- 2026-06-26: Handoff said "port the Builder's install_nodes.sh source-build."
  CORRECTED — the sage build lives in `cubric-vision-builder/Dockerfile:91-99`,
  not install_nodes.sh (which only does nodes/kornia/cupy/ffmpeg).
- 2026-06-26: Strategy changed from "fix the runtime bootstrap" to "bake into the
  image." Both Pod bases are `-devel` (nvcc present) so the image CAN compile
  sage at build time — faster boot, no fragile 5-15min first-boot compile.
- 2026-06-26: MPI-139 (v0.26.0 + Krea2/Boogu) SPLIT OUT of this batch to a later
  v0.10.0 cycle (core bump risk shouldn't block the two high-confidence perf fixes).

## Verification

**Verify mode:** user-ux

This batch is verified on live RunPod Pods (the user spins them — Pod create +
image build are user-gated live ops), and "faster sampling" / "no regression" are
judgments only the user can make against their real cards. After the v0.9.0 build:

1. **cu128 / 5090:** fresh Pod, run an LTX i2v. Confirm container/cmdline shows
   `--use-sage-attention` AND `--normalvram`. Time a gen vs the v0.8.1 SDPA+lowvram
   baseline — expect faster sampling (sage) and faster/equal load (normalvram).
2. **cu124 / 4090:** fresh Pod, run the same i2v that OOM'd before MPI-144.
   Confirm `--use-sage-attention` AND `--lowvram`, gen completes (no OOM), sage
   sampling faster than SDPA.
3. If Blackwell sage misbehaves (wrong output / crash), gate sage off for cu128
   only (decision 2) and re-verify; otherwise leave both on.

## Preservation Notes

- After verify, add a `docs/gotchas.md` entry: "Pod sage must be BAKED per-arch
  (`TORCH_CUDA_ARCH_LIST` split by CUDA_PROFILE); the runtime `pip --target`
  bootstrap silently produced nothing → SDPA fallback. Both Pod bases are
  `-devel` so nvcc is present at build time." (The MPI-145 lesson.)
- Add a gotcha: "Pod VRAM mode is per-card — `<=24GB --lowvram`, `>=32GB
  --normalvram`; blanket lowvram (v0.8.1) slowed 32GB+ cards."
- Update `cubric-vision-pod/README.md` v0.9.0 block + drop the stale "sage
  installs to the volume on first boot" language wherever it appears (start.sh
  comments, Dockerfile comment in remoteProxy.js:55-56).
- RunPod branch only — NO master merge / GitHub release / git tag (MPI-131 rule).
- Open MPI-143 follow-ups (separate cards, not this batch): verify i2v WITH audio;
  re-pull the truncated 995MB upscaler (declared 1.5GB).
