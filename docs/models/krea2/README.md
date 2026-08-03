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
| Workflows | **ONE file per card** since MPI-365: `krea2_t2i_<sfw\|nsfw>.json` serves all six ops, branch picked by `Input_wf_type` (1 t2i · 2 i2i · 3 depth · 4 edit · 5 unused · 6 detail · 7 upscale). `krea2_detailer_*` / `krea2_upscaler_*` are **deleted** — see [injection.md](injection.md) |
| Ops | `t2i` · `i2i` · `control` · `krea2Edit` · `detail` · `upscale`. Edit takes an **optional mask** (empty = whole-image), which is why branch 5 is dead. `control` is the op formerly called `poseReference`, then briefly `depth`; Krea2 declares `controlTypes: ['depth']`, so it shows no type picker |
| Speed tiers | Runtime toggle, **not** separate cards (MPI-316). `krea2Turbo` → `Input_is_Turbo` (a BOOLEAN since MPI-365; was the `Input_Tier` int) — false = quality, true = fast |
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
| 7 | [editing.md](editing.md) | the **edit path**: the two channels, prompt form, why negatives can't remove reference content, reference framing (pad vs crop), `ref_boost` / `cfg` / `grounding_px` measured trades. |
| 8 | [upscaling.md](upscaling.md) | the **upscale** graph: the post-tile refiner (a FIX for unusable raw upscales), the `Input_is_Turbo` gate on the accelerator LoRA, and the per-tile-prompt trap under `Use Grid`. |

## Krea2 as an EDITOR — SHIPPED

Krea2 got a real instruct-edit path via `conradlocke/krea2-identity-edit` weights +
`lbouaraba/comfyui-krea2edit` nodes (MPI-282; nodes bumped to v1.2.2 in MPI-346). The old
"Turbo re-composes, cannot edit" note in conditioning-and-control.md describes the *base*
model without the edit LoRA — it is not the shipped edit path.

The Raw-vs-Turbo question from the original test plan is answered and it is **not** simply
"Raw is better": Raw at the t2i-tuned `cfg 3.5` went plastic, and Raw bought no identity that
turbo didn't. The hunt ended by retuning **tier 1 outright** — base `cfg 3.5 → 2.0`, refiner
`3 / 0.19 → 2 / 0.30`, both flat literals, t2i included. All of it → [editing.md](editing.md).

## Hard rules (apply every session)

- **Dimensions must be ÷16, not ÷8.** Off-multiple does not crash — it silently
  circular-pads one edge. See [resolution.md](resolution.md).
- **NAG is a silent no-op on Krea2** and *doubles* NFE for zero effect. Krea2-Turbo
  runs at `cfg 1.0` and has **no working negative prompt**.
  See [conditioning-and-control.md](conditioning-and-control.md).
- **On the EDIT path a negative prompt cannot remove anything that is in the reference
  image.** The reference arrives as source tokens in both the cond and uncond pass, so it
  cancels out of the CFG difference. State removals in the *positive* prompt.
  See [editing.md](editing.md).
- **Check node `mode` before claiming a node is live** — `4` = bypass, `2` = mute.
- **The saved `.json` lags the ComfyUI canvas.** Ask the user to save before reading it.
- **Don't re-propose a dead theory.** [samplers.md](samplers.md) has the table; each row
  was killed by a live run.
- **`krea2RealVae_v10.safetensors` IS the Qwen image VAE, renamed.** Byte-identical —
  sha256 `a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f`, 253,806,246
  bytes — matches `Comfy-Org/Krea-2/vae/qwen_image_vae.safetensors` exactly, and is already
  on disk as `G:/CubricModels/vae/qwen_image_vae.safetensors`. NOT Wan, NOT a custom VAE.
  **Consequence:** the masked-edit colour seam is *not* a VAE-decode difference between Krea
  and Qwen — they share the decoder. Qwen edits clean because of its DiT + edit
  conditioning, not a better VAE. Don't go looking for a VAE fix.

## Sources

- https://huggingface.co/Comfy-Org/Krea-2 — weights, 9-LoRA table
- https://github.com/krea-ai/krea-2 — first-party steps/cfg/mu; `docs/prompting.md`
- `G:\ComfyUi\ComfyUI\comfy_extras\nodes_resolution.py` — ResolutionSelector formula (read locally)
- https://www.stablediffusiontutorials.com/2026/06/krea2-base-turbo.html — `er_sde`; native res bands
- https://www.stablediffusiontutorials.com/2026/06/krea2-lora-models.html — trigger-at-end
- https://docs.comfy.org/tutorials/image/krea/krea-2 — **stale 4-LoRA table**
- https://github.com/ClownsharkBatwing/RES4LYF · https://github.com/Auryg/Krea-2-Two-Stage-Sampler
- https://huggingface.co/conradlocke/krea2-identity-edit — identity-edit weights + model card (settings-by-task table, ref_boost/grounding_px guidance)
- https://github.com/lbouaraba/comfyui-krea2edit — the edit nodes
- **The INSTALLED node pack ships its own usage guide — read it before searching the web.**
  `engine/ComfyUI_windows_portable/ComfyUI/custom_nodes/comfyui-krea2edit/README.md`
  + `CHANGELOG.md` (same files in the `G:\ComfyUi` bench install). They carry the per-task
  steps/cfg recipes, the "removals need Raw at cfg 3" rule, the `grounding_px` trade and the
  ≤2MP ceiling. Unmined until 2026-07-25 — everything in [editing.md](editing.md) that isn't
  user-measured came from there or from the pack's source.
