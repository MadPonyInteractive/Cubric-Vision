# The shape gizmo — one geometry, three destinations (MPI-368)

Rectangle / triangle / ellipse dropped straight onto the canvas and committed into either the
binary mask layers or the RGBA paint layer. Pure geometry: no model, no ComfyUI round trip, no
download. Read before touching
`js/components/Primitives/MpiCanvas/managers/ShapeManager.js` or
`MpiToolOptionsShapes`. Split out of [masking-tools.md](masking-tools.md) at its 200-line cap,
the same way [masking-sam3.md](masking-sam3.md) was. Related:
[masking-tools.md](masking-tools.md) (the taxonomy and the preview contract this obeys) ·
[painting.md](painting.md) (the second destination) ·
[masking-undo.md](masking-undo.md) (the entry every commit records).

## Two mounts, one gizmo

`ShapeManager` owns geometry and hit-testing and **knows nothing about either layer**. The commit
belongs to whichever manager owns the destination — `MaskManager.commitShape()` or
`PaintManager.commitShape()` — and both take a path **BUILDER**, `(scale) => Path2D|null`, so each
applies its own `_scale`. That is not ceremony: the mask works at `MASK_MAX_EDGE` 1536 and the
paint layer at `PAINT_MAX_EDGE` 4096, so a path built for one is silently offset in the other.

