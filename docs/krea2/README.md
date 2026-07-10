# Krea2 — model notes

> **What this is.** The Krea2-specific *what*, split by subject.
> `docs/add-model-playbook.md` is the generic *how* — read it for procedure.
> Read the file for the topic you're on; don't read all of it.
>
> Tracking card: MPI-242. Deep research: `.agents/mpi-kanban/tasks/MPI-242/research/`.

Krea2 is **Flux-lineage in architecture only**. Its conditioning + VAE stack is Qwen.
Do not reason about it as a Flux model.

| | |
|---|---|
| Variants | **Turbo** (8-step distilled, ships first) · **Raw** (52-step, phase 2) |
| Transformer | `diffusion_models/krea2_turbo_fp8_scaled.safetensors` |
| Text encoder | `text_encoders/qwen3vl_4b_fp8_scaled.safetensors` — Qwen3-VL-4B, **not** a Flux encoder |
| VAE | `vae/qwen_image_vae.safetensors` — reuse existing dep **`vae-qwen-image`** (already on R2) |
| Native res | Turbo **1024–2048** · Raw ≤1024 |
| Upstream | `Comfy-Org/Krea-2` (weights) · `krea-ai/krea-2` (first-party inference code) |

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
| 5 | [injection.md](injection.md) | the app injection seam (style system), local install layout, prompt-enhancement cut. |
| 6 | [preview-taesd.md](preview-taesd.md) | why the latent preview is mediocre (missing `lighttaew2_1`, `Latent2RGB` fallback) and why we **must NOT** install the decoder — ComfyUI #13366 corrupts real generations. |

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
