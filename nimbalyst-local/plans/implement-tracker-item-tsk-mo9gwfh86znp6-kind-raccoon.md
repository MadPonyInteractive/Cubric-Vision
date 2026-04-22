# Video Support in History Block — Implementation Plan

Tracker: `tsk_mo9gwfh86znp6r` (high priority, bug/feature).

---

## Context

When a user clicks a video card in the gallery, `MpiGroupHistoryBlock` opens but shows nothing — no preview, no editing. Root cause: `MpiCanvasViewer` hardcodes `canvas.loadImage()` regardless of `_group.type`. Infrastructure is partly there (video meta type tag exists, `MpiVideoPlayer` block exists but unused, `MpiPromptBox` already supports video drops via `requiresVideo` flag, op filter in `_opOptions()` already branches on media type).

Goal: make the history page a proper video workspace — playback, crop, video upscale, interpolate — matching the image workspace in polish. Defer trim, masking, focus mode, conditioning inputs, and upscale/interpolate param UIs to follow-up tracker items. Preserve future-trim compatibility by reserving a timeline-mount slot in the viewer shell.

---

## Scope — included

1. **Video preview in history block** — large native `<video>` with full custom control bar (play/pause, progress slider, current/duration, loop, volume/mute, fullscreen).
2. **Crop tool adapted for video** — crop overlay on video, action bar with **Save Snapshot** (writes PNG to gallery as new `itemGroup`) and **Save Cropped Video** (ffmpeg re-encode, new video history entry).
3. **Video Upscale** + **Interpolate** — minimal: just Run button in action bar. Params baked in workflow JSON for now.
4. **Meta schema enrichment** — probe fps/duration/frameCount/hasAudio via ffprobe at save time; write to `.meta/<uuid>.json`.
5. **Hierarchy fix** — demote `MpiVideoPlayer` Block → Compound (required because history is a Block, and Blocks consume Compounds). Inline volume controls.
6. **New `MpiVideoViewer` Compound** — sibling of `MpiCanvasViewer`, orchestrates player + crop overlay + future timeline.
7. **Crop logic extraction** — shared `js/utils/cropTool.js` consumed by both `MpiCanvasViewer` and `MpiVideoViewer`.
8. **ffmpeg bundling** — ship ffmpeg binary with Electron resources.

## Scope — deferred (tracker follow-ups to create later)

- Trim tool with timeline thumbnails + in/out handles.
- Conditioning-input meta: `startFrame`, `endFrame`, `conditioningImages[]`, `conditioningVideo`, `conditioningAudio`. Schema + PromptBox UI hooks.
- Focus mode (F hotkey) — history+video fullscreen, history+image canvas overlay, gallery grid-only.
- Upscale/interpolate param UI (via `commandRegistry` `components:[]` + `operationRegistry` version bumps).
- Gallery sidecard fps/duration display.
- Masking on video.
- PromptBox/radial-menu hide-when-no-video-input-op edge case (only relevant when no model has any video-capable op loaded — rare; punt).

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Native `<video>` + transparent canvas overlay (hybrid) | GPU decode scales to large clips; crop/future-mask draw on overlay without re-architecting. |
| `MpiVideoPlayer` → Compound (not Block) | Blocks can't import Blocks; history Block must consume it. Verified: imports only `MpiButton` + `MpiProgressBar` Primitives after inlining volume. |
| Inline volume (slider + mute btn) into `MpiVideoPlayer` | Removes `MpiVolumeControl` Compound import (Compound-on-Compound violation). `MpiVolumeControl` kept intact in codebase for future use. |
| Separate `MpiVideoViewer` Compound | Mirrors `MpiCanvasViewer` role; keeps `MpiVideoPlayer` reusable. |
| Drop playback rate | Video fps baked in mp4; native player respects it; no use case. |
| F key NOT used for fullscreen | `F` reserved for Focus mode (future). Fullscreen = button-only for now. |
| Snapshot → gallery (not history) | Avoids image-in-video-workspace conflict. User drags snapshot to PromptBox for i2v later. Toast confirms save. |
| Cropped video → history (new group) | Same flow as regular video generation. |
| Backend crop = ffmpeg via Node route, not Comfy workflow | App runs without models; no GPU needed; faster. |
| ffmpeg = bundled binary | No user install assumption. |

---

## Critical Files

