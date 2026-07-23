# Qwen Image Edit 2511 Lightning LoRA — strength axis (loader pick)

> Raw research, 2026-07-17. Settled summary → `docs/models/qwen-edit/tiers-and-loaders.md`.

## Question

Does the 2511 Lightning LoRA take MODEL strength only, or MODEL + CLIP? (picks `LoraLoaderModelOnly` vs `LoraLoader`.)

## VERDICT: MODEL-ONLY — `LoraLoaderModelOnly`, strength `1.0`

- Distillation/accelerator LoRAs carry **transformer weight deltas only** — no text-encoder (CLIP) keys. So model-only loader is not just correct, it's the only sensible choice.
- Direct evidence: community workflow `qwen-image-edit-2511-4steps.json` (github.com/mholtgraewe/comfyui-workflows) has one LoRA node:

  ```json
  { "id": 209, "type": "LoraLoaderModelOnly",
    "widgets_values": ["Qwen-Image-Lightning-4steps-V2.0.safetensors", 1] }
  ```
- Official comfy.org Qwen-Image-Edit-2511 workflow listing also uses `LoraLoaderModelOnly` for the Lightning LoRA.
- Recommended strength **1.0** (distillation LoRAs calibrated for full strength).

→ In our stack: use the **model-only** LoRA loader (`MpiLoraModel`), single MODEL strength, value 1.0.

## V1.0 vs V2.0 — RESOLVED: only V1.0 exists

- Enumerated `lightx2v/Qwen-Image-Edit-2511-Lightning` (2026-07-17): **only V1.0**. No V1.1/V2.0 on HF or GitHub. Community graph's "V2.0" = mislabel.
- LoRA formats: 4-step + 8-step, each bf16 (849,608,296 B) / fp32 (1,698,951,104 B). No 6-step/2-step.
- User's downloaded `4steps-V1.0-bf16` + `8steps-V1.0-bf16` (849,608,296 B each) = **current + complete.** ✅
- BONUS — lightx2v also ships **pre-fused full fp8 Lightning checkpoints** (single-file, ~20.5GB, no separate LoRA):
  - `qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_4steps_v1.0` (20,580,040,288 B)
  - `qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_8steps_v1.0` (20,487,870,224 B)
  - `..._lightning_comfyui_4steps_v1.0` (20,447,469,486 B, ComfyUI-optimized)
  - Alt to base-fp8 + bf16-LoRA-at-runtime. Candidate for a fused Balanced tier if the LoRA-on-fp8 path underperforms. All ~19.1 GiB → below hot-store gate.

## Confidence: High (two independent sources agree on `LoraLoaderModelOnly`).

## Sources

- github.com/mholtgraewe/comfyui-workflows — qwen-image-edit-2511-4steps.json
- https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
