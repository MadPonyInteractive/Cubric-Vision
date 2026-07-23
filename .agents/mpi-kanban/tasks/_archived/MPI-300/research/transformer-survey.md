# Qwen Image Edit 2511 — transformer survey (raw vs distilled, quant matrix)

> Raw research, 2026-07-17 (HF blob byte counts verified). Settled → `docs/models/qwen-edit/tiers-and-loaders.md`.

## Raw vs distilled — CLEAN answer

- Base **2511 transformer is raw/undistilled** (~40 steps). Comfy-Org ships **no fused
  Lightning full checkpoint**.
- Acceleration = **separate Lightning LoRA on top of base** (lightx2v repo). Confirms
  the 3-tier design is architecturally correct.
- Pre-fused full **fp8 e4m3fn** Lightning checkpoints DO exist in the lightx2v repo (single-file
  Lightning) if ever wanted — not our approach (we apply the bf16 LoRA on the fp8 base).

## Distilled variant / step-count table

| Variant | Type | Steps | Source repo |
|---|---|---|---|
| 2511-Lightning-4steps-V1.0-bf16 | LoRA (810MB) | 4 | lightx2v/Qwen-Image-Edit-2511-Lightning |
| 2511-Lightning-8steps-V1.0-bf16 | LoRA (810MB) | 8 | lightx2v/Qwen-Image-Edit-2511-Lightning |
| (V2.0 4-step) | LoRA | 4 | lightx2v (newer; in community graph) |
| fused fp8 e4m3fn Lightning | full checkpoint | 4/8 | lightx2v (alt single-file) |

## Quant-format matrix (base transformer)

| Format | Filename | Bytes | GiB | Repo |
|---|---|---|---|---|
| bf16 (full/undistilled) | qwen_image_edit_2511_bf16.safetensors | 40,861,031,560 | 38.06 | Comfy-Org |
| fp8mixed | qwen_image_edit_2511_fp8mixed.safetensors | 20,533,762,817 | 19.13 | Comfy-Org |
| int8 | qwen_image_edit_2511_int8_convrot.safetensors | ~20.5e9 | ~19.10 | Comfy-Org (NOT in tutorial; newer) |
| GGUF | unsloth/Qwen-Image-Edit-2511-GGUF | Q2_K..Q8_0, BF16 | varies | unsloth / QuantStack mirrors |

## ≥20GB hot-store gate resolution

- Gate = **binary GiB** (`sizeToGb` in footprint.js parses declared size STRING as `N × 1024³`;
  `HOT_STORE_MIN_GB = 20`, commandExecutor.js:489). Threshold = 21,474,836,480 bytes.
- **fp8mixed 19.13 GiB → BELOW gate.** No STOP, serves from volume. (HF's "20.5 GB" is SI/decimal — misleading.)
- **High-tier bf16 38.06 GiB → ABOVE gate. STOP-and-ask + hot-store staging.**
- Declared `size` in dependencies.js: fp8mixed = "19GB", bf16 = "38GB".

## Text encoder options

| File | GiB | Note |
|---|---|---|
| qwen_2.5_vl_7b_fp8_scaled | 8.74 | default (tutorial). Qwen2.5-VL-7B, hidden 3584 |
| qwen_2.5_vl_7b | 15.45 | full precision |
| qwen_2.5_vl_7b_nvfp4 | 5.70 | NVIDIA-only |

VAE: qwen_image_vae.safetensors (~242MB) — REUSE dep `vae-qwen-image`.

## Sources

- Comfy-Org Qwen-Image-Edit-2511 HF repo (blob API byte counts)
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
- https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF
- https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
