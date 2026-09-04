# Gallery

Contracts for `MpiGalleryBlock` / `MpiGalleryGrid` — card rendering, media playback, selection,
drag-drop. Generation dispatch/stop semantics live in
[generation-lifecycle.md](generation-lifecycle.md). Verify a named file/function/flag still
exists before relying on an entry.

## Video thumbnail pattern

Three-stage pattern in `MpiGalleryGrid.js`: (1) Poster paint — `<img>` on the rendition ladder below (512/1280 WebP from `services/ffmpegThumb.js`) renders instantly. (2) Lazy promotion — grid-level `IntersectionObserver` (rootMargin 200px) calls `card.el.promoteVideo()` when wrapper enters viewport; creates `<video preload=auto>`, fades in once `loadeddata` fires. (3) Hover playback — `mouseenter` calls `play()`; `mouseleave` pauses + resets to frame 0. Element persists so replay works on second hover. `--hover-video-ready` class must NOT be removed on mouseleave — it keeps the paused still visible.

**Images get a thumb too (MPI-319).** A 512px **WebP** at `.meta/<id>.thumb.webp` via `extractImageThumb` (same `ffmpegThumb.js`), written on save-generation + import in `routes/projects.js`. **`extractImageThumb` returns the path it ACTUALLY wrote** — callers pass a `.thumb.jpg` path and must use the return value, not the path they passed. The viewer still opens full-res (`filePath`). Decoding 100+ full-res 4K PNGs was the scroll-jank cause (~179x heavier than thumbs). Pre-existing images (made before thumbs) backfill via `POST /backfill-media-derivatives`, fired fire-and-forget on project load (`projectService._backfillMediaDerivatives`), which patches live items + rebuilds the grid. Derivatives live/die with the sidecar — the GC and the delete paths match `DERIVATIVE_RE` (`<id>.thumb.*` / `<id>.proxy.*`) by prefix rather than by an extension list, because three separate lists had to be edited in lock-step and a missed one leaks a file per asset.

## The rendition ladder — a card mounts what it is drawn at (MPI-633)

512 served every card size, so at slider level 4 on a wide window a card painted ~775-1250px from a 512px source — a 2x upscale, and users went to the History workspace to see their own asset. There are now two image renditions (`IMAGE_RENDITION_PX` in `ffmpegThumb.js`): 512 at `<id>.thumb.webp` and 1280 at `<id>.thumb.1280.webp`.

**The rule is `pickImageRendition(item, boxPx)` in [js/utils/galleryRenditions.js](../js/utils/galleryRenditions.js)** — its own module because `MpiGalleryGrid.js` imports `/js/utils/dom.js` by absolute browser path, so Node cannot import it and the rule would have been untestable where it lived (`tests/gallery-renditions.test.cjs`). Smallest rendition covering the box, else `filePath`.

- **Keyed off the RENDERED BOX** (`max(width, height)` from the justified packer, `card.el.setRenderBox`), **not items-per-row**: with justified rows three PORTRAIT cards are narrow but tall, so a column count says nothing about painted pixels.
- **DEVICE pixels.** At 150% Windows scaling a 775px card rasterises at 1163; picking off the CSS box leaves exactly the users on scaled displays with the upscale this fixes.
- **Nothing above 1280.** A bigger card upscales the 1280 rendition rather than mounting a 4K original — the viewer is where full resolution belongs.
- **Never generated above the source**, so a 1280x800 asset (most of them) has no `.1280.webp` and a big card mounts `filePath`. Falling through to `filePath` is the correct answer, not a miss.

**A VIDEO poster is on the same ladder (MPI-689)** — same `extractVideoThumb`, same `.thumb.webp` / `.thumb.1280.webp` names, painted into the same base `<img>` that sits under the hover overlay. It was a 256px JPG until then, i.e. a 3-5x upscale on any large card, and the reason videos "only look right on hover": hover mounts the 720p proxy. That poster is not a brief flash either — it is what EVERY video card falls back to for the whole of a generation, because `_releaseMedia('generation')` demotes them all.

Two things differ from the image side, both because a clip's `filePath` is a video and the poster is an `<img>`:

- `pickImageRendition(item, box, { allowSource: false })` for a video — the `filePath` fallback that is right for an image would paint an `.mp4` into an `<img>`.
- So the large poster is owed by any clip **wider than the SMALL tier**, not wider than the large one: there is no "the source IS that tier" case to fall through to. `min(1280,iw)` still caps it, so a 768-wide clip gets a 768-wide large poster.

A video with NO poster at all keeps the `<video preload=metadata>` base thumb — `_isPosterLadderCard()` excludes it for exactly that reason.

### Retention is per decoded URL, and the page cannot evict it