### Frontend — modify
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — branch on `_group.type === 'video'`: mount `MpiVideoViewer` instead of `MpiCanvasViewer`. PromptBox visibility rule (already partly there via `_opOptions()`). Observer teardown contract — call `instance.destroy()` on nav-away.
- `js/components/Blocks/MpiVideoPlayer/MpiVideoPlayer.js` — **move** to `js/components/Compounds/MpiVideoPlayer/`. Remove `MpiVolumeControl` import, inline mute btn + `MpiProgressBar` for volume. Add loop btn, fullscreen btn, frame-step buttons (◀| |▶, uses `1/fps` step with fps from meta). Big control sizing (`size: 'lg'`).
- `js/components/Blocks/MpiHistoryTools/MpiHistoryTools.js` — video-mode toolbar variant: Crop mode in video context replaces "Apply" with **Save Snapshot** + **Save Cropped Video** buttons.
- `js/components/Blocks/MpiCanvasViewer/MpiCanvasViewer.js` — extract crop logic into `js/utils/cropTool.js`, import from there.
- `js/pages/components.js` — update import path for `MpiVideoPlayer` (Blocks → Compounds).
- `js/shell/preloadStyles.js` — register `MpiVideoPlayer.css` under Compounds, register new `MpiVideoViewer.css`.
- `js/components/types.js` — document props for new/changed components.
- `js/utils/video.js` — keep `captureFrame` + `getVideoBounds`. Replace `handleSnapshot` stub with gallery-save path (emit `media:imported` via project service).

### Frontend — create
- `js/components/Compounds/MpiVideoViewer/MpiVideoViewer.js` + `.css` — wraps `MpiVideoPlayer` + crop-overlay `<canvas>` + reserved timeline slot `<div class="mpi-video-viewer__timeline"></div>`. Imperative API: `loadVideo(url, meta)`, `enterCropMode()`, `exitCropMode()`, `getCropRect()`, `captureSnapshot()`, `destroy()`.
- `js/utils/cropTool.js` — shared crop-box drawing, drag handles, rect math (0–1 normalized), reused by `MpiCanvasViewer` + `MpiVideoViewer`.

### Backend — create/modify
- `routes/videoCrop.js` (new) — `POST /api/video/crop { groupId, itemId, cropRect, outFileName }` → spawns ffmpeg, writes to project Media dir, returns new item metadata.
- `services/ffmpegBinary.js` (new) — resolves bundled ffmpeg path (dev vs packaged Electron resources).
- `services/projectService.js` (modify) — on video save, run ffprobe, persist `fps`, `duration`, `frameCount`, `hasAudio` into `.meta/<uuid>.json`. Emit `generation:complete` for crop-produced videos so history appends normally.

### Build
- `package.json` / electron-builder config — bundle ffmpeg + ffprobe binaries per-platform (Windows/Linux/macOS). Use `ffmpeg-static` + `ffprobe-static` npm packages (pre-built per-platform binaries) as simplest path.

---

## Events & Integration Points (reused, not invented)

- `workspace:set-operation` — tool sync (existing).
- `media-change` / `media:imported` — PromptBox emits → MpiGalleryBlock listens (existing). Snapshot save reuses this by creating new gallery itemGroup via project service.
- `generation:complete { id, item, group }` — commandExecutor emits → `MpiGroupHistoryBlock` listens. Backend crop route triggers same event shape for cropped video output.
- `MpiHistoryTools.syncMode(mode)` — imperative API (existing). Video variant adds `crop-video` mode.
- `Events` bus with stored `_unsubs[]` collected in setup, cleaned in `el.destroy()` (per components.md).

---

## Toolbar Routing Matrix (video group)

| Active tool | Toolbar | PromptBox | Viewer overlay |
|---|---|---|---|
| none | Op action bar; PromptBox shown if current op has `requiresVideo >= 1` | conditional | none |
| Crop | Action bar: Save Snapshot, Save Cropped Video | hidden | crop canvas on player |
| Video Upscale | Action bar: Run | hidden | none |
| Interpolate | Action bar: Run | hidden | none |
| (future) Trim | Timeline strip + Save Trimmed Video | hidden | timeline |

---

## Implementation Order

