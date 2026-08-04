# MPI-375 — Paint tool (History workspace, image mode)

## Why

Two payoffs, both the user's:

1. **Scribble, then mask, then detail.** Rough in a shape with colour, mask it, run the
   detail op over it. Detail above ~0.50 denoise behaves like inpaint (see MPI-367), so
   a painted blob plus a prompt is a real instruction, not a doodle.
2. **Shape reference for the models.** The prompt says *what*; the paint says *where,
   what size, what colour*. Cheapest possible control signal, no extra model.

## Scope — deliberately small

- brush
- eraser, with the opacity slider we already ship for masking
- colour picker
- Clear paint
- Apply paint

Nothing else. No layers, no blend modes, no pressure curves.

## What already exists vs what is new

**Exists** — MPI-371 extracted `MpiMaskStrip`: the brush/eraser pair, size, opacity, as
a mountable strip shared by the mask tools. Mount it; do not author a second strip.

**New** — a colour layer. `MaskManager` layers are binary alpha (`manualCanvas`,
`subtractCanvas`, `autoPickMasks`, `selectedAutoPicks`) and are consumed as a mask.
Paint needs its own RGBA layer composited over the image, kept strictly independent of
the mask layers — the headline use case is *painting first and masking the paint
afterwards*, so a shared layer would defeat the feature.

Suggested shape: `PaintManager` beside `MaskManager` under
`js/components/Primitives/MpiCanvas/managers/`, same ownership pattern, same
per-entry lifecycle as masks (`hasMaskForEntry` / `getMaskDataURLForEntry` have obvious
paint twins on `MpiCanvasViewer`).

## Apply

Do not read a 4K canvas back as base64. MPI-362 already set the precedent: post the
paint layer plus the source path, let Sharp flatten server-side, append one new history
entry with the returned file. Either extend `/project/composite-media` or add a sibling
route — check whether composite's base/overlay/mask signature already covers
"flatten this RGBA layer over this image" before adding a route.

## Blast radius

- new `MpiToolOptionsPaint` — CSS in `js/shell/preloadStyles.js`, props in
  `js/components/types.js`
- `MpiHistoryTools.js` — rail entry (image mode only)
- `MpiCanvas.js` + new `PaintManager.js`
- `MpiCanvasViewer.js` — per-entry load/clear/publish plumbing
- server route for the flatten
- docs: `docs/masking.md` gains a neighbour, or a new `docs/painting.md`

## Sequencing

Ships with MPI-376 (undo). A paint tool with no undo is a demo, not a tool — one bad
stroke and the only recovery is Clear paint.
