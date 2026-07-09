# MPI-217 — Chroma image model integration (Flash, balanced tier)

> **SESSION HELPER / CONTINUE CARD** — like MPI-4 (LTX). One card drives all three
> Chroma phases. Read this whole file to resume in a fresh session.

## Scope

Wire **Chroma** (Flux-family, VAE-based image model) into Cubric Vision at the
**balanced tier**, using the **Chroma Flash** checkpoint (fast/distilled variant).
Three phases, sequenced, ALL tracked on this card:

1. **Generation workflow** — *IN PROGRESS (user authoring now)*.
2. **Upscaler** — later.
3. **Detailer** — later.

Phases 2 + 3 are deferred but belong here (do NOT split into new cards unless one
grows past a card's worth of work — same convention as MPI-4).

## Phase 1 — Generation (current) — FACTS LOCKED 2026-07-07

Workflow authored + API exported by user. Sources:
- UI graph: `G:\ComfyUi\ComfyUI\user\default\workflows\Chroma.json`
- **API export IN REPO: `comfy_workflows/Chroma_t2i.json`** ← the wiring source.
- Op: `t2i` (text-to-image, single-stage). NOT `_ms`.

### Dependencies (complete)

Upload to R2 (2 weights), then register in `dependencies.js`:
1. **`Chroma1-HD-Flash.safetensors`** — diffusion (Chroma Flash). `diffusion_models/`.
2. **`t5xxl_fp16.safetensors`** — T5 text encoder. `text_encoders/`. (NOT yet on R2.)

Reuse (already on R2 — do NOT re-upload):
- **`ae.safetensors`** — Flux VAE, shared. Already `dependencies.js:203`.

New custom-node pack:
- **RES4LYF** (`ClavtorSanguineForge/RES4LYF` — confirm exact repo). Provides
  `ClownModelLoader`, `ClownsharKSampler_Beta`, `ReChromaPatcher`, `Mahiro`,
  `FromBasicPipe`/`ToBasicPipe`. **MODEL-SPECIFIC** (only Chroma uses it):
  - Add to `dev_configs/node_lock.json` (single source of truth for node pins;
    `source: git-commit`, pin a commit).
  - `installRequirements: true` (RES4LYF ships a real `requirements.txt`).
  - **NO `installOnEngine`** — list it in Chroma's `dependencies[]` in `models.js`
    so it installs via `getInstalledModelNodeDeps()` when Chroma weights present +
    node missing. (comfy_engine.md § installOnEngine decision.)

### Shape
- Combined-op, single-stage, image op `t2i`. Flat `dependencies: []` on model def.
- Balanced tier = the one tier for Chroma this card. (No multi-tier variant axis
  unless a second tier is added later.)

### Settings — LoRA has NO clip strength
- **Chroma LoRA takes MODEL strength ONLY, no clip strength.** The settings UI must
  render Chroma's LoRA rows WITHOUT the clip-strength control. (Contrast: SDXL/Flux
  LoRAs show both.) Wire this as a model capability flag consumed by the LoRA
  settings component — find the flag other single-strength models use, or add one.
- **Node-naming law:** every NEW app-read/write node carries `Input_*`/`Output_*`;
  Tier-1 reserved titles stay bare. Workflow already uses `Input_Positive`,
  `Input_Lora_*`, `Input_Width`, `Ouptput_Image` (sic — typo in export, verify).

## Phases 2 + 3 — Upscaler + Detailer (deferred)

- **Upscaler = SDXL-style, NOT PiD.** User decision: Chroma's upscaler mirrors the
  existing **SDXL upscalers** (UltimateSDUpscale path). The ONLY delta vs SDXL is the
  **RES4LYF** custom-node dep (already added in Phase 1). Reuse the SDXL upscaler
  wiring; swap the model/sampler nodes for the Chroma/RES4LYF equivalents.
- **Detailer.** Standard detail/refine pass on Chroma output, same family as the SDXL
  detailer. Author + prove after generation + upscaler are solid. Spec TBD.

## Model facts

- **Family:** Flux-family, VAE-based (16-ch `ae.safetensors` — the shared Flux VAE,
  `dependencies.js:203`). NOT Chroma *Radiance* (that's the VAE-less pixel model —
  `pid-upscaler.md:19-21` — different thing, ignore for this card).
- **Weights:** `Chroma1-HD-Flash.safetensors` (diffusion) + `t5xxl_fp16.safetensors`
  (T5) + `ae.safetensors` (VAE). Per `ClownModelLoader` widget in the workflow.
- **Custom nodes:** RES4LYF (ClownShark sampler family + ReChromaPatcher).
- **Tier:** balanced only (this card).

## Playbook gate — USE THE PLAYBOOK

Follow `docs/add-model-playbook.md` end-to-end. The API workflow is already exported
(`comfy_workflows/Chroma_t2i.json`), so start at the app-wiring steps:
1. Upload 2 weights to R2 (`--s3-no-check-bucket` to dodge the 403). `ae.safetensors`
   is already there — do NOT re-upload.
2. Register RES4LYF in `dev_configs/node_lock.json` (pin commit).
3. `dependencies.js` — add the 2 weight entries + the RES4LYF node entry (URL built
   from node_lock).
4. `models.js` — add the Chroma model def (op `t2i`, `dependencies[]` incl. RES4LYF +
   both weights + `ae.safetensors` ref), the LoRA-no-clip capability flag, workflow
   map `{ t2i: 'Chroma_t2i.json' }`.
5. Workflow template→runtime split + loader-path normalization.
6. `model.type` consumer sweep.
**Models are NOT version-bumped.** `t2i` is an existing op → operation registry
untouched.

## Open questions (resolve during wiring)

- [ ] RES4LYF exact repo + commit to pin in `node_lock.json`.
- [ ] Which existing model carries the "LoRA model-strength only, no clip" flag (reuse
      it) — or add a new capability flag + sweep the LoRA settings component.
- [ ] Confirm `t2i` op exists + is image-single-stage in `commandRegistry.js`.
- [ ] Min VRAM/RAM spec for balanced tier (for footprint.js / manager display).
- [ ] `Ouptput_Image` node title typo in the export — fix to `Output_Image`?
