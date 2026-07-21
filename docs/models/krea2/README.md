# Krea2 — model notes

> **What this is.** The Krea2-specific *what*, split by subject.
> `docs/playbooks/add-model/` is the generic *how* — read it for procedure.
> Read the file for the topic you're on; don't read all of it.
>
> Tracking card: MPI-242. Deep research: `.agents/mpi-kanban/tasks/MPI-242/research/`.

Krea2 is **Flux-lineage in architecture only**. Its conditioning + VAE stack is Qwen.
Do not reason about it as a Flux model.

| | |
|---|---|
| Cards | **2**: `krea2` (SFW) · `krea2-nsfw`. Content variants, installable side by side — **not** tiers, so neither carries an H/B/L letter |
| Speed tiers | Runtime toggle, **not** separate cards (MPI-316). `krea2Turbo` → `Input_Tier` 1 = quality, 2 = fast |
| Transformer | SFW `diffusion_models/krea2_raw_int8_convrot.safetensors` · NSFW `lustify-v10-krea-raw-int8_convrot.safetensors` |
| Accelerator | `loras/krea-2/extra/krea2_turbo_distill_r128.safetensors` — an SVD delta extracted **from Raw**, so Raw + this @ 1.0 reconstructs Turbo. **This is the fast tier**; it replaced the two ~12GB Turbo transformers (deleted, ~24.5GB saved) |
| Text encoder | `text_encoders/qwen3vl_4b_abliterated_fp8_scaled.safetensors` — Qwen3-VL-4B, **not** a Flux encoder. Shared with the image-describer plugin; the stock `qwen3vl_4b_fp8_scaled` twin was retired 2026-07-19 (A/B'd equal, deleted from R2 and disk) |
| VAE | `vae/qwen_image_vae.safetensors` — reuse existing dep **`vae-qwen-image`** (already on R2) |
| Native res | **1024–2048** (both tiers; `qualityTiers: ['1k','2k']`) |
| Upstream | `Comfy-Org/Krea-2` (weights) · `krea-ai/krea-2` (first-party inference code) |

> **The 4-card layout is GONE** (MPI-316, 2026-07-20). There were once four cards —
> Turbo/Raw × SFW/NSFW — each shipping its own transformer. The turbo-distill LoRA
> collapsed that to two: every user now gets both speeds from whichever card they
> installed, instead of paying for a second transformer to get the other speed mode.
> The real driver was **Turbo seed-lock** (a vague prompt + a new seed returned
> near-identical images); Raw + the LoRA keeps the speed without the collapse in
> diversity. Evidence: `.agents/mpi-kanban/tasks/MPI-316/research/01-turbo-lora-parity.md`.

**Dep reuse:** the VAE is already hosted (added for the PiD upscaler). `vae-flux-ae` is the
WRONG dep — that's the Flux `ae.safetensors`. Only the transformer + Qwen text encoder are
new uploads.

## Topics

| # | File | When |
|---|---|---|
| 1 | [samplers.md](samplers.md) | the **settled** two-stage sampler config, why each constraint holds, the steps↔denoise invariant, and the **dead-theories table** — read before re-tuning anything. |
| 2 | [conditioning-and-control.md](conditioning-and-control.md) | Krea2 re-composes, it cannot edit. i2i, the encoder-choice table, **NAG does not work**, depth-ControlNet wiring + traps. |
| 3 | [style-loras.md](style-loras.md) | the 9 model-only style LoRAs, the trigger-phrase contract, the `Stylization` slider, stale-source warning. |
| 4 | [resolution.md](resolution.md) | `FLUX_RATIOS` verdict, delete the `ResolutionSelector`, the **÷16 rule**, the proven 2K tier. |
| 5 | [injection.md](injection.md) | the app injection seam (style system), local install layout, prompt enhancer + its mandatory chat scaffold. |
| 6 | [preview-taesd.md](preview-taesd.md) | why the latent preview is mediocre (missing `lighttaew2_1`, `Latent2RGB` fallback) and why we **must NOT** install the decoder — ComfyUI #13366 corrupts real generations. |

## To test — Krea2 as an EDITOR (unstarted)

Krea2 Turbo currently **re-composes, cannot edit** (see conditioning-and-control.md).
These upstream resources claim a real instruct-edit path — worth testing to turn Krea2
into an editor model:

- https://huggingface.co/conradlocke/krea2-identity-edit — identity-edit weights
- https://github.com/lbouaraba/comfyui-krea2edit — ComfyUI edit nodes

**Fallback plan:** if **Turbo** looks bad driving these edit nodes (distilled cfg 1.0 may
starve the edit conditioning), test **Raw** (52-step, phase 2) — the extra steps + working
cfg may be what the edit path needs. This is the first concrete reason to build Raw.

## Hard rules (apply every session)

- **Dimensions must be ÷16, not ÷8.** Off-multiple does not crash — it silently
  circular-pads one edge. See [resolution.md](resolution.md).
- **NAG is a silent no-op on Krea2** and *doubles* NFE for zero effect. Krea2-Turbo
  runs at `cfg 1.0` and has **no working negative prompt**.
  See [conditioning-and-control.md](conditioning-and-control.md).
- **Check node `mode` before claiming a node is live** — `4` = bypass, `2` = mute.
- **The saved `.json` lags the ComfyUI canvas.** Ask the user to save before reading it.
- **Don't re-propose a dead theory.** [samplers.md](samplers.md) has the table; each row
  was killed by a live run.

## Sources

- https://huggingface.co/Comfy-Org/Krea-2 — weights, 9-LoRA table
- https://github.com/krea-ai/krea-2 — first-party steps/cfg/mu; `docs/prompting.md`
- `G:\ComfyUi\ComfyUI\comfy_extras\nodes_resolution.py` — ResolutionSelector formula (read locally)
- https://www.stablediffusiontutorials.com/2026/06/krea2-base-turbo.html — `er_sde`; native res bands
- https://www.stablediffusiontutorials.com/2026/06/krea2-lora-models.html — trigger-at-end
- https://docs.comfy.org/tutorials/image/krea/krea-2 — **stale 4-LoRA table**
- https://github.com/ClownsharkBatwing/RES4LYF · https://github.com/Auryg/Krea-2-Two-Stage-Sampler
- https://huggingface.co/conradlocke/krea2-identity-edit — **edit-variant test** (see "To test — Krea2 as an EDITOR")
- https://github.com/lbouaraba/comfyui-krea2edit — **edit nodes test**
