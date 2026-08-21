# MPI-435 — Alpha brush pack

Ten procedural brush presets for the ONE shared dab path, so the mask brush and the paint
brush get them in a single edit. Card text and constraints: `task.json`. Umbrella: MPI-440.

## What the card asked for, and what it actually costs

`stampDab()` is a bare `ctx.arc()` fill. Ten presets are ten **parameter sets** — no image
assets, no loader, and they resample to any brush size for free, which a fixed-resolution
PNG stamp does not. The card's own instruction is *"parameterises `stampDab` and nothing
else"*, and that holds: the presets live in `brushDab.js`, every manager passes one through,
and no second dab implementation appears anywhere.

## The parameters, and why each one exists

`hardness` · `aspect` · `angle` · `angleJitter` · `density` · `scatter` · `flow` · `spacing`.
Eight, and each is load-bearing for at least one preset — a knob no preset moves is a knob
that should not exist. Sub-dab radius is **derived** (`r / sqrt(density)`) rather than being a
ninth knob: more specks means smaller specks, so total ink stays roughly constant.

## Three traps this card has to clear

1. **The mask brush stamps the SAME dab twice** — `destination-out` into `manual`,
   `source-over` into `subtract` (and the reverse when erasing). Those two layers are exact
   mirrors and `mask = manual AND NOT subtract` depends on it. A `Math.random()` scatter
   would produce a DIFFERENT dab for each of the two calls, leaving residue that no erase can
   ever remove. Jitter is therefore a pure hash of `(x, y, i)` — same dab, same geometry,
   every time, and a repaint of the same stroke is identical.
2. **`_growStrokeBox()` must cover the real painted extent** (the card's own undo note).
   `dabExtent(r, preset)` = `r * (scatter + 1/sqrt(density))`, and it returns exactly `r`
   for the default preset, so nothing about today's undo changes.
3. **Falloff on a non-round dab.** The soft edge is a radial gradient, which is circular; a
   chisel dab is an ellipse. Drawing the dab in a TRANSLATED / ROTATED / SCALED context and
   filling a plain circle makes the gradient inherit the same squash, so hardness and aspect
   compose instead of fighting.

## Where the picker goes

`MpiMaskStrip`, as a row in the `DESTINATIONS` table — the file's own rule is that a
destination is a table row, never a branch in `setup()`. Mask and paint declare a preset
setter; **composite declares `null`** and the row is REMOVED (not `[hidden]` — the MPI-382
lesson this file already carries). A composite cut is a hard cut for the same reason it has
no opacity slider, and `CompositeManager` keeps calling `stampDab` with no preset, which is
byte-for-byte today's hard round.

## Bitmap stamps later

`stampDab` resolves a preset object and fills a path. An authored PNG stamp becomes another
preset that swaps `ctx.fill()` for `ctx.drawImage()` inside the same loop — the scatter,
spacing, flow and extent maths are untouched. Not built now; nothing here walls it off.
