# Boogu Edit fp8_scaled dark-on-Blackwell — research (2026-07-12)

4 parallel web-research agents, ~50 sources. Question: why does `boogu_image_edit_fp8_scaled`
render dark/underexposed on RTX PRO 4500 (Blackwell, sm_120) but correct on RTX 4060 Ti (Ada)?

## Verdict

**The UNETLoader `weight_dtype` widget is NOT the fix.** The shipped graph uses `default`.

ComfyUI source (nodes.py / comfy/ops.py / model_management.py) confirms the compute path per value:

| weight_dtype | on an fp8_scaled file | compute | Blackwell-safe |
|---|---|---|---|
| `default` | manual_cast (fp8 storage, upcast→bf16 per layer) | bf16 | yes (what we ship) |
| `fp8_e4m3fn` | manual_cast (same as default) | bf16 | yes — but a NO-OP vs default |
| `fp8_e4m3fn_fast` | native `torch._scaled_mm` fp8 matmul (clamped) | fp8 | **NO — this is the one that glitches** |
| `fp8_e5m2` | manual_cast (recast layout) | bf16 | yes; not clearly better for inference |

Since we already use `default` (= manual_cast = safe), switching the widget changes nothing.
`fp8_e4m3fn_fast` is the value that produces "10%-denoised"/glitch output on RTX 5090
(Qwen-Image-Edit: ComfyUI #9190, #11255) — we never used it.

## Actual mechanism of the darkening

The dark/underexposed signature = a **multiplicative magnitude error compounding per layer**,
i.e. an fp8_scaled **per-tensor scale-factor mis-application** on sm_120 (scale ignored /
double-applied / wrong dtype). Analogous confirmed bugs: vLLM #39407 (double-applied activation
scales → garbage), Qwen-Image-Edit black output on RTX 5090 (ComfyUI #11865). Ada exercises a
different (working) kernel path; Blackwell hits a new CUTLASS/scaled_mm path.

Env contributor: Blackwell needs **torch cu130 + sm_120a**; cu128 mis-routes fp8 (PyTorch
#172807 strips sm_120a → sm_120 → broken block-scaled MMA). Also SageAttention + fp8 on
Blackwell = black (SageAttention #221), and `--fast`/torch.compile can black-out. We decline to
depend on any of these launch-flag/env conditions (they have bitten us before).

## The replacement answer

ComfyUI contributor **Kijai** (Comfy-Org/Boogu-Image Discussion #10):
> "int8-convrot is just much better, faster and better quality on all Nvidia GPUs"

Community quality rank: **bf16 > GGUF-Q8 > int8_convrot > mxfp8 > fp8_scaled > fp8**.
Speed: int8_convrot fastest; works on RTX 20/30/40/50 (int8 HW support broader than fp8's 40/50).
No mxfp8/e5m2 Boogu variant exists. nvfp4 (5.83GB) is Blackwell-only (rejected — not universal).

→ Decision: drop fp8_scaled; keep bf16 (High); promote the existing turbo int8_convrot weight to
Balanced. int8_convrot is universal + Blackwell-safe + already downloaded/on R2 (zero new upload).

## Key sources
- ComfyUI #9190 / #11255 — fp8_e4m3fn_fast glitch on RTX 5090 (Qwen)
- ComfyUI #11865 — Qwen-Image-Edit fp8 intermittent black on RTX 5090
- ComfyUI #11068 — fp8_scaled darker output (scale/matmul dispatch regression)
- vLLM #39407 — double-applied scale → garbage (same class of magnitude bug)
- PyTorch #172807 — sm_120a arch-flag stripping breaks Blackwell fp8
- Comfy-Org/Boogu-Image Discussion #10 — Kijai: int8_convrot > fp8 on all NVIDIA
- ComfyUI nodes.py / comfy/ops.py / model_management.py — weight_dtype compute-path truth
