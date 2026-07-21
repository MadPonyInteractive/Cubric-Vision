# LTX-2.3 transformer quant-tier research (2026-07-05, web-verified)

Context: MPI-197 closed the perf mystery — the ~48s@10s stage boundary on 32GB is bf16-eviction-structural. A smaller transformer that FITS kills the eviction class. This file = variant map for the (uncarded) tier feature.

## Variant map (distilled-1.1 = our model version; all Kijai files transformer-only, drop-in for our folder layout)

| Variant | File (repo) | Size | Arch gate | Loader | Verdict |
|---|---|---|---|---|---|
| bf16 (current) | ours / Kijai | 42GB | any | UNETLoader | quality ceiling; 32GB pays eviction floor (48s@10s, 116s@20s boundary) |
| fp8_scaled | `ltx-2.3-22b-distilled-1.1_transformer_only_fp8_scaled.safetensors` (Kijai/LTX2.3_comfy) | 25.2GB | weight-only fp8: loads on ANY GPU (dequant to bf16 matmul); the FAST W8A8 path (`fp8_input_scaled`, v1.0-distilled-only file) needs sm_89+ | stock UNETLoader | balanced-tier workhorse. ~98% SSIM vs fp16; loss visible: close faces, dense text, fast pans; community: fp8 distilled runs 720p on a 3090 24GB in ComfyUI (3.5min/5s) |
| mxfp8_block32 | `ltx-2.3-22b-distilled-1.1_transformer_only_mxfp8_block32.safetensors` (Kijai) | 24.1GB | loads anywhere; native tensor-core path = Blackwell only (ComfyUI PR #12907 by Kijai, merged 2026-03-14, adds `weight_dtype: mxfp8`; "Blackwell only in practice"; needs torch≥2.10+cu130 — our exact pod stack); others silently dequant to bf16 cores | stock UNETLoader, `weight_dtype=mxfp8` | ★ PR's own benchmark, THIS model on a 5090: **9.68 s/it vs bf16 16.14 s/it (~40% faster)**. Strongest 5090 candidate. Also 30-series fit-tier (dequant) |
| int8_convrot | Kijai | 21.5GB | Ampere+ | ❌ custom node (INT8 not in core) | skip (new dep) |
| NVFP4 | Lightricks/LTX-2.3-nvfp4 (dev only, no distilled) | 21.7GB | Blackwell sm_120 ONLY | native path has open bugs (#11864) | ❌ parked: dev-model-only, i2v quality below practical (smoky artifacts), sometimes slower than fp8 on 5090 |
| GGUF Q2-Q8 | QuantStack/unsloth | 12-25GB | any | ❌ ComfyUI-GGUF (removed MPI-190) | ❌ do not re-open |
| fp8_input_scaled_v3 (v1.0 distilled) | Kijai | ~25GB | sm_89+ | UNETLoader | fallback candidate only |

⚠️ Official `Lightricks/LTX-2.3-fp8` checkpoints = full-bundle 29.5GB AND broken in the LTX-2 python lib (fp8_scaled_mm layout bug, garbled output, no fix as of 2026-07). Use Kijai comfy-format files, NOT the official fp8 repo. bf16 remains Lightricks' quality reference.

## Proposed tiers (user's shape, evidence-adjusted)
- High/quality 32GB: bf16 (accepts the 48s boundary) — or fp8 if speed>quality
- Blackwell fast (5090): mxfp8_block32 OR fp8_scaled — A/B pending
- Ada balanced (4090 24GB): fp8_scaled
- Low (16GB/30-series): mxfp8_block32 (dequant, offload)

## VRAM math caution
fp8/mxfp8 ~24-25GB + gemma fp4_mixed 9.5GB + VAEs + long-video latents may STILL be tight on 32GB — "fits → eviction gone" is plausible NOT proven. Decisive free probe: our existing bf16 file + UNETLoader `weight_dtype: fp8_e4m3fn` (on-load cast, no download) on a 5090 pod → does the stage boundary collapse?
Kotonia measured (LTX-2 PYTHON lib, not ComfyUI): fp8_cast cold-start 23.9GiB but GENERATION peak 58-59GiB at 720p+ — the python pipeline holds both stages resident. ComfyUI+aimdo behaves differently (3090 24GB runs fp8 distilled fine), but treat "fits" claims as unproven until our own pod probe.

## Test plan (before carding implementation)
1. weight_dtype fp8_e4m3fn cast probe on 5090 pod (free, mechanism proof). Use `fp8_e4m3fn_fast` — plain `fp8_e4m3fn` stores fp8 but matmuls bf16; `_fast` engages Ada+/Blackwell fp8 matmul HW (community 4090: ~1.8x speedup, ~14-15GB peak).
2. Download Kijai distilled-1.1 fp8_scaled → quality A/B vs bf16 locked seed (faces/text/motion prompts) + boundary timing.
3. mxfp8 vs fp8_scaled on 5090 (speed) — resolves the native-path conflict; check KJNodes LTX2_NAG artifact bug (issue #576, closed — verify our pin 7f43f2c has fix; we use LTX2_NAG node #426).
4. Weights to R2 per add-model playbook (NOT HF at build time); models are not version-bumped.

## Late addenda (post-synthesis straggler, verify during MPI-200)
- 24GB Ada sizing (community-measured): DEV fp8 OOMs a 24GB card (peak ~23.5GB, crashed at 112MB free — ComfyUI issue #12047); DISTILLED fp8 works at 18-22GB with sequential offload + gemma fp4. We are distilled — fine, but keep gemma fp4 + expect offload on 24GB.
- CONFLICT (one agent claims): "MXFP8 needs the ComfyUI-Kitchen fork, not core." Contradicts the verified core PR #12907 (merged 2026-03-14, `weight_dtype: mxfp8`, release-noted). Core support is the better-evidenced claim; resolve with the first live mxfp8 load on our v0.27 pod.

## Key sources
Kijai repo: huggingface.co/Kijai/LTX2.3_comfy (diffusion_models/) · ComfyUI mxfp8 core support: Comfy-Org/ComfyUI #12907 · NVFP4 quality: zenn.dev rtx5090-nvfp4-quantization-reality · fp8 official bug: Lightricks/LTX-2 issues #193 #205 · quality consensus: HF Lightricks/LTX-2.3 discussions #1 #16 · comfy-quants docs: github.com/Comfy-Org/comfy-quants (ltx2.md)
