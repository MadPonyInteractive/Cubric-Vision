## Sub-Agent Briefing
> Use this file when you need to know what events an Organism component emits or listens to.
> Primitives/Compounds live in `component-events-primitives.md`. Blocks live in `component-events-blocks.md`.
> Generation lifecycle (commandExecutor, StatusBar, Active Generation Registry) lives in `component-events-lifecycle.md`.

---

## Organisms

### MpiVideoSurface (Compound — js/components/Compounds/MpiVideoSurface/)
EMITS:   `play`           `{ time: number }`
         `pause`          `{ time: number }`
         `ended`          `{ time: number }`
         `timeupdate`     `{ time: number, duration: number }`
         `loadedmetadata` `{ duration: number }`
         `volumechange`   `{ volume: number, muted: boolean }`
LISTENS: (none — driven externally via instance API)
NOTE:    Bare `<video>` surface + click-to-toggle (skipped on `[data-no-toggle]` ancestors). Owns no transport UI; MpiVideoControlBar drives via `attachSurface(instance)`. Preserves loop-disable/seeked-restore + frame-step wrap-on-loop semantics. `frameStep(dir, range?)` operates in integer frame space and accepts `{ rangeIn, rangeOut, loop }`; out timestamp is inclusive (`round(hi*fps)` is the last visible frame).

### MpiVideoControlBar (Compound — js/components/Compounds/MpiVideoControlBar/)
EMITS:   `loop-change`  `{ loop: boolean }`
         `range-change` `{ in: number, out: number }` — forwarded from embedded MpiTrimBar (only fires when `showTrim` is true)
LISTENS: surface events `play/pause/timeupdate/loadedmetadata/volumechange` (via `attachSurface(instance)`)
HOTKEYS: binds `video.playPause/frame.back/frame.forward/volume.up/volume.down/loop` on `attachSurface`; trim hotkeys `video.trim.in/out/clear` bound only when `showTrim` is true. Unbinds on `detachSurface`/`destroy`.
PROPS:   `fps` (default 24), `showTrim` (default true). When `showTrim: false`, MpiTrimBar is not mounted; `setRange`/`setRangeQuiet`/`setPendingTrim` no-op; `getRange()`/`getValue()` return `null`.
NOTE:    Single horizontal row layout `[left buttons + time] [trim flex:1] [right buttons]`. Mounted full-width by the parent Block (NOT by the viewer). Wired to a surface via `attachSurface(surfaceInstance)`. On every surface `loadedmetadata` resets range to `[0, duration]` UNLESS `setPendingTrim(in, out)` was called first (one-shot). Loop intent is tracked internally; when active range is a strict subset of the clip, native `video.loop` is forced off and the loop is emulated via `timeupdate` (`seek(_in)` at `_out` if loop on; `_pause()` otherwise). Range-loop branch gates on `!video.paused` so frame-step is not re-routed.

### MpiTrimBar (Compound — js/components/Compounds/MpiTrimBar/)
EMITS:   `seek`         `{ time: number }` — playhead committed (drag end / track click)
         `seek-preview` `{ time: number }` — playhead value during drag (throttled ~50ms; playhead role only)
         `in-change`    `{ time: number }` — in handle committed
         `out-change`   `{ time: number }` — out handle committed
         `range-change` `{ in: number, out: number }` — fired alongside in/out commits
LISTENS: (none — pure pointer drag state)
NOTE:    Two-handle trim seek bar. Pointer drag coalesces on RAF; commits on `pointerup`. Frame-snap via `Math.round(t*fps)/fps`. Constraints: `0 ≤ in+frame ≤ out ≤ duration`; playhead clamped to `[in, out]`. `seek-preview` enables live-scrub on the host video without re-firing on every RAF tick.

### MpiVideoViewer (Organism — js/components/Organisms/MpiVideoViewer/)
EMITS:   `play`, `pause`, `ended`, `timeupdate` — forwarded from MpiVideoSurface
         `change`        `{ volume, muted }` — forwarded from surface `volumechange`
         `loadedmetadata` `{ duration }` — forwarded from surface
         `crop-change`   `{ rect: { x, y, w, h } }` — crop rect updated (normalized 0–1)
GLOBAL EMITS (via Events.emit):
         `video-viewer:context-menu` `{ x, y }` — right-click on viewer (native menu suppressed). Consumed by MpiGroupHistoryBlock for "Set as start/end frame" context menu.
