# Place — the composite that inverts the stack (MPI-454)

Stamp an image onto the selected entry: drag it to size and angle over the entry, and its
**own alpha** is the cut. Split out of [composite.md](composite.md) at its 200-line cap —
that doc keeps the shared operation, the layer stack and the two hole-cutting front ends.
Read before touching `MpiToolOptionsPlace` or `CompositeManager`'s `placeImage` half.
Related: [masking-tools.md](masking-tools.md) (the taxonomy and the preview contract this
obeys) · [masking-shapes.md](masking-shapes.md) (the gizmo it borrows) ·
[painting.md](painting.md) (the Apply route it shares).

## It is the OPPOSITE STACK, and that is the whole tool

`maskComp` / `paintComp` put the selected entry **on top** and the slot image
**underneath**, and you cut a hole through the top to reveal it. That is right when the two
images share a frame — a background swap, a region replacement.

It is wrong for placing a cut-out object. There the slot image goes **on top**, at its own
size, at a position the user chooses, and its own alpha is the cut — no hole, no mask,
nothing to brush. Same group, same slot, same Apply-makes-one-entry contract; inverted
stack and a gizmo instead of a brush.

The product reason: cut an object out of any image (Remove Background), place it into an
already-generated one, Apply, **then** mask and detail it so it blends. That last step is
why Place is last in the Composite group — and why the group dropping the PromptBox is
right rather than awkward. The box comes back when the user leaves for the Mask tools,
which is exactly the next move.

## What it is made of — almost nothing new

| Piece | Owner | Why not new |
|---|---|---|
| Geometry, handles, drag | `ShapeManager`, armed `setShapeMode('place')` | a placed image **is** a rotated rectangle with a texture |
| The image + its draw + its rasterise | `CompositeManager` | `reset()` is already the preview contract's ONE seam |
| Apply | `POST /project/apply-paint` → `compositeOverlay()` | an RGBA plane carrying its own alpha is exactly what that route takes |

**The gizmo is a third DESTINATION, not a third manager.** `shapeMode` was already
`'mask' | 'paint'`; `'place'` joins it, and Shift's aspect lock, ALT-rotate about a handle,
the 7.5° rotation snap, the shape-local hit testing and CropManager's handle set all come
for free. The alternative — a sibling manager reusing the handle module — would have been
two gizmos to keep in agreement, and [masking-shapes.md](masking-shapes.md) exists because
keeping one honest was already work.

Two consequences that must stay wired:

- **`setMode('place')` forces `kind = 'rect'`.** `kind` is shared with the shape tools, so
  arming Place after drawing an ellipse would draw an ellipse outline round a rectangular
  image. Forced inside the manager rather than at the call site, because every caller would
  otherwise have to remember. The shape tools re-set their own kind from project settings on
  mount, so nothing of theirs is lost.
- **`commitShape()` REFUSES `'place'`.** Place owns no layer — its commit is Apply, which
  writes a new entry server-side. Falling through would rasterise the rectangle into the
  **mask**, silently. `tests/mask-tool-registry.test.cjs` holds both.

## There is no place LAYER, and that is deliberate

The cut is scratch pixels because a brush builds it up stroke by stroke. A placement is
four numbers and an image, so it is re-drawn from scratch every frame for the cost of one
`drawImage` — `CompositeManager.drawPlaced()`, straight onto the image-sized overlay canvas
in `_renderOverlay()`, under the mask and under the gizmo handles, which is the stacking the
user is judging.

**The obvious build was to rasterise into the paint layer, and it is wrong twice.**
`docs/composite.md` § The layer stack already rules out the first half: the paint layer
**persists per entry**, so a placement would eat a paint layer the user made for something
else. The second half is quieter — `PAINT_MAX_EDGE` is 4096, so going through that layer
would cap the placement at 4096 whatever the base is. Rasterising only at Apply, straight at
the base entry's own pixel size, has neither problem.

**Known ceiling, written down rather than discovered later:** `PLACE_MAX_EDGE` is 8192, and
`compositeOverlay` stretches the overlay to the base with `fit: 'fill'`, so a base above
8192px resamples the object up from an 8192-wide plane. Affordable at that size for the same
reason a paint layer is: the plane is mostly transparent and PNG collapses transparent runs
to near nothing. The upgrade path if anyone reaches it is to send the placement **rect** and
let Sharp `composite` the source at its own resolution with `left`/`top` — a route change
this card deliberately did not make.

## Three gestures, three ORIGINS

| Gesture | Origin |
|---|---|
| Drop an image file on the History workspace | outside the app |
| Click the empty slot → `MpiMediaPicker` | project media, and the filesystem via its upload card |
| Right-click → Paste | the `_compositeImage` buffer `Send to Composite` seeds |

**This widens the standing slot rule on purpose** — see [composite.md](composite.md) § One
slot. `Copy image` was killed as a *redundant second gesture for the same origin*; these are
different origins, and `MpiMediaPicker` was itself settled with the user (2026-08-16) as
*the* single entry point for filling a slot, its upload card the first cell of the grid.
`MpiMediaSlot` stays dumb: it gained one optional `onEmptyClick` prop that outranks its
paste shortcut, and the panel owns what opens.

**The drop is MPI-377, absorbed.** That card proposed turning the dropped file into a
history entry, and the user rejected it: an imported photo is not a generation, so it
pollutes the group history. `uploadMediaFile` already returns a project-file URL the canvas
can load, so the slot never needed an entry — the entry is written at **Apply**, where it is
a composite and a legitimate history artifact.

