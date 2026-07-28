# Crop

The image crop tool: three resolution types, a rect that may leave the image, and the
server-side pad+extract that makes that possible. Video crop is a **different** code path
(see the last section).

Files: `managers/CropManager.js` (rect + snap + draw), `js/utils/cropSnap.js` (snap maths),
`MpiToolOptionsCrop` (panel), `MpiCanvasViewer._runCrop` (apply), `services/imageCrop.js` +
`POST /project/crop-media` (pixels).

## The three resolution types

| Type | Box behaviour | Output |
|---|---|---|
| `ratio` | locked to a `CROP_RATIOS` aspect (orientation-keyed table) | the selected pixels, rounded by **Divisible by** |
| `free` | each handle moves its own axis | the selected pixels, rounded by **Divisible by** |
| `resolution` | seeds at **exactly** the typed W×H image px, then stays locked to W/H | resampled to exactly W×H |

`resolution` is the ONLY type that resamples (MPI-383, user decision). Divisible-by is hidden
there — the typed size already IS the output. The other two never scale pixels: what the box
covers is what the file gets.

## The rect is not confined to the image

Any type may drag the box off any edge. Whatever it selects beyond the source is filled with
the panel's **Fill Outside** colour (`MpiColorPicker`, persisted per project as `fill_color`).

That flat colour is the point of the feature: it is the outpaint target. The user extends the
frame, then asks an edit model to fill the coloured area. **There is deliberately no auto-mask** —
prompting the model to fill "the black area" beats handing it a painted mask.

Consequences to keep in mind:

- `getCropRect()` can return **negative** `x`/`y`, and `x + w` can exceed the image width.
- Crop drawing lives on **`screenUICanvas`** (container space), not `overlayCanvas`. The overlay
  canvas is sized to image-native pixels, so anything outside the image is unpaintable there.
  Scrim, border, thirds, handles and the dashed source-bounds outline are all one screen pass
  (`CropManager.drawScreen`).
- The managed view frames **image ∪ crop** (`CropManager.getFitBox()` → `ViewManager.refit(..., fitBox)`),
  otherwise a 1920×1080 box on a 784px image hangs off the viewport.
- That refit is **suppressed while dragging** (`MpiCanvas._refitForCrop`). Scale is what maps the
  cursor into image space; changing it mid-gesture makes the rect chase the pointer. It settles
  on mouse-up, which is why `InputController`'s mouseup calls `onDraw()`.

## Snapping (`js/utils/cropSnap.js`)

An edge within **8 screen px** (converted to image px with `view.scale`) of an image bound lands
exactly on it, so a 1–2px accidental border is impossible. There is no bypass modifier — a
sub-8px border is the thing the feature exists to prevent.

- **Free**: only the edges the active handle owns snap, each to `0` or `imgW`/`imgH`. The anchored
  edge must not drift. Skipped while shift (scale-from-centre) is held — snapping one edge of a
  mirrored gesture silently breaks the mirror.
- **Body**: the whole box snaps flush-left/top, flush-right/bottom, or centred on the image.
- **Ratio-locked**: the ratio is the invariant, so snapping adjusts the **scale**
  (`snapRatioWidth`), never one edge. Every moving edge proposes the width that would land it on
  a bound; the smallest correction inside the radius wins. Sign 0 (edge handles,
  shift-from-centre) means both edges move, and it snaps symmetrically.

## Server: pad first, then extract

`services/imageCrop.js`. Sharp's `.extract` **throws** on an out-of-bounds rect, so the overhang
has to exist before the extract:

1. `planExtendedCrop()` — pure maths, returns the pad per side (`max(0, -x)` etc.) and the extract
   rect shifted by the left/top pad.
2. `.extend({...pad, background: fill})` → **`.toBuffer()`** → `sharp(buffer).extract(...)`.
3. optional `.resize(outW, outH, { fit: 'fill' })` for the `resolution` family.

**The two-pass is not optional.** Sharp applies `extend` *after* extraction regardless of call
order, so chaining them extracts from the unpadded image and dies with
`extract_area: bad extract area`. Materialising the padded image is the only way round it.

`roundToDivisible()` still floors when rounding up overshoots its `max` — the crop viewer now
passes `Infinity` because an overshoot is filled rather than clipped, but the bound stays in the
helper for the callers that cannot pad.

## Video and Apps use a different cropper

`js/utils/cropTool.js` (normalized 0–1, used by `MpiVideoViewer` and `MpiStepBox`) is
**unchanged**: still clamped to the content, no fill, no exact-size family. The video crop route
crops with ffmpeg and cannot pad, so the panel hides the fill colour and the `resolution` type
for `kind: 'video'`. Bringing extension to Apps means porting the same three pieces (unclamp,
snap, fill) into `cropTool.js`.
