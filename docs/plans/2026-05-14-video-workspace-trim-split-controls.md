# Video workspace trim + split controls

Restructure the video workspace per the Stage `editor-video` mockup. Split the
monolithic `MpiVideoPlayer` into a surface (video only) + a separate control
bar (with embedded trim bar). Introduce always-on trim (in/out points)
persisted per history entry, plus a shared top-right viewer chip primitive.

## Current State

### Component layout today

- `js/components/Compounds/MpiVideoPlayer/MpiVideoPlayer.js` — monolith.
  Owns `<video>`, all controls (play/frame±/loop/audio/fullscreen/frames-
  toggle), the 0–1000 progress slider, the time display, and the video-scoped
  hotkeys (`video.playPause`, `video.frame.back/forward`, `video.volume.up/
  down`, `video.loop`). Emits `play/pause/ended/timeupdate/change/loop-change`.
- `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js:72` — mounts the
  player into a stage area. Has a reserved-but-empty
  `<div class="mpi-video-viewer__timeline"></div>` slot (line 51) waiting for
  the trim UI. Owns the crop overlay canvas. Forwards 6 player events to its
  parent via component-local `emit/on`. Right-click anywhere emits
  `video-viewer:context-menu` on the global Events bus.
- `js/pages/components.js:57` — imports `MpiVideoPlayer` for the dev gallery.
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js:54-62` —
  hard-codes a top-right `__compare-overlay` chip (`#compare-overlay` +
  `#compare-tool-label` + `#compare-btn`). Public API:
  `setCompareEnabled(bool)`, `setActiveToolLabel(label)`, emits
  `compare-clicked`. Block calls `viewer.el.loadCompare(itemA, itemB)` /
  `clearCompare()`.

### Behaviors that must survive the refactor

Hard-won quirks from `MpiVideoPlayer.js`:

- **Frame-step + loop wrap** (lines 296–320). Frame-back wraps to
  `dur - frameStep` when looping; frame-forward wraps to `0`. Both pause
  first.
- **Seek + loop disable/restore dance** (lines 247–262). Slider disables
  `video.loop`, writes `currentTime`, re-enables loop only after the
  `seeked` event fires. Prevents native auto-wrap during a drag. Clamps to
  `duration - frameStep` to avoid seeking past the last frame.
- **0–1000 slider scale.** `pct = (cur / dur) * 1000`. Uses `setValueQuiet`
  on the underlying `MpiProgressBar` to avoid emit storms.
- **`_showFrames` toggle.** Time display switches between `mm:ss.ms` and a
  frame counter; `_frameCount` overrides the derived total when provided
  (avoids `dur * fps` rounding drift).
- **Volume sync via `volumechange`** (lines 366–386). Mute button + volume
  slider mirror the underlying `<video>` state.
- **Hotkeys are window-global** (`js/managers/hotkeyManager.js:52-64` —
  capture-phase `keydown` on `window`). Gating is done via registry `when()`
  callbacks, not workspace scopes. After the split, the new control bar
  rebinds the same registry ids and unbinds on destroy.

### Sidecar + ops surfaces

- Item sidecar = `.meta/<uuid>.json`. Already carries `fps`, `duration`,
  `frameCount`, `hasAudio`, `cropRect`, `videoMeta`, etc. (`docs/project-
  integrity.md:152-162`; example writer at `routes/videoCrop.js:120-147`).
  No existing `trim` field. Sidecar updates today go through
  `POST /project-media/:projectId/update-meta` in `routes/projects.js:765-
  784`, which uses a plain `fs.writeJson()` and **does not queue
  per-sidecar writes**. `updateProjectJson()` (`routes/projects.js:46-66`)
  is per-`project.json` only.
