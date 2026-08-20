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

**Top-right action column (MPI-564).** One flex column, fixed order: Favourite → Notes → Reuse. Favourite is hover-revealed but stays visible while favourited; Reuse is hover-only and hides when the selected item has no reusable prompt; the **Notes marker is persistent** — `notesWrap.style.display` is driven by `selected?.notes?.trim()`, so it appears only on an annotated card and needs no hover, which is the point (scanning a shared project for annotated cards). Clicking it emits the same `card-notes` event as the context-menu entry. Notes live on the **selected history item** (`item.notes`, sidecar-persisted), not the group — so the marker follows `selectedIndex`. A card's `_getGroupRenderKey` carries a `notes` flag; without it a notes edit that arrives via a full grid re-render (rather than `refreshGroup`) would not repaint the marker.

## "Open in file system" — single-select reveal, folder fallback

Gallery context-menu "Open in file system" → `reveal` event → `/reveal-item` route. Single card reveals + selects the media file cross-platform via Electron `shell.showItemInFolder` (browser-dev fallback: `explorer /select,` · `open -R` · Linux `xdg-open` on the parent — no portable select flag). **`explorer.exe /select,` returns exit code 1 even on SUCCESS** — the platform fallback ignores its error (Windows only). Multiple cards can't be multi-selected portably → falls back to opening the `Media` folder via the existing `/open-folder` route.

## Window-drop — no stopPropagation

`MpiGalleryBlock` binds `dragenter/dragleave/dragover/drop` on **`window`** to show/hide its `MpiMediaDropOverlay`. The window `drop` handler ONLY hides the overlay + resets a drag counter — actual import runs from the overlay element's own listener. Any other drop target must call `preventDefault()` but NOT `stopPropagation()` — swallowing the bubble starves the gallery's window-level cleanup, leaving the overlay stuck open. Found MPI-82.

## Card drag — two consumers on ONE dragstart (MPI-318)

A gallery card's `dragstart` (image thumb + video thumb, `MpiGalleryGrid.js`) feeds **both**: (1) `dataTransfer.setData('application/mpi-media', …)` → in-app drops (PromptBox chip, group-history); (2) `_addDownloadUrl()` sets a Chromium `DownloadURL` (`mime:realname:/project-file?path=` URL) → OS drag-out to a folder with the real Media-folder filename. Both ride the SAME HTML5 drag. **NEVER `e.preventDefault()` in this handler** — it kills the in-app drop (the whole card was reverted once for exactly that). `DownloadURL` is single-file only (Chromium cap).

