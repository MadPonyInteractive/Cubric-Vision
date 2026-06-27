# Pod vs Local Perf — why the cloud 4090 isn't faster than a local 4060 Ti

> FOUR dead ends ruled out (do NOT re-try any): (1) cu130 *cuBLAS GEMM* gains
> (deep-research, Blackwell-only — Ada gets nothing); (2) host throttle
> (live-cleared — 4090 hits 165 TFLOPS / P0 / full clocks, GPU STARVES at 1%
> util); (3) disabling aimdo (`--disable-dynamic-vram`/`--highvram` — live
> OOM-killed the Pod, TWICE counting MPI-146 — aimdo is load-bearing); (4) fp8
> (both engines ALREADY run the identical model set — BF16 22B transformer + fp8
> gemma encoder; nothing to switch). REMAINING AXIS: **torch 2.8 (Pod) vs 2.12
> (local)** — the framework jump, NOT the cu toolkit, which the cu130 research did
> not actually clear. Both engines are otherwise byte-identical (same files, aimdo
> 0.4.10, DynamicVRAM ON, SDPA, CPU-offload). The 16GB local card offloads MORE
> and still beats the 24GB Pod (1:31 vs 2:09). NEXT = per-step profile to localize
> the cost, then a torch-only bump test. Deep-research (108-agent harness) +
> live-tested 2026-06-27. Read this BEFORE proposing ANY of the four dead ends.

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

## fp8 lead = KILLED. Both engines run the IDENTICAL model set (BF16 transformer).
Verified 2026-06-27 from the live local workflow graph + local app.log. The
local 4060Ti loads the EXACT same files the Pod does:
- transformer `ltx-2.3-22b-distilled-1.1_transformer_only_bf16.safetensors` (**BF16**, 22B), weight_dtype `default`
- CLIP1 `gemma-3-12b-it-heretic-fp8-comfy.safetensors` (already fp8), CLIP2 `ltx-2.3_text_projection_bf16`
- VAE `LTX23_video_vae_bf16` + `LTX23_audio_vae_bf16` (bf16)

So format is NOT the gap — the heavy transformer is BF16 on BOTH sides; the
encoder is ALREADY fp8 on both. There is no fp8 transformer to switch to in this
workflow. **Do not chase fp8.** (An fp8 transformer build, if one exists upstream,
is a SPECULATIVE future optimization for BOTH engines, not an explanation of the
local-vs-Pod gap.)

Worse for every offload/VRAM theory: local app.log confirms the 4060Ti runs
`comfy-aimdo inited ... (VRAM: 16379 MB)` + `DynamicVRAM support detected and
enabled` + `offload device: cpu` — i.e. the **16GB local card offloads MORE** of
the 22B BF16 transformer than the 24GB Pod does, **and still wins (1:31 vs 2:09).**
The card doing the MOST offloading is the FASTEST. That definitively kills suspect
A (aimdo/offload overhead) from a second direction.

## CONCLUSION — every cheap lever is exhausted; the only remaining axis is torch
After live testing, the two engines are byte-identical on every measurable axis:
same model files, same ComfyUI 0.26, same aimdo 0.4.10 + DynamicVRAM ON, same SDPA
(sage gated off on Ada both sides), same BF16 transformer, same CPU-offload. RULED
OUT live: host throttle (165 TFLOPS/P0), aimdo-off (OOM), fp8 (identical already).
RULED OUT by deep-research: cu130 cuBLAS GEMM gains (Blackwell-only).

**The ONE remaining difference is the torch/CUDA stack: Pod torch 2.8.0+cu126 vs
local torch 2.12.0+cu130.** The deep-research dead-end verdict was specifically
about cu130's *cuBLAS GEMM* gains being Blackwell-only — it did NOT clear the
**torch 2.8 → 2.12** jump itself (4 minor PyTorch releases: SDPA kernel selection,
inductor/compile, CUDA-graph capture, the caching allocator all changed across
2.8→2.9→2.10→2.11→2.12, independent of the CUDA toolkit version). The earlier
research conflated "cu126→cu130" (toolkit, Ada-neutral) with "torch 2.8→2.12"
(framework, possibly NOT neutral). That axis is the live re-open.

### NEXT (open) — isolate the torch version, do NOT bump cu blindly
The clean experiment is to raise ONLY torch on the Pod and re-time, WITHOUT taking
cu130's driver-floor cost. Options, in order of cheapness:
1. **Measure first, don't rebuild:** on a Pod, `pip install torch==2.12 ...` into a
   throwaway venv ISN'T trivial (cu/driver floor), so instead profile WHERE the
   Pod's 2:09 goes vs local's 1:31 — per-stage step timing from the stdout tqdm
   (we already parse it, MPI-147). If the Pod is slower PER STEP uniformly → it's
   the kernel/framework (torch). If it's slower only at stage boundaries →
   load/offload/PCIe. This localizes the cost for free before any image work.
2. Can a torch 2.9–2.12 wheel install on the cu126 base WITHOUT moving to cu130's
   r580 floor? torch 2.12+cu126 wheels may exist (cu126 is still supported in
   newer torch). If so → bump torch only, keep the wide driver coverage, re-time.
3. Only if 1+2 point hard at torch AND a cu126-compatible 2.12 wheel doesn't
   exist, reconsider the cu128/cu130 base trade (coverage loss vs the measured
   gain) — with NUMBERS this time, not the assumption that cu130 = no gain.

Do NOT reopen: aimdo-disable (OOM, twice), fp8 (identical), or a blind cu130 bump
(coverage cost). The next move is a per-step profile to localize the cost, THEN a
torch-only bump test if step-time is the culprit.
