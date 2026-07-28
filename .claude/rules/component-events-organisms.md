## Sub-Agent Briefing
> Use this file when you need to know what events an Organism component emits or listens to.
> Primitives/Compounds live in `component-events-primitives.md`. Blocks live in `component-events-blocks.md`.
> Generation lifecycle (commandExecutor, StatusBar, Active Generation Registry) lives in `component-events-lifecycle.md`.

---

## Video Compounds

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

## Organisms

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
         `resetView()` — resets pan/zoom to fit. Pan/zoom transform is applied directly to `.mpi-video-surface__video` for macOS/Linux compositor compatibility; do not move it back to the wrapper.
         `setRangeQuiet(in, out)`, `getRange()` — proxy to attached control bar.
NOTE:    Viewer no longer forwards `loop-change`/`range-change` — block listens directly on the control bar instance. Viewer owns display + crop overlay + chip strip state only. Wheel zoom remains enabled in tool modes; crop mode only suppresses left-drag pan so crop handles keep priority.

### MpiCanvasViewer (Organism — js/components/Organisms/MpiCanvasViewer/)
EMITS:   `mode-changed`  `{ mode }` — tool mode changed (from any source)
         `crop-applied`  `{ item }` — crop completed; item is the new HistoryItem
         `mask-ready`    `{ hasMask }` — mask painted or cleared. Now ALSO fires mid-tool on stroke end (MPI-372): `InputController._endMaskStroke()` → `MpiCanvas onMaskStrokeEnd` → `_publishMaskState()` → `evaluateMask()`, emitting only when `hasMask` FLIPS. That is what unlocks mask-gated ops in the op strip while a mask tool stays open — before, mask state was published only when a tool was destroyed. **A tool that creates a mask by any route other than a brush stroke (shape commit, text detection) MUST emit this itself or call `evaluateMask()`.**
         `entry-loaded`  `{ idx, hasMask }` — image loaded for index
         `brush-changed` `{ type: 'brush'|'eraser' }` — brush type changed via hotkey
         `mask-points-changed` `{ count }` — a point prompt was added, removed or cleared (MPI-361)
LISTENS: (none — all wiring done by parent MpiGroupHistoryBlock via `on()`)
API:     `compositeMaskDataURL(dataUrl)` — OR incoming mask onto existing canvas mask (no clear). Used by auto-detect thumb-pick flow.
         `setAutoMaskModel/setAutoMaskUseBox` — reset thumbs+picks only; do NOT clear existing paint.
         `runAutoMaskDetect` — reset thumbs+picks, run detection; do NOT clear existing paint.
         `getSourceElement()` — returns the underlying `HTMLImageElement` so external tools (e.g. resize) can sample the source for thumbnail extraction. Read-only, never reassign.
         `invertMask()` — toggle display-only invert; returns new bool. Updates viewer-scope `_isMaskInverted` cache + current canvas. Cache survives swapToPreview→swapToCanvas remount; re-applied to fresh MpiCanvas inside swapToCanvas. NOT a data mutation — underlying mask layers unchanged.
         `setMaskInverted(bool)` / `isMaskInverted()` — explicit setter/getter for the cached invert flag. Used by MpiMaskStrip on mount to restore the persisted invert state.
         `setMaskOpacity(v)` / `getMaskOpacity()` — overlay opacity 0–1. Live-driven by the opacity slider in MpiMaskStrip.
         `setMaskPointsMode(bool)` / `isMaskPointsMode()` — swap auto-mask onto the click-point (SAM `mask-points`) branch of `img_auto_mask.json`. Resets thumbs+picks like `setAutoMaskModel` does; the viewer caches `_pointsMode` on its own scope so it survives the swapToPreview→swapToCanvas remount. (MPI-361)
         `setMaskPointsThreshold(n)` / `getMaskPointsThreshold()` — `SAMDetectorCombined.threshold`, 0–1, default 0.93.
         `clearMaskPoints()` / `getMaskPointCount()` — point-prompt list management.
         `bakeAutoPicks('manual'|'subtract')` — Add / Subtract: bake the selected auto-pick masks into the permanent paint layers and drop the auto layer. Returns false (+ warning toast) when nothing is selected. This is how multi-part point selections accumulate — each points run returns exactly ONE region.
