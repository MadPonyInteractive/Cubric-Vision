# Qwen Image Edit 2511 — input dimensions + ScaleImageToTotalPixels

> Settled from MPI-300 research (2026-07-17, config-verified). Raw dump: `research/dimensions.md`.

## Divisibility: dims must be multiples of 32

- Architecture math floor = **16**: VAE 8× spatial downsample (`vae/config.json` `dim_mult:[1,2,4,4]`
  → 3 halving stages → 2³) × transformer `patch_size: 2`.
- **diffusers `calculate_dimensions()` enforces 32** (extra ×2 margin — RoPE grid `axes_dims_rope:[16,56,56]`
  / symmetry; open issue huggingface/diffusers#12997, no official why). 32 is what ships.
- **Violation ⇒ `ValueError`** — errors, does NOT crop or pad.
- **Rule: feed the VAE encode width & height both divisible by 32.**

## Normalize input with `ImageScaleToTotalPixels`

- `class_type = ImageScaleToTotalPixels`. Inputs: `image`, `upscale_method`, `megapixels`
  (default `1.0` = 1,048,576 px), and — **new node only** — `resolution_steps`.
- Scale: `scale_by = sqrt(megapixels*1024*1024 / (W*H))`.
- **Two node versions ship in ComfyUI:**

| Version | File | Rounding |
|---|---|---|
| OLD | `comfy_extras/nodes_images.py` | bare `round(W*scale_by)` — **arbitrary dims, no snap** ⚠️ can emit non-÷32 → ValueError |
| NEW | `comfy_extras/nodes_post_processing.py` | `round(W*scale_by / resolution_steps) * resolution_steps` — snaps to multiple |

- **`resolution_steps`** = int snap granularity (advanced param, default `1` = no snap). NOT sampling steps.
  `8`→÷8, `16`→÷16, `32`→÷32.

## Recommended wiring for Qwen-Edit-2511

- `megapixels = 1.0` (predictable VRAM, standard in official 2511 workflows).
- **`resolution_steps = 32`** (guarantees ÷32 → no VAE ValueError).
- ⚠️ **Verify the canvas node HAS `resolution_steps`.** If absent = OLD node (bare round, no snap) →
  update ComfyUI or add explicit round-to-32 before VAE encode.

## Sources

- Qwen/Qwen-Image-Edit-2511 `transformer/config.json` (patch_size 2) + `vae/config.json` (dim_mult 8×)
- github.com/huggingface/diffusers/issues/12997 — 16-vs-32, 32 enforced
- comfy_extras/nodes_post_processing.py (resolution_steps) + nodes_images.py (old)
