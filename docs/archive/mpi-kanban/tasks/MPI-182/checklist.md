# MPI-182 Checklist

- [x] Injector fix — added 'select' to comfyController _inject targets
- [x] New `pid` op — commandRegistry + operationRegistry.js + operation_registry.json
- [x] Controls — pidVariant + pidResolution in PromptBoxControls.js (+ defaults)
- [x] Deps — 4 checkpoints + 4 VAEs + gemma in dependencies.js (sha256:null)
- [x] ModelDef `nvidia-pid` in models.js (+ §6 sweep: enhanceRecipe='sdxl')
- [x] R2 upload — 9/9 landed + HEAD-verified byte-exact (hashes: separate session)
- [x] progressStages.js entry — NVIDIA_PID {single:1} (live-confirmed 1 bar)
- [ ] WORKFLOW (user, in ComfyUI): rename output node Output_Image → Output + re-export (image capture needs bare 'Output'; NOT a hand-JSON-edit)
- [x] Bug fixes (code): op label Upscale, showSettings:false gear-hide
- [x] Playbook §8 updated with lessons (Output-title, select-injector, control pattern, showSettings, resource-VAE-ids)
- [ ] Verify in-app (user-ux): re-run PiD → output captured, 4 paths, resolution, denoise, non-square, no gear
