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
  reads as wrong to the user. Product decision pending.

## Not yet run

Krea2's six ops on both cards (SFW + NSFW), turbo speed delta via `Input_is_Turbo`,
Krea2 masked edit, Klein regression pass.
