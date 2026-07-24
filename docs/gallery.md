# Gallery

Contracts for `MpiGalleryBlock` / `MpiGalleryGrid` — card rendering, media playback, selection,
drag-drop. Generation dispatch/stop semantics live in
[generation-lifecycle.md](generation-lifecycle.md). Verify a named file/function/flag still
exists before relying on an entry.

## Video thumbnail pattern

Three-stage pattern in `MpiGalleryGrid.js`: (1) Poster paint — `<img src=thumbPath>` (256px JPG from `services/ffmpegThumb.js`) renders instantly. (2) Lazy promotion — grid-level `IntersectionObserver` (rootMargin 200px) calls `card.el.promoteVideo()` when wrapper enters viewport; creates `<video preload=auto>`, fades in once `loadeddata` fires. (3) Hover playback — `mouseenter` calls `play()`; `mouseleave` pauses + resets to frame 0. Element persists so replay works on second hover. `--hover-video-ready` class must NOT be removed on mouseleave — it keeps the paused still visible.

**Images get a thumb too (MPI-319).** A 512px JPG at `.meta/<id>.thumb.jpg` via `extractImageThumb` (same `ffmpegThumb.js`), written on save-generation + import in `routes/projects.js`. The grid renders `selected.thumbPath` for images, falling back to `filePath`; the viewer still opens full-res (`filePath`). Decoding 100+ full-res 4K PNGs was the scroll-jank cause (~179x heavier than thumbs). Pre-existing images (made before thumbs) backfill via `POST /backfill-image-thumbs`, fired fire-and-forget on project load (`projectService._backfillImageThumbs`), which patches live items + rebuilds the grid. Thumbs live/die with the sidecar (same GC as video thumbs). Remaining large-project ceiling = DOM node count, not decode → windowing (MPI-322).

## Slider sizing — items-per-row bands

Drive seed from desired items-per-row, not pixel: `target = ((containerWidth - (N-1)*gap) / (N * aspectRef)) * 0.92`. `aspectRef` 1.6. Justified-layout per-row rescaling collapses any two seed pairs that land in the same items-per-row band → two adjacent pixel targets produce identical visual output. Current map: `ITEMS_PER_ROW_TARGET { 1:6, 2:4, 3:3, 4:2 }`. Recompute on BOTH slider input AND ResizeObserver.

## Card chrome — inverse info mode

`MpiGalleryGrid` card chrome uses inverse `galleryShowInfo` model: info OFF = clean media until hover reveals metadata/actions; info ON = metadata by default, hover hides metadata and shows actions. State/preview/selection badges stay persistent. Local chip/button backgrounds, not card-wide radial scrims. Prompt excerpts stay out of gallery cards; bottom metadata = compact dimensions/time only.

## "Open in file system" — single-select reveal, folder fallback

Gallery context-menu "Open in file system" → `reveal` event → `/reveal-item` route. Single card reveals + selects the media file cross-platform via Electron `shell.showItemInFolder` (browser-dev fallback: `explorer /select,` · `open -R` · Linux `xdg-open` on the parent — no portable select flag). **`explorer.exe /select,` returns exit code 1 even on SUCCESS** — the platform fallback ignores its error (Windows only). Multiple cards can't be multi-selected portably → falls back to opening the `Media` folder via the existing `/open-folder` route.

## Window-drop — no stopPropagation

`MpiGalleryBlock` binds `dragenter/dragleave/dragover/drop` on **`window`** to show/hide its `MpiMediaDropOverlay`. The window `drop` handler ONLY hides the overlay + resets a drag counter — actual import runs from the overlay element's own listener. Any other drop target must call `preventDefault()` but NOT `stopPropagation()` — swallowing the bubble starves the gallery's window-level cleanup, leaving the overlay stuck open. Found MPI-82.

## Card drag — two consumers on ONE dragstart (MPI-318)

A gallery card's `dragstart` (image thumb + video thumb, `MpiGalleryGrid.js`) feeds **both**: (1) `dataTransfer.setData('application/mpi-media', …)` → in-app drops (PromptBox chip, group-history); (2) `_addDownloadUrl()` sets a Chromium `DownloadURL` (`mime:realname:/project-file?path=` URL) → OS drag-out to a folder with the real Media-folder filename. Both ride the SAME HTML5 drag. **NEVER `e.preventDefault()` in this handler** — it kills the in-app drop (the whole card was reverted once for exactly that). `DownloadURL` is single-file only (Chromium cap); multi-select export would need `webContents.startDrag` + a disambiguator and was dropped by the user.

## Hover audio + scroll-stop

MPI-132: hovering a gallery VIDEO card unmutes+plays its `<video>`; hovering an AUDIO card plays its hidden `<audio>`. Gated by `Storage.getPlayAudioOnHover()` (`mpi_play_audio_on_hover`, default true). One-card-at-a-time via `_stopOtherGalleryMedia(except)` covering BOTH `audio[data-src]` AND `video.mpi-group-card__thumb--video`. SCROLL BUG: `mouseleave` does NOT fire when the card scrolls out from under a STATIONARY cursor. Do NOT rely on mouseleave alone for "stopped hovering" in a scrollable list.

**Scroll gate (MPI-321).** Scrolling drags the cursor across cards, firing `mouseenter` on each → without a gate every one plays → stutter + audio blares on scroll-past. Now: a setup-scope `_isScrolling` flag; the grid `scroll` handler sets it, calls `_stopOtherGalleryMedia(null)` (stops ALL media, including under the cursor), and restarts a 150ms idle timer. The idle timer clears the flag and replays whatever card the cursor settled on via `qs('.mpi-group-card:hover')?._hoverPlay?.()` (mouseenter won't re-fire — the scroll moved, not the pointer). `mouseenter` (audio + video) and `_promoteVideo`'s hover-autoplay both bail while `_isScrolling`. Each card exposes `cardEl._hoverPlay` (video/audio play logic; no-op for image). A REAL hover (not scrolling) plays instantly — no dwell. Rejected first attempt: a 200ms hover-intent dwell — the wait-to-play felt bad.

## Selection survives setGroups refresh (2026-07-12)

`MpiGalleryGrid.setGroups()` used to `_selectedIds.clear()` unconditionally → a generation finishing mid-select (which re-feeds the grid) silently dropped the user's multi-select and kicked them out of selection mode. Fix: reconcile instead of clear — keep selected ids whose group still exists, drop only vanished ones, and `_exitSelectionMode()` only when the set empties. Any grid refresh path that replaces `_groups` must preserve live selection, not reset it.
