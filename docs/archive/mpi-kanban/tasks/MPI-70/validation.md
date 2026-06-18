# MPI-70 Validation

> Live verification is USER-run (image build via mpi-ci workflow_dispatch + live Pod tests). See brief.md "Verify".

## Build #1 (v0.3.0, run 27429271607) — BOTH legs FAILED → 3 root causes fixed

First multi-image build failed; all 3 causes were base-image differences research missed:

1. **cu124: `git: not found` (exit 127)** at the ComfyUI clone. `pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel`
   is a minimal conda image with NO git (the old runpod/pytorch base had it). FIX: `apt-get install -y
   git ffmpeg` layer after FROM (unconditional, both profiles).
2. **cu128: flash-attn `ImportError: undefined symbol: _ZN3c104cuda9SetDeviceEab`.** The runpod/pytorch:2.8.0
   base ships a torch NIGHTLY (`2.8.0.dev20250319+cu128`), not stable 2.8; the `cu12torch2.8` flash-attn
   wheel is ABI-built vs STABLE 2.8 → symbol mismatch. FIX: pin STABLE `torch==2.7.1+cu128`
   (`--force-reinstall`, still has Blackwell sm_120 per PyTorch 2.7+cu128) + switch the cu128 flash-attn
   wheel to `cu12torch2.7`.
3. **ffmpeg missing (would crash ALL video outputs).** Caught by the MPI-64 session live (L4 Wan-2.2 T2V →
   `VHS_VideoCombine ProcessLookupError: ffmpeg is required`). Neither base bundles ffmpeg; only surfaced
   on video (image gen needs none). FIX: same `apt-get install -y git ffmpeg` layer.

The earlier "cu124 base may be py3.12 → cp311 wheel fails" risk did NOT occur — the base is py3.11 (the
cp311 flash-attn wheel installed fine; cu124 died earlier at git). Removed as a live risk.

## Build #2 (run 27429999871) — flash-attn ABI again → DROPPED baked flash-attn

git+ffmpeg+cu128-torch fixes worked, but flash-attn STILL failed (cu124:
`undefined symbol: ...__cxx1112basic_string` = the `cxx11abiTRUE` wheel vs conda
torch's `_GLIBCXX_USE_CXX11_ABI=0`; cu128 leg cancelled mid-build). Both the cu124
conda torch AND the cu124 pip wheel are ABI=0, so no force-reinstall fixes it — only
a per-base `cxx11abiFALSE` wheel guess would. Decided to **drop baked flash-attn
entirely** (D2 revised): it's ABI-fragile across bases, ~7% slower than SDPA for
diffusion, and bypassed by `--use-sage-attention` anyway. Stack is now runtime
sageattention + SDPA fallback. This removes the failing step. → Build #3.

## Build #4 + RESULT — both tags v0.3.0 LIVE + public on GHCR (2026-06-12)

- **cu124: CI green** → `:v0.3.0-cu124` (Ampere/Ada/Hopper, broad host compat).
- **cu128: CI hit `No space left on device`** (full image = bigger base + torch 2.7.1 swap +
  custom-node torch deps > GitHub runner disk; the uninstall-first fixed the torch step but it
  died later at the custom-node requirements). **Built + pushed LOCALLY** on the Windows Docker box
  (D: 1.8TB) → `:v0.3.0-cu128`. Local build exit 0; smoke-checked the image: torch 2.7.1+cu128
  (cuda 12.8), ffmpeg 4.4.2, git, ComfyUI + 9 custom_nodes dirs, flash-attn correctly absent.
- **GHCR:** both tags resolve; package visibility = public (verified via gh api). RunPod can pull both.
- **cu128 is now LOCAL-BUILD-ONLY** (the runner cannot hold it). Future cu128 rebuilds = local
  `docker build` + `docker push`, not the CI matrix. cu124 stays CI-built.

MPI-70 (images + CI) is DONE. Remaining = MPI-64's app-side live-verify (remote video gen + input
asset) on a fresh v0.3.0 Pod — tracked on their card, not this one.

**CARD GATE (user decision 2026-06-12): MPI-70 stays `validating`, NOT moved to `done`, until MPI-64
reports a live v0.3.0 Pod reached `ready`** (cu124 on a card → ready + a gen; ideally cu128 on Blackwell
too). The image being built+public+smoke-checked is NOT sufficient for done — the brief's Verify
requires a real deploy. MPI-64 acked the green ping (msg 571aef9f) and is running cu124/L4 live-verify
(Wan 2.2). Move MPI-70 → done only after they confirm ready on this thread.

## Build-time risks to watch in the CI log (USER runs the build)

1. **cu124 base Python version.** The flash-attn wheel is `cp311`-pinned. `pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel` MAY ship Python 3.12 (conda env), which would make the cp311 flash-attn install fail. The Dockerfile's `python -c "import flash_attn"` smoke-check turns this into a LOUD build failure (caught in CI, not at runtime). If cu124 fails here: confirm `docker run --rm pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel python --version`; if 3.12, either pick a py3.11 cu124 base or swap to the matching `cp312` flash-attn wheel for the cu124 row only.
2. **cu124 torch reinstall size.** The `torch==2.6.0+cu124` reinstall after ComfyUI requirements may pull a large wheel set; the disk-free step is kept for headroom. Watch for OOM/disk on the cu124 row.
3. **flash-attn ABI vs base torch.** cu124 row uses the `torch2.6` wheel (matches the pinned 2.6.0+cu124); cu128 row uses `torch2.8` (matches the base's 2.8.0). The `import flash_attn` check catches an ABI mismatch.

## Live verification (USER runs)

Pending:
- [ ] Both image tags (cu124 + cu128) build green in mpi-ci + pull from public GHCR
- [ ] cu124 image deploys on an Ada/Ampere card on an older-driver host → wrapper `ready` (kills the 4090 refusal)
- [ ] cu128 image deploys on a Blackwell card → ready
- [ ] sageattention (+ any added accelerator) imports in the running Pod; ComfyUI reports it as active attention backend; benchmark gen near native-ComfyUI speed (not ~50% slower)
