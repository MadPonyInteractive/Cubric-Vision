# LanPaint replaces the relight and the whole composite-back tail — measured 2026-08-22

Run on the bench (8188), Klein 4B and 9B INT8 ConvRot, the same five plates and the same
stage-1 stamped composites session 3 was measured on. Runners in this folder; outputs at
`D:/WORK/Images/Outputs/mpi567_lp*_*.png`, sheets at `D:/WORK/Images/Outputs/mpi567/lp/`.

## The route

Stage 1 is untouched. Everything after the stamp is replaced by:

```
stamped composite ─┐
box mask ──────────┼→ InpaintCropImproved  (mask, optional_context_mask = MpiMaskSquareBbox(mask, 64))
                   │     [0] stitcher  [1] cropped_image  [2] cropped_mask
                   ↓
  ImageScaleToTotalPixels(nearest-exact, 1.0 MP, resolution_steps 16) → VAEEncode ─┬→ ReferenceLatent → FluxGuidance 4.0 → positive
                                                                                   └→ SetLatentNoiseMask(mask = cropped_mask)
  LanPaint_KSampler(steps 4, cfg 1.0, euler/simple, denoise 1.0,
                    LanPaint_NumSteps 2, "Image First", "🖼️ Image Inpainting")
  → VAEDecode → InpaintStitchImproved(stitcher) → output
```

Wiring is **copied, not invented** — the sampler half from Fabio's `LanPaint.json`, the
crop/stitch half and its tuned `InpaintCropImproved` settings from his `klein_t2i_template.json`
(both bench workflows, 2026-08-22). Negative is `ConditioningZeroOut` of the positive encode.

**What this deletes:** the whole-image Klein relight pass, and the ~25-node composite-back tail
(`ImageBlend`×2 + screen, `ImageToMask`, both `ThresholdMask`, both `GrowMaskWithBlur`,
`MaskComposite`, the 100px proximity gate, the full-frame `ImageCompositeMasked`). The tail only
ever existed to repair a global re-grade. There is no global re-grade now.

## The user's photo stops moving

`outside` = mean |diff| against the original plate, strictly outside the user's box.

| plate | tight | auto | generous |
|---|---|---|---|
| sun | 0.302 | 0.308 | 0.358 |
| overcast | 0.178 | 0.238 | 0.058 |
| night | 0.179 | 0.136 | 0.106 |
| indoor | 0.132 | 0.095 | 0.041 |
| anime | 0.056 | 0.162 | 0.042 |

Session 3's routes for comparison: silhouette composite-back `bg_mean` **3.45**, shadow-aware
**10.34** (sun). This route is an order of magnitude quieter, and structurally so — the stitch
returns the untouched original everywhere outside the box.

## Box size is the whole control, and it cuts both ways

`shadow_ratio` = pixels changed outside the object's own bbox ÷ that bbox's area — i.e. how much
ground the model was able to touch. `far_frac` = fraction of pixels changed *inside the box but
≥200px from the object*, i.e. collateral re-grade.

| plate | tight ratio | auto ratio | generous ratio | generous far_frac |
|---|---|---|---|---|
| sun | 0.054 | 0.606 | 2.211 | **0.675 RE-GRADE** |
| overcast | 0.043 | 1.039 | 2.002 | **0.656 RE-GRADE** |
| night | 0.043 | 0.380 | 0.571 | 0.023 clean |
| indoor | 0.036 | 0.292 | 0.380 | 0.001 clean |
| anime | 0.015 | 0.780 | 1.443 | **0.429 RE-GRADE** |

Boxes: `tight` = object bbox +2%; `auto` = +25% out, +60% down; `generous` = +60% out, +120% down.

**Three findings, all monotonic:**

1. **A tight box structurally cannot make a shadow.** 0.015–0.054 across every plate — the model
   has nowhere to put one. This is the same law as § "the mask must be a FILLED RECT, not a
   silhouette", restated as a size: a mask that only covers the object confines the denoise to
   the object.
2. **`auto` is the sweet spot on all five plates** — a real cast shadow, no collateral.
3. **`generous` re-grades on 3 of 5.** The sun plate's whole field turns yellow, the overcast
   grass warms, the anime palette shifts. The box IS the denoise region, so an over-large box
   re-invents the photo inside it. The re-grade did not disappear with LanPaint — it moved
   under the user's control. Night and indoor stay clean only because they are dark and
   low-contrast, which is the same under-reporting trap § Measuring the rectangle warns about.
   **Do not calibrate the default box on night or indoor.**

## 9B is better, on all five, at 1.9× the cost

