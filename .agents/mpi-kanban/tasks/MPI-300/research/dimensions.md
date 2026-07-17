# Qwen Image Edit 2511 — dimension divisibility + scale node (raw)

> Raw research, 2026-07-17 (config-verified). Settled → `docs/models/qwen-edit/dimensions.md`.

## Q1 — divisibility = 32

- VAE 8× spatial (`vae/config.json` `dim_mult:[1,2,4,4]` → 3 halvings → 2³=8) × transformer `patch_size:2` = **16 math floor**.
- diffusers pipeline: non-÷16 = **WARNING + silent crop/pad** to nearest ÷16 (NOT a hard ValueError — corrected). `calculate_dimensions()` rounds its bucket dims to ÷32 (`round(x/32)*32`, conservative). ComfyUI can hard-error separately on attention-reshape shape mismatch (#9421). Open: huggingface/diffusers#12997.
- Practical: feed ÷32 → dodges crop/pad + bucket drift. Use 32.
- ComfyUI landmines: black-image=latent norm not applied (#11865); batched VAE encode 1-img bug fixed ca68660; inpaint VAE unsupported (#9605).

## Q2 — ImageScaleToTotalPixels

- `class_type = ImageScaleToTotalPixels`. Inputs image / upscale_method / megapixels (def 1.0 = 1,048,576 px).
- `scale_by = sqrt(megapixels*1024*1024 / (W*H))`.
- OLD (`nodes_images.py`): `width=round(W*scale_by)` — arbitrary, NO snap. Can emit non-÷32 → downstream ValueError.
- NEW (`nodes_post_processing.py`): adds `resolution_steps` int (def 1, advanced). `width=round(W*scale_by/steps)*steps` — snaps to multiple.
- Typical: megapixels=1.0 to normalize to ~1MP pre-VAE.

## Q3 — "resolution steps"

- Literal `resolution_steps` param on NEW node. Dimension snap granularity (÷N). NOT sampling/denoise steps.
- def 1 = no snap. For Qwen-Edit-2511 → **32**.

## Recommended

- ImageScaleToTotalPixels: megapixels=1.0, resolution_steps=32.
- VERIFY node has resolution_steps (else OLD node → update ComfyUI or explicit round-to-32).

## Sources

- Qwen/Qwen-Image-Edit-2511 transformer/config.json + vae/config.json
- github.com/huggingface/diffusers/issues/12997
- comfy_extras/nodes_post_processing.py + nodes_images.py
