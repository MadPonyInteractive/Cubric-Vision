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

**~~The probable cause is not the sampler.~~ DISPROVEN 2026-08-22 (session 8), see below.** The
guess here was VAE round-trip + rescale drift hidden by `mask_blend_pixels: 32`. `edge_profile.py`
killed it: round-trip drift has no direction, so its signed mean would sit at ~0, and instead the
signed mean is large and *grows with depth* into the box (sun right edge −19 → −33; overcast +9 →
+14 on all three edges). The model **re-grades the whole crop**. Also `norescale` — dropping
`ImageScaleToTotalPixels` entirely — is byte-identical to base, so the rescale half of that guess
was a no-op the whole time (`resolution_steps: 16` rounds 1000 back to 1024).

**All four candidates were run 2026-08-22 (session 8). None of them works.** Detail in the next
section; runner `seamfix.py`, 17 configs, every number in `seamfix_results.json`.

1. `mask_blend_pixels` 32 → 96/128 — **impossible and useless.** The node caps it at 64; 96 and
   128 make ComfyUI prune the branch and report `status_str: "success"` in 0.2s with nothing
   sampled. At the legal max of 64 the edge is unmoved (30.43 vs 30.84) and `outside` LEAKS
   worse (0.506 vs 0.308).
2. `denoise` < 1.0 — **dead.** At `steps: 4` ComfyUI computes `int(steps/denoise)`, so 0.85 is
   byte-identical to 1.0; the values that do bite destroy the feature (0.55 takes anime's shadow
   to 8% of baseline) while sun's edge stays at 10.6.
3. `ImageCompositeMasked` against the original `cropped_image` — **a no-op by construction**, and
   this was worth catching before building it. The mask named is `cropped_mask`, which *is* the
   box; compositing decoded-over-original through the box mask reproduces exactly what
   `InpaintStitchImproved` already does with the same mask. It can only do something with a
   DIFFERENT mask — a real change mask — which is the deleted tail, not this node.
4. Separate crop bounds from denoise mask — **the right family, wrong direction.** Shrinking the
   denoise mask inside the box (`f032`/`f096`) ramps the seam but pays for it out of the shadow
   (overcast to 61%/46%). Growing the box and feathering outward (`g064`/`g096`/`g192`) keeps the
   shadow and cuts the edge 3–27×, but only by moving the change into the photograph.

Shrinking the box is NOT a fix — it trades the seam for the shadow, per the table above.

## The seam is a TRADE, not a bug you can tune out — measured 2026-08-22 (session 8)

The cause is that the model **re-grades everything it is allowed to touch**. `SetLatentNoiseMask`
+ `denoise: 1.0` means every pixel in the box is regenerated, and it comes back with a directional
tonal offset. The box edge is simply where that offset meets untouched photo. So there are only
two ways to hide the step, and the pipeline's knobs are all one or the other:

- **Confine the change** (small box, low denoise, inward feather) → the photo stays clean but the
  boundary is sharp, and the shadow has nowhere to fall.
- **Spread the change** (big box, outward feather) → the boundary fades, but the re-grade is now
  spread across the user's photograph.

Every config lands on that one curve. `gc` — ramp centred on the box edge instead of outside it —
scores within noise of `g096` on both axes, which is what makes it a curve rather than a knob.

**The metric that shows it, and why the earlier ones could not.** `edge_step` is sampled AT the
box edge, so widening the ramp fades it without shrinking the change. `shadow_ratio` counts
changed pixels outside the OBJECT bbox, so a re-graded field reads as a better shadow — overcast
`g192` scores 2.05, double baseline, on a plainly green field. `outside` is measured outside the
BOX, so it shrinks toward zero as the box grows to fill the frame. All three flatter a big box.
`far_mean` (`farglobal.py`) anchors to the OBJECT instead — mean |diff| across the whole image
excluding the object bbox +150px — and cannot be improved by growing the box:

| plate | | base | g064 | g096 | g192 | s096 | f096 |
|---|---|---|---|---|---|---|---|
| sun | edge / far | 30.84 / **0.154** | 11.10 / 1.112 | 10.39 / 2.500 | **0.40** / 3.219 | 11.18 / 0.227 | 10.44 / 0.138 |
| overcast | edge / far | 12.82 / **0.223** | 6.43 / 0.784 | 6.31 / 1.739 | **1.13** / 3.636 | 7.00 / 0.137 | 6.64 / 0.157 |
| anime | edge / far | 9.33 / **0.248** | 3.27 / 0.467 | 2.48 / 1.057 | **0.86** / 2.680 | 3.12 / 0.081 | 3.02 / 0.159 |

`g192` is the only config that clears the invisibility bar of 2 — and it does so while moving
**21× more of the photograph** than baseline. That is the generous-box failure from § "Box size is
the whole control" made gradual. It is not a fix, and its low `edge_step` must not be quoted as one.

**The feather mechanism is real, though** — it is the trade that is fatal, not the mechanism. A
hard-mask control at the identical grown box (`g096hard`) scores 14.44 / 12.50 / 13.87 against
`g096`'s 10.39 / 6.31 / 2.48, so the ramp itself is worth 1.4–5.6×. Best edge-per-unit-photo-moved
is `s096` (tight +12% core, grown 96, feathered 96): worst edge 11.18 / 7.00 / 3.12 at `far_mean`
0.227 / 0.137 / 0.081, i.e. base-level quiet. Still not under 2.

**Conclusion: this route cannot reach the bar by tuning.** Reaching it needs the change RESTORED
where the model only shifted tone — a real change mask compositing decoded over the original crop,
which is what the deleted ~25-node tail did. That is a structural decision for Fabio, not a knob.

**Two traps this cost, both of which return a confident wrong answer with no error:**

- **An out-of-range widget is not an error.** `mask_blend_pixels: 96` (max 64) and
  `GrowMaskWithBlur.blur_radius: 128` (max 100) both yield `status_str: "success"`, ~0.2–2s, and
  the sampler branch never runs. The only outputs are the preview temps from
  `MpiLoadImageFromPath` (it is an `OUTPUT_NODE`), so a runner that takes `files[-1]` picks up a
  temp path from `<comfy>/temp` and dies somewhere unrelated. Assert your own `SaveImage` prefix
  produced a file.
- **A blank box cannot isolate the seam.** Inpainting an object-free box to measure the edge on
  all four sides fails: with `denoise: 1.0` and a prompt that says "place the object into the
  scene", the model INVENTS content in the empty box (anime bottom edge 32.32). And place that
  box carelessly and it overlaps the object — the first attempt put the grown box 47px into the
  object's head, which read as "the feather made the bottom edge worse" and was nothing of the
  kind. `blankbox.py` now asserts against both.

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