NOTE:    A points run auto-picks index 0 up front, so it is ONE round trip; the detector's detect-then-pick two-step exists only because YOLO returns N segments to choose between. The two detector branches sit behind an `MpiIfElse` titled `Input_Points_Mode` whose inputs are lazy, so the unselected branch never executes.
NOTE:    Display-invert is honored only in mask-mode (MpiCanvas overlay paint). Prompt-mode preview (MpiMaskedImagePreview) uses CSS-luminance mask and does NOT currently honor `displayInverted`.

### The mask tool family (MPI-371 — one tool per masking method)

Rail modes `maskDetect` / `maskPoints` inside the `Mask` group; no switcher, no source radio. Shapes (MPI-368) and Text (MPI-361 Phase B) join as siblings. Every tool owns only its own controls and mounts the two shared compounds below. None emits `apply` — the mask is canvas-resident and PromptBox drives ops. All of them persist under the SINGLE `'mask'` tool key, so settings survive a swap between mask tools.

#### MpiToolOptionsMaskDetect (Organism — js/components/Organisms/MpiToolOptionsMaskDetect/)
EMITS:   (none)
GLOBAL EMITS (via Events.emit, consumed by projectService):
         `settings:tool:update` `{ toolKey: 'mask', key, value }` — keys `model` (detector path), `useBox` (bool).
LISTENS: (none)
NOTE:    The fast YOLO shortcut (Face / Hair / Hand / Person) — kept deliberately; points sit BESIDE it, they do not replace it. Mount reads `getToolSettings(state.currentProject, 'mask', DEFAULTS)`, applies `model`/`useBox` to the viewer auto APIs, and calls `setMaskPointsMode(false)` so entering from Points gives the right mouse button back. `destroy()` calls `evaluateMask()` then `exitMode()`.

#### MpiToolOptionsMaskPoints (Organism — js/components/Organisms/MpiToolOptionsMaskPoints/)
EMITS:   (none)
GLOBAL EMITS: `settings:tool:update` `{ toolKey: 'mask', key: 'pointsThreshold', value }` (0–1).
LISTENS: (none)
NOTE:    Click-point (SAM `mask-points`) prompts, MPI-361. Scope slider ships the raw `SAMDetectorCombined.threshold` as 30–99, deliberately NOT remapped — it SNAPS between SAM's 3 candidates, so sweep it. Mount calls `setMaskPointsMode(true)`. **`destroy()` MUST call `viewer.el.setMaskPointsMode(false)` before `evaluateMask()`** — points mode owns the right mouse button and suppresses the image context menu, so skipping it leaves right-click broken app-wide.

#### MpiMaskStrip (Compound — js/components/Compounds/MpiMaskStrip/)
PROPS:   `{ viewer, brush = true }`
EMITS:   (none)
GLOBAL EMITS: `settings:tool:update` `{ toolKey: 'mask', key, value }` — keys `opacity` (0–1), `inverted` (bool).
LISTENS: (none — `Hotkeys.bind 'mask.brush.toolbar'`/`'mask.eraser.toolbar'` ONLY when `brush` is true; unbound in destroy)
NOTE:    The ONE shared bottom strip, mounted by every tool in the family — change it here, not per tool. `brush: false` drops the paint/erase pair AND its B/E binds; the Points tool mounts it that way. Invert, clear and opacity are on every tool. Mount-time restore applies `opacity` via `setMaskOpacity` and `inverted` via `setMaskInverted` (viewer-scope cache, survives canvas remount). Invert active state via `.mpi-mask-strip__invert--on` (accent border + 180° icon rotation).

#### MpiMaskDetectRow (Compound — js/components/Compounds/MpiMaskDetectRow/)
PROPS:   `{ viewer }`
EMITS:   (none)
LISTENS: `Events.onState('generationQueueCount')` — gates the row as a unit; a detect run is a generation.
NOTE:    `MpiAutoMaskThumbs` slot + Detect + Add / Subtract, shared by every detection-based tool (Detect, Points, and Text when it lands). The thumbs node is OWNED BY THE VIEWER — re-parented via `getAutoMaskThumbsEl()`, detached in destroy, NEVER destroyed. The gate covers this row only; the owning tool's own controls stay live while Cue is busy because none of them run anything.

#### Family-wide invariant
**A tool swap must NOT clear the mask.** `manualCanvas` + `subtractCanvas` are the user's work; only the auto layer is disposable. `_exitMode()` only sets `activeMode = 'none'` — no mask tool's mount path may call `clearMask()`.

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
