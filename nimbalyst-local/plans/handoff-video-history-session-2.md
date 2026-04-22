# Video History — Handoff for Session 2

**Tracker:** `tsk_mo9gwfh86znp6r`
**Branch:** `feature/video-history-support`
**Parent plan:** `nimbalyst-local/plans/implement-tracker-item-tsk-mo9gwfh86znp6-kind-raccoon.md`
**Session 1 scope:** steps 1–5 (frontend foundation).
**Session 2 scope:** steps 6–10 (backend + polish + docs).

---

## Session 1 — DONE

| Step | Status | Commit | Notes |
|---|---|---|---|
| 1. MpiVideoPlayer Block→Compound, inline volume | ✅ | `8d929b4` + `a44aae3` + `2894ca7` | Moved to `Compounds/MpiVideoPlayer/`. MpiVolumeControl import removed; inline mute btn + MpiProgressBar slider. CSS uses vars only. `preloadStyles.js` + `pages/components.js` + `types.js` updated. |
| 2. Player enhancements | ✅ | `b4a17b0` | Loop toggle, fullscreen btn, frame-step btns (`◀\|` `\|▶`) using fps prop (default 24). Buttons bumped to `size: 'lg'`. 4 new icons added to `utils/icons.js`: `loop`, `fullscreen`, `frameBack`, `frameForward`. |
| 3. cropTool util | ⚠️ partial | `f79b8c0` | Created `js/utils/cropTool.js` as reusable factory `createCropTool({ overlayCanvas, targetElement, onChange })`. **Did NOT refactor MpiCanvasViewer** — discovered that the image crop logic lives inside `MpiCanvas` Primitive's `CropManager`, not in `MpiCanvasViewer`. Additive extraction chosen to avoid regression. MpiCanvasViewer still uses its original CropManager path. cropTool is used by MpiVideoViewer only. |
| 4. MpiVideoViewer Compound | ✅ | `dfa5896` | New Compound at `js/components/Compounds/MpiVideoViewer/`. Composes MpiVideoPlayer + overlay canvas (for cropTool) + reserved timeline slot div. API: `loadVideo(url, meta)`, `enterCropMode`, `exitCropMode`, `getCropRect`, `setCropRatio`, `captureSnapshot`, `destroy`. ResizeObserver on stage for overlay resize. Forwards player events. CSS registered in `preloadStyles.js`; typedef in `types.js`. |
| 5. History block branching | ✅ | `3eb73e3` | `MpiGroupHistoryBlock` now branches on `_group.type === 'video'`. Video path mounts `MpiVideoViewer` + minimal tools `[{ mode: 'crop' }]`. Image path unchanged. Tool activation: video → `enterCropMode`/`exitCropMode`; image → unchanged `enterMode`/`exitMode`. Destroy contract extended to call `viewer.el.destroy()` on teardown. |

All commits on `feature/video-history-support`. No merges to master yet.

---

## Post-run verified (session 1 end)

Tested in app:
- ✅ Video plays
- ✅ Back nav works (no crash)
- ✅ Breadcrumb shows Gallery
- ✅ Selection bar hidden in video mode
- ⚠️ **Crop overlay + drag feel off** — handles don't follow mouse precisely. Root cause: stage has 16:9 aspect-ratio CSS but videos may be portrait → content rect math correct BUT stage dead-zone makes coord mapping feel wrong at boundaries. Defer to session 2 when stage sizing + video-mode toolbar layout overhauled.

## Known issues / deviations from plan

1. **cropTool extraction scope**: plan called for MpiCanvasViewer refactor; actual crop logic lives in MpiCanvas Primitive. Options for session 2:
   - **Accept as-is**: image crop still runs through CropManager, video crop through cropTool. Duplicated logic tolerated.
   - **Unify**: extract CropManager core into cropTool, rewire MpiCanvas to consume it. Higher risk, more value. Recommended as separate tracker item (not part of this plan finish).
2. **MpiCanvasViewer shadow update skipped**: types.js cropTool reference, grep for leftover inline crop code inside MpiCanvasViewer — do a sanity pass in session 2.
3. **No dev-gallery showcase for MpiVideoViewer** added. Session 1 skipped to avoid coupling verification to gallery. Add it in session 2 for visual regression.
4. **No app-run verification**. Neither viewer nor branch tested against live video itemGroup — code compiles/imports resolve, but golden-path click-video-in-gallery not exercised. First action in session 2 = run app, open video project, verify flow.
5. **Code-quality review loop skipped**. Skill dictates 2-stage review per task. Spec review done for step 1 (2 iterations). Steps 2–5 got implementer self-review only. Session 2 should run a final code-reviewer pass on the whole branch (`superpowers:requesting-code-review` skill).

