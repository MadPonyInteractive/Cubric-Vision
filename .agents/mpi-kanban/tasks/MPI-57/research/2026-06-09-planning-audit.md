# MPI-57 Planning Audit

Date: 2026-06-09

## Task Summary

Replace old model preview images in the Models slide-over and make video-model cards play a video preview on mouse hover.

## Current Implementation

- Models slide-over content is `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`.
- Model cards are rendered through `js/components/Compounds/MpiInstalledDisplay/MpiInstalledDisplay.js`.
- Model preview metadata currently lives in `js/data/modelConstants/models.js` as `model.image`.
- `MpiInstalledDisplay` renders only `<img src="comfy_workflows/display/{props.image}">`.
- Existing display assets live in `comfy_workflows/display/`:
  - `AlchemyMix176.png`
  - `AnimeMixV80.png`
  - `AnimerJeiV30.png`
  - `Lustify7.png`
  - `wan2.2_t2v.mp4`
- Current image model mappings:
  - `sdxl-realistic` -> `Lustify7.png`
  - `sdxl-nsfw` -> `Lustify7.png`
  - `ill-anime-beauty` -> `AlchemyMix176.png`
  - `ill-anime` -> `AnimeMixV80.png`
  - `pony-mix` -> `AnimerJeiV30.png`
- `wan-22` has no `image` property, so its model-manager card currently has no media preview despite `wan2.2_t2v.mp4` existing.

## Relevant Patterns And Constraints

- Component rules apply: use `ComponentFactory`, `js/utils/dom.js` helpers, `on()` for listeners, BEM classes, and `destroy()` cleanup.
- Download rules apply only to install/pause/resume/cancel behavior; this task should not bypass `downloadService` or alter download manager flow.
- Existing gallery video-hover pattern in `MpiGalleryGrid` uses muted looping native `<video>`, starts playback on hover, pauses and resets to frame 0 on leave.
- `MpiInstalledDisplay` is a shared compound used by the model manager. Any new props must be documented in `js/components/types.js`.
- `MpiModelManager` re-renders cards during download-state changes. Media props must be passed in every card-mount path, including the `download:started` in-place rebuild path.
- Use Stage tokens only in CSS. No hardcoded colors.

## Asset Intake Questions For Implementation

- Fabio needs to provide replacement preview assets and intended model mapping.
- Recommended committed location: `comfy_workflows/display/`, matching the existing model-preview path.
- Recommended media conventions:
  - Image previews: optimized `.webp` or `.png`.
  - Video previews: short muted-loop-safe `.mp4` clips, ideally with a poster image fallback.
- Implementation should not invent final replacement imagery. If assets are not provided yet, create the code path and wire current assets only where appropriate, then leave a clear TODO in the plan rather than committing placeholder media.

## Planning Implications

- This is a coherent UI/data change, not a parallel batch.
- First implementation step should confirm the asset list and mapping before changing `models.js`.
- Hover video should be implemented in `MpiInstalledDisplay` rather than in `MpiModelManager`, because the display card owns the media slot.
- Verification should include both image-model cards and at least one video-model card in the Models slide-over.
