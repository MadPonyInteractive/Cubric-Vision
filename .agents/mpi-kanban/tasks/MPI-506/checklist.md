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
- [x] **`Input_Frames_Per_Chunk` STAYS AT 57 - the 33 finding did NOT generalise.** A second clip (AI-generated, 1536x640 landscape) inverted it: 57 scored 3.79 vs 33 at 3.67, where the first clip had 33 ahead 3.86 to 3.46. The optimum is content- and aspect-dependent; 57 is safe on both and never failed. Brief S 2j + 2k.
- [ ] `frames_per_chunk` sizing off `/system_stats`, PER VARIANT (§2h). `routes/platformEngine.js` reads only the GPU name today

## Open gates — must clear before a number or a plugin ships


- [ ] **PRODUCT DECISION - DOES THE VIDEO PATH SHIP AT ALL? (Fabio, blocking)** Measured 2026-08-16: SeedVR2's frequency signature is a SHARPENER's, not a reconstructor's (top/mid 0.57 at 1.5x, WORSE at 0.43 at 2x, against a 1.06 codec control), it has no semantic prior at all (one step, cfg 1.0, no text encoder - hence square irises and invented cheek blotches), and on a 16 GB card **2x collapses the chunk to 13 frames and 3x OOMs even at the fpc=5 floor**. Fabio: *"if we're offering a model that can't even do 2x on a 16 GB card, then there's no point in offering it."* Options: (a) drop the video path, ship the IMAGE path only - it has no chunker and is unaffected; (b) drop SeedVR2 entirely; (c) ship video with a hard factor cap. Full evidence: brief S 2k.
- [x] **THE NODE CHOICE - SETTLED 2026-08-15, core wins, pack REJECTED.** Baked off `numz/ComfyUI-SeedVR2_VideoUpscaler` (v2.5.23) against the bundled `comfy_extras.nodes_seedvr` on the bench. At MATCHED chunk size (33) core resolves **~50% more detail (3.86 vs 2.57)** and is 13% faster. BlockSwap does NOT solve the OOM - full swap bought 1.6 GiB and still fell 1.46 GiB short, because the activations are the bottleneck, not the weights. The pack also OOMs EARLIER than core (49 vs 69 frames). No int8 on its shelf either. Full evidence + disposition: brief S 2f-ter. **MPI-557 is unblocked.**
- [x] **Chunk-size sweep - `fpc = 33` is the measured peak, NOT the shipped 57** (17/25/33/57/69/81 swept; quality falls off on both sides; 33 also has the flattest decay at ratio 0.97 vs 0.70). Corrects the 2026-08-10 pick. Brief S 2j.
- [ ] **`--lowvram` re-measure on `:48188`.** Every fpc number so far is NORMAL_VRAM bench; the app launches `--lowvram` on every NVIDIA GPU (`routes/comfy.js:432`). Node path is now SETTLED (core), so this gate is live: re-run the 17/25/33/57 sweep under `--lowvram` before any fpc constant reaches the app
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
