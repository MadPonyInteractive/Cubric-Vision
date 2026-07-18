# Qwen Image Edit 2511 — deps manifest (for PHASE 1 dependencies.js)

> Ready-to-wire dep data, 2026-07-18. SHA256 computed locally; R2 upload in progress.
> R2 layout: `vision/models/<comfy-type>/<file>` → `https://models.cubric.studio/vision/models/<filename>`.

| Slot | filename (comfy-relative = dep `filename`) | bytes | size str | sha256 |
|---|---|---|---|---|
| Transformer (ALL tiers) | `diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors` | 20,499,083,824 | `"19GB"` | `11b5af5ac601821d73930c84846c9a158e67177356daf927ce1c8d10f3963829` |
| Text encoder (ALL tiers) | `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` | 9,384,670,680 | `"9GB"` | `cb5636d852a0ea6a9075ab1bef496c0db7aef13c02350571e388aea959c5c0b4` |
| LoRA Low (4-step) | `loras/qwen/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` | 849,608,296 | `"810MB"` | `22226e8d05d354bb356627d428809f5afd7819399b077238a2b70a82883a904f` |
| LoRA Balanced (8-step) | `loras/qwen/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` | 849,608,296 | `"810MB"` | `a9e81a58a78f260f67b337a6f615e8fa4cd3bc79847c77b7d61a581b789b1ba8` |
| VAE | `vae/qwen_image_vae.safetensors` | — | — | **REUSE dep `vae-qwen-image`** (assetDeps.js, already on R2 + hashed) — zero upload |

## Notes

- URL for each = `https://models.cubric.studio/` + `vision/models/` + `<filename>` (flat-mirror invariant).
- `size` STRING must keep int8 **below** the ≥20 GiB binary hot-store gate → `"19GB"` (NOT "20GB"/"20.5GB").
- Filenames go to R2 case-exact (mixed-case Lightning LoRAs OK — lowercase rule is WORKFLOW files only).
- TE `qwen_2.5_vl_7b_fp8_scaled` = Qwen2.5-VL-7B (hidden 3584). NOT krea2/boogu Qwen3-VL. NEW upload (not previously on R2).
- Lightning LoRAs = BAKED deps (size, no `type`, `loras/qwen/` subfolder), NOT user style slots.
