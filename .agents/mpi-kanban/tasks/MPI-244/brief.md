# MPI-244 — Add Boogu-Image 0.1 (image editing)

## Why
Boogu-Image 0.1 is a 10B Apache-2.0 unified generate+edit family. **The interest is the Edit variant**:
instruction-driven single-reference-image editing — object insert / replace / remove, attribute + material
change, background & scene replace, faithful style transfer.

## Non-negotiable
Run `/mpi-add-model`. Its step 0 is a **full read of `docs/add-model-playbook.md`**. This brief assumes the
playbook; it does not replace it (CLAUDE.md § Add a New Model).

## What recon already settled

| Question | Answer |
|---|---|
| Custom node? | **No.** `ComfyUI-Boogu` is legacy and its README says "do not install this custom node." |
| ComfyUI bump? | **No.** Two official templates already ship on our 0.27.0 engine — user confirmed live. |
| Where to start the workflow | ComfyUI Templates browser → search `boogu` → **"Boogu image 0.1 Edit"**. User is opening it and building our workflow from it. |
| Weights | `huggingface.co/Comfy-Org/Boogu-Image` (repackaged for native ComfyUI, ~205GB org repo). Layout already matches ours: `diffusion_models/`, `text_encoders/`, `vae/`, `loras/`. |
| VAE | FLUX.1 VAE. **We already ship one** as a shared dep (`vae/ae.safetensors`, `dependencies.js:214`). Check byte-identity with Comfy-Org's `flux1_vae_bf16.safetensors` before adding a second copy. |
| Text encoder | `text_encoders/qwen3vl_8b_fp8_scaled.safetensors`. **Collision watch:** MPI-242 (Krea2, in flight) lands Qwen3-VL-**4B**. Different weight, same family — name deps by weight file, coordinate so both land as separate shared entries. |
| Prompt rewriter | Upstream ships an "instruction reasoner". **Do not port it.** Prompt-gen is Cubric Prompt, a separate app (`project_product_scope`). |
| VRAM table | Never hand-write. `footprint.js` computes it from dep `size` strings (playbook s5). Upstream's "12GB min / 24GB+" claim is unverified marketing. |

## The second template
`Boogu Turbo: Text to Image` also ships natively. Ship it only if it costs nothing beyond a second
`diffusion_models/` weight — same VAE, same text encoder. Decide after reading both graphs.

## Traps that will bite
- **Tier 2 naming.** New model ⇒ `Input_*` / `Output_Image`. Never the tier-1 bare `Output`.
  (`feedback_comfy_node_naming_law`, playbook s8 tier table.)
- **Edit reference image is required** ("taking one input image") ⇒ no `placeholder.png` staging.
  Confirm against the exported graph anyway.
- **Baked LoRA.** If the Edit graph pulls `boogu_image_turbo_hotfix_lora_rank_128_bf16.safetensors`, it is a
  dep, not a user slot (LTX ships 3, wan22-5b ships 1).
- **Never hand-edit workflow JSON.** Author on the Builder Pod, export, then split template→runtime.
- **R2 upload and deletes need explicit user approval.**
- **Both engines.** Local *and* remote must generate before this closes (`feedback_check_both_engine_paths`).
- Models are **not** version-bumped.

## Definition of Done
`/mpi-add-model` run to completion: deps + R2 upload → `models.js` ModelDef → workflow template/runtime split
→ `progressStages` → `model.type` consumer sweep → **live generation on both engines**.

## Later, not now
`boogu_image_edit_turbo_int8_convrot.safetensors` exists. Krea2 research measured int8_convrot at ~1.92× fp8
on Ampere (`docs/krea2/resolution.md`). The runtime-VARIANT axis is already built (`resolveModelDeps.js`,
`gpuArch.js`, MPI-200/206/209). Candidate follow-up, not a v1 requirement.
