# MPI-424 - Canvas tool family umbrella

Five open cards, one surface (`MpiCanvasViewer` + the `MpiMaskStrip` rail from
MPI-381). This card owns their ORDER and nothing else.

## MPI-379 REJECTED 2026-08-01 - outcome of the session this umbrella scheduled

The whole card is dropped, not trimmed - including Part 1, the cheap half with no
download. User's decision: what ships today is fine, and moving selection onto the
canvas is another layer of complexity that does not need to exist. **The thumb strip
stays. The Detect button stays.** Part 2 (COCO YOLO, its R2 upload, the segm-folder
trap) dies with it. Closed `done` / `rejected`, kept as the record - its live
measurements are still true and worth reading before anyone re-proposes canvas-side
selection.

**Consequence:** MPI-421 is no longer downstream of anything. It was second because
379 might have auto-fired detection; with the chip strip and Detect button staying,
421 is exactly what it says - cache the per-object masks so chip toggling stops
re-dispatching the whole graph, and put the runs that remain in the generation lane
with progress and a Stop.

## Order, and why it is this order

| # | Card | Why here |
|---|------|----------|
| 1 | **MPI-382** mask strip control pack | IN DOING - the user picked it up 2026-08-01 and named both halves unprompted. Grow/shrink and the two-slider edge band are the SAME primitive (an edge band is dilate minus erode), so they are written once. It also lands before the new tools, so those inherit a finished strip instead of needing a retrofit pass. |
| 2 | **MPI-421** auto-mask run cost + feedback | Independent now. Every chip toggle re-dispatches the full graph; cache per-object masks client-side, then give the surviving runs a lane, a progress signal and a Stop. |
| 3 | **MPI-368** shape masking | Cheapest new tool - pure geometry, no model, no download, no ComfyUI round trip. A rail registry addition after the MPI-381 split, and it exercises the finished strip. |
| 4 | **MPI-375** paint tool | Needs the strip (brush/eraser/opacity) and the MPI-376 undo stack, both shipped. Introduces the RGBA paint layer, which is the new machinery. |
| 5 | **MPI-373** live composite | Last on purpose: its erase-to-reveal layer IS the paint layer MPI-375 introduces. Built after 375, this card is a two-image live preview plus the existing full-res server route - not new layer code. |

## Standing constraints for every card in this set

- Mask and paint layer mutations are UNDOABLE - record an `UndoStack` entry before
  mutating (`docs/masking-undo.md`). An unwired mutation is a silent hole in Ctrl+Z.
- Layer ORDER rule from MPI-371 holds: auto picks union last, so nothing baked into
  manual may resurrect an erased region.
- New rail tools register in `_MASK_TOOLS` and `TOOL_OPTIONS_REGISTRY` - the MPI-381
  guard test fails if one is missing from either.
- `docs/masking.md` is capped at 200 lines: trim before adding.
