# MPI-365 — live verification log

Live-verification pass in the Electron app, 2026-08-02. Defects found during the pass
are fixed here rather than carded, unless noted as deferred.

## Verified

- **Qwen Image Edit B — VERIFIED** (user, 2026-08-02, app engine). edit / depth / pose all
  produce output matching the requested op (`Input_wf_type` 1/2/3), the tier radio holds
  across ops after fix 1, and masked edit works after fix 2. First round ran against the
  standalone bench (see below); re-run on the app's own engine after the port was freed.
- **Progress bar** — reported as pinned at 100% for a whole generation. NOT a code
  defect: the fine-grained fill is parsed from the app's ComfyUI *child* stdout
  (`routes/comfy.js` → `comfy:step-progress`), and the app had no child process at the
  time. Correct once the app owned its engine.

- **Krea2 masked ("localised") edit — VERIFIED** (user, 2026-08-02), after the mask
  resolution fix. Node 589's crop path takes the app mask cleanly.

## Trap hit: the bench owns port 8188

`G:\ComfyUi` was running and holding 8188, so the app's engine start failed
(`Port 8188 is already in use` → `exited (code=1)`) and every dispatch went into the
bench instead. The app log is the tell: zero `got prompt`, zero tqdm lines, while
generations completed on screen. Known trap — memory `tool_verify_through_the_app`.
Close the bench BEFORE any verification round.

## Defects found + fixed

1. **Qwen tier followed the operation** (`PromptBoxControls.js`). `qwenTier` was
   `scope: 'perOp'`, harmless while Qwen had one op; MPI-365 gave it three, so
   switching op switched tier. Now `perModel`, matching `krea2Turbo` / `qualityTier`.
   Old per-op values are orphaned — the radio starts at its default once, then sticks.

2. **Masked edit died on any image over 1536px** —
   `InpaintCropImproved failed: AssertionError: Mask dimensions do not match image
   dimensions. Expected torch.Size([2304, 1728]), got torch.Size([1536, 1152])`.
   Mask layers work at `MASK_MAX_EDGE = 1536` (`MaskManager.js`) and `getURL()`
   exported at that capped size; the file staged for the failing run measured
   1152×1536 against a 1728×2304 source. The cap's own header comment assumed
   "ComfyUI's own mask resize" would absorb it — true of `SetLatentNoiseMask`, false of
   `InpaintCropImproved`, which asserts equality.
   **Not a Qwen-only bug:** `qwen_edit.json` node 243, `krea2_t2i_{sfw,nsfw}.json`
   node 589 and `klein_t2i.json` nodes 276 + 581 all feed the app mask straight into a
   crop node — so Klein masked edit has been broken in **released 1.3.0** for any
   source image over 1536px.
   Fixed at both mask producers (the graphs are correct, the app was lying about the
   mask size): `MaskManager.getURL()` now exports at the source image's pixels via
   `_toSourceScale()`, and `MpiCanvasViewer._buildCompositeFromTemp()` scales its TEMP
   composite to `item.pixelDimensions` (that one reaches the graph through
   `_previewMaskCache` → `getCurrentMaskDataURL`).

## Open / deferred

- ~~**Krea2 has an extra depth control in the graph** (`Input_depth_strength`) that the
  app never injects.~~ BUILT 2026-08-02 on the user's request, awaiting live test: a
  **Depth Strength** slider (`depthStrength`, `scope: 'perOp'`, 0–1.00 step 0.05,
  default 1.00) on the `depth` op, gated on the new `capabilities.depthStrength` so
  only the two Krea2 cards render it. The value IS `Krea2ControlLoRALoader.strength`,
  passed straight through; 0 unpatches the model and the op stops being a depth op.
  Ceiling was 1.5 for one round — user tested it, the subject's clothing dissolved into
  ribbons, so overdrive was capped back to 1.00.