LISTENS: (none — tool bars are owned by MpiGroupHistoryBlock, not viewer)
API:     `attachControlBar(instance)` / `detachControlBar()` — wire an external MpiVideoControlBar; viewer internally calls `instance.el.attachSurface(viewerSurfaceInstance)`. Control bar lifetime is owned externally; `viewer.destroy()` only `detachSurface()` on the bar.
         `getSurfaceInstance()` — returns MpiVideoSurface instance.
         `loadVideo(url, meta)` — `meta.fps`/`meta.frameCount`/`meta.trim` proxied to the attached control bar; `meta.trim = { in, out }` propagates as `setPendingTrim` (one-shot, applied on next `loadedmetadata`).
         `getSourceElement()` — underlying `HTMLVideoElement` for external tools (resize/snapshot).
         `setRangeQuiet(in, out)`, `getRange()` — proxy to attached control bar.
NOTE:    Viewer no longer forwards `loop-change`/`range-change` — block listens directly on the control bar instance. Viewer owns display + crop overlay + chip strip state only.

### MpiCanvasViewer (Organism — js/components/Organisms/MpiCanvasViewer/)
EMITS:   `mode-changed`  `{ mode }` — tool mode changed (from any source)
         `crop-applied`  `{ item }` — crop completed; item is the new HistoryItem
         `mask-ready`    `{ hasMask }` — mask painted or cleared
         `entry-loaded`  `{ idx, hasMask }` — image loaded for index
         `brush-changed` `{ type: 'brush'|'eraser' }` — brush type changed via hotkey
LISTENS: (none — all wiring done by parent MpiGroupHistoryBlock via `on()`)
API:     `compositeMaskDataURL(dataUrl)` — OR incoming mask onto existing canvas mask (no clear). Used by auto-detect thumb-pick flow.
         `setAutoMaskModel/setAutoMaskUseBox` — reset thumbs+picks only; do NOT clear existing paint.
         `runAutoMaskDetect` — reset thumbs+picks, run detection; do NOT clear existing paint.
         `getSourceElement()` — returns the underlying `HTMLImageElement` so external tools (e.g. resize) can sample the source for thumbnail extraction. Read-only, never reassign.
         `invertMask()` — toggle display-only invert; returns new bool. Updates viewer-scope `_isMaskInverted` cache + current canvas. Cache survives swapToPreview→swapToCanvas remount; re-applied to fresh MpiCanvas inside swapToCanvas. NOT a data mutation — underlying mask layers unchanged.
         `setMaskInverted(bool)` / `isMaskInverted()` — explicit setter/getter for the cached invert flag. Used by MpiToolOptionsMask on mount to restore the persisted invert state.
         `setMaskOpacity(v)` / `getMaskOpacity()` — overlay opacity 0–1. Live-driven by the opacity slider in MpiToolOptionsMask.
NOTE:    Display-invert is honored only in mask-mode (MpiCanvas overlay paint). Prompt-mode preview (MpiMaskedImagePreview) uses CSS-luminance mask and does NOT currently honor `displayInverted`.

### MpiToolOptionsMask (Organism — js/components/Organisms/MpiToolOptionsMask/)
EMITS:   (none)
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:tool:update` `{ toolKey: 'mask', key, value }` — debounced per-control persistence to `project.toolSettings.mask`. Keys: `model` (detector path), `useBox` (bool), `opacity` (0–1), `inverted` (bool).
LISTENS: (none — Hotkeys.bind 'mask.brush.toolbar'/'mask.eraser.toolbar' while mounted; unbound in destroy)
NOTE:    Unified auto+manual mask panel. No apply button. Mask is canvas-resident; PromptBox drives ops. Auto picks composite onto manual paint via `compositeMaskDataURL`. destroy() calls `evaluateMask()` then `exitMode()`. Mount-time restore: reads `getToolSettings(state.currentProject, 'mask', DEFAULTS)`, applies `useBox`/`model` to viewer auto APIs, applies `opacity` via `viewer.el.setMaskOpacity`, applies `inverted` via `viewer.el.setMaskInverted` (which writes the viewer-scope cache, surviving canvas remount). Invert button shows active state via `.mpi-tool-options-mask__invert--on` modifier (accent border + 180° icon rotation).

### MpiToolOptionsResize (Organism — js/components/Organisms/MpiToolOptionsResize/)
EMITS:   `apply` `{ params: { width, height, upscale_method, keep_proportion, pad_color, crop_position, divisible_by, flip, rotation } }` — full-resolution params; payload is intentionally minimal. The block always re-runs the workflow at full resolution via `startGeneration`; there is no fast-path / preview-URL reuse.
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:tool:update` `{ toolKey: 'resize', key, value }` — debounced per-control persistence to `project.toolSettings.resize`
LISTENS: (none — read-only access to viewer via `viewer.el.getSourceElement()`)
API:     `el.setCurrentItem(item)` — re-target active history item without remount; cancels in-flight preview, re-extracts the thumbnail from the new source (uses `awaitNextLoad: true` for video so the next `loadeddata` is awaited rather than sampling a stale frame), then schedules a fresh preview. Block calls this from `historyList.on('entry-selected')` AND from `generation:complete` for `resize`/`resizeVideo` items.
         `el.getParams()` — read current params.
