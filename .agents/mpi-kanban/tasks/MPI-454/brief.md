# MPI-454 — Composite Place: a transform gizmo for the pasted image

**Blocked by MPI-377.** Read [docs/composite.md](../../../../docs/composite.md) and
[docs/masking-shapes.md](../../../../docs/masking-shapes.md) before planning this.

## What the user asked for

> A gizmo with handles like the other gizmos. It moves the image that is in the composite
> window so the user can scale and place it anywhere, then composites that image on top of
> the current entry, creating a new image from the two. So the user can add an object from
> another generation, or a photograph, onto a portion of an existing image. We already have
> Remove Background, so the user can grab any object from the internet, cut it out, send it
> to composite, place it in an already-generated image, create an image from that, and then
> detail it so it matches and blends.

## It is the OPPOSITE STACK of the composite we shipped

`maskComp` / `paintComp` (MPI-373) put the selected entry **on top** and the slot image
**underneath**, and you cut a hole through the top to reveal it. That is the right model when
the two images share a frame — a background swap, a region replacement.

It is the wrong model for placing a cut-out object. There the slot image goes **on top**, at
its own size, at a position the user chooses, and its **own alpha** is the cut — no hole, no
mask, nothing to brush. Same subsystem, same slot, same Apply-makes-one-entry contract;
inverted stack and a gizmo instead of a brush.

Name it `placeComp` and add it to `_COMPOSITE_TOOLS` alongside the other two.

## Why MPI-377 blocks it

The headline flow is *grab an object from the internet → Remove Background → place it*. Step
one is dragging a downloaded file into the History workspace, and today that drop silently
becomes a **prompt chip** — no entry, no project-file URL. `MpiMediaSlot` needs a URL the
canvas can load (docs/composite.md § One slot), and Remove Background needs an entry to run
on. MPI-377 is what makes the dropped file a real entry. Without it the user can only place
images that came out of the app's own generations, which is half the feature.

## The lazy build — do not invent a new server route

`POST /project/apply-paint` → `compositeOverlay()` in `services/imageComposite.js` already
does the server half: an RGBA buffer carrying its own alpha, stretched to the base's pixel
size, flattened onto it, one new entry. If the tool **rasterises the transformed image into a
full-frame RGBA scratch layer client-side** — exactly what the paint layer is — the transform
never has to cross the wire and the server needs no change at all.

Known ceiling of that shortcut, write it into the plan rather than discovering it later: the
paint layer caps at `PAINT_MAX_EDGE` 4096 and `compositeOverlay` resizes with `fit: 'fill'`,
so a small object placed on an 8K base is resampled up from a 4096-wide plane and loses
detail. The upgrade path if that shows: pass the placement rect to the server and have Sharp
`composite` the source at its own resolution with `left`/`top`.

**Do not reuse `paintCanvas` itself.** docs/composite.md § The layer stack is explicit — the
paint layer **persists per entry**, so a placement would eat a paint layer the user made for
something else. The cut gets its own scratch layer for exactly this reason; a placement gets
one too, dropped by `discardPreview()` / `resetComposite()` on the one seam.

## Gizmo — import, do not fork

`ShapeManager` already imports `CropManager`'s 8 handles + `body`, its hit radius, its
fixed-screen-size drawing and `getCursor()`, and adds rotation and inverse-rotated hit
testing (docs/masking-shapes.md). A placed image is a **rotated rectangle with a texture** —
the same geometry ShapeManager's rect kind already has. The open question for planning is
whether this is a third `ShapeManager` kind or a small sibling manager that reuses the handle
module; decide it by reading `ShapeManager.js`, not from this card.

`shapeMode` is a FLAG, but `composite` is a canvas MODE — `CANVAS_MODES` in `MpiCanvasViewer`
**and** `_viewerModeFor()` in the Block, both, or the tool ships dead (docs/composite.md,
MPI-375's bug).

## Open questions for the plan session

1. **Multiple objects per Apply, or one at a time?** One is the lazy answer and Apply is cheap
   to repeat. Do not build a layer list unless the user asks for it.
2. **Does the placed image keep a soft edge?** `compositeThroughMask` feathers; `compositeOverlay`
   does not, it takes the alpha as given. A cut-out from Remove Background usually wants a
   1–2px feather to not read as a sticker — check what BiRefNet's alpha already gives.
3. **Where does the second image come from besides the slot?** The slot is seeded by right-click
   → *Send to Composite*. Keep that as the ONE origin (the doc records `Copy image` being
   removed for being a second one).
4. **Does the toolbar group need a name change?** Three tools in the Composite group, two of
   them hole-cutters and one a placer.
