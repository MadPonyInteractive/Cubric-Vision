# Change model download preview media

## Current State

Project mode: scalable-foundation.

- MPI-57 is a `todo` task for refreshing the model preview media shown in the Models slide-over and making video-model cards play a preview clip on hover.
- The Models slide-over is `MpiModelManager`, opened through `models:open` -> `slide-over:open`.
- Cards are rendered by `MpiInstalledDisplay`, which currently supports only `image` and always reads from `comfy_workflows/display/{image}`.
- Model media mappings live in `js/data/modelConstants/models.js`.
- Existing display media in `comfy_workflows/display/` includes four PNGs and `wan2.2_t2v.mp4`; `wan-22` currently has no `image` property and therefore no card media preview.
- Fabio still needs to provide the replacement model preview assets and intended mapping. Implementation can proceed only to the extent that assets and filenames are known.

## Implementation

- [ ] Intake the replacement media assets and create the final model-to-media mapping. Store committed preview files under `comfy_workflows/display/` unless there is a deliberate reason to move the display-media root. **Verify:** Every model in `MODELS` has an explicit preview image or video mapping, all referenced files exist, and old files are removed only if no longer referenced.
- [ ] Extend `MpiInstalledDisplay` to support model preview media as either a still image or a hover-play video, keeping the card API backward-compatible with existing `image` usage. Use muted looping native `<video>`, `preload="metadata"` or `auto` only when justified, `playsInline`, hover play/pause/reset behavior via `on()`, and cleanup in `destroy()`. **Verify:** Existing image cards still render as images, video cards show a playable preview, hover starts playback, mouse leave pauses and resets, and failed media does not break the card layout.
- [ ] Update `MpiModelManager` to pass the complete media props on every `MpiInstalledDisplay.mount()` path, including installed, uninstalled, and `download:started` card rebuilds. **Verify:** A model card preserves the correct preview media before install, during download-state transitions, after cancel/retry, and after installed-state re-sync.
- [ ] Update `models.js` and component prop docs to reflect the new media fields and final asset mapping. **Verify:** `js/components/types.js` documents any new `MpiInstalledDisplay` props, `models.js` comments describe image/video preview fields, and no unsupported raw paths leak into model definitions.
- [ ] Validate the Models slide-over visually and functionally. **Verify:** Run a browser or desktop smoke check that opens the Models slide-over, confirms image previews render, confirms video preview playback on hover for video models, and confirms install/pause/resume/cancel/uninstall controls still mount and respond.

## Completed

- [x] Read MPI-57 task card and current board state.
- [x] Located model-manager surface, display-card component, model metadata source, existing display assets, and gallery hover-video reference pattern.
- [x] Preserved planning findings in `research/2026-06-09-planning-audit.md`.

## Remaining Work

- Intake Fabio-provided replacement assets and mapping.
- Implement model preview image/video support in the model-manager card path.
- Verify Models slide-over behavior across still-image and video-model cards.

## Plan Drift

- None yet.

## Verification

MPI-57 is implementation-ready when:

- The first `mpi-continue` brief can name the exact asset files or explicitly identify that asset intake is the blocker.
- `MpiInstalledDisplay` is the planned ownership point for preview rendering and hover-video behavior.
- `MpiModelManager` is planned to pass media props consistently across all mount/rebuild paths.
- `models.js`, `js/components/types.js`, and `comfy_workflows/display/` are identified as primary edit targets.
- Final checks cover both visual media rendering and preservation of download controls/events.

## Preservation Notes

- Do not modify download manager behavior for this task.
- Do not introduce raw DOM querying or raw component event listeners; use `qs`/`qsa`/`ce` and `on()`.
- Use CSS variables from `styles/01_base.css`; no hardcoded colors.
- If new display assets are large, verify they are intentionally committed and suitable for portable artifacts.
- If implementing without final replacement assets, stop after code-path preparation and record the asset dependency rather than committing placeholder/generated media.
