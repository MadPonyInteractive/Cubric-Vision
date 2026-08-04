# MPI-439 — validation

Built 2026-08-04. Both directions live on the image canvas's right-click menu. Verified by pixel
probe in Chromium, as the card required — not a DOM click. Awaiting the user's in-app pass.

## What shipped

- `js/utils/maskUtils.js` — `alphaStencil(src, color, alphaT = 128)`. ONE cut for both directions:
  alpha at ≥128 becomes flat colour, everything else transparent. The channel is not re-decided
  here; MPI-436 settled it for the whole MPI-440 set.
- `PaintManager.fillFromMask(maskCanvas)` — stencil cut at the MASK's resolution, then scaled up
  into the 4096 paint layer, so the edge is resampled rather than 2.7px stair-steps.
- `MaskManager.fillFromPaint(paintCanvas)` — paint downscaled to 1536 FIRST and cut after (2.4M px
  instead of 16.7M), into `manualCanvas`, with the same region punched out of `subtractCanvas`.
- `MpiCanvas.maskToPaint()` / `paintToMask()` (+ both in the `_methods` allowlist),
  `el.maskToPaint()` / `el.paintToMask()` on the viewer, two items in the image context menu.

## The four decisions, and where they came from

1. **Colour: the CURRENT paint colour, FLAT** — user, 2026-08-04. Carrying the mask's own alpha so
   a soft mask edge became a soft paint edge was offered and declined.
2. **A COPY, and therefore a MERGE** — user, same call. The source layer survives, the destination
   keeps what it had, so a mis-click costs one Ctrl+Z.
3. **Alpha at ≥128, not luminance** — inherited from MPI-436, not re-opened. Proved below on a
   `#101010` scribble, which luminance would read as background.
4. **Only paint → mask publishes** (`onMaskStrokeEnd`). It changes what the op strip gates on;
   mask → paint does not, and publishing there would claim a mask change that never happened —
   the line MPI-436 already drew for paint Adjust.

## Proven in Chromium — real pixels, both undo paths

`mask → paint`: the mask's area reads `[255,0,0,255]` (the current colour, flat, full alpha);
pre-existing blue paint elsewhere is untouched; outside both is transparent; the mask itself is
unchanged. Ctrl+Z restores the paint layer to exactly its pre-conversion ink and the old blue
survives it.

`paint → mask`: the paint's area is white in BOTH `maskCanvas` and `manualCanvas` — the stored
layer, not the derived one; a pre-existing mask elsewhere survives; the paint layer is unchanged.
Ctrl+Z + `refresh()` restores the mask exactly, old mask included. The source scribble was
`#101010`, so this is also the luminance-vs-alpha proof.

**The guards:** converting an EMPTY layer returns `false` in both directions and the undo stack is
still empty afterwards (`canUndo() === false`) — the dead-entry bug the card names. A wash at alpha
~99 over the whole layer also converts to nothing: sub-threshold ink is not a shape.

`npm test` green — **429/429**, including the new `tests/layer-convert.test.cjs` (6 cases: undo
after the guard in both directions, the stored-layer + subtract-mirror rule, publish on one side
only, the `_methods` allowlist and viewer surface, the menu's per-layer gating with the two
existing items intact, and one stencil helper cutting alpha). `eslint` clean on all six changed
files.

## Still to confirm in the app

Right-click the image canvas: both items appear next to Clear mask / Send to Composite, each
greyed with its reason when its source layer is empty. Convert a mask with a detection you have
NOT pressed Add on — it must stay disabled (MPI-426's meaning of `hasMask()`).
