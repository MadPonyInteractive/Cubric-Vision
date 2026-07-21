# Qwen Image Edit 2511 — input dimensions + ScaleImageToTotalPixels

> Settled from MPI-300 research (2026-07-17, config-verified). Raw dump: `research/dimensions.md`.

## Divisibility: feed dims that are multiples of 32

- **True architecture floor = 16**: VAE 8× spatial downsample (`vae/config.json` `dim_mult:[1,2,4,4]`,
  `vae_scale_factor = 2^len(temperal_downsample) = 2³ = 8`) × transformer `patch_size: 2`.
  Packed latent = 16 ch × 2×2 = `in_channels: 64`.
- **What the pipeline actually does (NOT a hard ValueError — I over-stated this earlier):**
  - Non-÷16 → the pipeline logs a **WARNING** (`height % (vae_scale_factor*2) != 0`) and **continues**;
    the image processor **silently crops/pads** to the nearest ÷16 size → possible spatial-mismatch artifacts.
  - `calculate_dimensions()` **rounds its own bucket dims to ÷32** (`round(x/32)*32`) — conservative margin,
    used for the 7 fixed aspect-ratio buckets, not a validation gate. Open issue huggingface/diffusers#12997
    (why 32 not 16 — unanswered).
  - **ComfyUI can HARD-error separately** on a shape mismatch in the attention reshape for some
    image/token-length combos (ComfyUI #9421) — a different failure than dim validation.
- **Rule: feed the VAE ÷32 dims** — avoids the silent crop/pad AND the ÷32 bucket rounding drift.

## Known ComfyUI Qwen-Edit landmines (for wiring phase)

- **Black-image output** = per-channel `latents_mean`/`latents_std` normalization not applied (ComfyUI #11865). Watch on first gens.
- **Batched VAE encode processed only 1 image** — ComfyUI bug, fixed in commit `ca68660`. Ensure current ComfyUI.
- **Inpaint VAE encode node unsupported** for `AutoencoderKLQwenImage` (ComfyUI #9605).

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
