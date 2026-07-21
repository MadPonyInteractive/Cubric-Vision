# Boogu-Image — model files, sizes, VRAM

Source: user's two shipped ComfyUI-Boogu workflows (edit + turbo T2I), HF, stablediffusiontutorials.com. 2026-07-11.

## Files the shipped workflows actually load

Both graphs use the same loader set (Load Diffusion Model + Load CLIP + Load VAE):

| Node | Widget | Value |
|---|---|---|
| Load Diffusion Model (edit graph) | `unet_name` | `boogu_image_edit_fp8_scaled.safetensors` |
| Load Diffusion Model (turbo graph) | `unet_name` | `boogu_image_turbo_fp8_scaled.safetensors` |
| Load CLIP | `clip_name` | `qwen3vl_8b_fp8_scaled.safetensors` |
| Load CLIP | `type` | `boogu` |
| Load VAE | `vae_name` | `ae.safetensors` |

**Text encoder = `qwen3vl_8b_fp8_scaled.safetensors`** — same qwen3vl family as Krea2 (Krea2 used `qwen3vl_4b_fp8_scaled`; Boogu = **8b**, a DIFFERENT file → new upload, confirm on-disk name).
**VAE = `ae.safetensors`** — HF README lists `flux1_vae_bf16.safetensors` as the VAE; the workflow's `ae.safetensors` is likely a rename. CONFIRM which R2 dep this maps to before assuming reuse (Krea2 reused `vae-qwen-image`; Boogu VAE may be flux-ae, NOT qwen — do NOT assume).
**CLIP loader `type: boogu`** — non-standard CLIP type → needs the **ComfyUI-Boogu custom node** (the `type` enum comes from that node). => model-declared baked node → **Pod image rebuild** (MPI-244 pattern) for the remote engine. Confirm node name/repo.

## Diffusion-model (transformer) sizes — per variant, per precision

All 10B. Single-file transformer.

| Variant | BF16 (full) | FP8 scaled | INT8 ConvRot | NVFP4 |
|---|---|---|---|---|
| Base (T2I) | 20.6 GB | 10.3 GB | — | 5.83 GB |
| Turbo (T2I) | 20.6 GB | 10.3 GB | 11.4 GB (hotfix) | 5.83 GB |
| Edit (i2i) | 20.6 GB | 10.3 GB | 11.4 GB | 5.83 GB |
| Edit-Turbo | 20.6 GB | — | 11.4 GB | — |

## VRAM (transformer only, + encoder/VAE overhead on top)

| Precision | VRAM |
|---|---|
| BF16 | 24 GB (base/turbo) / 16 GB (edit) |
| FP8 scaled | ~12 GB |
| INT8 ConvRot | ~12 GB |
| NVFP4 | ~6 GB |

## Turbo vs full-weight — the comparison the user wants (image EDIT)

- **Turbo edit** the workflow ships = `boogu_image_edit_fp8_scaled` **is already the fp8 EDIT weight** (there is no separate "turbo-edit fp8" in the shipped graph — the loaded edit weight IS fp8-scaled edit). Distilled 4-step edit-turbo ships as BF16/INT8 only, no fp8.
- **"Full weight" edit** = **Edit BF16, 20.6 GB, ~16 GB VRAM**. fp8-scaled edit = 10.3 GB, ~12 GB VRAM.
- So a like-for-like turbo(4-step) vs full(25-50-step) edit compare = **Edit-Turbo INT8 11.4 GB** (4 steps) vs **Edit BF16 20.6 GB** (25-50 steps), OR fp8-scaled edit 10.3 GB as the middle ground.

## Hot-store gate check (playbook §4, >=20GB per FILE)

- fp8_scaled (10.3 GB), INT8 (11.4 GB), NVFP4 (5.83 GB) — all UNDER 20 GB. Safe.
- **BF16 (20.6 GB) CROSSES the 20 GB per-file hot-store gate.** If we ship a BF16 variant remotely → PING USER before shipping (container disk budget). fp8/int8 variants are fine.

## Open before wiring
1. Confirm ComfyUI-Boogu custom node repo + whether it's code-only or has weights → baked-node decision (Pod rebuild).
2. Confirm `ae.safetensors` real identity (flux-ae vs qwen) → R2 reuse-or-upload.
3. `qwen3vl_8b_fp8_scaled` is a NEW dep (8b ≠ Krea2's 4b) → upload.
4. User downloads weights himself (freeing disk) — so the R2 upload source is TBD until he has them local.
