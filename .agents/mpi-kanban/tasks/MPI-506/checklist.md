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

> **Read this before estimating: what is left is a FEATURE, not wiring.** The
> workflows are done and proven, but the mechanism they plug into does not exist.
> `PluginDef` (`js/data/pluginsRegistry.js`) has a **singular `operation`** and
> exactly **one** instance (`image-describer`), and three SeedVR2 plugins all serve
> `videoUpscale` — so `operation` stops identifying a plugin. Good news, already
> checked: `MpiToolOptionsUpscale.js` is **already `kind`-aware** (`'image' | 'video'`),
> so it needs no refactor. MPI-507 is blocked on this same mechanism by design — it
> was always meant to be the second consumer.

- [ ] `PluginDef` gains a tool-dropdown entry declaration (which tool, label, injector value). `operation` is singular today and three plugins share `videoUpscale`
- [ ] Per-entry conditional controls — SeedVR2 declares none, PiD declares prompt + denoise. A declared list, never `if (isPid)`
- [ ] `plugin:<id>` value namespacing + `coerceSettings()` dropping a stale value whose weight left disk
- [ ] Three `PLUGINS` entries + four deps (3 weights + shared VAE), R2-hosted with sha256
- [ ] Upload 20.62 GB to R2 and mirror to HF
- [ ] Injection mapping: selected entry -> `unet_name`
- [ ] `frames_per_chunk` sizing off `/system_stats`, PER VARIANT (§2h). `routes/platformEngine.js` reads only the GPU name today

## Open gates — must clear before a number or a plugin ships

- [ ] **THE NODE CHOICE — settle this FIRST; it can retire the gates below.** Bake off `numz/ComfyUI-SeedVR2_VideoUpscaler` against the bundled `comfy_extras.nodes_seedvr` on a **full-frame** upscale. §2f-bis. Decisive test: a 1.5x whole-video run on the 16 GB 4060 Ti, which **OOMs on core today** (Fabio, 2026-08-14). Also compare `input_noise_scale` / `latent_noise_scale` / `preserve_frames` / batching, and check whether defects 1 and 2 exist there at all. Price the trade: the pack ships fp16/fp8_e4m3fn, so switching likely costs `int8_convrot` and the 30-series users who need it — confirm whether int8 has landed since 2026-08-10. **MPI-557 is blocked on this.**
- [ ] **`--lowvram` re-measure on `:48188`.** Every fpc number so far is NORMAL_VRAM bench; the app launches `--lowvram` on every NVIDIA GPU (`routes/comfy.js:432`). **Only worth running against whichever node path wins above** — core's fpc numbers are meaningless if we switch packs
- [ ] **Remote/Pod half (§5).** A plugin dep is not baked into the Pod image. Establish how `image-describer`'s encoder reaches a Pod, and whether SeedVR2 can work remotely at all

## Tooling notes — cost time on 2026-08-10, will cost it again

- **`sync-raw-workflows.mjs` refuses to run** while any generated workflow is dirty, and
  **nine of them are permanently dirty** here from the `core.autocrlf` renormalisation
  (content-identical to HEAD, `git diff --numstat` empty). Do NOT try to "fix" them —
  unpicking it needs a banned git command. Drive its steps 3 and 4 directly instead:
  `COMFY_URL=http://127.0.0.1:48188 node scripts/workflow-to-api.mjs <raw> > <runtime>`,
  then `node scripts/validate-injection-rules.mjs <runtime…>`. That is exactly what the
  script does internally, with no side effects on files other sessions own.
- **Convert against `:48188`, never the `:8188` bench** — the bench runs ahead and has
  silently shifted a widget before.
- **Re-dumping a co-owned kanban JSON with `ensure_ascii=False` re-escapes the WHOLE
  file** and produced a ~40-line false diff on `board.json` when the real change was two
  lines. Rebuild from `git show HEAD:<path>`, apply only your edit, dump with
  `ensure_ascii=True`, and check `git diff --numstat` before committing.