- Range-aware op consumers identified for Phase E:
  - **Snapshot** — `MpiVideoViewer.captureSnapshot()` →
    `captureFrameBlob(video, rect)` in `js/utils/Video.js`. Implicitly
    reads `video.currentTime`.
  - **"Continue from last frame" / Extend** — `MpiGroupHistoryBlock.js`
    around `_handlePromptBoxExtend` (~line 1286) and the I2V frame-capture
    handler `_setFrameFromVideo(role)` (~lines 1203–1273). Both read the
    live playhead. `POST /extend-video` in `routes/videoConcat.js:215-280`
    takes `sourceItemId` and concatenates the whole source. **No
    start/end range parameters exist today.**
  - **Crop export** — `POST /api/video/crop` in `routes/videoCrop.js:45-
    174`. Spatial only; no temporal range.
  - **Frame-step** — already covered above.
- Hotkey ids follow `video.<feature>.<action>` (e.g. `video.frame.back`).
  New ids for trim: `video.trim.in`, `video.trim.out`, `video.trim.clear`.

### Constraints + risks

- **No atomic write helper for item sidecars.** Concurrent trim handle
  drags + auto-save will race against the same `.meta/<uuid>.json`. Plan
  must add or reuse a per-sidecar queue (mirror of `updateProjectJson`).
- **No `_pendingSeekTime` pattern in active code** despite the
  `feedback_chromium_seek_coalescing.md` memory. New `MpiTrimBar` must
  coalesce playhead-drag seeks on RAF or commit only on `mouseup`.
- **`MpiProgressBar` is single-handle.** `MpiTrimBar` is custom from
  scratch (two handles + a playhead + a range fill that extends past the
  track rect per mockup).
- **Stage mockup parity.** Token-only colors:
  `--accent-heat`, `--surface-bar`, `--ink-1…4`, `--line`; spacing
  `--s-2…6`; type `--t-xs / --t-2xs`, tabular-nums. Track 44px tall;
  handles overflow `-8px` top/bottom with caps.
- **Wrapper deletion blast radius** is small (one viewer + one dev
  gallery), but the gallery mount must be migrated before `MpiVideoPlayer`
  is deleted, otherwise the components dev page breaks.

## Completed

- [x] **Phase A.1** — `MpiViewerCorners` Compound (`js/components/Compounds/MpiViewerCorners/{js,css}`). Registered in `preloadStyles.js`, documented in `types.js`, dev-gallery card mounted in `tpl-components.html` + `js/pages/components.js`. Chip strip is flat text per `editor.html` mockup (`gap:16px`, uppercase, no boxes/borders).
- [x] **Phase A.2** — `MpiCanvasViewer` `__compare-overlay` markup deleted; chip strip now routed through `MpiViewerCorners`. Public API preserved: `setCompareEnabled`, `setActiveToolLabel`, `compare-clicked` emit. Old `mpi-canvas-viewer__compare*` CSS removed.
- [x] **Phase B** — `MpiTrimBar` Compound (`js/components/Compounds/MpiTrimBar/{js,css}`). Two-handle trim seek bar + playhead per `editor-video.html` mockup (44px track, ±8px overflow handles w/ 12×4 caps, 2px playhead w/ triangle, 12% heat selection fill). Stage tokens only. Pointer drag coalesces on RAF, commits on `pointerup`. Track click drags playhead from cursor. Frame-snap via `Math.round(t*fps)/fps`. Constraints `0 ≤ in+frame ≤ out ≤ duration`, playhead clamped to `[in, out]`. API: `setDuration`, `setFps`, `setValue(Quiet)`, `setRange(Quiet)`, `getValue`, `getRange`. Emits `seek`, `in-change`, `out-change`, `range-change`. Registered in `preloadStyles.js`, documented in `types.js`, dev-gallery card mounted at `preview-trim-bar-default` (duration 14.74s @ 30fps, in=1.0, out=12.5, value=4.5).
- [x] **Phase C** — `MpiVideoPlayer` monolith split into `MpiVideoSurface` + `MpiVideoControlBar`, both mounted by `MpiVideoViewer`.
    - `MpiVideoSurface` (`js/components/Compounds/MpiVideoSurface/{js,css}`) — bare `<video>` + click-toggle (skipped via `[data-no-toggle]` ancestors). API: `_setSrc`, `_play`, `_pause`, `seek` (loop-disable/seeked-restore dance preserved), `frameStep(±1)` (wrap-on-loop preserved), `getVideoElement`, `_setFps`, `_setFrameCount`, `getFps`, `getFrameCount`, `_setVolume`, `_setMuted`. Emits `play/pause/ended/timeupdate/loadedmetadata/volumechange`. Destroy stops + clears src.
    - `MpiVideoControlBar` (`js/components/Compounds/MpiVideoControlBar/{js,css}`) — owns play/frame±/loop/audio/fullscreen/frames-toggle + time display + embedded `MpiTrimBar`. API: `attachSurface(instance)`, `detachSurface()`, `setRange(Quiet)`, `getRange`, `getValue`, `setVolume`, `setMuted`, `setFrameCount`, `setFps`, `destroy`. Emits `loop-change`. Hotkeys (`video.playPause/frame.back/frame.forward/volume.up/volume.down/loop`) bound on `attachSurface`, unbound on `detachSurface`/`destroy`. Range default = full clip on each `loadedmetadata` (persistence in Phase D).
    - `MpiVideoViewer` reshaped — `[data-mount="surface"]` mounts `MpiVideoSurface`; `__timeline` slot now hosts `MpiVideoControlBar`. Controls flag still respected. Forwards same 6 external events: `play/pause/ended/timeupdate` from surface, `change` synthesised from surface `volumechange`, `loop-change` from control bar. Crop tool, snapshot, `getSourceElement`, `loadVideo` API stable; `loadVideo` now propagates `meta.fps`/`frameCount` to BOTH surface + control bar. Destroy chains control bar → surface.
    - CSS registered in `preloadStyles.js`; both compounds documented in `types.js`. Dev-gallery `MpiVideoPlayer` card untouched (Phase G).
