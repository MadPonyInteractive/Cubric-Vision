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

## Caveat — V1.0 vs V2.0

- Community JSON references `Qwen-Image-Lightning-4steps-V2.0`. User downloaded `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16` + 8-step V1.0.
- Both are transformer-only distillation LoRAs from the same lightx2v repo → loader choice holds either way.
- OPEN: confirm with user whether V1.0 (downloaded) or V2.0 (newer, in community graph) is the intended accelerator. Not a blocker for loader selection.

## Confidence: High (two independent sources agree on `LoraLoaderModelOnly`).

## Sources

- github.com/mholtgraewe/comfyui-workflows — qwen-image-edit-2511-4steps.json
- https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