- **A detected-but-not-applied mask is still injected.** SAM3 detect auto-selects its
  picks (`MpiCanvasViewer.js` `exec.onMasks` → `setSelectedAutoPicks(runPicks)` +
  `evaluateMask()`), and `maskCanvas` = manual ∪ selected picks, so `hasMask()` is true
  and the pick reaches `Input_Mask` without the user pressing Add. That is the
  MPI-372 / MPI-384 contract (the op strip must unlock on a detection), and it now
  reads as wrong to the user. ~~Product decision pending.~~ **DECIDED and HANDED OFF
  2026-08-03 — no longer MPI-365's item.** The user's ruling ("if a preview stops being
  a preview, it is no longer a preview") is recorded verbatim on **MPI-426**, which owns
  the fix and the MPI-372 replacement it owes. MPI-382's preview contract closed the
  *leave-the-tool* half only (`mountOptions()` → `el.discardPreview()` →
  `_exitAutoMaskMode(false)`); dispatching while STILL in Detect continues to inject the
  un-Added pick, because `_recomposite()` still unions selected picks into `maskCanvas`
  and `getURL()` still reads `maskCanvas`. Verified in source 2026-08-03. Track on MPI-426.

## Klein re-export, 2026-08-02 (user-authored, synced in `c7e353eb`)

Two graph changes came back, plus one the generator caught:

1. **`Input_depth_strength` (node 644)** → node 143's `strength_model`, the
   `flux2_klein_4b_refcontrol_depth` LoRA. `capabilities.depthStrength` flipped on and
   that was the entire app side — the control, default, gate and injection were already
   generic from the Krea2 wiring. **Klein's LoRA bites softer: usable at 0.2–0.3 where
   Krea2 wants 0.6–0.8.**
2. **Mask loader (296) `block_if_empty` false → true** — user's fix, diagnosis
   user-confirmed. Klein's `MpiIfElse` 576/592 pick the crop path off the mask checker
   while the loader still handed a blank mask downstream, and 296 feeds SIX consumers
   (both `InpaintCropImproved`, `MaskDetailerPipe`, two `MpiMaskSquareBbox`,
   `GrowMaskWithBlur`). Blocking short-circuits the branch instead.
   **NOT propagated to Krea2 (557) or Qwen (202), on purpose:** both gate the IMAGE into
   their crop with an `MpiBlocker` off their own mask checker, upstream of the loader, so
   the loader's emptiness decides nothing there. Klein had no such gate.
3. **`Input_wf_type` came back baked to 3** (the user had been testing depth).
   `generate_klein.py` asserted the node's existence but never rebaked it, unlike
   `generate_qwen.py::_bake_wf_type` — so the authoring value would have shipped as the
   runtime fallback and every op would run DEPTH whenever injection failed. Guard added
   in `950890f4`; the sync log shows it firing (`[WFTYPE] Input_wf_type.int: 3 -> 1`).

## Migrated models: VERIFIED

Krea2 (six ops, both cards), Qwen (edit/depth/pose) and Klein all run through the app on
its own engine — user-confirmed 2026-08-02 with a create-and-climb pass. Krea2 and Klein
masked edit included.

## Chroma: VERIFIED IN THE APP, 2026-08-02

Ran through the app on its own engine, user-confirmed ("it works fine now") after the
three defects below were fixed. The migration itself (one template, two tier bakes) had
already passed; these were found by USING it, which is why they are recorded here rather
than in the migration section.

- **depth offered a ratio picker and its gallery card came out padded.** One cause:
  `imageSizedOps` omitted `depth`. Evidence it was real — picker set to 8:5, output
  `depth_013` at 1280×768, i.e. the input's shape. Traced in the graph rather than
  inferred: depth's latent is `VAEEncode` 2762 ← `ImageScaleToTotalPixels(1MP)` ←
  `Input_Image`; `MpiCrop` (which does read `Input_Width`/`Height`) feeds the **i2i**
  latent. Fixed in `f7fd3026`; the padding went with it, because the `ratio` control is
  what injects `Width` and the placeholder is sized `injectionParams.Width || 0`.
- **The batch control was dead on half the ops.** `Input_Batch_Size` reaches only
  `EmptyLatentImage` in every graph in the repo, so any op sampling a VAE-encoded latent
  returned one image while the control claimed N. New per-op `ModelDef.batchOps`; swept
  across Chroma **and** the SDXL family in one pass rather than fixing the reported model.
- **Style strength started at the global 1.0.** Both checkpoints are distilled enough
  that 0.8/1.0 artefact instead of styling. New `ModelDef.controlDefaults` sets 0.6,
  matching what the graph already baked into `Input_Style_Selector.strength_model`.

Licence gate also closed: four style LoRAs verified and on R2, `chroma-style-cinema`
dropped on a licence call. See `docs/models/chroma/licences.md` and `b5fcc373`.

Not verified by this session: Chroma `progressStages` bar counts remain unmeasured in
code (the per-FILE table cannot express "1 on t2i/i2i/depth, variable on detail/upscale"
— deferred by user decision to the per-op table).

## Remaining scope — the card stays in `doing`

**SDXL has not been migrated.** The user confirmed 2026-08-02 that the SDXL models are
next for the one-master-template shape and that the work belongs to THIS card, so the
title ("migrate all models…") is not yet satisfied. Card stays in `doing` at
`in-progress`.

**Boogu Image Edit is NOT in scope** — it is already a single file, so it never needed
migrating. Its upcoming localised-edit work is a separate card in a separate session.
When it lands, the localised-edit bullet in `docs/releases/UNRELEASED.md` gets EXTENDED,
not duplicated.

## Live verification — 2026-08-03, the control merge + SDXL migration

**User-confirmed working.** After a hard reload, the control op, its type picker and the
migrated SDXL family behave correctly in the app. One issue was raised during the pass
and then withdrawn by the user as a dud — nothing outstanding from it.

Two defects were found and fixed DURING the pass, both worth keeping:

1. **`UltimateSDUpscale.image` was unconnected in the re-exported SDXL template**, and it
   failed EVERY control run, not just upscale:

       Failed to validate prompt for output 1592:
       * UltimateSDUpscale 1702:
         - Required input is missing: image

   This is the master-template trap read from the other side. ComfyUI validates every
   node at submit even on a branch lazy evaluation will never reach, so one malformed
   branch takes the whole file down with it. When a migrated model fails on an op that
   does not touch the broken nodes, suspect a sibling branch before suspecting injection.
   Fixed by re-export + `sync-raw-workflows.mjs`.

2. **The control guide named all four types on every model.** The Krea2 popup promised a
   Scribble its graph cannot run. The "which structure" paragraph is now DERIVED from
   `ModelDef.controlTypes` (`controlTypesParagraph`, spliced by `getOpHelp`) instead of
   authored, so it cannot go stale again; a one-type model says it has one control rather
   than describing a picker it never renders. Klein's `byModel` override is untouched.
   Pinned by a test that asserts Krea2/Chroma/Qwen never mention a type they cannot run.

### Still unverified

- **SDXL detail and upscale from the master template.** They now run out of
  `t2i_<model>.json` instead of the ten deleted `detailer_*`/`upscaler_*` files. The
  upscale branch is the one that was broken above, so it has had the least exercise of
  any path in this change.
- **The video models are not migrated** (wan-22, ltx-23 x2, wan22-5b). They are the only
  reason this card is not closeable on the image work alone.
