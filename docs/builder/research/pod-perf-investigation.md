# Pod vs Local Perf — SOLVED: the gap is 40GB MODEL FAULT-IN, not compute

> **ROOT CAUSE (live-proven 2026-06-27):** the cloud 4090 loses to the local
> 4060Ti on LTX-2.3 ENTIRELY because of the per-stage **aimdo dynamic-VRAM
> fault-in of the 40GB LTXAV transformer**, NOT compute. Live per-phase split on a
> cold Pod LTX gen (`Prompt executed in 250.34s`):
>
> | Phase | Pod 4090 | Local 4060Ti | who wins |
> |---|---|---|---|
> | Stage-1 fault-in (40GB → VRAM) | **108.19 s** | 34 s | local 3.2× |
> | Stage-1 sampler (7 steps) | 1.45 s/it (~10s) | 4.6 s/it (~32s) | **Pod 3×** |
> | Stage-2 fault-in (40GB → VRAM) | **58.66 s** | 28 s | local 2× |
> | Stage-2 sampler (3 steps) | 1.3 it/s (~6s) | 2 s/it (~6s) | Pod |
>
> The two fault-ins = **167s of the 250s gen (~67%)**. The Pod SAMPLER is FASTER
> than local — compute was never the problem. WHY the fault-in is slow: the 40GB
> model does NOT fit resident in 24GB VRAM → aimdo faults it in per stage; and the
> Pod's RAM is too small to fully cache it (live: 23GB used of 46GB RAM, VRAM pinned
> 23.1/24) → fault pages partly stream from the **1.0 GB/s network volume**
> (measured by `dd`, 42GB in 42s) instead of from RAM. 40GB / 1 GB/s ≈ 40s floor,
 stacked with VRAM-ceiling evict-thrash → 108s.
>
> **LOCAL SPEC (verified, do not re-ask): 64GB DDR5 @ 4000 MT/s, ~20GB baseline →
> ~43GB available; model on an NVMe SSD (C:, PCIe). Python 3.13.12 / torch 2.12.0 /
> CUDA 13.0.** Pod free RAM (~43-46GB) ≈ local's ~43GB — RAM size is NOT it.
>
> **CORRECTION — it is NOT transfer/disk/bus bandwidth either (measured 2026-06-27):**
> On a Pod 4090 the host→VRAM copy is FULL SPEED: **pinned 25.7 GB/s, pageable 19.5
> GB/s, PCIe Gen4 x16.** 40GB at 25.7 GB/s = **~1.6 seconds.** The fault-in took
> **108 seconds — 65× longer than the raw transfer.** So the 108s is NOT memcpy, NOT
> the 1.0 GB/s volume (the model is already "Staged" to RAM before init prints), NOT
> PCIe. It is **aimdo's page-fault-in MECHANISM overhead** — aimdo hooks CUDA
> (`cuda-detour.c`) and faults weights page-by-page on first access; the cost is the
> per-page fault-handler / UVM bookkeeping, not the bytes. **This is stack-version-
> sensitive:** the CUDA driver's UVM/fault path + torch's allocator changed cu126→
> cu130 / torch 2.8→2.12, so local (torch 2.12 / cu130 / py3.13) faults far faster
> than the Pod (torch 2.8 / cu126 / py3.11). This is the ONE axis the cu130 deep-
> research never covered — it cleared cuBLAS GEMM *compute* gains (Blackwell-only),
> NOT the fault-hook path. The earlier "1 GB/s volume" explanation in this doc is
> SUPERSEDED by this measurement.
>
> **FIX — only TWO real levers (bandwidth/RAM/disk/PCIe all PROVEN not the cause):**
> 1. **Don't fault at all — model resident in VRAM (48GB card):** if the 40GB model
>    fits VRAM, aimdo's page-fault path never runs → BOTH 100s+ inits vanish. The
>    surest fix; sidesteps the fault mechanism entirely. (Won't fit 24/32GB → fault
>    stays; needs ~48GB for the 40GB model + working set.)
> 2. **Match local's stack on the Pod (torch 2.12 / cu130 / py3.13):** the fault-in
>    is the aimdo page-fault MECHANISM, which is stack-version-sensitive. A Pod image
>    on torch 2.12+cu130 may fault as fast as local (34s vs 108s). This is the
>    JUSTIFIED torch-bump test — by ELIMINATION (bus/disk/RAM/compute all cleared),
>    NOT the cuBLAS-GEMM angle the deep-research killed. COST: cu130 needs the r580
>    driver floor → narrows host coverage (the whole Option-A tradeoff). Measure the
>    gain FIRST on a throwaway torch-2.12 venv + a fault-in micro-benchmark before
>    committing an image rebuild.
> (Dropped: "more RAM" — equal RAM still wins. Dropped: "faster disk / pre-warm
>  volume" — the host→VRAM copy is 25.7 GB/s, the volume read is not the bottleneck;
>  the 108s is fault-handler overhead, not bytes moved.)
>
> The mechanism is aimdo's PAGE-FAULT-IN overhead (per-page fault-handler / UVM
> bookkeeping), NOT bytes moved — proven by: host→VRAM = 25.7 GB/s pinned / PCIe
> Gen4 x16 → 40GB would copy in ~1.6s, but the fault-in took 108s (65×). It is
> stack-version-sensitive (CUDA UVM + torch allocator changed cu126→cu130 / torch
> 2.8→2.12), which is why local (torch 2.12/cu130) faults 3× faster.
>
> RULED OUT (do NOT re-try): cu130 cuBLAS GEMM *compute* (Blackwell-only — but the
> cu130 *fault-hook* path was NEVER tested, that's fix #2); host throttle (165
> TFLOPS/P0); aimdo-disable (OOM, twice); fp8 (identical already); torch-broad-
> compute (SDXL on the Pod is FAST, 2s vs local 12s); Triton/PatchTritonVAE (not in
> the workflow); transfer/disk/PCIe bandwidth (25.7 GB/s, Gen4 x16 — NOT the cause).
> Deep-research (108-agent) + live-tested 2026-06-27.

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

