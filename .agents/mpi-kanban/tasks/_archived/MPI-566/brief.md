# MPI-566 — Fill Holes on the PAINT layer

## The gap

Adjust is registered under both `maskAdjust` and `paintAdjust`, and the `DEST` table in
`MpiToolOptionsMaskAdjust.js` marks `fillHoles` **mask-only**, on the reasoning that "an enclosed
hole is a coverage idea". That reasoning was wrong for the layer that ships the **outline tool**:
the paint layer's shape is its alpha (MPI-436/MPI-440), so an enclosed transparent region is exactly
as well defined there as it is on the mask — and drawing a closed outline and filling it is the
whole point of having an outline.

Reported by the user 2026-08-14 with a screenshot: a green outline traced around a face in Paint
Adjust, and no way to fill it.

## What ships

1. `managers/holeFlood.js` — the flood, extracted **pure** (typed array in, typed array out) so both
   layers call one implementation. `MaskManager.fillHoles()` was the only copy; leaving it there and
   writing a second one in `PaintManager` is the shared-primitive regression the root-cause rule
   bans, and the module mirrors `distanceField.js`, which is already one module with two
   destinations.
2. `PaintManager.fillHoles()` — same layer-wide one-shot discipline as `applyAdjust()`
   (`_recordUndo()` after the no-op guard), filling the enclosed region **flat in the current paint
   colour with the original drawn back on top** — byte-for-byte the composite Adjust's *grow* row
   already uses, so the fill is the only flat part and every existing stroke keeps its own colour
   and alpha.
3. `MpiCanvas.fillPaintHoles()` + the API whitelist entry. No `onMaskStrokeEnd`: an adjustment to
   paint is not a mask change (the rule `applyPaintAdjust` already follows).
4. `DEST.paintAdjust.fillHoles = true` and the click routed through a per-destination `fill` fn, so
   the component still has no `if (isPaint)` in `setup()`.

## Boxed to the ink

The flood is bounded to the ink's bounding box padded by 1 and seeded from **that** border. Sound
because the box holds every non-zero-alpha pixel, so everything outside it is transparent and
connected to the box's own transparent ring — the seeds are equivalent to the canvas border. Not a
micro-optimisation: the paint layer runs at 4096², where the full-canvas version is 16.7M pixels and
~170 MB of transient typed arrays per press, and MPI-445 already measured a full-canvas pass on this
exact layer as a freeze. The mask path gets the same reduction for free.

The pad must not be dropped: an unpadded box whose edge is ink seeds nothing, every interior region
reads as enclosed, and Fill floods the whole layer.

## Verify

- `tests/mask-hole-flood.test.cjs` — pure geometry: a ring's hole fills, a notch cut to the border
  does not, a solid shape returns null, the antialiased rim leaves no partial-alpha seam, and the
  boxed flood is **identical** to a full-canvas one.
- `tests/paint-adjust.test.cjs` — the undo-ordering and no-op guards on `PaintManager.fillHoles()`.
- Human: draw a closed outline in Paint Adjust, press Fill, confirm the interior fills in the picker
  colour and Ctrl+Z restores the outline in one step.