---

## Session 2 — TODO

### 6. Meta schema + ffprobe

- Install `ffmpeg-static` + `ffprobe-static` npm packages.
- Create `services/ffmpegBinary.js` — resolve bundled ffmpeg/ffprobe path (dev: npm pkg `path`; packaged: `process.resourcesPath`).
- Modify `services/projectService.js` — on video save (or on project-load reconciliation if missing), spawn ffprobe on each video file, persist `{ fps, duration, frameCount, hasAudio }` into `.meta/<uuid>.json`.
- Load this meta when constructing the group object passed to `MpiGroupHistoryBlock` so `loadVideo(url, meta)` gets real fps (not fallback 24).
- Backfill command (optional): one-shot route to re-probe all existing video meta on demand.

### 7. Backend crop route

- Create `routes/videoCrop.js` — `POST /api/video/crop { groupId, itemId, cropRect, outFileName }` → spawn ffmpeg `-vf crop=...` + re-encode (h264 + aac if audio) → write to project Media dir → register new itemGroup via projectService → emit `generation:complete { id, item, group }` so history auto-appends.
- Wire route into `server.js` / `app.js` router.
- Error path: cleanup partial files, emit `generation:error`.

### 8. HistoryTools video-mode variant

- `MpiHistoryTools` needs a `mode` prop or variant to show a video-action-bar with **Save Snapshot** + **Save Cropped Video** buttons when `crop` mode active on a video group.
- Save Snapshot: `videoViewer.el.captureSnapshot()` → POST blob to projectService endpoint for gallery save → emit `media:imported` → toast "Snapshot saved to gallery".
- Save Cropped Video: POST to `/api/video/crop` with rect from `videoViewer.el.getCropRect()`.
- Replace minimal tools array in `MpiGroupHistoryBlock` with full video-mode toolbar definition.

### 9. Video Upscale + Interpolate toolbars

- Verify `operationRegistry` already has video-capable ops (plan says yes — `_opOptions()` already filters on `requiresVideo`).
- Wire op selection → Run button in toolbar action bar → commandExecutor with params baked into workflow JSON.
- UI is minimal: just a Run button. Param panels deferred to follow-up tracker.

### 10. Docs pass (requires user approval per CLAUDE.md cardinal rule 3)

Update after steps 6–9 merged:
- `.claude/rules/component-mounts.md` — add MpiVideoPlayer (Compound now), MpiVideoViewer, branching in MpiGroupHistoryBlock.
- `.claude/rules/component-events.md` — add events emitted/listened by MpiVideoPlayer, MpiVideoViewer.
- `.claude/rules/component-state.md` — any state reads/writes (likely none new).
- `.claude/rules/component-comfy.md` — Video Upscale / Interpolate workflow injection points if any.

**DO NOT update rules files without explicit user permission.** Ask first.

---

## Session 2 first actions (recommended order)

1. `git status` + `git log --oneline master..HEAD` — confirm branch state.
2. Run app (`npm run start:electron` or equivalent). Open existing project with at least one video itemGroup.
3. Click video card in gallery → verify history opens + video plays. If broken, fix before starting step 6.
4. Regression check: click image card → confirm image workspace still fine.
5. Proceed with step 6 (ffmpeg-static install + probe wiring).

---

## Files changed in session 1 (full list)

**Created:**
- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js` (moved from Blocks)
- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.css` (moved from Blocks)
- `js/components/Compounds/MpiVideoViewer/MpiVideoViewer.js`
- `js/components/Compounds/MpiVideoViewer/MpiVideoViewer.css`
- `js/utils/cropTool.js`

**Modified:**
- `js/utils/icons.js` (+4 icons)
- `js/shell/preloadStyles.js` (MpiVideoPlayer moved to Compounds section + MpiVideoViewer added)
- `js/pages/components.js` (import path update)
- `js/components/types.js` (tier comments, new typedef)
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` (branching logic)

**Deleted:**
- `js/components/Blocks/MpiVideoPlayer/` (directory + contents — moved via git mv)

**Untouched (per rules):**
- `js/components/factory.js`
- `js/components/Compounds/MpiVolumeControl/MpiVolumeControl.js`
- `js/components/Blocks/MpiCanvasViewer/MpiCanvasViewer.js` (actually a Compound per CLAUDE.md tier inspection — kept unchanged, uses own CropManager)
