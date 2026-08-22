# Paint gizmo — the user draws, and the drawing is the input

> **PORTABLE.** First needed by Scribble-to-object
> ([../existing-flows/scribble-to-object.md](../existing-flows/scribble-to-object.md)), but it
> applies to any flow whose input is something the user MARKS by hand — a scribble, a
> region hint, a light direction smeared on with a brush.
>
> Its neighbours: [box-gizmo.md](box-gizmo.md) sends four numbers to a node;
> [crop-gizmo.md](crop-gizmo.md) sends a new picture that REPLACES the old one; this one
> sends a new picture that stands BESIDE the old one.

## It is the History paint tool, not a lookalike

`MpiStepPaint` mounts **`PaintManager`** and **`brushDab.js`** — the same RGBA layer and the
same dab/spacing primitive `MpiCanvas` runs in the History workspace
([../../../painting.md](../../../painting.md)). Not a port, not a second brush: the manager needs
only `init(w, h)`, `paint(imgX, imgY)` in image px, and an injected `UndoStack`, so the step
supplies a canvas and a fitted view and gets the whole learned brush free — the ten presets, the
75%-overlap interpolation, the `destination-out` eraser.

**So a change to how a STROKE behaves belongs in `PaintManager` / `brushDab.js`**, where both
surfaces get it. A second dab implementation here is the regression `brushDab.js` exists to
prevent.

`MpiCanvas` itself was NOT reused, for the same reason `crop` did not reuse it: it carries mask
layers, a tool router, per-entry TEMP persistence and an entry lifecycle, none of which a flow
step has.

## 🔴 Undo is part of the contract, not a feature

Every mutation records into an `UndoStack` — the step's own instance, because a flow step has no
entry to switch and nothing else on the canvas to walk back into:

| Mutation | Shape |
|---|---|
| a stroke | `undo.begin(paint.undoLayers())` at pointerdown · `undo.commit(paint.takeStrokeBox())` at pointerup · `undo.abort()` when it painted nothing |
| Clear | `PaintManager.clear()`'s own `_recordUndo()`, after its empty-layer guard |

Adding a mutation without one is a silent hole in Ctrl+Z — read
[../../../masking-undo.md](../../../masking-undo.md) § The contract before touching this
component. `Ctrl+Z` / `Ctrl+Shift+Z` bind on the shared `mask.undo.canvas` /
`mask.redo.canvas` registry ids, so the combination means one thing app-wide; the History
canvas gates its own handlers on `mask.isMaskingMode`, so an open flow cannot double-fire them.

## What it sends: the LAYER ALONE, and never the composite

```
value → { paint: <PNG data URL>, size: {w, h}, color, brushSize, mode }
```

`composePaintLayer` turns that into an **RGBA PNG at `size`** — transparent everywhere the user
did not paint.

**The composite would be a silent, plausible failure.** Scribble-to-object's graph reads this one
file TWICE: its RGB over flat white becomes the ControlNet hint, and its **ALPHA** becomes the
crop rect (`InvertMask` → `MpiMaskSquareBbox`). Hand it a flattened photo and the alpha is the
whole frame, so the crop selects everything and the object renders from a hint that is the entire
picture — no error anywhere. The same trap in a different costume as the session-1 `cutout`
preview whose alpha was ~90% opaque (scribble-to-object.md § Three traps).

### `size` is the SOURCE's size, not the layer's

`PaintManager` caps its layer at `PAINT_MAX_EDGE` **4096**, so on a larger photo the layer is
SMALLER than the source. Coordinates read off the layer's alpha then land the object at the wrong
place and scale — silently, with a result that looks like the model misplaced it. So `size`
carries the source's **natural** dimensions and `composePaintLayer` redraws into them. At or below
4096 the sizes match and the redraw is skipped entirely, so the common case costs one comparison.

## `mediaRole` — the step delivers to a slot that is not its own

`crop` REPLACES the media it operated on: a padded picture supersedes the picture it padded.
`paint` must not — the graph wants the photo **and** the drawing (`Input_Image` *and*
`Input_Paint`). So a step may declare where its derived file lands:

```js
{ kind: 'paint', role: 'image1', mediaRole: 'image2',
  title: 'Draw what you want to add',
  hint:  'Draw it at least ~96px tall. Smaller and the render invents detail.' }
```

`_deriveRunMedia` (`MpiBaseFlow`) replaces when that role already has media and **appends** when
it does not. Omit `mediaRole` and the old behaviour is exactly unchanged. The named role must be
one the op's `mediaInputs` declares, or the file reaches no node — that is the one way to get this
wrong, and it is silent.

Still declaration-only, so a `paint` step stays manifest-expressible: `kind`, `role`, `mediaRole`,
copy. No JS.

## The control row is the gizmo's, not declared `fields`

Same exception the crop gizmo's ratio bar takes, for a different reason. There the option list is
orientation-dynamic; here the controls are **intrinsic** — every paint step in every flow ever
written needs a brush/eraser pair, a colour and an undo, and a manifest author who omitted them
would ship a canvas the user cannot erase on. It is still ONE row and still nothing but
Primitives: `MpiRadioGroup` (icon-only) · `MpiColorPicker` · two `MpiButton`s.

**Brush SIZE is the mouse wheel**, not a slider — the gesture `InputController` already gives the
History brush, so the two surfaces read identically and the row keeps a slot. The ring drawn under
the cursor is what makes it legible, and it is why the canvas sets `cursor: none`: a system arrow
beside the ring reads as two pointers.

No brush-preset picker, no opacity slider. Layer opacity is pinned at **1** so what is on screen
is byte-for-byte what the graph receives; display opacity would make the step lie about its own
output. Add a preset picker when a measured case wants one, not because the History strip has one.

## Reuse persists the PIXELS

The layer is reported as a PNG data URL, so `stepValues` — the snapshot Reuse restores from —
carries the user's own drawing with no frame change at all. That is deliberate: the drawing is an
INPUT the user made by hand, unlike crop's derived padded image, which is stripped from the
snapshot precisely so a reuse does not outpaint an already-outpainted picture.

> `ponytail:` base64 pixels in the run snapshot. A scribble is mostly transparent and PNG costs
> almost nothing for that, so the realistic bill is tens of KB — but it is unbounded by a
> full-coverage paint. The upgrade is to place the layer in the preview-asset store on stroke end
> and store its path; that buys an async write per stroke and a GC question, so do it when a
> measured snapshot is actually too big.

The encode is memoised behind a dirty flag. `getURL()` runs `isEmpty()` (a full alpha scan) and
then re-encodes; at 4096² that is 16.7M px, and a wheel tick or a colour change moves no pixel.

## An unpainted step reports `paint: null`

`composePaintLayer` then returns null, which the frame reads as *this kind changed nothing* — the
run proceeds with no file in that slot. **A flow whose graph requires the layer must guard this
itself**, because a `MpiLoadImageFromPath` left on its baked authoring path will load whatever was
there and produce a confident wrong result. The frame cannot guard it: a null from `STEP_MEDIA`
legitimately means "nothing to change" for `crop`. This is a flow-wiring obligation, not a gizmo
one.

## Verified (2026-08-22, MPI-567)

Driven live in an isolated instance — see the card's `validation.md`.