- [x] **Phase E** — Range-aware ops + loop-within-range.
    - `MpiVideoSurface.frameStep(direction, range?)` — accepts `{ rangeIn, rangeOut, loop }`. Frame-step works in integer frame space (`round(t*fps)`) to avoid float drift at range edges. Out timestamp is inclusive: `round(hi*fps)` is the last visible frame. `loop` is passed explicitly because native `video.loop` is forced off when range is a strict subset of the clip.
    - `MpiVideoControlBar` — tracks `_loopIntent` separately from `video.loop`. `_syncNativeLoop()` disables native loop when range ≠ full clip; the `timeupdate` listener emulates loop (`_surface.seek(_in)` at `_out` if loop on; `_surface._pause()` otherwise). Range-loop branch gates on `!video.paused` so frame-step paused state is not re-routed.
    - `MpiVideoViewer.captureSnapshot({ time }?)` — optional `time` triggers `seek + await 'seeked' + capture`; otherwise defensively clamps playhead to active range if outside.
    - `MpiGroupHistoryBlock._setFrameFromVideo(role)` — passes `time: item.trim.out` to `captureSnapshot` when trim is set. `prompt-box-tools:extend` payload carries `trimIn`/`trimOut`; `/api/video/crop` POST body carries `trimIn`/`trimOut`.
    - `js/services/generationService.js` — `/extend-video` body forwards `trimIn/trimOut` from `GenerationConfig`.
    - `services/videoConcat.js` — `concatVideos(inputs, out, { onProgress, inputRanges })`: per-input `-ss/-to` input-seek in filter path; demuxer fast-path bypassed when any range present; `totalDurationSec` uses sliced lengths.
    - `routes/videoConcat.js` `/extend-video` accepts `trimIn/trimOut` and builds `inputRanges=[{in,out}, null]`.
    - `routes/videoCrop.js` `/api/video/crop` accepts `trimIn/trimOut`; inserts `-ss <in> -to <out>` before `-i`. Output sidecar omits `trim`; duration/frameCount from output probe.

