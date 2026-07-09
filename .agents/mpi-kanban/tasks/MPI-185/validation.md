# MPI-185 Validation

## Stage-2 sigma fix 0.65 → 0.85 — SHIPPED + auto-verified 2026-07-04

**What:** Corrected the two-stage LTX refine sigmas from our `0.65, 0.45, 0.25, 0.0`
to the official `0.85, 0.7250, 0.4219, 0.0` (proven sharper in the clean i2v A/B, see
`docs/builder/research/ltx-workflow-authoring.md`).

**How:** User re-exported `comfy_workflows/scripts/workflow_generation/LTX_i2v_t2v_template.json`
with the new value on the live stage-2 `ManualSigmas` (node #28 → SamplerCustomAdvanced #39).
Agent ran `generate.bat` (orchestrator) to fan the template into the 8 app workflow files.

**Auto-verify (agent, passed):** all 8 output files
(`LTX_{i2v,t2v}{,_stage2}{,_gguf}.json`) carry `"0.85, 0.7250, 0.4219, 0.0"` on the live
stage-2 sampler (#28→#39). The old `0.65` survives ONLY as dead `ManualSigmas` node #440
(zero consumers) — inert cruft from a prior export, never executes, copied verbatim by the
generator. No output ships `0.65` on any live sampler.

**Live gen A/B already done** (prior session): official 0.85 beats our 0.65 on the same
seed/two-stage/i2v — sharper face + better detail recovery. This ship just propagates that
proven value into the shipped workflows. No further live check needed for the sigma value.

## SHIPPED — --vram-headroom=1 baked as ≤24GB start.sh default + R2 stable 2026-07-04

**Why not env-at-deploy:** the reversible env-test path is mechanically dead. The wrapper reads
`CUBRIC_VRAM_MODE` ONCE in `ComfyManager.__init__` (`wrapper.py:193`), NOT in `_build_cmd`, so
`POST /wrapper/restart-comfy` re-spawns ComfyUI with the boot-cached value. wrapper.py is baked
in the image (no R2 hot-fix), and a terminal `export` can't reach the already-running wrapper's
env anyway. On RunPod the terminal only opens AFTER ComfyUI has booted, so there is no
pre-boot window to set the env. → baking into start.sh (which IS R2-fetched) is the only
no-rebuild path.

**What shipped:** `mpi-ci/cubric-vision-pod/start.sh` — gated default
`if [ -z "$VRAM_MODE" ] && [ "$VRAM_GIB" -gt 0 ] && [ "$VRAM_GIB" -le 24 ]; then
VRAM_MODE="--vram-headroom=1"`. Only ≤24GB Pods get it; ≥32GB stay on plain aimdo; an explicit
`CUBRIC_VRAM_MODE` env still overrides. `=` form (wrapper appends as one un-split argv token).
Self-tested the gate across 0/8/16/24/32/90/nogpu → correct. `bash -n` clean.

**Published:** `./publish-runtime.sh stable` → `cubric-pod-runtime/vision/stable/`. Verified:
local `start.sh` sha256 `59f2e38…` == published manifest `start_sha256` == live-served content
(plain GET returns 13752 B with `vram-headroom=1` ×3). (publish-runtime.sh exited 43 on its
own curl `-o /dev/null` URL-verify loop — a client-side `000` artifact on this box; the upload
+ SHA match + real GET all confirm the file is live and correct.)

## ☠️ POD CONFIRM DONE — --vram-headroom=1 DISPROVEN. Fix did NOT hold. (2026-07-04)

User recreated a real 24GB 4090 Pod. Boot log confirmed the fix was live and applied:
`[cubric] VRAM: 24GB-tier default --vram-headroom=1 (GGUF dequant headroom, MPI-185; detected
23GiB)`, `start_sha256` matched the published manifest, ComfyUI parsed the flag + booted clean.
Ran LTX i2v (mall i2v, locked start frame). **OOM'd anyway, identical to the no-flag run:**
```
LTXVNormalizingSampler failed: torch.OutOfMemoryError
Currently allocated : 22.58 GiB   (no-flag baseline: 22.53)
Requested           : 576.00 MiB
Device limit        : 23.64 GiB
Free (CUDA)         : 4.81 MiB
```
Live telemetry: VRAM plateaued 23.6/24 GB, RAM climbed to ~43/61 GB (offload WAS happening) —
then OOM at the stage-1 `dequantize_blocks_BF16` upcast. The flag was inert.

**Mechanism gap (why the local bf16 proof didn't transfer):** `--vram-headroom` reserves headroom
against **aimdo's managed pool**; the GGUF +576MB is a **raw torch alloc inside the ComfyUI-GGUF
custom node** (`dequant.py:62`), fired during the forward pass on top of an already-staged model —
outside aimdo's fence. Wrong allocator. bf16 (no dequant) was never the failing path, so capping
it proved nothing. Full write-up: `docs/builder/research/pod-perf-investigation.md` § "DISPROVEN
on the Pod GGUF path".

**Standing state:** `--vram-headroom=1` is baked in start.sh (≤24GB) + live on R2 stable, doing
nothing useful. Next session: revert it OR repoint to the winning real fix (another R2 push).

## OPEN — the REAL 24GB fix (next session, escalate to plan.md fixes 2-4)

The OOM is GGUF-dequant-specific at stage-1 sample time → attack the dequant working set, NOT
aimdo flags. Ranked: (1) lower res/tier ceiling on 24GB (cheap, quality-preserving in-cap);
(2) smaller quant Q6_K (17.8GB) / UD-Q5_K_M (18.2GB) per-tier — needs a per-tier workflow/dep
split + a face-quality A/B; (3) bf16 transformer last-resort (re-enters the 40GB cold-fault tax).
