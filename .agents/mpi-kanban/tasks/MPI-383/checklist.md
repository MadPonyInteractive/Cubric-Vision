# MPI-383 checklist

- [x] `js/utils/cropSnap.js` — snap maths (free / body / ratio-scale), pure + tested
- [x] `CropManager` — image clamps removed from body, free and ratio-locked drag
- [x] `CropManager` — snapping wired into all three drag paths, tolerance = 8 screen px / scale
- [x] `CropManager.setExactSize(w, h)` for the RESOLUTION family
- [x] Crop overlay moved to the screen canvas (`drawScreen`), overlay-canvas pass deleted
- [x] Dashed source-bounds outline, drawn only when the crop leaves the image
- [x] `CropManager.getFitBox()` + `ViewManager.refit(..., fitBox)` — view frames image ∪ crop
- [x] Refit suppressed while dragging; `InputController` mouseup draws so it settles on release
- [x] `InputController` passes `view.scale` into `crop.drag()`
- [x] `MpiToolOptionsCrop` — RESOLUTION family, W/H inputs (pushed on `change`, not `input`)
- [x] `MpiToolOptionsCrop` — `MpiColorPicker` fill, persisted as `fill_color`
- [x] Divisible-by hidden in RESOLUTION; fill + RESOLUTION hidden for video
- [x] `MpiCanvasViewer.setCropSize()` + `_runCrop` sends `fill`/`outW`/`outH`, unbounded rounding
- [x] `services/imageCrop.js` — `planExtendedCrop`, `parseFill`, `cropExtended` (two-pass)
- [x] `POST /project/crop-media` — accepts fill/outW/outH, reports the written size
- [x] `tests/crop-extend.test.cjs`
- [x] `docs/crop.md` + routed from `docs/README.md` and the CLAUDE.md context router
- [x] `js/components/types.js` — canvas + panel contracts updated
- [x] Live check in the app — all 8 items pass, user-verified 2026-07-29 (see validation.md)
- [ ] Port extension to `js/utils/cropTool.js` so Apps and video get it (deliberately out of v1;
      user 2026-07-29: revisit only if needed — see validation.md for why it is not a flag flip)