- [x] **Phase D** — Trim persistence + I/O/X hotkeys.
    - `routes/projects.js` — added `updateItemMeta(metaPath, updater)` per-sidecar queue (mirrors `updateProjectJson()` shape: serialize on path key, read → updater → `writeJsonAtomic` temp-rename). `POST /project-media/:projectId/update-meta` now routes through it (request shape unchanged).
    - `MpiVideoControlBar` emits `range-change`; new `el.setPendingTrim(in, out)` stashes a one-shot range applied on the next `loadedmetadata` (survives the default full-clip reset). `I` / `O` / `X` hotkeys bound on `attachSurface`, unbound on `detachSurface` — set in/out to current playhead (clamped) or reset range to `[0, duration]`.
    - `MpiVideoViewer` forwards `loadedmetadata` + `range-change`; `loadVideo(url, meta)` propagates `meta.trim` to `setPendingTrim`. New convenience: `el.setRangeQuiet`, `el.getRange`.
    - `MpiGroupHistoryBlock` — listens to `viewer.on('range-change')` (debounced 250ms) and `POST /project-media/:projectId/update-meta` with `{ trim: { in, out } }` (or `{ trim: null }` when range == full clip). Mirrors in-memory `item.trim` for sidecar parity. All 6 `viewer.el.loadVideo(...)` call sites pass `trim: item.trim`.
    - `js/managers/hotkeyRegistry.js` — three new ids registered with category `video`: `video.trim.in` (`I`), `video.trim.out` (`O`), `video.trim.clear` (`X`).
    - Sidecar field `trim` documented in `docs/project-integrity.md`.

## Remaining Work

### Phase A: Top-right viewer chip primitive

Goal: introduce a dumb, shared top-right chip strip, migrate the image
workspace's hard-coded compare overlay onto it, leave the image workspace
behavior identical, and prepare the video workspace to mount its own chip
later in Phase F.

- [x] Create `js/components/Compounds/MpiViewerCorners/MpiViewerCorners.{js,
      css}`. Props: `topRight: [{ text, accent?, disabled?, onClick? }]`.
      No top-left. Use BEM (`.mpi-viewer-corners__chip…`). Use only existing
      Stage tokens (subtle backdrop via `var(--surface-bar)` + `var(--line)`
      so chips stay readable over bright media). Register the css in
      `js/shell/preloadStyles.js` and document the props in
      `js/components/types.js`. Provide a minimal instance API:
      `el.setTopRight(items)`, `el.setChipEnabled(index, bool)`.
      **Verify:** Mount the component on the dev gallery
      (`js/pages/components.js`) with two static chips and confirm visual
      parity with the mockup (heights, padding, backdrop, hover); confirm
      `el.destroy()` removes any internal listeners cleanly (factory unsub
      pattern).
- [x] Migrate `MpiCanvasViewer`'s `__compare-overlay` DOM (lines 54-62) onto
      `MpiViewerCorners`. Drop the hard-coded markup. Keep the viewer's
      public API stable: `setCompareEnabled`, `setActiveToolLabel`,
      `loadCompare`, `clearCompare`, and the `compare-clicked` emit must
      still work — implementations now route through the chip's `onClick`
      and the chip's text. **Verify:** Open the image workspace, navigate
      to an item with compare available — chip appears top-right with the
      correct label, clicking dispatches `compare-clicked`,
      `setCompareEnabled(false)` greys it out. Navigate away and back; no
      duplicate chips and no warnings about listener leaks.

### Phase B: `MpiTrimBar` Compound (isolated)

Goal: build the trim seek bar as a self-contained Compound, validated on
the dev gallery before any wiring into the video workspace.