NOTE:    Preview is **thumbnail-based**, NOT canvas-resident. The compound extracts a 512px-longest-edge PNG thumbnail from the source via `js/utils/thumbnail.js` (`extractThumbnail`, `waitForVideoFrame`) and runs the **image** `resize` workflow on the thumbnail with proportionally-scaled `width`/`height`/`divisible_by`. Result paints into an inline `<img>` slot inside the panel between the Transform section and the Apply button — the viewer canvas/video stays untouched and interactive. This is true for both `kind: 'image'` and `kind: 'video'` (video grabs the first frame). Preview submits via `runCommand({ ..., previewOnly: true, suppressLifecycleEvents: true })` so StatusBar lifecycle signals (`tool:sampling-start` / `tool:loading-model`) are not emitted — there is no `tool:running`/`tool:idle` pair wrapping a tool-panel preview. Apply emits `{ params }` and the block routes to `startGeneration` (`resize` op for image, `resizeVideo` for video). Apply is **append-only** — never replaces the source. Block treats both ops as tool-only transforms via `_setBusy` (no mascot) — see component-events-blocks.md MpiGroupHistoryBlock entry. Setup fires an initial `schedulePreview()` so the user sees the tool's effect without touching a control. The panel uses `MpiColorPicker` for `pad_color`. Width/Height are NEVER auto-seeded from the source; the user owns dimensions (defaults `1024x1024` from `DEFAULTS`, persisted thereafter).

### MpiToolOptionsPrompt (Organism — js/components/Organisms/MpiToolOptionsPrompt/)
EMITS:   (none on local bus — buttons emit on global Events bus)
GLOBAL EMITS (via Events.emit):
         `prompt-box-tools:extend`     `{}` — Extend button click. Listened to by MpiGroupHistoryBlock only.
         `prompt-box-tools:create-new` `{}` — Create new button click. Listened to by MpiGroupHistoryBlock only.
LISTENS: PromptBox `media-change` — re-renders thumb slots from `promptBox.el.getMediaByRole(role)` for `startFrame` / `endFrame`.
NOTE:    Video-history-only toolbar. Mount gate: `isVideo && activeModel.supportedOps.some(op => op.startsWith('i2v'))` — NOT `_hasPromptOps()` (capacity-based gate would hide the toolbar before user can inject the frame that unblocks it; block force-mounts PromptBox in this branch). Mounted into `#right-top-slot`; `__right-top` visibility under `--prompt-active` is `:empty`-scoped, so the slot becomes visible when this organism mounts a child. Thumb sizing CSS-only (`max-height` + `object-fit: contain`). Single listener for both prompt-box-tools events lives in MpiGroupHistoryBlock — do NOT pre-wire them anywhere else.

### concatProgress (service — js/services/concatProgress.js)
EMITS (Events bus, keyed by `jobId`):
         `concat:progress` `{ jobId: string, ratio: number }` — 0..1 progress from ffmpeg `time=` stderr lines
         `concat:done`     `{ jobId: string, item: HistoryItem }` — concat finished, sidecar written
         `concat:error`    `{ jobId: string, error: string }` — first-line truncated (full stderr stays in logs/app.log)
LISTENS: own SSE channel `/concat/events/stream` (separate from `/comfy/events/stream`); single EventSource opened eagerly on module import.
API:     `trackConcatJob({ jobId, label })` → Promise. Bridges to `StatusBar.progress.start/update/complete/cancel`; resolves on `concat:done`, rejects on `concat:error`. Multiple in-flight jobs de-multiplexed by `jobId`.
