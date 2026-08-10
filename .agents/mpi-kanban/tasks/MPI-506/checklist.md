# MPI-506 Checklist

## Research + workflows — DONE (2026-08-09/10)

- [x] Engine check: SeedVR2 nodes are core since ComfyUI 0.28.0, pin is 0.30.0. No bump, no node pack (brief §2)
- [x] Reject `comfyorg/comfyui_seedvr2` — zero-star stale fork, `comfyorg` is not `Comfy-Org` (§2f)
- [x] Weight table + precision decision: `int8_convrot` x3 + one shared VAE, 20.62 GB all-in (§3)
- [x] Defect 1 — `temporal_overlap` 8 clamps to force step=1 and ghosts. Ship 2 (§2e)
- [x] Defect 2 — `chunking_mode: auto` ~5x too conservative. Ship `manual` (§2e)
- [x] Defect 3 — `color_correction_method: none` leaves luma drift. Ship `lab` (§2e, §2g)
- [x] Fabio picked `fpc = 57` at 1.5x on a 16 GB card from the review clips
- [x] IMAGE path measured — no chunker, so no VRAM sizing; every variant at every multiplier, incl. 7B at 4x / 13.17 Mpx (§2g)
- [x] 7B + 7B Sharp VIDEO measured — `fpc 57` OOMs, `37` runs clean; drop predicted from the weight delta (§2h)
- [x] 3B control at `fpc 37` — isolates model from chunk size: chunk costs 12%, model gap 1.9x (§2h)
- [x] `denoise` settled — quantised, inert above ~0.67 at steps=1. Ship 1.0, do not expose (§2i)
- [x] Alpha settled — `JoinImageWithAlpha` is a pass-through, not a mask; transparency perturbs the whole frame via Pillow's RGBA lanczos (§2i)
- [x] `comfy_workflows/seedvr2_image.json` + `seedvr2_video.json` — converted vs `:48188`, gated, and EXECUTED (commit `57c92ae9`)

## App wiring — NOT STARTED (deferred to 1.5 by Fabio, 2026-08-10)

- [ ] `PluginDef` gains a tool-dropdown entry declaration (which tool, label, injector value). `operation` is singular today and three plugins share `videoUpscale`
- [ ] Per-entry conditional controls — SeedVR2 declares none, PiD declares prompt + denoise. A declared list, never `if (isPid)`
- [ ] `plugin:<id>` value namespacing + `coerceSettings()` dropping a stale value whose weight left disk
- [ ] Three `PLUGINS` entries + four deps (3 weights + shared VAE), R2-hosted with sha256
- [ ] Upload 20.62 GB to R2 and mirror to HF
- [ ] Injection mapping: selected entry -> `unet_name`
- [ ] `frames_per_chunk` sizing off `/system_stats`, PER VARIANT (§2h). `routes/platformEngine.js` reads only the GPU name today

## Open gates — must clear before a number or a plugin ships

- [ ] **`--lowvram` re-measure on `:48188`.** Every fpc number so far is NORMAL_VRAM bench; the app launches `--lowvram` on every NVIDIA GPU (`routes/comfy.js:432`)
- [ ] **Remote/Pod half (§5).** A plugin dep is not baked into the Pod image. Establish how `image-describer`'s encoder reaches a Pod, and whether SeedVR2 can work remotely at all
