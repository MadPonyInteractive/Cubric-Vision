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
- **Version: V1.0 is the only one that exists** (2026-07-17 enumeration). No V1.1/V2.0 on HF/GitHub;
  community graph's "V2.0" = mislabel. User's `4steps`+`8steps`-V1.0-bf16 = current + complete.
- **Fused-fp8 alt:** lightx2v also ships single-file fp8 Lightning checkpoints (~19.1 GiB, no
  runtime LoRA) — `qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_{4,8}steps_v1.0`. Candidate for
  a fused Balanced/Low tier if base-fp8 + bf16-LoRA underperforms. Below hot-store gate.

## Tier → weights (PROVISIONAL — user is test-driving, 2026-07-17)

Final mapping decided AFTER the user runs comparison tests across formats. Current lean:

| Tier | Steps | Transformer (leaning) | Accelerator LoRA |
|---|---|---|---|
| Low | 4 | fp8 (mixed or int8) | 2511-Lightning-4steps-V1.0-bf16 — **may DROP 4-step** |
| Balanced | 8 | fp8 (mixed or int8) | 2511-Lightning-8steps-V1.0-bf16 |
| High | ~40 | **`qwen_image_edit_2511_bf16`** (undistilled, 38 GiB, ≥gate) | none |

Weights downloaded to `G:\CubricModels` for testing: full TE `qwen_2.5_vl_7b` (15.45 GiB),
`_bf16` (38 GiB), `_fp8mixed` (19.13 GiB), `_int8_convrot` (19.10 GiB). Fused-fp8-lightning
checkpoints NOT downloaded yet (fetch if LoRA-on-fp8 path underperforms).

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
