# Pod vs Local Perf — why the cloud 4090 isn't faster than a local 4060 Ti

> THREE dead ends ruled out (do NOT re-try any): (1) torch/cu130 bump
> (deep-research, Ada gets no cuBLAS gain + loses driver coverage); (2) host
> throttle (live-cleared — 4090 hits 165 TFLOPS / P0 / full clocks); (3)
> disabling aimdo (`--disable-dynamic-vram`/`--highvram` — live OOM-killed the
> Pod, TWICE counting MPI-146). REMAINING LEAD: the model **format** — fp8 native
> weights load faster WITH aimdo on (a model-asset change, not a flag/torch
> change). Deep-research-backed (108-agent harness) + live-tested 2026-06-27 on a
> 4090. Read this BEFORE proposing a torch bump, a VRAM flag, or re-researching
> the version gap.

## The observation

Same LTX-2.3 t2v workflow, byte-identical ComfyUI 0.26.0 + comfy-aimdo 0.4.10 +
SDPA (sage gated off on Ada sm_89, MPI-145), warm gen:

| Machine | GPU | torch / CUDA | warm gen |
|---|---|---|---|
| Local (app engine) | RTX 4060 Ti 16GB | **2.12.0+cu130 / CUDA 13.0** | **1:14** |
| Cloud Pod | RTX 4090 24GB | **2.8.0+cu126 / CUDA 12.6** | **1:41** |
| Cloud Pod | RTX A4500 20GB | 2.8.0+cu126 / 12.6 | 5:51 (cold), warm untested |

A 4090 should be ~2-3× a 4060 Ti on raw compute. It was SLOWER. Cold-gen on the
Pod (4:34 / 5:51) is mostly one-time aimdo model-staging tax — warm is the real
comparison.

## CONCLUDED — the torch 2.8+cu126 → 2.12+cu130 bump is NOT the fix (do not do it)

Deep research (verified, primary NVIDIA sources):

1. **CUDA 13.0 cuBLAS gains are Blackwell-ONLY** (3-0). NVIDIA's own notes: the L3
   non-GEMM kernel improvements (SYRK/HERK/TRMM/SYMM, FP32/CF32) are "on NVIDIA
   Blackwell GPUs." Ada sm_89 gets **zero** fp16/bf16 GEMM or attention speedup
   from cu130. LTX diffusion is fp16/bf16 GEMM+attention → no benefit.
2. **Driver-floor cost is real and worse than the cu124-label framing** (3-0):
   cu130 needs a **hard r580 floor** (≥580.65.06 Linux; Update 3 ≥580.126.20);
   cu126 runs as low as ~r525-560. Bumping to cu130 would **exclude every host
   below r580** = directly kills Option A's wide-coverage purpose (the A4500 ran
   on r550 — a cu130 image would have REFUSED it).
3. No confirmed Ada-specific torch-2.8 regression survived adversarial verification
   (sglang cu124→cu126 Ada regression, SDPA MATH-upcast, fp16-accum — all refuted
   0-3). The version gap alone does not explain a ~35% wall-time penalty.

**→ A cu130 bump = all cost (lose hosts), zero benefit (no Ada speedup). Off the
table. Don't re-research this; the answer is documented here.**

## LIVE TEST SESSION 2026-06-27 (4090 Pod) — B CLEARED, A FAILED (OOM)

Both suspects were tested live on a fresh 4090 Pod. Clean measurement table
(all sampling-only — the card/toast timer excludes cold model-load, MPI-147):

| Machine | GPU | warm | cold |
|---|---|---|---|
| Local (app engine) | 4060 Ti 16GB | **1:31** | 2:18 |
| Cloud Pod | 4090 24GB | **2:09** | 2:49 |

The ~38% gap (4090 LOSING to a 4060 Ti) is REAL and reproducible.

### B (host throttle) = CLEARED. Hardware is fine.
Probed during a gen: **bf16 8k matmul = 165 TFLOPS** (full 4090 spec), **P0**
under load (not the idle P8 RunPod telemetry showed), **Graphics/SM 2520–3105
MHz** (full Ada boost), **mem 10501 MHz**, **450W** power limit, **zero throttle
reasons**. The card delivers full compute WHEN FED. But `nvidia-smi dmon` showed
**SM util 1–15%** across the whole gen with **VRAM pinned 93%** and the
**framebuffer climbing mid-gen** — the GPU is STARVING, not throttling. CPU 0–10%,
sys RAM not pegged → host is not the bottleneck. → Throttle ruled out. The
starvation pointed at aimdo's dynamic fault-in stalling the SM (suspect A).

### A (aimdo overhead) = TESTED, FAILED — disabling aimdo OOM-KILLS the Pod.
Hypothesis was: LTX fits 24GB, so aimdo's stage/evict is wasted overhead; disable
it and the model stays resident → faster. **WRONG, and it was already documented
(gotchas.md MPI-146).** `--disable-dynamic-vram` (R2-pushed via start.sh, gated
VRAM_GIB≥22) made ComfyUI load LTX-2.3's **full 3-stage** weight set RESIDENT with
the offload spec on CPU → it streamed **~57GB into a Pod with ~57GB RAM** → the
status bar sat at `LOADING MODEL 0%` for 2:54+, RAM hit 98%, then the **container
was OOM-KILLED mid-gen** ("remote engine disconnected — the Pod may have run out
of memory and restarted"). This is the SAME failure as MPI-146's 5090 `--lowvram`
OOM. **aimdo's dynamic fault-in is LOAD-BEARING — it is what PREVENTS this OOM,
not wasted overhead.** The "LTX peaks ~18GB so it fits" framing was wrong: one
STAGE fits VRAM, but the full pipeline's resident RAM footprint does not.

`--highvram`/`--gpu-only` would be even MORE aggressive (everything on GPU) → same
or worse OOM. Do not try them either. **`--disable-dynamic-vram` is reverted;
start.sh default is back to `VRAM_MODE=""` (aimdo manages). Never disable aimdo to
chase perf again — it's now failed live TWICE (MPI-146 + this).**

## CONCLUSION — the gap is the model FORMAT, not a VRAM flag or torch version
Both the version bump (cu130, deep-research dead end) and the VRAM flag (aimdo-off,
OOM) are dead ends. The remaining lever — flagged by BOTH ComfyUI's own
`--disable-dynamic-vram` deprecation warning AND aimdo's guidance — is the model
**format**: *"fp8 native ComfyUI formats will be faster even if they are larger
than your memory"* WITH dynamic vram ON. A bf16 LTX transformer streamed through
aimdo is the slow path; an **fp8 transformer (~20GB) + fp8 encoder (~7GB)** is
smaller, loads faster, and keeps aimdo's OOM safety. This also likely explains the
local-vs-Pod gap directly: confirm what FORMAT each engine actually loads (local
4060Ti in 16GB almost certainly runs a quantized/fp8 set; the Pod may be running
bf16). 

### NEXT (open) — fp8 format investigation
1. Confirm the dtype/format the LOCAL engine loads for LTX-2.3 (check its model
   files + load log `model weight dtype`) vs what the Pod loads (boot log showed
   `model weight dtype torch.bfloat16` on the Pod).
2. If they differ, that IS the gap — align the Pod to the fp8 set (model registry
   / download, NOT a start.sh flag). Keep aimdo ON.
3. Re-time warm gen. Target: 4090 warm < local 1:31.

This is a model-asset change, not a VRAM/torch/flag change — different workstream.
Do NOT reopen the cu130 bump or any aimdo-disable flag.