1. **Tier-fix pass**: move `MpiVideoPlayer` to Compounds, inline volume, update `pages/components.js`, `preloadStyles.js`, `types.js`. Verify dev gallery page renders.
2. **Player enhancements**: add loop btn, fullscreen btn, frame-step (reads fps from passed-in meta, fallback 24). Big control size.
3. **Crop util extract**: move crop logic to `js/utils/cropTool.js`, refactor `MpiCanvasViewer` to consume. Verify image crop still works.
4. **`MpiVideoViewer` Compound**: build shell with player + overlay canvas + reserved timeline div. Wire `loadVideo()`, crop mode API.
5. **History block branching**: `_group.type === 'video'` → mount `MpiVideoViewer`. Verify click-video-in-gallery now plays.
6. **Meta schema + ffprobe**: ffmpeg-static + ffprobe-static install. `projectService` probes on video save. Update `.meta/` writer.
7. **Backend crop route**: `POST /api/video/crop` with ffmpeg crop + re-encode. Project service integration to register new itemGroup. Emit `generation:complete`.
8. **History tools video-mode**: Crop mode variant with Save Snapshot + Save Cropped Video. Snapshot path uses `captureFrame` → POST to project service for gallery save → toast.
9. **Video Upscale + Interpolate toolbars**: minimal Run button wiring (ops likely already work; may need UI-visibility pass only).
10. **Docs pass**: update `.claude/rules/component-mounts.md`, `component-events.md`, `component-state.md`, `component-comfy.md` per DOCUMENTATION DRIFT cardinal rule after user approval of changes.

---

## Verification

**Manual (golden path):**
1. Start app. Open project with at least one video itemGroup.
2. Click video card in gallery → history page opens → video visible, controls responsive.
3. Play/pause via space, big play btn, click-video. Seek via progress bar. Volume/mute. Loop toggle. Fullscreen btn. Frame-step ← →.
4. Activate Crop tool → overlay appears → drag crop rect → **Save Snapshot** → toast "Snapshot saved to gallery" → navigate to gallery → confirm new image itemGroup present → drag into PromptBox → confirm it injects as conditioning image.
5. Back to video → Crop mode → **Save Cropped Video** → toast → confirm new video itemGroup appears in history → verify dimensions = crop.
6. Video Upscale → Run → new video itemGroup → plays back.
7. Interpolate → Run → new video itemGroup with higher fps → plays back.
8. Open `.meta/<uuid>.json` for a video file → confirm `fps`, `duration`, `frameCount`, `hasAudio` present.
9. Navigate away from history → back in → no memory leaks, no dangling listeners (check `el.destroy()` fires).

**Edge cases:**
- Video with audio (LTX future): volume slider changes audio level.
- Video without audio (Wan22): volume slider harmless.
- Large video (>30s): playback smooth (trust native `<video>`; if lag, deferred).
- Image itemGroup still works (regression check — `MpiCanvasViewer` unchanged behavior after `cropTool.js` extract).
- Dev gallery page (`pages/components.js`) still renders `MpiVideoPlayer` after Compound move.

**Unit/integration:**
- `cropTool.js` — pure math on normalized rects; add tests if test infra exists.
- `ffmpegBinary` resolution — verify path works dev + packaged build (spot-check on Windows first, other platforms during release).

**Logs:** tail `logs/app.log` after each step for backend errors (ffmpeg spawn failures, ffprobe parse errors, missing binary).

---

## Risks / Open at Implementation Time

- **ffmpeg-static packaging in Electron**: code-signing on macOS may require extra config. First pass Windows-only test; macOS/Linux during release.
- **MpiVolumeControl Compound import**: if inlining proves ugly, fallback is to demote `MpiVolumeControl` itself to a Primitive-only compound (it likely already imports only Primitives internally). Verify at step 1.
- **`MpiHistoryTools` may hardcode image modes**: if deeply coupled to image crop/mask, step 8 may balloon. Mitigation: add `mode` prop for video-variant modes and branch template.
- **Snapshot→gallery integration path**: requires project service API for "create itemGroup from in-memory blob". If missing, new service method needed. Verify in step 8.

---

## Post-Implementation Tracker Items to Create

1. Trim tool with timeline thumbnails.
2. Video conditioning-input meta + PromptBox UI (startFrame, endFrame, conditioning images/audio/video).
3. Focus mode (F) — context-aware fullscreen across history video/image and gallery.
4. Upscale/interpolate param UI + op version bumps.
5. Gallery sidecard fps/duration display.
6. Video masking tool.
