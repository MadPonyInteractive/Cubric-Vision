# Crop gizmo — the frame the picture sits in

> **PORTABLE.** First needed by Outpaint ([../existing-flows/outpaint.md](../existing-flows/outpaint.md)),
> but applies to any flow where the user chooses a FRAME rather than a region — outpaint,
> reframing, pad-to-ratio, any "make this a different shape" step.
>
> Its opposite number is [box-gizmo.md](box-gizmo.md): `box` marks a region INSIDE a picture
> and sends four numbers to a node; `crop` marks a frame the picture sits IN, and what it
> sends is a new picture.

## It is the History crop tool, not a lookalike

`MpiStepCrop` mounts **`CropManager`** — the same rect/handle/snap engine
`MpiCanvas` runs in the History workspace (`docs/crop.md`). Not a port, not a second
implementation: the class needs only a 2D context, an `{offsetX, offsetY, scale}` view and
the image size, so the step supplies a canvas and gets the whole learned interaction free —
unclamped rect, 8 handles, body drag, shift-from-centre, thirds, the dashed source-bounds
outline, and `cropSnap.js` snapping to every image edge and centre.

**So a change to how a crop rect BEHAVES belongs in `CropManager`**, where both surfaces get
it. Adding it to the step is how the two drift into dialects.

`MpiCanvas` itself was NOT reused: it carries mask layers, paint layers, an undo stack and a
tool router, none of which a flow step has, and its stage is sized by the History workspace.

## Two deliberate differences from the History tool

| | History crop | `crop` step |
|---|---|---|
| Picking a ratio | **inscribes** — largest rect inside the image | **contains** — smallest rect at that ratio covering the whole image |
| The view | the workspace's, framing image ∪ crop | the step's own, refit to image ∪ crop on every settle |

**Contain, not inscribe, is the whole point.** Cropping means "which part do I keep", so an
inscribed seed is right there. Outpainting means "what shall I add", and an inscribed seed
would *throw away* the ends of a portrait the moment the user picked 1:1 — the opposite of
what they asked for. `_seedContain` goes through `CropManager.setExactSize`, so the seed is
still the manager's own rect maths.

**The refit is suppressed mid-drag.** Scale is what maps the cursor into image space;
changing it during a gesture makes the rect chase the pointer. It settles on mouse-up. Same
rule, same reason as `MpiCanvas._refitForCrop` (`docs/crop.md`).

The fit is INSET by `HANDLE_SLACK` (14px): a handle sitting on the union's edge has to be
drawn whole, or the box you cannot grab is the box at the extreme the user most wants.

## The ratio bar belongs to the gizmo, not to `fields`

A step's controls are normally DECLARED (`fields`, rendered by the frame — see
[carousel-frame/steps.md](carousel-frame/steps.md)). This one is not, for one reason: **the ratio list is
orientation-dynamic.** Flipping portrait↔landscape rewrites all nine options, their labels and
their icons, and a declared field's `options` are static. The bar is still nothing but
components — two `MpiRadioGroup`s over the same `CROP_RATIOS` table
(`js/utils/ratios.js`) the History crop panel uses, with the same `rect_*` → `ratio_*` icon
mapping, plus a leading **Free** entry (no lock, every edge moves alone).

It is ONE row (`columns: 10`), not the History panel's 4-wide grid: that grid lives in a narrow
side panel, while this sits under a canvas where every extra row costs the step's title and
hint — both clipped off the slide at two rows, measured 2026-08-21.

**If a second gizmo ever wants a dynamic control row, that is the moment to give `fields` an
options-provider — not the moment to copy this bar.**

## What it sends: a FILE, not a param

`box` binds through `param` → `injectionParams`. `crop` binds through **`STEP_MEDIA`**
(`stepKinds.js`, MPI-594): the kind returns a File and the frame swaps it in for that role's
media at dispatch (`MpiBaseFlow._deriveRunMedia`). The graph therefore loads ONE image that
already carries its fill, and needs **no pad node, no mask, no rect and no fill input** — a
workflow authored in the browser runs unchanged.

```
value → { crop: {x, y, w, h}, ratio: {orientation, label} }     // absolute SOURCE px, top-left
```

`x`/`y` may be **negative** and `x+w` may exceed the width — that is the normal case here, and
`composePaddedImage` needs no clamping for it: the source is drawn at `(-x, -y)` onto a filled
canvas of the rect's size, so an off-frame origin is simply an offset.

Two rules that keep this honest:

- **The derived file NEVER enters the snapshot.** `submitFlowGeneration` strips
  `runMediaItems` before writing `flowInputs`, so Reuse restores the user's own image plus the
  rect and re-derives. Persisting the derived one instead would outpaint an already-outpainted
  picture on every reuse.
- **A failed derivation ABORTS the run.** Falling back to the original would generate from an
  un-padded image and come back looking like the model ignored the request.

A rect identical to the source returns `null` — nothing to add, so the original path runs and
the content-addressed store gains no duplicate.

## Fill colour

Black, hardcoded. The History tool persists a `fill_color` per project because a crop's
padding is a design choice; an outpaint's fill is a **signal to the model** and every recipe
here is written around black. Make it configurable only when a measured case says another
colour fills better — not because a picker exists elsewhere.

## Verified (2026-08-21, MPI-594)

Driven live in an isolated instance on an 896×1120 source:

| check | result |
|---|---|
| contain-seed, landscape 16:9 | `1991 × 1120` — exactly `1120 × 16/9`, image centred |
| orientation flip | list transposed by index, shape kept (1:1↔1:1, 4:5↔5:4 …) |
| ratio-locked drag (right edge) | `1120²` → `1382²`, ratio held, anchored left, grown both ways in y |
| edge snapping | pulled to `x = -165`, dragged back to ≈`-17`, **landed exactly `0`** |
| `composePaddedImage` | `1991 × 1120` PNG, side bars `0,0,0`, centre = real pixels, origin `-547` handled |
| storage | `Media/.preview-assets/<sha256>.png` via `place-preview-asset` |