## KEY PIVOT 2026-06-27 — the Pod is NOT generically slow; it is LTX-SPECIFIC
User datapoint: an **SDXL image gen = ~2s on a 5090 Pod vs ~12s on the local 4060Ti
— the Pod WINS ~6×.** So the cloud GPU + torch stack is FINE for image diffusion;
the slowness is specific to the LTX VIDEO path. This DEMOTES every "torch is broadly
slower" theory — torch 2.8 is not globally slow (SDXL proves it), so if torch is
involved it's via an LTX-specific kernel, not a blanket regression. New frame: find
what in the LTX graph behaves differently on the Pod stack.

### Triton / PatchTritonVAE = CHECKED + DISMISSED (do NOT chase — agents were right)
Local app.log shows `KJNodes: PatchTritonVAE could not be imported ... No module
named 'triton'` (triton is flaky/absent on Windows; present on the Linux Pod). This
LOOKS like a local/Pod divergence, but the 4 SHIPPED LTX workflows
(`comfy_workflows/LTX_{t2v,i2v}{,_stage2}.json`) were grepped: they use
`VAELoaderKJ` + `VAEDecode` + `LTXVAudioVAEDecode/Encode` and contain **ZERO**
`PatchTritonVAE`/triton references. The failing node is never in the graph → its
import failure changes nothing → it CANNOT be the gap. Prior agents correctly said
"ignore it." Recorded here so it is not re-chased.

### Surviving LTX-specific suspects (ranked)
1. **LTX sampler / DiT forward (per-step compute)** — most of the 2:09 is sampling;
   an LTX-specific attention/forward kernel that's slower on torch 2.8 than 2.12
   would be both LTX-specific AND stack-sensitive, consistent with SDXL-fast.
2. **LTX VAE decode** (`VAELoaderKJ` / `LTXVAudioVAEDecode` — video VAE, tiling +
   temporal, heavy) — could differ by stack.