- [x] Create `js/components/Compounds/MpiTrimBar/MpiTrimBar.{js,css}`.
      Props: `duration`, `fps`, `value` (playhead seconds), `inPoint`,
      `outPoint`. Emits component-local `seek { time }`,
      `in-change { time }`, `out-change { time }`, `range-change { in, out
      }`. Use BEM, Stage tokens only, no raw SVG. Implementation notes:
      - Three draggable elements (in handle, out handle, playhead) plus a
        track + range fill. Handles overflow the track by 8px top/bottom
        with end-caps per mockup.
      - Constraints: `0 ≤ in ≤ playhead ≤ out ≤ duration` (snap to nearest
        frame using `fps`).
      - During drag, accumulate target seek on RAF tick or commit only on
        `mouseup` (per `feedback_chromium_seek_coalescing.md`). Do not
        write the playhead on every pixel.
      - Provide `el.setValueQuiet(t)`, `el.setRangeQuiet(in, out)` to
        receive external sync without re-emitting.
      - Use `on()/off()` helpers, store unsubs in `_unsubs`, implement
        `el.destroy()`.
      Register css in `preloadStyles.js`. Document props in `types.js`.
      **Verify:** Mount on the dev gallery with `duration: 14.74`,
      `fps: 30`, `inPoint: 1.0`, `outPoint: 12.5`. Drag each handle and the
      playhead; confirm visual range fill updates, constraints hold, frame
      snapping is correct at the boundaries, events fire as expected, and
      `el.destroy()` followed by remount leaves no dangling listeners
      (check via repeated mount/unmount in DevTools).

### Phase C: Split `MpiVideoPlayer` → `MpiVideoSurface` + `MpiVideoControlBar`

Goal: replace the monolith with two siblings, both mounted by
`MpiVideoViewer`. Range UX is visual-only at this stage (no persistence,
no op rewiring).

- [x] Create `js/components/Compounds/MpiVideoSurface/MpiVideoSurface.{js,
      css}`. Owns the bare `<video>` element + the click-to-toggle-play
      gesture. Emits component-local `play/pause/ended/timeupdate/
      loadedmetadata/volumechange`. API: `el._setSrc(url)`,
      `el._play()`, `el._pause()`, `el.seek(t)` (uses the same loop-
      disable/seeked-restore dance from `MpiVideoPlayer.js:247-262`),
      `el.frameStep(±1)` (preserves the wrap-on-loop semantics from lines
      296–320 — when no range is set), `el.getVideoElement()`,
      `el._setFps(fps)`, `el._setFrameCount(n)`. Register css in
      `preloadStyles.js`, document in `types.js`. **Verify:** Replace the
      `MpiVideoViewer` player mount with `MpiVideoSurface` temporarily; the
      video loads, plays/pauses on click, frame-stepping via the public API
      works in console, no console errors.
- [x] Create `js/components/Compounds/MpiVideoControlBar/MpiVideoControlBar.
      {js,css}`. Owns play/frame±/loop/audio/fullscreen/frames-toggle
      buttons, time display, and embeds `MpiTrimBar`. API:
      `el.attachSurface(surfaceEl)` (direct ref wiring; parent-child events
      stay component-local — no global bus). Internal logic:
      - On `attachSurface`, subscribe to surface events
        (`timeupdate/play/pause/volumechange/loadedmetadata`) and drive UI.
        On detach/destroy, unsubscribe.
      - All existing video hotkeys (`video.playPause`, `video.frame.back/
        forward`, `video.volume.up/down`, `video.loop`) move here.
      - Loop semantics: native `<video>.loop` continues to wrap to 0; the
        control bar adds an "if playhead >= out: surface.seek(in)" branch
        inside its own `timeupdate` listener (so the surface stays naive
        of ranges, per investigation recommendation). For Phase C, range
        defaults to the full clip, so behavior is identical to today.
      - Volume sync uses surface `volumechange`/`change` events, not raw
        `<video>` listeners (per the `feedback_video_first_frame_paint.md`
        and the post-split sync recommendation).
      Register css in `preloadStyles.js`, document in `types.js`.
      **Verify:** Mount in a temporary harness on the dev gallery; full
      control parity with the old player (play/pause, frame-step,
      loop-wrap, frame-counter, volume slider+mute, fullscreen, hotkeys).
