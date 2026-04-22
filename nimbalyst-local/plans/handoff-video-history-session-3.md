# Handoff — Video History Support (Session 3)

**Branch:** `feature/video-history-support`
**Predecessors:** `handoff-video-history-session-2.md`
**Last commits (session 2 + bug pass):**
- `d1b76b0` fix(video): crop ratio, snapshot op, thumbnails, hide promptbox
- `6bfba04` fix(video): force-hide PromptBox on video group mount + log thumb ok
- `e2625c5` fix(video): thread thumbPath from upload response into item state
- (uncommitted) remove `logger.info` line from `services/ffmpegThumb.js`

---

## Status

### Done
- Step 6: ffprobe meta (fps/duration/frameCount/hasAudio) written to video sidecars.
- Step 7: `POST /api/video/crop` — spawns ffmpeg `-vf crop`, writes sequenced `video_crop_NNN.mp4`, sidecar + first-frame thumb.
- Step 8: `MpiHistoryTools` video-mode variant (Save Snapshot / Save Cropped Video / Cancel) via `MpiToolActionBar` mounted in barContainer of `MpiVideoViewer`. Snapshot uses `captureSnapshot()` → `uploadMediaFile(..., {filenamePrefix:'snapshot', operation:'snapshot'})` → `addGroup()` so it shows in gallery.
- Bug fixes (user-reported):
  - Snapshot sidecar `operation` = 'snapshot' (threaded client→server via `opts.operation`).
  - Crop ratio distortion (9:16 rendered square): `cropTool._applyRatioToRect` + drag logic now use `normRatio = pixelRatio / (contentW/contentH)` to account for anisotropic normalized space on non-square content.
  - PromptBox hidden on video groups: `PromptBoxService.hide()` called at top of `MpiGroupHistoryBlock.setup` before any gen wiring, and `_setBottomBar` guards `isVideo && 'promptbox'` to hide instead of show.
  - Video thumbnail: `services/ffmpegThumb.js` added; hooked into `/project-media/upload` (imports) and `/api/video/crop` (crop outputs). Thumb URL returned in upload response, threaded through `uploadMediaFile` → `media:imported` event → `createVideoItem({thumbPath})` in `MpiGalleryBlock` listener. `MpiHistoryList` renders `item.thumbPath` for video rows.

### Verified by user
- Import/drop video → thumb shows in gallery card + history list.
- PromptBox hidden on video groupHistory page.
- Crop toggle keeps PromptBox hidden.
- Crop ratio 9:16 now correct on landscape/portrait video.
- Snapshot persists to project.json + appears in gallery, correct filename (`snapshot_NNN.png`) and sidecar `operation: 'snapshot'`.
- Crop output named `video_crop_NNN.mp4` (sequenced).

### Known deferred (pre-existing, from session 1)
- Crop handles drift from mouse during drag (reported session 1, not fixed).
  File: `js/utils/cropTool.js` — pointer delta math.

---

## Remaining Plan Steps

### Step 9 — Wire Video Upscale + Interpolate Run button
Plan ref: `handoff-video-history-session-2.md` step 9.

Scope: Enable `promptBox.on('run', ...)` for video ops (`v2v-upscale`, `v2v-interpolate`). Currently `_runGenerate` only called from image PromptBox; the video page hides PromptBox entirely.

Open questions:
1. Does video group need a PromptBox at all? User said "normal" for now; may need a minimal variant showing only Run button (no prompt text) plus op selector.
2. Or invoke video ops from `MpiHistoryTools` (tool bar buttons per op) and skip PromptBox entirely on video pages.

Recommended: **option B** — add "Upscale" / "Interpolate" actions to `MpiHistoryTools` video-mode variant (alongside Crop). Matches crop pattern; no prompt text input needed for these ops anyway.

Backend already supports video ops via existing ComfyUI injection pipeline. Check:
- `js/services/comfyInjection/operations/*.js` — confirm `v2v-upscale`, `v2v-interpolate` implementations exist.
- `js/workflows/` — confirm workflow JSONs for these ops.

### Step 10 — Docs pass
Per `CLAUDE.md` cardinal rule 3: **ask user first** before updating `.claude/rules/*.md`. Expected updates:
- `component-events.md`: add `MpiVideoViewer` events (`crop-save-snapshot`, `crop-save-video`, `crop-cancel`, `crop-change`).
- `component-mounts.md`: document `MpiVideoViewer` mount inside `MpiGroupHistoryBlock` when `isVideo`.
- `components.md`: possibly note ffmpeg service dependency + packaging note.
- `docs/project-integrity.md`: video sidecar fields (`fps`, `duration`, `frameCount`, `hasAudio`, `videoMeta`, `thumbPath`, `sourceItemId`, `sourceGroupId`).

---

## Key Files Touched (session 2 + bug pass)

**Backend:**
- `services/ffmpegBinary.js` — bundled ffmpeg/ffprobe path resolver (packaged via `process.resourcesPath`, dev via `ffmpeg-static`/`ffprobe-static`).
- `services/ffprobeVideo.js` — `probeVideo(path)` returning `{fps,duration,frameCount,hasAudio,width,height}`.
- `services/ffmpegThumb.js` — `extractVideoThumb(in, out, {atSeconds=0})` → 256-wide JPG.
- `routes/videoCrop.js` — `POST /api/video/crop`.
- `routes/projects.js` — upload route now probes video, writes thumb, returns `thumbPath` in response.
- `server.js` — registers `videoCropRoutes`.

**Frontend:**
- `js/services/mediaUploadService.js` — `opts.filenamePrefix`, `opts.operation`; returns `thumbPath`.
- `js/components/Compounds/MpiVideoViewer/MpiVideoViewer.js` — crop overlay, `barContainer` prop, action bar, `captureSnapshot`.
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — wires video crop/snapshot events, hides PromptBox for video.
- `js/components/Compounds/MpiHistoryList/MpiHistoryList.js` — prefers `item.thumbPath` for video rows.
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — passes `thumbPath` through `media:imported` to `createVideoItem`.
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — emits `thumbPath` on `media:imported`.
- `js/components/Primitives/MpiGalleryDropOverlay/MpiGalleryDropOverlay.js` — emits `thumbPath` on `media:imported`.
- `js/utils/cropTool.js` — `_contentAspect()` + `normRatio` anisotropy fix.
- `js/utils/icons.js` — added `camera` icon.

**Deps added:** `ffmpeg-static`, `ffprobe-static` (both win/mac/linux x64 binaries bundled).

---

## Packaging Note (future)

For electron-builder packaging, `process.resourcesPath` must contain `ffmpeg(.exe)` and `ffprobe(.exe)`. Add to `build.extraResources` in `package.json`:

```json
"extraResources": [
  { "from": "node_modules/ffmpeg-static/ffmpeg.exe", "to": "ffmpeg.exe" },
  { "from": "node_modules/ffprobe-static/bin/${platform}/${arch}/ffprobe.exe", "to": "ffprobe.exe" }
]
```

Or forward `MPI_RESOURCES_PATH` env to the server fork if needed (`ffmpegBinary.js` checks both).

---

## Suggested Next-Session Start

1. Pull + confirm branch clean: `git status`.
2. Decide step 9 approach (tool-bar vs PromptBox variant) with user.
3. Implement + test.
4. Ask user about docs pass (step 10).
