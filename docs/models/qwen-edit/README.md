# Qwen Image Edit 2511 — model notes

> **What this is.** The Qwen-Edit-specific *what*, split by subject.
> `docs/playbooks/add-model/` is the generic *how* — read it for procedure.
> Read the file for the topic you're on; don't read all of it.
>
> Tracking card: **MPI-300**. Deep research: `.agents/mpi-kanban/tasks/MPI-300/research/`.
> Blocks **MPI-299** (Head Swap app), which requires this model wired.
>
> **Status: RESEARCH phase.** Greenfield — no workflow/template/ModelDef exists yet.
> Author + prove the graph locally before any app wiring.

Qwen-Image-Edit-**2511** is the latest generation (released 2025-12-22, replaces 2509):
instruction-driven image editing with a Qwen2.5-VL text encoder and the Qwen-Image VAE.

| | |
|---|---|
| Tiers | **Low** (4-step Lightning) · **Balanced** (8-step Lightning) · **High** (20-step, no accelerator) — all on ONE transformer. Details + why: [tiers-and-loaders.md](tiers-and-loaders.md) |
| Transformer | **`qwen_image_edit_2511_int8_convrot`** (ALL tiers; 19.10 GiB, below gate, `size:"19GB"`) — 🆕 NEW dep. fp8mixed + bf16 tested & REJECTED |
| Text encoder | `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` (9.38GB, hidden 3584) — 🆕 NEW dep. **NOT** the krea2 Qwen3-VL-4B nor boogu Qwen3-VL-8B |
| VAE | `vae/qwen_image_vae.safetensors` — REUSE existing dep **`vae-qwen-image`** (already on R2, hashed) |
| Lightning LoRAs | 2511 4-step + 8-step bf16 (810MB each) — BAKED deps, `loras/qwen/` subfolder. Downloaded to `C:/AI/Loras/Qwen` |
| Upstream | `Comfy-Org` (base weights) · `lightx2v/Qwen-Image-Edit-2511-Lightning` (accelerator LoRAs) |

**Dep reuse:** the VAE is already hosted. `vae-flux-ae` is the WRONG dep. The transformer,
the Qwen2.5-VL-7B text encoder, and the two Lightning LoRAs are new uploads.

## Topics

| # | File | When |
|---|---|---|
| 1 | [reference-latents.md](reference-latents.md) | the `FluxKontextMultiReferenceLatentMethod` node — what the 4 `reference_latents_method` values do, why the workflow ships `index_timestep_zero`, and the **color-shift caveat**. |
| 2 | [tiers-and-loaders.md](tiers-and-loaders.md) | tier→weights table, Lightning LoRA loader (**MODEL-only, str 1.0**), transformer quant matrix + exact bytes, hot-store gate resolution. |
| 3 | [dimensions.md](dimensions.md) | input dims must be **÷32** (else ValueError); `ImageScaleToTotalPixels` + `resolution_steps=32` snap; what "resolution steps" means. |

(More topic files added as research settles — samplers, resolution, injection, etc.)

## Hard rules (apply every session)

- **The Lightning LoRA MUST match the base generation.** A 2509-era LoRA on the 2511 base
  silently degrades quality (this is what the user was running). Use the `-2511-` LoRAs.
- **`index_timestep_zero` is the 2511-correct reference method** (matches the 2511 GGUF
  metadata default) but carries a known **color-shift** artifact — watch it on head-swap
  skin/lighting; fall back to `offset`/`index` if drift appears. See
  [reference-latents.md](reference-latents.md).
- **Check node `mode` before claiming a node is live** — `4` = bypass, `2` = mute.
- **The saved `.json` lags the ComfyUI canvas.** Ask the user to save before reading it.
- **Models are NOT version-bumped.**

## Sources

- https://blog.comfy.org/p/qwen-image-edit-2511-and-qwen-image · https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- https://qwen.ai/blog?id=qwen-image-edit-2511 — 2511 improvements
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning — accelerator LoRAs
- https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF/discussions/6 — `index_timestep_zero` = 2511 default