**This is the part that was designed wrong first, so do not re-derive it from intuition.** MPI-633 shipped an image-side demote on the `DEMOTE_MARGIN_PX` observer expecting it to return the memory, because the no-scroll control was cheap. It does not. Measured on a 120-card rig at slider level 4, one app process per config, `getAppMetrics()` pids (`tasks/MPI-633/validation.md`):

| config | resting delta | cards still on the large src |
|---|---|---|
| the ladder, demote firing | 236.5 MB | 6 |
| the same tour, no demote possible | 234.5 MB | 120 |

Every off-screen card really had swapped back to its 512 thumb and the number did not move. Chromium's GPU image cache keeps a decoded image keyed by **URL**, so once a card has PAINTED its large rendition the memory is spent whether or not anything still points at it — and no page API evicts it.

So the lever is **how many distinct large renditions ever get painted**, and the thing that bounds it is the scroll gate: `promoteImage` refuses while `_isScrolling`, and the existing 150 ms scroll-idle timer (MPI-321) sweeps the band you came to rest on via `_promoteVisibleImages()`. A fling past 120 cards then paints 6 large renditions instead of 120:

| tour | ladder + gate | no gate possible |
|---|---|---|
| fling (one gesture, ~16 ms steps) | **73.8 MB** | 241.5 MB |
| 44-stop dwell tour | 221.9 MB | 234.5 MB |

The no-scroll floor for the same config was 72.9 MB, so the gate takes a full fling to essentially the cost of what is on screen. The dwell tour is the honest ceiling: a user who stops 44 times down a 120-card gallery pays for what they stopped on, and that is the design working, not failing. **Absolute numbers drift between sessions** (the same control read 23.7 MB in Phase 0 and 72.9 later) — only compare configs measured in one run.

