# MPI-424 - Canvas tool family umbrella

Six open cards, one surface (`MpiCanvasViewer` + the `MpiMaskStrip` rail from MPI-381).
This card owns their ORDER and nothing else.

## Step 0 - brainstorm MPI-379 with the user (IN DOING NOW)

MPI-379 is first because it is the only one of the six whose outcome REWRITES the
others, and because the user says the real feature is much simpler than the card.

The card as written carries three rounds of parked options and that is the defect
being fixed. What the session must settle:

1. **The user's own model of the feature, in their words, stated first.** Everything
   below is checked against it - not the other way round.
2. **Box or blob on hover.** The card's own strong candidate is a rectangle: a blobby
   native-segm mask under the cursor reads as poor output quality even though the
   committed mask would be crisp. Box also DELETES the per-pixel index map, and may
   delete the -seg model requirement with it.
3. **Does Part 2 (COCO YOLO) survive at all?** It costs an R2 upload, the segm-vs-bbox
   folder trap and its own coarse-mask quality problem. The card already records that
   SAM3 named buttons may cover every flow the user actually performs, with a generic
   "Objects" bucket as the only real gap (SAM3 is ~3.6s per category vs YOLO 0.5s for
   all 80, so buckets do not rescue SAM3).
4. **Thumb strip and Detect button - really dropped?** On Detect AND on Points.
5. **Auto-fire on model/mode change plus a debounce.** Decide this WITH MPI-421 in
   view: auto-fire multiplies dispatches, which is the exact cost MPI-421 exists to
   remove.
6. **Where the instant green on click comes from** - coarse mask kept but never shown,
   or the box rectangle filled and upgraded when the real mask lands.

Session rule: whatever the user rules out is **deleted** from MPI-379, not parked.

## Order, and why it is this order

| # | Card | Why here |
|---|------|----------|
| 1 | **MPI-379** hover-to-select | Brainstorm first. It may drop the thumb strip and the Detect button and make detection fire automatically - every card below inherits that surface. |
| 2 | **MPI-421** run cost + feedback | Directly downstream of 379's auto-fire decision. Cache per-object masks, then put the runs that survive in the generation lane with progress and a Stop. Its scope is not final until 379 lands. |
| 3 | **MPI-382** mask strip control pack | Grow/shrink, edge bands, alpha brushes. Do it BEFORE new tools so the tools added after inherit a finished strip instead of needing a retrofit pass. |
| 4 | **MPI-368** shape masking | Cheapest new tool - pure geometry, no model, no download, no ComfyUI round trip. A rail registry addition after the MPI-381 split, and it exercises the finished strip. |
| 5 | **MPI-375** paint tool | Needs the strip (brush/eraser/opacity) and the MPI-376 undo stack, both shipped by now. Introduces the RGBA paint layer, which is the new machinery. |
| 6 | **MPI-373** live composite | Last on purpose: its erase-to-reveal layer IS the paint layer MPI-375 introduces. Built after 375, this card is a two-image live preview plus the existing full-res server route - not new layer code. |

## Standing constraints for every card in this set

- Mask and paint layer mutations are UNDOABLE - record an `UndoStack` entry before
  mutating (`docs/masking-undo.md`). An unwired mutation is a silent hole in Ctrl+Z.
- Layer ORDER rule from MPI-371 holds: auto picks union last, so nothing baked into
  manual may resurrect an erased region.
- New rail tools register in `_MASK_TOOLS` and `TOOL_OPTIONS_REGISTRY` - the MPI-381
  guard test fails if one is missing from either.
- `docs/masking.md` is capped at 200 lines: trim before adding.

## Re-check point

After MPI-379 ships, re-read this order. 379 is allowed to shrink or delete parts of
MPI-421, and a shrunken 421 may fold into it entirely.
