# MPI-217 Checklist — Chroma (Flash, balanced)

## Phase 1 — Generation (workflow authored + API exported)
- [ ] Upload `Chroma1-HD-Flash.safetensors` to R2 (`--s3-no-check-bucket`)
- [ ] Upload `t5xxl_fp16.safetensors` to R2
- [ ] (ae.safetensors already on R2 — skip)
- [ ] Register RES4LYF in `dev_configs/node_lock.json` (pin commit, model-specific)
- [ ] `dependencies.js`: add 2 weight entries + RES4LYF node entry (installRequirements true, NO installOnEngine)
- [ ] `models.js`: add Chroma model def (op `t2i`, dependencies[], workflow map)
- [ ] `models.js`: LoRA-no-clip capability flag on Chroma
- [ ] LoRA settings component: hide clip strength when flag set
- [ ] Workflow template→runtime split for `Chroma_t2i.json`
- [ ] Loader-path normalization
- [ ] `model.type` consumer sweep
- [ ] Fix `Ouptput_Image` title typo if present
- [ ] Prove in in-app engine ComfyUI
- [ ] Live-verify generation end-to-end

## Phase 2 — Upscaler (deferred, SDXL-style)
- [ ] Clone SDXL upscaler wiring, swap in Chroma/RES4LYF nodes
- [ ] Author + export upscaler API workflow
- [ ] Wire + live-verify

## Phase 3 — Detailer (deferred)
- [ ] Clone SDXL detailer wiring for Chroma
- [ ] Author + export + wire
- [ ] Live-verify