**`DownloadURL` is a virtual-file PROMISE, not a path (MPI-363).** Explorer/Finder materialize it — that's why folder drops work — but third-party targets (Discord, Photoshop, browser upload zones) read `CF_HDROP` and see nothing, so a plain drag into another app is a silent no-op. Real-path handoff needs Electron `webContents.startDrag`, which **replaces** the in-flight HTML5 drag (documented pattern = `e.preventDefault()` + `startDrag` inside `dragstart`) → it can never share the plain-drag gesture with the in-app drop, and an HTML5 drag can't be upgraded mid-flight. Second gesture instead: **Alt+drag** → `_tryNativeDragOut()` → `drag-out-files` IPC → `startDrag` in `main.js`. Ctrl/Shift are taken by gallery selection; Alt is free. Alt+dragging a card inside an active selection drags EVERY selected file (`startDrag` takes an array — this is the multi-select export `DownloadURL` couldn't do). The `preventDefault` ban above still holds for the plain path; the Alt path is gated on `e.altKey` + `window.require` (browser-dev has neither, so it falls through to HTML5). Windows reads drop modifiers at DROP time, so Alt can be released once moving and Explorer still copies instead of making a shortcut.

## Hover audio + scroll-stop

MPI-132: hovering a gallery VIDEO card unmutes+plays its `<video>`; hovering an AUDIO card plays its hidden `<audio>`. Gated by the toolbar VOLUME slider — `Storage.getGalleryVolume()` (`mpi_gallery_volume`, default 0.8), read into a setup-scope `_volume`. **0 IS the mute**, and the two card kinds treat it differently on purpose: an audio card skips hover play entirely (silent playback would only show a lying stop icon), a video card still previews but stays muted. The old "Play audio on hover" Settings toggle and its `mpi_play_audio_on_hover` key were REMOVED when the slider landed — the slider is the only control. One-card-at-a-time via `_stopOtherGalleryMedia(except)` covering BOTH `audio[data-src]` AND `video.mpi-group-card__thumb--video`. SCROLL BUG: `mouseleave` does NOT fire when the card scrolls out from under a STATIONARY cursor. Do NOT rely on mouseleave alone for "stopped hovering" in a scrollable list.

**Scroll gate (MPI-321).** Scrolling drags the cursor across cards, firing `mouseenter` on each → without a gate every one plays → stutter + audio blares on scroll-past. Now: a setup-scope `_isScrolling` flag; the grid `scroll` handler sets it, calls `_stopOtherGalleryMedia(null)` (stops ALL media, including under the cursor), and restarts a 150ms idle timer. The idle timer clears the flag and replays whatever card the cursor settled on via `qs('.mpi-group-card:hover')?._hoverPlay?.()` (mouseenter won't re-fire — the scroll moved, not the pointer). `mouseenter` (audio + video) and `_promoteVideo`'s hover-autoplay both bail while `_isScrolling`. Each card exposes `cardEl._hoverPlay` (video/audio play logic; no-op for image). A REAL hover (not scrolling) plays instantly — no dwell. Rejected first attempt: a 200ms hover-intent dwell — the wait-to-play felt bad.

**`currentTime = 0` is NOT free at position 0 (MPI-583).** The scroll gate above calls `_stopOtherGalleryMedia(null)` on EVERY scroll event, and that sweep used to `pause()` + seek + re-mute every video in the DOM unconditionally. Blink does **not** short-circuit a seek to the position the element already holds: measured **1000 `seeking` events for 10 sweeps over 100 videos**, each queuing a demux + decode of frame 0. A scrollbar drag fires ~60–100 scroll events/s, so a gallery full of promoted videos took thousands of seeks/s and the scroll visibly lagged. The sweep now early-outs on `if (m.paused && !m.currentTime) return;` — 60 sweeps over 100 videos went 23.7 ms → 0.5 ms, idle seeks 1000 → 0, while a genuinely playing card still stops (paused, `t 0`, re-muted). **Do not restore the unconditional seek**, and treat "the element is already at 0 so this is a no-op" as false for any media element. Note this is the STOP path, not playback — the `_isScrolling` gate already keeps hover from playing anything mid-scroll, and a cursor parked on the scrollbar never fires `mouseenter` at all, so a scroll-lag report here is about the sweep, not about videos trying to play.

## Live preview frames — exercising a generating card without a GPU

A card exposes `cardEl.updatePreview(objectUrl, clip)` and `cardEl.resetPreviewClip(clip)`; the
grid-level `el.updatePreview` / `el.resetPreviewClip` are thin forwarders that look the card up in
`_cardMap` (keyed by **group id**, despite the `tempId` parameter name). **Frame buffering,
eviction and loop semantics are NOT here** — they belong to the clip player and its bus; read
[preview-bus.md](preview-bus.md) before reasoning about ring size or replay rate.

What is useful from the gallery side: the burst-previewer path (H3/LTX clip frames) is entirely
client-side, so it reproduces from the page with **no generation, no GPU and no cost** — feed a
burst far larger than the buffer and the eviction race arises in one tick (MPI-565):

```js
const st = (await import('/js/state.js')).state;
const gid = st.currentProject.itemGroups[0].id;
const card = el.getCardByGroupId(gid);
card.setGenerating(null);                                            // a finished card becomes live
const b = await new Promise(r => canvas.toBlob(r, 'image/jpeg'));    // real decodable bytes
for (let i = 0; i < 40; i++) card.updatePreview(URL.createObjectURL(b), { rate: 8, length: 8 });
```

Put a fix behind a temporary `window.__AB_OFF` flag and feed the identical burst both ways — same
harness on both sides, or "0 errors" only proves the harness got quieter. The control that matters
is the same probe on a slow still-mode run (krea2, ~9 s between frames): 0 errors over 6 frames is
what proves a race is a *burst*-only window rather than a fix that happened to work.

Two lookup traps in such a probe: `activeGenerations.list()` is **EMPTY after a page reload** even
while a card still shows generating — that run belongs to the previous renderer — so take the group
id off `state` and use `getCardByGroupId`, never `list()[0].tempId`. And the generating card's
wrapper carries no `data-group-id`; that lives on the ROW wrapper, so `closest()` from the card
returns null.

## Selection survives setGroups refresh (2026-07-12)

`MpiGalleryGrid.setGroups()` used to `_selectedIds.clear()` unconditionally → a generation finishing mid-select (which re-feeds the grid) silently dropped the user's multi-select and kicked them out of selection mode. Fix: reconcile instead of clear — keep selected ids whose group still exists, drop only vanished ones, and `_exitSelectionMode()` only when the set empties. Any grid refresh path that replaces `_groups` must preserve live selection, not reset it.
