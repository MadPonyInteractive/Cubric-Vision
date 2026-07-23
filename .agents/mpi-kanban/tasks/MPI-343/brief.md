# MPI-343 — Evaluate PiD 1.5 (do we upgrade the shipped PiD upscaler?)

**Idea / low priority.** Explore, then decide. Do not start wiring off this brief.

## What triggered it

ComfyUI **v0.28.0** lists *"Support PID 1.5 models"* (#14894) — a newer generation of the
PixelDiT upscaler we already ship. Spotted while researching MPI-342 (the 0.28 bump).

## What we ship today (MPI-182)

`nvidia-pid` — "NVIDIA PiD Upscaler", `type: 'pid'`, `sizeTier: 'low'`, dropdown `UPSCALE`,
no model-settings gear (takes no upscale model and no LoRAs), `enhanceRecipe: 'sdxl'`
(borrowed — Cubric Prompt has no `pid` recipe).

It is **one model with four VAE-locked checkpoints** picked at runtime via `Input_Type` —
compat is the VAE latent space, not the model name:

| dep | file | size |
|---|---|---|
| `pid-flux1` | `pid_flux1_1024_to_4096_4step_bf16.safetensors` | 2.72GB |
| `pid-sdxl` | `pid_sdxl_1024_to_4096_4step_bf16.safetensors` | 2.72GB |
| `pid-sd3` | `pid_sd3_1024_to_4096_4step_bf16.safetensors` | 2.72GB |
| (+ qwen leg) | see `modelDeps.js` | |

Shared gemma text encoder + sd3/qwen/flux VAEs live in `assetDeps.js` (dedup is automatic).
Research: `docs/models/pid/upscaler.md`. Also a `requiredModels` member of the `sdxl-4k`
test app (`appsRegistry.js`) — **which MPI-332 plans to rip**, so don't let that app's fate
confuse the model's.

## Questions to answer (this card = research only)

1. **What actually changed in 1.5?** Quality, step count (ours is 4-step), speed, VRAM.
   Is 1024→4096 still the shape, or new resolutions?
2. **Same four-VAE-checkpoint structure, or fewer/more?** That decides whether this is a
   drop-in weight swap or a workflow/`Input_Type` selector change.
3. **Does it need ComfyUI ≥0.28?** If yes it is gated behind MPI-342. If the node is the
   same and only the weights differ, it may not be.
4. **Replace or add?** Replacing means re-uploading ~2.7GB × N to R2 and every existing
   user re-downloading. Adding means two PiD entries in the Model Library. Neither is
   obviously right — decide on the measured quality delta, not on novelty.
5. Is the shared gemma/VAE asset set unchanged? If it moved, the dedup story changes.

## Verify (if it proceeds)

Side-by-side upscale of the same source at the same seed, 1.0 vs 1.5, across at least the
flux1 and sdxl legs — quality AND wall-clock. A quality win that doubles the time is a
different decision than a free one.

## Related

- MPI-342 — the 0.28 bump that surfaced this.
- MPI-182 — the original PiD wiring; `docs/models/pid/upscaler.md`.
- MPI-332 — rips the `sdxl-4k` test app that currently lists `nvidia-pid`.
- Playbook if it proceeds: `docs/playbooks/add-model/` (models are NOT version-bumped).