| | 4B | 9B |
|---|---|---|
| wall clock (auto box) | **16.1s** | 30.1s (42.6s first, cold load) |
| result | shadow present, sometimes blotchy | cleaner, longer, better-directed shadow; real occlusion on overcast |

Judged by eye off `SHEET_4b_vs_9b.png`. 9B wins on every plate — clearest on indoor (cast shadow
aligns with the window beam) and overcast (grass crosses the legs). Confirms Fabio's read.

4B's 16.1s is the same wall clock as session 5's 74-node merged graph, on a far smaller graph:
LanPaint's inner Langevin loop (`NumSteps` 2) costs real NFE, and crop-stitch gives it back.

**9B needs `qwen_3_8b_int8_convrot.safetensors`** — pairing it with 4B's `qwen_3_4b` dies with
`mat1 and mat2 shapes cannot be multiplied (512x7680 and 12288x4096)`, which reads as a LanPaint
bug and is not one. Already recorded in MPI-600 `research/format.md`; re-derived here at the cost
of one failed sweep.

## 🔴 THE BOX EDGE IS VISIBLE — found by Fabio's eye, missed by every metric above

Fabio spotted seams in the sheets. Checked at 1:1 with the box edge drawn on
(`SHEET_seam_corners.png`, `seamzoom.py`) and he is right — **including on `auto`, which the
tables above call clean.**

`edge_step` = mean |result − photo| in a 12px band just INSIDE the box edge. Image-border edges
are `None` (nothing to step against). "Under ~2 is invisible" applies here, as everywhere.

| plate | box | top | left | right |
|---|---|---|---|---|
| sun | auto | 11.06 | 8.80 | **30.84** |
| sun | generous | 29.38 | — | — |
| overcast | auto | 10.92 | 12.62 | 12.82 |
| overcast | generous | 4.52 | — | — |
| anime | auto | 4.62 | 6.98 | 9.33 |
| anime | generous | 2.73 | — | — |

Plainly visible on sun: a horizontal tonal step across the dry field, exactly on the box's top
edge, dry straw above and darker saturated grass below.

**Why the earlier metrics said "clean" and were wrong.** `outside` measures *beyond* the box,
where the stitch guarantees the original — it can never see this. `far_frac` measures re-grade
*far from the object*, and `auto` has no far area, so it returned `None`, which I read as "cannot
re-grade". It cannot re-grade **at distance**; it can still shift tone across the whole box, and
the box edge is where that shift meets untouched photo.

**The probable cause is not the sampler.** `InpaintStitchImproved` pastes back the *whole*
inpainted crop, and that crop has been VAE round-tripped and rescaled to 1024×1024
(`output_resize_to_target_size: True`). So every pixel inside the box drifts a little in tone and
texture, masked only by `mask_blend_pixels: 32` — enough to hide a small step, not an 11.
LanPaint's noise mask preserves the *latent*, not the decoded pixels.

**Untested candidate fixes, cheapest first — this is the next session's first job:**

1. `mask_blend_pixels` 32 → 96/128. One widget.
2. `denoise` < 1.0. Less tone drift inside the box.
3. `ImageCompositeMasked(destination = the ORIGINAL cropped_image, source = decoded,
   mask = feathered cropped_mask)` before the stitch, so unmasked pixels stay byte-identical and
   the stitch has nothing to step against. **This is the node I dropped earlier in the session
   after reading `mask_blend_pixels: 32` as the cure — that was wrong.**
4. Separate the two regions: crop bounds generous (resolution + context), denoise mask smaller.
   Structural, most work, most likely to actually hold.

Shrinking the box is NOT a fix — it trades the seam for the shadow, per the table above.

## A metric that does NOT work on this route

**`ring` measured on the changed region's own bbox is meaningless here — do not quote it.** With
a rectangular noise mask the changed region's bbox hugs the box, so the ring band lands on real
content (the object, its shadow) instead of on untouched photo. It reads 7–20 on results that are
visually clean. Session 3's numbers were valid because its changed region was a feathered blob
sitting well inside its bbox. Use `outside` and `far_frac` instead, both above.

## What this settles for the flow

- The `box` step is load-bearing, not a convenience — without it there is no shadow.
- Its copy asks for **room**, never direction: the model reads the scene's light itself.
- The auto-seed should be ≈ +25% out / +60% down on the drawing's bbox, and the hint should
  discourage covering half the frame — the failure at the generous end is real and visible.
- `MpiMaskSquareBbox(padding 64)` as `optional_context_mask` is what lets the model see past the
  box to judge the light, while the denoise stays inside the box.