Two halves of the drop that must not be collapsed into one branch:

- **Image groups** → first file fills the slot and arms `placeComp`. A multi-file drop
  toasts the rest as ignored; a slot holds one media, but a file that vanishes on drop reads
  as a broken app.
- **Video groups** → today's PromptBox chip path, untouched. Dropping a start/end frame is
  how a user unlocks the frame-driven i2v ops with no media staged.

**A drop while Place is ALREADY open does not remount the panel** —
`MpiHistoryTools._activate()` returns early on an unchanged mode — so the panel exposes
`el.setSlotImage()` and the Block picks the branch. Without it the second drop of a session
lands nowhere, which is MPI-377's own bug one layer down.

## Remove Background is a TOGGLE, and it commits nothing

It runs the existing `removeBackground` universal op (BiRefNet, an `engineAsset` that
installs with the engine, no download gate) on the **slot image**.

**Not a forced step on ingest** (user, 2026-08-21): it is a dispatch, so auto-running it
would make every drop pay a queue round-trip — and the cases that want the background
(filling a monitor screen, swapping a painting on a wall, a cut-out that arrived already
cut out) would pay it for nothing with no way back.

**`_runImageTool` cannot be reused.** It means *"run an image op on the CURRENT ENTRY and
append the result"* — it hardwires `_group.history[_currentIdx]` and dispatches
`scope: 'groupHistory'` with `existingGroup`. Place needs the opposite of both halves, so
`_cutOutSlotImage()` is a sibling function, not a flag. Parameterising a shared primitive
would force a re-check of every existing consumer against a path none of them wants.

**`deferCommit: true` is what withholds the result** — MPI-306's HOLD-UNTIL-APPLY, and Place
is its first live consumer. The media and its sidecar land on disk with a real project-file
URL, and only the project *record* is withheld, so no gallery card and no history entry
appears. It is honoured **only in the gallery branch**, which is selected by the ABSENCE of
`existingGroup`; passing one commits the cut-out with no error anywhere. The orphaned file is
the existing `.preview-assets` + Cleanup GC path's job (MPI-277/227).

Three behaviours the toggle owes the user, all guarded by the panel holding both versions:

- **Off is free.** The original pixels are held in the panel, so going back is never a second
  dispatch.
- **A second on is free too** — the cut-out is cached for the life of that slot value.
- **A new slot image resets it.** A new image is a new object, so the cached cut-out is not
  its, and re-running BiRefNet because a checkbox was left on is a dispatch nobody asked for.
- **A failure says so and puts the switch back.** A toggle that silently stays on over
  unchanged pixels would have the user Apply believing the background was gone.

`setPlaceImage(url, { reseed })` exists for this: the toggle passes `reseed: false`, because
it swaps the pixels of the *same* object for a cut-out of identical dimensions, and
re-centring there would throw the user's placement away as a side effect of a checkbox.

## Apply, and what undo means here

Apply rasterises the placement into a full-frame RGBA plane at the entry's own resolution and
posts it to `/project/apply-paint` — the **same** route and the same `compositeOverlay()` the
Paint tool's Apply uses, because it is the same operation: an RGBA plane carrying its own
alpha, blended onto the entry by Sharp, one new entry, both sources untouched. The viewer's
`_flattenOverlay()` is that one round trip with two callers.

The route gained **one optional field**, `operation` (allowlisted `paint | composite`,
defaulting to `paint`). It names the sidecar's operation *and* the filename prefix, so a
placement is not filed as `paint_007`. Provenance is what the `.meta` sidecar is for.

**Undo is the paint-Apply contract, not a new stack.** The gizmo's transform is not layer
pixels, so there is nothing for `UndoStack` to hold — exactly as the shape gizmo's drag is
not undoable either. What is undoable is the *result*: Apply appends a new entry and the
source keeps everything it had, so a placement is undone by deleting that entry. Giving Place
a transform history the shape gizmo does not have would make the app's two gizmos behave
differently, which is the one thing sharing the manager is meant to prevent.

## The contracts it obeys

- **The whole placement is a preview.** `discardPreview()` already calls `resetComposite()`
  and `clearShape()`, and Place is made of exactly those two — so it extends the seam without
  touching it, which is what [masking-tools.md](masking-tools.md) § The preview contract
  requires. `CompositeManager.reset()` drops `placeImage`; missing that would leave the
  stamped image drawn over the next tool's entry.
- **`placeComp` is registered like any other canvas tool** — `_COMPOSITE_TOOLS`,
  `TOOL_OPTIONS_REGISTRY`, `TOOL_LABELS`, the rail group. It is in `_isCanvasTool` and out of
  `_modeKeepsPromptBox`, like its two siblings.
- **It enters `composite` mode and immediately disarms the cut brush**
  (`setCompositeEnabled(false)`). Composite is a canvas MODE because it needs brush
  ownership; Place has no brush, and without this a drag that misses a handle would cut a
  hole while the brush ring followed the cursor. Asserted on mount, never restored on
  destroy — the discipline `MpiMaskStrip` already follows for the other two front ends.
- **Apply is dead-gated, not silent.** An empty slot renders Apply disabled with the reason
  on the hint line, which doubles as the error surface for a slot the canvas could not load
  and for a failed background removal.
