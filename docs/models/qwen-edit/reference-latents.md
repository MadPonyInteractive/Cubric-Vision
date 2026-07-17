# Reference-latents method — the "Edit Model Reference Method" node

> Node: `FluxKontextMultiReferenceLatentMethod` (ComfyUI, `comfy_extras/nodes_flux.py`,
> [BETA]). Full raw research: `.agents/mpi-kanban/tasks/MPI-300/research/reference-latents-method.md`.

## What it does

Sets a single string, `reference_latents_method`, on the conditioning. It does **not**
touch pixels or conditioning content — it tells the transformer forward pass
(`comfy/ldm/flux/model.py`) **where to place the reference-image latents**. Kontext is
Flux edit tech; Qwen Edit reuses the same plumbing.

The head-swap graph runs **two** of these — one on POSITIVE, one on NEGATIVE conditioning.
Keep both on the same method.

## The 4 methods

| Method | What it does | Use |
|---|---|---|
| **offset** (default) | Ref placed in a separate SPATIAL region (aspect-ratio stack). | Safe general default. |
| **index** | Ref gets its own incremented positional/temporal index in `img_ids`. | Clean multi-ref separation. |
| **uxo/uno** | Pure SPATIAL stack (USO/UNO subject-driven). Node normalizes to `"uxo"`. | Subject/identity carry. |
| **index_timestep_zero** | `index` + refs conditioned at timestep 0 (clean, contrastive). STRONGEST adherence. | **The 2511 default.** |

## Verdict

- `index_timestep_zero` is the **2511-correct** method — it matches the 2511 GGUF metadata
  default; 2511 edit models are trained to condition the reference at timestep 0. Shipping
  it is intended.
- **Caveat: known color shift.** For head-swap (skin/lighting match matters) this is the
  axis to watch. If drift appears, test `offset` or `index`.
- Good candidate for a user-tuned knob in the app, not a structural change.
