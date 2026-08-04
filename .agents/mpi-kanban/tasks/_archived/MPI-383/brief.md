# MPI-383 - Crop past the image edge

User request 2026-07-28, with the Photoshop crop screenshots as the reference behaviour.
The point of the feature is outpainting ("alt paint" in the request): crop out to a bigger
frame, the new area lands as a flat colour, then ask an edit model to fill that colour.
It is also meant to be reusable by Apps later.

## Decisions (user, 2026-07-28)

1. **Fill** - an `MpiColorPicker` in the crop panel, same primitive the Resize pad colour and
   Remove Background use. Not transparent-only, not hardcoded black.
2. **No auto-mask.** Painting a mask over the new area does a worse job than telling the model
   to fill the black/green/whatever area. So Apply produces the extended image and stops.
3. **Resample only in the exact-dimensions type.** RATIO and FREE never resample - the selected
   pixels are the output. RESOLUTION takes a typed WxH and resamples to exactly that.

## Where the work lands

- `managers/CropManager.js` - the clamps to `[0..imgW] x [0..imgH]` come out of body drag,
  free drag and the ratio-locked anchor maths. Snapping goes in on top.
- Drawing moves to the **screen UI canvas**. The overlay canvas is sized to image-native pixels,
  so anything outside the image is literally unpaintable there. The screen canvas already hosts
  the handles; the scrim, border, thirds and a dashed image-bounds outline join them.
- `ViewManager.refit()` gains an optional fit box so the managed view can frame
  union(image, crop). MpiCanvas recomputes it per draw but **never while dragging** - rescaling
  under a live drag changes the screen-to-image mapping mid-gesture and the rect chases.
- `MpiToolOptionsCrop` - third family, W/H inputs, colour picker.
- `MpiCanvasViewer._runCrop` - sends `fill` and (RESOLUTION only) `outW`/`outH`; the
  divisible-by call stops bounding by the source span.
- `routes/projects.js` + `services/imageCrop.js` - Sharp `.extend()` the outside margins, then
  `.extract()` on shifted coords, then optional `.resize()`.

## Traps

- Sharp `.extract` throws on an out-of-bounds rect - that is why the extend runs first and the
  extract rect is shifted by the left/top margins.
- `roundToDivisible` floors when rounding up would overshoot the source. That guard exists
  because extract could not overshoot. Pass an unbounded max from the canvas viewer; leave the
  helper alone, the video/App path still needs the bound.
- The managed view (`isManagedView`) recomputes scale from the image on every resize; a box
  bigger than the image is off-screen without the union fit. Panning already drops managed mode,
  so a user who has panned keeps their view.
