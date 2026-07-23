# FluxKontextMultiReferenceLatentMethod — "Edit Model Reference Method" node

> Raw research, 2026-07-17. Settled summary lives in `docs/models/qwen-edit/reference-latents.md`.

## What the node is

- ComfyUI class `FluxKontextMultiReferenceLatentMethod`, display name **"Edit Model Reference Method"**. Source: `comfy_extras/nodes_flux.py`. Marked **[BETA]**.
- Kontext = Flux edit tech; Qwen Image Edit reuses the same reference-latent plumbing, so the node applies to Qwen Edit graphs too.
- It does **NOT** touch pixels or conditioning content. It sets **one string** — `reference_latents_method` — on the conditioning via `conditioning_set_values()`. The diffusion transformer (`comfy/ldm/flux/model.py` forward pass) reads that string and positions the reference-image latents differently.
- The head-swap workflow has TWO of these: one on POSITIVE conditioning, one on NEGATIVE. Each conditioning stream carries its own reference latents from the Qwen Edit encoder. **Both should match.**

## The 4 methods — WHERE the reference latents get placed (temporal vs spatial)

| Method | Mechanics (from `model.py` forward) | Effect |
|---|---|---|
| **offset** (default) | Reference placed in a separate SPATIAL region, stacked by aspect ratio (`h_offset`/`w_offset`); single index. | Ref seen as a neighbor tile. Safe general default. |
| **index** | Reference gets its own incremented positional/temporal index in `img_ids` (`index += ref_index_scale`). | Cleaner multi-ref separation; ref = own "frame slot". |
| **uxo/uno** | Pure SPATIAL stack — refs tiled vertically/horizontally, cumulative offsets. Node normalizes `"uxo/uno"` → `"uxo"` internally. | From USO/UNO subject-driven generation. Refs as distant spatial regions. Good for subject/identity carry. |
| **index_timestep_zero** | Like `index`, PLUS duplicates the timestep batch and ZEROS it for the references — refs conditioned at timestep 0 (clean/noiseless), contrastive forward. | STRONGEST reference adherence. |

Core distinction: index* methods differentiate refs via `img_ids` coordinates (temporal); offset/uxo place them in distinct spatial regions. `index_timestep_zero` uniquely manipulates the timestep tensor itself.

## The verdict that matters

1. **`index_timestep_zero` is the 2511-correct default.** Qwen-Image-Edit-2511 GGUF/native ships `index_timestep_zero` as the metadata default — 2511 edit models are trained to condition the reference at timestep 0. The workflow shipping it is INTENDED, not a mistake.
2. **Known tradeoff: color shift.** Community + RefineNode docs warn `index_timestep_zero` "can introduce a noticeable color shift." For head-swap (skin-tone / lighting match critical) this is the axis to watch. If drift appears → test `offset` or `index`.
3. This is a candidate **user-tuned knob** for the head-swap app, not a structural change (per workflow-authoring rule: agent does structural edits, user sets knob values).

## Sources

- `comfy_extras/nodes_flux.py` (node), `comfy/ldm/flux/model.py` (forward-pass branches) — read via GitHub raw
- https://docs.comfy.org/built-in-nodes/ReferenceLatent
- https://www.runcomfy.com/comfyui-nodes/ComfyUI/flux-kontext-multi-reference-latent-method — color-shift caveat
- https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF/discussions/6 — index_timestep_zero metadata is the 2511 default
- https://github.com/1Kynx/ComfyUI-RefineNode — "avoid index_timestep_zero, color shift"