- [x] Reshape `MpiVideoViewer`. Mount `MpiVideoSurface` in the stage area
      (replaces the old player mount). Mount `MpiVideoControlBar` into the
      pre-existing `.mpi-video-viewer__timeline` slot. Call
      `controlBar.attachSurface(surfaceEl)` after both mount. Forward the
      same six external events the viewer emits today (play/pause/ended/
      timeupdate/change/loop-change) — re-route them from the surface (5)
      + control bar (`loop-change`). Crop overlay stays parented to the
      stage. Update `el.getSourceElement()` to return
      `surface.el.getVideoElement()`. Keep `el.captureSnapshot`,
      `enterCropMode`, `exitCropMode`, `getCropRect`, `setCropRatio` — they
      keep working through the surface. **Verify:** Open the video
      workspace, load a video, exercise play / frame± / loop / volume /
      fullscreen / frames-toggle / crop tool / snapshot / right-click
      context menu. Behavior matches today. Trim handles visible on the
      track but default to full-range; range is purely visual at this
      stage.

### Phase D: Trim persistence + hotkeys

Goal: range survives reload, with safe concurrent writes, and is settable
without touching the mouse.

- [x] Add a per-sidecar atomic write helper. Either (a) extend the
      `/project-media/:projectId/update-meta` route in
      `routes/projects.js:765-784` with a per-path queue + `writeJsonAtomic`
      mirroring `updateProjectJson()`, or (b) add a new `updateItemMeta
      (metaPath, updater)` helper and have the route call it. Pick the
      smaller diff. Do not change the request shape unless necessary.
      **Verify:** Hit the route in a tight loop from a test page or curl
      with two parallel `update-meta` calls on the same sidecar; final
      JSON contains both updates' fields and parses cleanly.
- [x] Wire trim persistence in `MpiGroupHistoryBlock` (or the appropriate
      video-workspace owner). On `MpiTrimBar` `range-change`, debounce
      ~250ms, then `POST /project-media/:projectId/update-meta` with
      `{ trim: { in, out } }` on the active item. On item load, read
      `item.trim` from the sidecar, lazy-default to `{ in: 0, out: duration
      }` when absent, and call `controlBar.el.setRange(in, out)`. Update
      `js/components/types.js` ItemMeta JSDoc (or wherever the sidecar
      schema lives) to document the new optional field. **Verify:** Drag
      the in/out handles, navigate away to another item and back, reload
      the app — the range restores. Two videos hold independent ranges.
      A clip with no `trim` field still loads with full-range defaults.
- [x] Register three new hotkey ids in `js/managers/hotkeyRegistry.js`:
      `video.trim.in` (`I`), `video.trim.out` (`O`), `video.trim.clear`
      (`X`). Bind them inside `MpiVideoControlBar`'s setup via
      `Hotkeys.bind(...)`; the handlers set the in/out to the current
      playhead (clamped) or reset range to full duration. Unbind on
      destroy. Gate via `when()` to fire only on the video workspace
      (mirror existing video hotkey guards). **Verify:** With a video
      loaded, press `I` at 00:02, then `O` at 00:10 — handles snap there;
      press `X` — range resets to full clip; press the keys inside a text
      input — they're ignored (existing typing guard).

### Phase E: Range-aware ops + loop-within-range

Goal: every operation that reads a timestamp respects the active range.

- [x] **Loop-within-range + frame-step clamp.** Inside
      `MpiVideoControlBar`'s `timeupdate` handler, if `time >= out` then
      `surface.seek(in)` (only when `loop=true`; otherwise pause at `out`).
      Update `surface.frameStep(±1)` to accept an optional `{ rangeIn,
      rangeOut }` parameter; the control bar always passes the active
      range. Frame-back wraps to `outPoint - frameStep`; frame-forward
      wraps to `inPoint`. **Verify:** Set a range from 00:02 to 00:08,
      enable loop, press play — playhead loops within the range. Disable
      loop, press play — playhead pauses at `out`. Frame-step at `in - 1
      frame` wraps to `out`, frame-step at `out + 1 frame` wraps to `in`.