The demote is kept: it bounds the working set and leaves the off-screen entries unreferenced, hence discardable under real pressure. It is not what makes the ladder affordable. Regression spec: `tests/desktop/gallery-renditions.spec.js` — the fling case asserts through `performance` resource entries (each card's large rendition carries a cache-busting query), because at rest the demote has put everything back on the small thumb and the DOM cannot tell a banded sweep from one that promoted everything. **Clear the resource-timing buffer first**: the shell's boot fills the default 250 entries, and a full buffer drops new ones silently, which looks exactly like a perfect gate.

## Video hover proxy — the decoder ignores your card size (MPI-633)

`_promoteVideo` used to mount the full-resolution master. A decoder works at the clip's NATIVE resolution however small the card is — measured, the same 3000x1280 clip cost 81.2 MB per promoted card in a 64x80 box and 82.4 MB in a 134x167 one, across 4.4x the painted area. Cost tracks pixels at **~20 MB per megapixel per promoted card**, so the file is the only lever.

`<id>.proxy.mp4` at `VIDEO_PROXY_HEIGHT` (720), h264 CRF 26 veryfast, **with audio** — hovering a card plays sound (MPI-132), and a silent proxy would make the volume slider a lie. 65-81 MB/card becomes 11-21, a 6x cut; 480p buys ~10 MB more and is visibly soft on a 775px card. Written by `writeVideoDerivatives` in `ffmpegThumb.js`, which all five video routes (import, save-generation, concat, crop, reverse) call instead of each repeating the poster extraction. `proxyPath` is **absent for a clip at or under 720p** — the master IS the proxy there. The grid mounts `selected.proxyPath || filePath`; the viewer, drag-out and reveal read the item's `filePath` and are untouched.

**WebP, because JPG has no alpha — and the symptom is NOT a white backdrop (MPI-627).** Background removal writes its mask into the ALPHA channel and leaves the source RGB untouched, so flattening that PNG into a JPG thumb restored the **original image whole**, backdrop and drop-shadow included: the card looked like the pre-removal import while the viewer (full-res `filePath`) showed the cut-out. WebP keeps alpha, so the cut-out composites over `.mpi-group-card__media`'s `--surface-3`, and it is also *smaller* than the JPG it replaced (512px measured: 30 KB vs 44 KB photo). The backfill above therefore **replaces** a legacy `.thumb.jpg` whose source is `.png/.webp/.avif/.gif` (a JPG source can never carry alpha, so it keeps its thumb) and deletes the stale jpg — which is why the backfill patches on a CHANGED value rather than on a missing thumbPath; an item left holding the deleted URL would 404 its card until the next project load. Its map is `{ itemId: { thumbPath, thumbPathLg, proxyPath } }` (MPI-633) — a string value could not express the common case, an item whose `thumbPath` is already right and whose large rendition is the only new thing, which compares equal and never reaches the card. Test: `tests/image-thumb-alpha.test.cjs` (asserts a transparent pixel survives the downscale — the extension is not the thing that matters).

## Media suspension — the gallery hands its VRAM back (MPI-631)

A promoted hover `<video>` is `preload="auto"`, so it holds a decoder and its decode surfaces for as long as the element exists. Promotion used to be a **one-way ratchet** — the promote `IntersectionObserver` called `unobserve` the moment a card promoted — so every video card that ever scrolled past kept its decoder for the life of the grid. Measured on a 161-asset project (RTX 4060 Ti, engine not running): Vision held **410 MB** of dedicated VRAM idle on landing and **1858 MB** after one scroll through the gallery, byte-identical for 13 idle minutes with zero decay. Entering the History workspace dropped it to **404 MB** — navigating away destroys the grid, which was the only thing that ever released it.

The point is not idle tidiness. It is that 1.5 GB of gallery on a 16 GB card is VRAM the user does not get to generate with.

So promotion is **suspendable**. `_mediaHolds` is a Set of reasons, not a boolean, because the two suspenders overlap constantly — a Flow is an overlay AND it dispatches generations, so a boolean would resume on the flow closing while its generation still ran. `_releaseMedia(reason)` adds a hold, stops playback and demotes every promoted card via the pre-existing `_removeHoverVideo`; `_resumeMedia(reason)` drops one hold and, only when the last one goes, re-promotes what is on screen.

Two whole-grid holds, both driven from inside the grid:

| hold | released on | resumed on |
|---|---|---|
| `'overlay'` | `Overlays.onDepthChange` depth > 0 — the same MPI-570 choke point every overlay already routes through | depth back to 0 |
| `'generation'` | `generation:started` | `generation:complete` **and** `state.generationQueueCount === 0`, re-checked after 150 ms |

Plus a per-card one that needs no hold: **a card scrolled further than `DEMOTE_MARGIN_PX` out of view demotes itself**, via a SECOND observer. That is what bounds the resting cost to the band you can see rather than everything you have ever scrolled past — the two holds above do nothing for a user sitting in the gallery after a deliberate scroll to the bottom, measured at 1976 MB with both of them already working.

The two observers exist because they need **different margins**: promote at `PROMOTE_MARGIN_PX` (200), demote at `DEMOTE_MARGIN_PX` (600). The gap is hysteresis, not slack — one shared boundary makes a card parked on the edge promote and demote on every few pixels of scroll.

That 150 ms defer is not cosmetic: the last `generation:complete` and the count reaching 0 arrive from decoupled paths in either order (the same race `shell/notificationService.js` defers for), so resuming on the event alone re-promotes the whole visible band mid-generation.

Three things that are easy to get wrong here:

- **Tearing down once is not enough.** `IntersectionObserver.observe()` fires immediately for anything already intersecting, and the observer is still watching every card, so a release with no suspension flag re-promotes the visible band on the next notification and frees nothing. `_promoteVideo` must check the flag.
- **Resume needs a manual sweep.** The observer reports intersection *changes*, and nothing moved while suspended, so re-observing fires nothing. `_resumeMedia` walks `_cardMap` and promotes what is inside the viewport, using `PROMOTE_MARGIN_PX` — the same constant feeding the observer's `rootMargin`. If those two ever disagree, resume paints a different band than scrolling does.
- **Cards must stay observed.** The old `unobserve` is what made this permanent; `_promoteVideo` self-guards on `_videoPromoted`, so leaving cards observed makes a repeat notification a cheap no-op and lets a demoted card promote again on its next scroll-in.

Carve-outs: an explicit hover still promotes ONE card while suspended (`_promoteVideo({ userHover: true })`), and `_onCardLeave` demotes it again so a slow browse during a long generation cannot re-accumulate what the suspension freed. The generating card's live preview is a different path (`updatePreview` / `resetPreviewClip`, see [preview-bus.md](preview-bus.md)) and is untouched.

Regression spec: `tests/desktop/gallery-media-release.spec.js`. Its fixture uses REAL shipped media (the Flow hero clips + stills under `comfy_workflows/display/`) — a made-up src 404s into the missing-media path, which empties `.mpi-group-card__media` so there is nothing to promote, and the spec then reads as a broken fix when the fix is fine.

**Grid virtualisation was considered and deliberately not done.** Images already ship 512px WebP thumbs (~1 MB of texture each), so card count is not the cost — per-video decoder retention is — and windowing would still have ratcheted inside its own band while costing a rewrite of justified layout, selection, drag-out and scroll anchoring.

**A fixture must overflow by more than `DEMOTE_MARGIN_PX`** or the scroll-out demote can never fire and the spec passes green against a broken build. The trigger-C case sizes itself for that deliberately and asserts the overflow before asserting anything else.

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