| | Mask mount (`maskShapes`) | Paint mount (`paintShapes`) |
|---|---|---|
| Family set | `_MASK_TOOLS` | `_PAINT_TOOLS` |
| Commit buttons | **Add** / **Subtract** | **Fill** / **Erase** |
| Writes | white into `manualCanvas`, `destination-out` from `subtractCanvas` (`bakeAutoPicksInto`'s twin write) | `paint.color` into `paintCanvas`, or `destination-out` |
| Publishes | `onMaskStrokeEnd` — a shape IS a mask change, or the op strip never unlocks | nothing |

The vocabulary differs on purpose (user, 2026-08-04): "subtract" already names a mask LAYER, so
reusing it for colour would make one word mean two things. **One panel component** is registered
under both modes and reads `props.mode` — `mountOptions()` passes `mode` into every options
compound for exactly this. An unknown mode **throws**; falling back to `'mask'` would rasterise
into the wrong layer while the rail still looked right.

## Armed like `pointsMode`, not as a canvas mode

`shapeMode` (`null | 'mask' | 'paint' | 'place'`) is a FLAG inside the canvas' existing `'mask'` /
`'paint'` / `'composite'` mode. Adding a fourth `activeMode` would have meant re-deciding brush
ownership, the undo gate, the opacity slider and the paint layer's render pass; points mode
already showed that a brushless sub-behaviour does not need one. So `CANVAS_MODES` and
`_enterMode` are untouched by this card, and `shapeMode` decides one thing only: where a commit
lands.

Both panels mount `MpiMaskStrip` with `brush: false`, which also calls the destination's
`setEnabled(false)` — without it a drag off the gizmo would paint instead of panning.

**A THIRD destination joined in MPI-454 and it owns no layer.** `'place'` says *"this rectangle
is where the placed image goes"*; its commit is Place's own Apply, which writes a new history
entry server-side, so `MpiCanvas.commitShape()` **refuses** it rather than falling through to the
mask. Two more consequences live there rather than here —
[composite-place.md](composite-place.md) § What it is made of: `setMode('place')` forces
`kind = 'rect'` because `kind` is shared with these two mounts, and `seed(aspect)` opens the
gizmo at the placed image's own proportions instead of a square.

## Handles, and why hit-testing runs in shape-local space

`CropManager`'s handle system is **imported, not forked**: the same 8 keys plus `body`, the same
`HANDLE_HIT_RADIUS / scale` hit box (constant on screen, so it grows in image px as you zoom out),
the same fixed-screen-size drawing, and `getCursor()` itself. What is new is rotation and the
triangle/ellipse geometry.

Every hit test inverse-rotates the cursor about the centre and then runs CropManager's
axis-aligned test. **One test therefore serves all three kinds AND rotation.** Corners are
checked before edges, so a zoomed-out hit box covering both resolves to the corner — the more
useful grab. `body` is the local bounding box for all three kinds: a triangle's corner gap is not
worth a barycentric test.

- **Drag a handle** — resize along that handle's own axis, in shape-local space, with the
  opposite edge anchored. The min-size floor pushes back the MOVED edge, never the anchor.
- **SHIFT** — resize without deforming. The ratio locked is the one the shape **HAS**, not 1:1
  (user, 2026-08-04): stretch it first and Shift scales that stretched shape as it is. The
  grabbed handle drives its own axis and the other follows, so a top-edge drag widens the shape
  too — and an axis the handle does not touch stays CENTRED, or the shape would slide sideways
  while growing. The min-size floor moves **both** axes together; flooring one alone would break
  the very lock Shift exists to hold.
- **ALT over a handle** — rotate about THAT handle: it stays put and the centre orbits it.
- **ALT over the body** — rotate about the centre.
- **Rotation snaps to 7.5°** (`ROT_SNAP`, user 2026-08-04 — it was free before, which made
  squaring a shape back up by hand impossible). The **absolute** angle is snapped, not the delta,
  so an off-grid shape is pulled back onto the grid rather than carrying its offset forever; and
  the orbit uses the SAME snapped delta, or the pivot handle would slide off the cursor while the
  shape landed on a grid angle.

Both modifiers are read off the mouse event rather than through `hotkeyRegistry` — they are only
consulted while the pointer is moving, which always has an event in hand.

The gizmo draws on **`screenUICanvas`**, beside the crop rect and for the same two reasons
(MPI-383): the shape may hang off the image, which the image-sized overlay canvas cannot show,
and that surface carries no `image-rendering: pixelated`, so handles and hairlines stay crisp.

## The two contracts it obeys

- **The shape SURVIVES its commit** (user, 2026-08-04) — three ellipses is three drags, not three
  re-creations. But an **uncommitted gizmo is a PREVIEW**: `el.discardPreview()` drops it on every
  rail switch, on the ONE seam, never at the call site
  ([masking-tools.md](masking-tools.md) § The preview contract). `clearShape()` reports whether
  there was one, so it is immune to whether the tool is still armed when the discard runs.
- **A commit is a layer-wide ONE SHOT** — `_recordUndo()` **after** the no-op guard, so a commit
  with nothing to draw cannot book an empty entry that eats a Ctrl+Z. Moving a shape around
  records nothing; only the commit changes a pixel.

## Measured against real pixels

Chromium, 2048² source (mask `_scale` 0.75, paint `_scale` 1.0), via the temp-module probe route:

- A **45°-rotated ellipse** fills along its rotated major axis and leaves the UNROTATED axis
  empty — the card's own criterion that rotation is not applied to the axis-aligned bbox.
- **Add → Subtract** of the same shape returns the mask to **0 px at the app's `>= 128` cut**.
- Each commit books **exactly one** undo entry; a zero-area shape books **none** and returns
  `false`; Ctrl+Z after a commit restores the layer.
- Fill lays down the picked colour (`#3366cc` read back exactly) at the PAINT layer's scale, Erase
  punches it out, and neither touches a mask pixel.

**Antialiasing leaves a sub-threshold rim that erasing cannot remove**, and it is a property of
the layer model rather than of this tool: measured after Add → Subtract, 1973 px carry non-zero
alpha but **0 px reach 128** — and the shipped mask BRUSH leaves the same thing (1605 px, 0 at
128) after paint-then-erase over one path. It matters because `MaskManager.getURL()` exports
`a > 0` as solid white while [masking-tools.md](masking-tools.md) § Fill Holes cuts at `>= 128`;
those two thresholds disagree. Nothing here changed that, and it is **not** MPI-368's to fix.
