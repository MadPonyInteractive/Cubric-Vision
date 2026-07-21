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

## Tier → weights (LOCKED — user test-drive complete, 2026-07-18)

**ONE transformer + ONE TE for every tier.** Tiers differ only by step count / LoRA.

| Tier | Steps | Transformer | Text encoder | Accelerator LoRA | Time |
|---|---|---|---|---|---|
| Low | 4 | `qwen_image_edit_2511_int8_convrot` | `qwen_2.5_vl_7b_fp8_scaled` | 2511-Lightning-4steps-V1.0-bf16 | 64s |
| Balanced | 8 | `qwen_image_edit_2511_int8_convrot` | `qwen_2.5_vl_7b_fp8_scaled` | 2511-Lightning-8steps-V1.0-bf16 | 103s |
| High | ~20 (raw) | `qwen_image_edit_2511_int8_convrot` | `qwen_2.5_vl_7b_fp8_scaled` | **none** | 386s |

### Why (live A/B, standalone ComfyUI, seed/prompt held constant)

- **Transformer: int8 beats fp8mixed** — int8 raw 386s vs fp8 486s (~20% faster), quality equal-or-better
  at every step count. **fp8mixed TRASHED.**
- **Transformer: bf16 TRASHED** — no tier-level quality win at any step (4/8/20/40) for +45–87% time
  + ~18GB extra VRAM (38967MB staged). **40-step raw made it WORSE** (over-cooked lips → teeth artifact).
  Base 2511 wants the Lightning-LoRA path, not high raw steps; raw-high drifts.
- **Text encoder: full `qwen_2.5_vl_7b` TRASHED** — hallucinates + stretches anatomy on ALL three
  transformers (fp8, int8, bf16). `qwen_2.5_vl_7b_fp8_scaled` is the only good TE.
- **High = int8 raw ~20 steps** (no LoRA) — clean, no drift. NOT bf16, NOT 40-step.

Only surviving weights on `G:\CubricModels`: `int8_convrot` (diffusion) + `qwen_2.5_vl_7b_fp8_scaled` (TE).
Both Lightning LoRAs on `C:/AI/Loras/Qwen`. fp8mixed / bf16 / full-TE deleted.

## Chosen transformer — deps entry

`qwen_image_edit_2511_int8_convrot.safetensors` = **20,499,083,824 bytes / 19.10 GiB**.

- **Below the ≥20 GiB hot-store gate** (`sizeToGb` parses the dep `size` STRING as `N × 1024³`;
  `HOT_STORE_MIN_GB = 20` in `commandExecutor.js:489`). Serves from the volume, **no PING-USER**.
- Declare `size: "19GB"` in `dependencies.js` (below gate; do NOT write "20GB"/"20.5GB" — the SI
  label would push it over the binary gate).

Rejected formats (deleted, do NOT re-add): `_fp8mixed` (20,533,762,817 B — slower + no quality edge),
`_bf16` (40,861,031,560 B — ≥gate, no win, drifts at 40-step).

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