3. **The distilled 22B transformer run path.**
4. ~~Triton/PatchTritonVAE~~ — DEAD (not in graph, above).
5. ~~gemma CLIP~~ — unlikely (one-time text encode, ~constant cost; does not scale
   with the per-step 2:09 gap).

### Tests that DO probe this (an SDXL/image test does NOT — it's the control, already done)
- **Per-node timing, one LTX gen each side (free, decisive):** ComfyUI logs per-node
  execution time. Compare local vs Pod per-node for the LTX graph; the dominant node
  (sampler vs VAE-decode) names the culprit. No rebuild.
- **Wan video on the Pod (secondary):** Wan uses a different VAE/node set. Wan fast →
  slowness is LTX-node-specific; Wan also slow → video-class-broad. Splits the tree.
- **NOT useful:** re-running SDXL/image gens. SDXL never touches the LTX video path,
  so it cannot confirm or deny any LTX theory — it is the (already-collected) control
  showing the Pod stack is fine for images.

## ROOT CAUSE FOUND 2026-06-27 — it's INTER-STAGE MODEL STAGING, not per-step compute
Per-step sampler rate is FAST on BOTH sides (live tqdm): Pod main LTX sampler =
**~2.96 it/s (~0.34 s/it)**, local = ~4.57 s/it — i.e. the Pod's per-step DiT compute
is actually FASTER. **The wall-clock is NOT in the sampler steps.** It is in the gaps
BETWEEN stages, where aimdo (re)stages each stage's model:
```
Requested to load LTXAV
Model LTXAV prepared for dynamic VRAM loading. 40050MB Staged. 1440 patches attached.
```
LTX-2.3 is multi-stage (text-encoder LTXAVTEModel_ ~15GB → stage-1 transformer LTXAV
~40GB → stage-2 LTXAV ~40GB → VideoVAE/AudioVAE). The **40GB LTXAV transformer is
(re)STAGED at EACH stage boundary** — in the local cold LTX log it appears 3× with
~38s + ~39s wall-clock BETWEEN the staging events (16:36:29 → 16:37:07 → 16:37:46),
while the sampler bars in between are quick. SDXL is fast because it's ONE small
(~5GB) model, ONE stage, no re-staging. This is why:
- per-step is fast both sides (compute was never the issue);
- total is slow (staging dominates the wall-clock);
- it's LTX-specific (SDXL doesn't re-stage a 40GB model 3×);
- disabling aimdo OOM'd (materializing 40GB × stages resident > RAM) — aimdo's
  staging is the SYMPTOM's mechanism but also the OOM SAFETY; the fix is to stop the
  RE-staging, not to disable aimdo.

### The narrowing question (needs Pod WARM log)
Local does the same re-staging on COLD (the +38s events are in local's 132s cold
gen) yet local WARM = 1:31 vs Pod WARM = 2:09. So warm runs must SKIP some staging
(model kept resident/cached). The remaining question: **what does the Pod re-stage
on a WARM gen that local keeps cached?** Likely a cache-retention difference —
wrapper.py:202-211 DROPPED `--cache-lru` (MPI-142) to fall back to v0.26's
pressure-aware `--cache-ram` default "matching local"; verify the Pod actually keeps
the 40GB LTXAV resident across stages on warm the way local does.

### NEXT — capture & compare the WARM staging logs (free, no rebuild)
1. On the Pod, run TWO consecutive LTX gens; capture the `Requested to load` /
   `Model … prepared for dynamic VRAM loading … Staged` lines + timestamps for the
   SECOND (warm) gen.
2. Compare to a local WARM LTX gen's same lines (app.log).
3. If the Pod re-stages LTXAV (40GB) on warm where local keeps it cached → the fix is
   cache retention (keep the stage models resident between/across gens), NOT a torch
   bump and NOT aimdo-off. Tune via `--cache-ram`/`--reserve-vram`/cache count —
   aimdo stays ON (no OOM). If both re-stage identically on warm → the per-STAGING
   cost itself is slower on the Pod (PCIe / host-mem bandwidth / torch-2.8 staging
   path) → measure staging seconds per 40GB event, Pod vs local.
Do NOT bump torch or disable aimdo before this log comparison localizes the cost.