- [x] **Snapshot at clamped playhead.** Update
      `MpiVideoViewer.captureSnapshot()` (or its caller in the block) to
      clamp `video.currentTime` to `[in, out]` before
      `captureFrameBlob(...)`. If the playhead is outside the range
      (shouldn't happen post-clamping but defensively), nudge to `in`,
      wait for `seeked`, then capture (use the `readyState >= 2` check
      already in `captureFrameBlob`). **Verify:** Set a range, scrub
      playhead inside, snapshot — saved frame matches the playhead.
      Mid-range hotkey-snapshot also matches.
- [x] **"Continue from last frame" / Extend uses `out`.** Update the
      I2V frame-capture handler `_setFrameFromVideo(role)` in
      `MpiGroupHistoryBlock.js` (~lines 1203–1273) to use
      `outPoint` when a range is set (otherwise current behavior). Update
      `_handlePromptBoxExtend` (~line 1286) similarly so extend uses the
      `out` frame. **Verify:** Set a range with `out` at 00:06, click
      "Set as end frame" in the context menu — the captured frame is at
      00:06, not the playhead. Run an extend with a range — concat
      starts from the `out` frame.
- [x] **Video concat / extend route gets temporal range.** Update
      `POST /extend-video` in `routes/videoConcat.js:215-280` to accept
      optional `{ trimIn, trimOut }`; pass them to `videoConcat.js` so the
      source clip is sliced via `-ss <in> -to <out>` (or `-ss <in> -t <out
      - in>`) when present. Preserve the codec/pix_fmt/fps/dims/audio
      fast-path detection (memory `feedback_ffmpeg_concat_strategy`).
      Frontend caller passes `trim` from the sidecar. **Verify:** Set a
      range on a clip, run extend — the resulting video starts from the
      trimmed source slice, not the full source. No range → behavior
      unchanged.
- [x] **Crop export honors the range.** Update `POST /api/video/crop` in
      `routes/videoCrop.js:45-174` to accept `{ trimIn, trimOut }` and
      include `-ss <in> -to <out>` in the ffmpeg command when present. Set
      `duration`, `frameCount`, and clear `trim` on the new sidecar
      (cropped output starts fresh). **Verify:** Crop a clip with a range
      — output duration == `out - in`, output sidecar has the right
      `frameCount`, no leftover `trim` field.

### Parallel Batch: chip content + visual polish

Run only after Phase E lands. Three independent diffs.

- [ ] Add top-right chips to the video workspace via
      `MpiViewerCorners`. Content per mockup intent: op label (`CROP` /
      `TRIM` / `EXTEND` / etc.), ratio when in crop mode, and clip length
      / fps. Owner: `MpiGroupHistoryBlock.js` (mount chip slot + assemble
      array from active state). Briefings: components.md, events.md,
      state.md. **Verify:** Each workspace mode lights up the right
      chips; clicking the op chip is a no-op (read-only) or wired to a
      shortcut if mockup expects it; chip backdrop is visible over bright
      media.
- [ ] Fix the video viewer's bright background. Single token swap on
      `.mpi-video-viewer__stage` (or the equivalent surface wrapper) —
      adopt the same dim surface token used by `MpiCanvasViewer`. No new
      tokens. Owner: `MpiVideoViewer.css` only. Briefings: dos_and_donts.md
      (token-only colors). **Verify:** Side-by-side with image workspace,
      the dim background matches; mascot/icons remain readable.
- [ ] Match the Stage mockup polish for the new control bar +
      trim bar. Tighten heights to spec (track 44px or reduced per user
      preference, buttons 28–32px), tabular-nums on time display,
      letter-spacing on uppercase labels, heat color for active states.
      Owner: `MpiVideoControlBar.css` + `MpiTrimBar.css` only.
      Briefings: dos_and_donts.md, `docs/redesign/c-stage/editor-video.
      html`. **Verify:** Visual diff against the mockup is within
      acceptable tolerance; user signs off.

### Phase G: Wrapper cleanup

Goal: remove the legacy `MpiVideoPlayer` monolith after the dev gallery
moves to the new pieces.

- [ ] Migrate `js/pages/components.js:57` to mount `MpiVideoSurface` +
      `MpiVideoControlBar` (with `attachSurface`) instead of
      `MpiVideoPlayer`. Re-validate the dev gallery still renders cleanly.
      **Verify:** Open the components dev page — the video preview section
      shows both new components with full controls working; no console
      errors.
- [ ] Delete `js/components/Compounds/MpiVideoPlayer/`. Remove its entry
      from `preloadStyles.js` and `types.js`. Grep for any remaining
      `MpiVideoPlayer` imports — there must be none. **Verify:** App
      starts clean; image + video workspaces still work; `git grep
      MpiVideoPlayer` returns nothing (or only intentional history
      mentions in docs/memory).

## Plan Drift

- 2026-05-14 — Phase E framestep wrap-edge semantic: out-handle is INCLUSIVE
  (range covers frames `loFrame … round(hiSec*fps)`, not `… -1`). Original
  plan implicitly assumed half-open `[lo, hi)`; live behavior reads
  `_out = duration` for full clip and users expect back-from-frame-0 to wrap
  to the last decodable frame. Step works in integer frame space (`round(t*fps)`)
  to avoid float-tolerance off-by-ones at edges.

## Verification

End-to-end pass (run after Phase G):

1. Image workspace — compare button still works, chip looks right.
2. Video workspace — split layout matches mockup; play/pause/frame±/
   loop/volume/fullscreen/frames-toggle all intact.
3. Trim — `I`/`O`/`X` keys, mouse drag of in/out/playhead, snap to frame,
   range fill rendering, in ≤ playhead ≤ out invariant.
4. Persistence — range survives reload; two clips hold independent
   ranges; legacy sidecars (no `trim`) lazy-default cleanly.
5. Loop-within-range — playhead loops between `in` and `out` when loop on;
   pauses at `out` when loop off.
6. Frame-step — wraps at range edges instead of clip edges.
7. Snapshot — captures the clamped playhead frame.
8. Extend / "Continue from last frame" — uses `out` when range is set;
   ffmpeg concat slices `[in, out]` of the source.
9. Crop export — output is `[in, out]` duration with correct frame count
   and a cleared `trim` field on the new sidecar.
10. No regressions on `videoConcat` fast-path (codec/pix_fmt/fps/dims/
    audio match still picks concat-demuxer over filter re-encode).
11. Hotkey gating — `I`/`O`/`X` ignored while typing in inputs.
12. No memory leaks — repeated navigation in/out of the video workspace
    leaves no stray listeners (DevTools event-listener count stable).

## Preservation Notes

- Update `.claude/rules/component-mounts.md`, `component-events.md`,
  `component-state.md`, `component-comfy.md` (if extend/crop change) for
  the new components.
- Update `js/components/types.js` JSDoc for the new components and the
  new `trim` sidecar field.
- Update `.claude/rules/components.md` § "Stage design baseline" if the
  trim bar introduces a primitive worth surfacing for future work.
- Memory to consider after Phase E: write a `feedback_trim_range_ops.md`
  capturing the "ops always read `out` when range set" convention so
  future ops don't regress to `currentTime`.
- Memory to consider after Phase D: write a `feedback_item_sidecar_atomic_
  writes.md` if a new per-sidecar queue helper is introduced.
- `feedback_video_first_frame_paint.md`, `feedback_chromium_seek_
  coalescing.md`, `feedback_compare_loop_user_intent.md`,
  `feedback_mpicanvas_img_must_stay_image.md`, `feedback_video_workspace_
  no_latents.md`, `feedback_history_no_multistage.md` — all stay relevant;
  no edits expected.
- After Phase G ships, ask the user: "Should I update `.claude/rules/`
  to reflect the split + trim?" (per CLAUDE.md cardinal rule 3).
