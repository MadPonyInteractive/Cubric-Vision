# Pod vs Local Perf — why the cloud 4090 isn't faster than a local 4060 Ti (OPEN)

> Concluded part: **the torch/CUDA version bump is a DEAD END — do not chase it.**
> Open part: two unmeasured live suspects (aimdo overhead; cloud-host throttle).
> Deep-research-backed (108-agent harness, 25 claims adversarially verified,
> 2026-06-27). Read this BEFORE proposing a torch/cu130 bump or re-researching the
> version gap.

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

## OPEN — two live suspects (both need a Pod; both cheap, no rebuild, no torch change)

The research narrowed the cause to two things it could NOT measure remotely:

### A. aimdo overhead on a card that doesn't need offload
ComfyUI's own blog (2-1): async-offload + pinned-memory help **only when weights
must offload to RAM**; *"if you do not need to offload any weights… these
optimizations will not improve your performance in a meaningful way."* LTX-2.3
peaks ~18GB on a 24GB 4090 → **fits without offloading** → aimdo's dynamic
stage/evict/fault-in is wasted work and can make the big card *slower*. (The
specific aimdo-Ada-stall GitHub bugs #13423/#14378 were refuted 0-3 = could NOT be
confirmed against 0.4.10, NOT disproven — check the 0.4.10 changelog before
leaning on them.)

**Test:** boot the Pod with aimdo OFF on big cards — `--disable-dynamic-vram` (or
`--highvram`/`--gpu-only`) so the model stays resident. Edit `start.sh` `VRAM_MODE`,
gate by `VRAM_GIB` (e.g. disable aimdo when ≥24GB, keep it below where LTX doesn't
fit). R2 push + `restart-comfy`, no rebuild. Re-time warm gen vs 1:41. Watch for
OOM on the disable path (that's exactly what aimdo protects against on small cards).

### B. Cloud-host throttle (the report's #1 open question)
*"could independently explain a 35% wall-time penalty without any torch/CUDA
involvement."* P-State stuck low under load, clock caps, persistence mode off, ECC.
Never measured on the test Pod. (RunPod telemetry showed the 4090 at **P8** at idle
— need to confirm it reaches **P0/P2 under load**; stuck P8 alone explains it.)

**Test (Pod web terminal, during a gen):**
```bash
# clocks + P-State + throttle reasons under load
nvidia-smi -q -d CLOCK,PERFORMANCE,POWER | grep -iE "Performance State|SM |Graphics|Memory |Power Draw|Power Limit|Persistence|Throttle|Clocks Throttle"
nvidia-smi dmon -s pucm -c 20   # 20 samples of pwr/util/clocks/mem during sampling
# raw bf16 matmul — is the 4090 delivering ~150-160 TFLOPS or suppressed?
python - <<'PY'
import torch, time
x = torch.randn(8192,8192,device='cuda',dtype=torch.bfloat16)
for _ in range(3): torch.mm(x,x)
torch.cuda.synchronize(); t=time.time()
for _ in range(20): torch.mm(x,x)
torch.cuda.synchronize(); dt=(time.time()-t)/20
print(f"bf16 8k matmul {dt*1000:.1f} ms ~{2*8192**3/dt/1e12:.0f} TFLOPS")
PY
```
If TFLOPS is 4090-class (~150-160) but the gen is still slow → it's aimdo (suspect
A). If TFLOPS is suppressed or P-State/clocks are capped under load → it's host
throttle (suspect B), independent of any image change.

## Decision rule
Run B's diagnostics FIRST (free, just commands) — they rule throttle in/out in one
gen. Then A (start.sh aimdo-off test, R2 push). Do NOT touch torch/cu130 either way.
