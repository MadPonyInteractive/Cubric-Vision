# Qwen Image Edit 2511 — tiers, loaders, transformer variants

> Settled from MPI-300 research (2026-07-17). Raw dumps:
> `research/lora-strength-axis.md`, `research/weights-and-tiers.md`,
> `research/transformer-survey.md`.

## Architecture (confirmed)

Base 2511 transformer is **raw / undistilled** (~40 steps). Comfy-Org ships **no
fused Lightning checkpoint** — acceleration is always a **separate Lightning LoRA on
top of the base**. → the 3-tier design (same base, LoRA swapped per tier) is correct.

## Lightning LoRA loader

- **Loader: MODEL-only** (`LoraLoaderModelOnly` → our `MpiLoraModel`). Distillation LoRAs
  carry **transformer deltas only, no CLIP keys**.
- **Strength: `1.0`** (calibrated for full strength).
- Evidence: comfy.org 2511 workflow listing + community `qwen-image-edit-2511-4steps.json`
  both use `LoraLoaderModelOnly`. High confidence.
- **OPEN — V1.0 vs V2.0:** user downloaded `-2511-Lightning-{4,8}steps-V1.0-bf16`;
  community graph references `Qwen-Image-Lightning-4steps-V2.0`. Both transformer-only,
  same lightx2v repo → loader unchanged. Confirm intended version with user.

## Tier → weights

| Tier | Steps | Transformer | Accelerator LoRA |
|---|---|---|---|
| Low | 4 | `qwen_image_edit_2511_fp8mixed` | 2511-Lightning-4steps-V1.0-bf16 (810MB) |
| Balanced | 8 | `qwen_image_edit_2511_fp8mixed` | 2511-Lightning-8steps-V1.0-bf16 (810MB) |
| High | ~40 | **`qwen_image_edit_2511_bf16`** (undistilled) | none |

## Transformer quant matrix (Comfy-Org repo)

| Format | Filename | Bytes | GiB | Hot-store gate (≥20 GiB) |
|---|---|---|---|---|
| bf16 (full) | `qwen_image_edit_2511_bf16.safetensors` | 40,861,031,560 | 38.06 | **ABOVE — stages + PING-USER** |
| fp8mixed | `qwen_image_edit_2511_fp8mixed.safetensors` | 20,533,762,817 | **19.13** | below (serves from volume) |
| int8 | `qwen_image_edit_2511_int8_convrot.safetensors` | ~20.5e9 | ~19.10 | below |

**Hot-store gate is BINARY GiB** (`sizeToGb` parses the dep `size` STRING as `N × 1024³`;
`HOT_STORE_MIN_GB = 20` in `commandExecutor.js:489`). Declared `size` string in
`dependencies.js` must match real bytes:
- fp8mixed → `"19GB"` (below gate ✅) — despite HF's "20.5 GB" SI label.
- **High-tier bf16 → `"38GB"` — ABOVE gate. STOP-and-ask before upload (≥20GB hot-store).**

## Text encoder / VAE

| Slot | File | GiB | Note |
|---|---|---|---|
| TE (default) | `qwen_2.5_vl_7b_fp8_scaled` | 8.74 | NEW dep. Qwen2.5-VL-7B, hidden 3584 |
| TE (full) | `qwen_2.5_vl_7b` | 15.45 | alt |
| TE (nvfp4) | `qwen_2.5_vl_7b_nvfp4` | 5.70 | NVIDIA-only, skip |
| VAE | `qwen_image_vae.safetensors` | 0.24 | REUSE dep `vae-qwen-image` |

## Sources

- Comfy-Org Qwen-Image-Edit-2511 HF repo (blob byte counts verified)
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
- https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- github.com/mholtgraewe/comfyui-workflows — qwen-image-edit-2511-4steps.json
