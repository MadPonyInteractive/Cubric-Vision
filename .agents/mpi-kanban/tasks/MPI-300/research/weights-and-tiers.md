# Qwen Image Edit 2511 — weights, tiers, dep map

> Raw research, 2026-07-17. Settled summary → `docs/models/qwen-edit/README.md`.

## Generation check

- **2511 = latest** Qwen Image Edit (released 2025-12-22; replaces 2509). Improvements over 2509: less image drift, better character consistency, integrated LoRA capability, better industrial-design gen, stronger geometric reasoning.
- User's base (`qwen_image_edit_2511_fp8mixed`) is already current gen. ✅

## MISMATCH found (the reason the user asked)

- Old workflow loaded `Qwen-Image-Edit-Lightning-8steps-V1.0.safetensors` (dated Sep 2025, 1.7GB fp32) — a **2509-era** LoRA — on the **2511** base. Version mismatch = quality loss.
- FIX: downloaded version-matched **2511** Lightning LoRAs (bf16, 810MB each) to `C:/AI/Loras/Qwen`:
  - `Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors` (849608296 bytes)
  - `Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors` (849608296 bytes)
- Source repo: https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning (both 4-step and 8-step, bf16/fp32/fp8 variants). bf16 LoRA-only = right pick (applies on top of existing fp8 base, not the 20GB fused fp8).

## Tier plan

| Tier | Steps | Accelerator LoRA |
|---|---|---|
| Low | 4 | Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16 |
| Balanced | 8 | Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16 |
| High | base | none |

## Dep map (for the wiring phase / dependencies.js)

| Slot | Weight | Status |
|---|---|---|
| VAE | `qwen_image_vae.safetensors` (254MB) | ✅ REUSE existing dep `vae-qwen-image` (assetDeps.js, on R2, hashed) |
| Text encoder | `qwen_2.5_vl_7b_fp8_scaled.safetensors` (9.38GB / 9384670680 bytes, hidden 3584) | 🆕 NEW dep. On G:\CubricModels\text_encoders. NOT the krea2 4B nor boogu 8B — those are Qwen3-VL, this is Qwen2.5-VL-7B. |
| Diffusion | `qwen_image_edit_2511_fp8mixed` (fp8 — size TBD, CHECK ≥20GB gate) | 🆕 NEW dep. NOT on G: yet — lives in user's standalone ComfyUI models dir. Need exact filename + size. |
| LoRA (Low) | 2511 Lightning 4-step bf16 (810MB) | 🆕 BAKED dep (size, no type, loras/qwen/ subfolder). Downloaded to C:. |
| LoRA (Balanced) | 2511 Lightning 8-step bf16 (810MB) | 🆕 BAKED dep. Downloaded to C:. |

## OPEN before wiring

- [ ] Exact diffusion filename + byte size (≥20GB gate — STOP-and-ask if any single file ≥20GB).
- [ ] User to SAVE the ComfyUI canvas so the workflow JSON can be read (currently unsaved — no qwen file in comfy_workflows/).
- [ ] Confirm second "4 Step LoRA" node in the screenshot graph (loads `Qwen-Image-Lightning-4steps`, base-image not edit) is intentional.
- [ ] What ops does this model serve? (edit / i2i-style). Head-swap app (MPI-299) may add its own op — that's the app session's job.

## Sources

- https://blog.comfy.org/p/qwen-image-edit-2511-and-qwen-image
- https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- https://qwen.ai/blog?id=qwen-image-edit-2511
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
- https://civitai.com/models/2047657/qwen-image-edit-lightning
