## Sub-Agent Briefing
> Use this file when you need to know who mounts a component, what props it receives, or where it appears in the UI.

> **Scope:** Lists only components that perform internal sub-mounts. Components absent from this file have no internal mounts.

## MpiCanvas (Primitive: interactive image canvas)

DOM structure: `.mpi-canvas` root → `.mpi-canvas__stack` (CSS-transform pan/zoom target) → `canvas[data-role=base]` + `canvas[data-role=overlay]` (both image-native px) + `canvas[data-role=screen-ui]` (container px, sibling of stack).

Props: `{ onBrushSizeChange?: fn, onBrushTypeChange?: fn }`

---

## MpiMaskedImagePreview (Primitive: lightweight prompt-mode image preview)

DOM structure: `.mpi-masked-preview` root (overflow:hidden) → `.mpi-masked-preview__stack` (CSS-transform pan/zoom, sized to image-native px) → `img.mpi-masked-preview__base` + `img.mpi-masked-preview__masked` (CSS `mask-image` overlay).

No canvas, no GPU texture backing. Zero VRAM beyond the two `<img>` decode buffers.

Props: none

**Instance API (on `el`):**
- `loadImage(url)` — load image; resets view to contain
- `setMaskDataURL(dataUrl)` — show PNG mask as CSS `mask-image` tinted overlay
- `clearMask()` — hide overlay
- `destroy()` — remove listeners, disconnect ResizeObserver

**Mounted by:** `MpiCanvasViewer` (`swapToPreview`) into `_previewWrap` (absolute-positioned sibling of `#canvas-wrap`)

---

## MpiGalleryBlock

- `MpiGalleryGrid`   props: `{ groups: ItemGroup[] }`   slot: top-level workspace container
- `MpiMediaDropOverlay`   props: `{ onDrop({ files: [{ file, mediaType }, ...] }) }` callback   slot: `document.createElement('div')` appended to `el` — full-area OS-file drop target; shown/hidden via window `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); ignores internal `application/mpi-media` drags; `onDrop` loops over files: uploads each, emits `media:imported` per file. PromptBox slots filled up to `_pb.el.remainingCapacity(mediaType)` (per-type); overflow files still become gallery cards but are not injected into the strip.
- `MpiPromptBox` (Organism)   props: `{ model, modelList: installedImageModels, operation: 't2i', includeNegative: true }`   slot: `gid('prompt-box-mount')` — Block keeps handle in `_pb`, destroys before remount AND in `el.destroy`; only mounted when `installedImageModels.length > 0`
  - `updateContext`: called on `media-change` event — `{ imageCount, videoCount, hasMask: false }`
- `MpiCompareOverlay`   props: none   slot: `document.createElement('div')` — singleton; shown on `grid 'compare-requested'` event from MpiGalleryGrid
- `MpiOkCancel`   props: `{ title: 'Delete', text: '...', okLabel: 'Delete', cancelLabel: 'Cancel' }`   slot: `document.createElement('div')` — singleton delete-confirmation dialog; shown on `grid 'delete'` event
- `MpiAddToProject`   props: `{ projects: [{id,name}], onConfirm(projectId) }`   slot: `document.createElement('div')` — mounted on demand on `grid 'add-to-project'` event; dropdown picks a target project, `onConfirm` POSTs `/project-media/:id/add-from-cards` to copy the selected cards
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; opened by the model picker's `settings` event (MPI-356 — the PromptBox no longer emits `settings`; the LoRA/upscale gear left the popup with the dropdowns)
- `MpiModelPicker` (Compound, MPI-356)   props: none   slot: `document.createElement('div')` — singleton model overlay opened on `ui:open-model-picker` via `el.open({ models, modelId })`. The Block owns the (workspace-filtered) list AND applies the pick — the picker holds no model logic. Its `settings` event opens `MpiModelSettings({ modelId })`.

> **Note:** `MpiModelManager` is NOT mounted here — it is the **Model Library** overlay (MPI-215). It self-hosts an `MpiOverlay(mountTarget:'body')` and shell mounts it once as a lazy singleton, calling `el.open()` on `models:open` (`shell.js`). `MpiGalleryBlock` emits `Events.emit('models:open')`. PromptBox mounts only when `s_installedModelIds.length > 0`; post-install mount is keyed off `state:changed (s_installedModelIds)`, not a `models:closed` event.
> **Selection:** No `MpiSelectionBar`. Ctrl/Cmd-click toggles card into selection; shift-click range-selects; right-click opens `MpiContextMenu`. `MpiCheckbox` is also removed from cards.

---

## MpiGroupHistoryBlock

Photoshop-style layout: `grid-template-columns: 3.5rem 1fr 14rem`. Slots: `#left-slot` (toolbar), `#centre-slot` (viewer), `#right-top-slot` (active tool options), `#right-bottom-slot` (history list), `#prompt-box-mount` (shell PromptBox, centre-bottom floating).

**Mediator pattern:** `mountOptions(mode)` is `async`. Destroys previous `MpiToolOptions*` instance and mounts the new one into `#right-top-slot`. `prompt` mode is special — no compound, toggles CSS class `mpi-group-history-block--prompt-active` which shows PromptBox and hides `#right-top-slot`. For image groups, `prompt` mode also calls `await viewer.el.swapToPreview()` (destroys `MpiCanvas`, mounts `MpiMaskedImagePreview`). Switching away from prompt calls `await viewer.el.swapToCanvas()` (destroys preview, remounts fresh `MpiCanvas`, reloads image + mask) before mounting the tool compound. Always `await` both swaps — tool compounds must not mount before canvas is ready.

```js
const TOOL_OPTIONS_REGISTRY = {
    crop:         MpiToolOptionsCrop,
    maskBrush:    MpiToolOptionsMaskBrush,
    maskDetect:   MpiToolOptionsMaskDetect,
    maskPoints:   MpiToolOptionsMaskPoints,
    maskText:     MpiToolOptionsMaskText,
    videoUpscale: MpiToolOptionsUpscale,
    imageUpscale: MpiToolOptionsUpscale,
    removeBackground: MpiToolOptionsRemoveBg,
    interpolate:  MpiToolOptionsInterpolate,
    resize:       MpiToolOptionsResize,
    resizeVideo:  MpiToolOptionsResize,
    exportGif:    MpiToolOptionsGif,
};
```

> `MpiToolOptionsUpscale` is shared by both image (`imageUpscale`) and video (`videoUpscale`). Block passes `kind: modeKind` ('image'|'video'). Organism keys persistence as `toolSettings.imageUpscale` / `toolSettings.videoUpscale` and only calls `viewer.el.enter/exitUpscaleMode()` for video (image canvas has no upscale overlay).

**Both group types:**
- `MpiHistoryTools`   props: `{ mode: 'image'|'video' }` — builds own tool list from `mode` prop   slot: `#left-slot`
- `MpiHistoryList`   props: `{ history, selectedIndex, isVideo, hasMaskForIndex, hasCopiedMask }` — ctrl/shift/right-click selection; the two mask callbacks gate the mask rows in its context menu   slot: `#right-bottom-slot`
- `MpiMaskCompositeDialog` (Compound, MPI-362)   props: `{ maskName, otherName }`   slot: `document.createElement('div')` — lazy per-use dialog on `composite-requested` (image groups); emits `add`/`subtract`/`cancel`, Block destroys it in each handler
- `MpiMediaDropOverlay`   props: `{ onDrop({ files: [{ file, mediaType }, ...] }) }` callback   slot: `document.createElement('div')` appended to `el` — loops files: uploads each, calls `_pb.el.injectMedia()` per file (no history card created). Suppressed while video prompt mode is active so start/end-frame slot drops keep local targeting.
- `MpiModelSettings`   props: none   slot: `document.createElement('div')` — singleton settings overlay; opened by the model picker's `settings` event (MPI-356 — the PromptBox no longer emits `settings`; the LoRA/upscale gear left the popup with the dropdowns)
- `MpiModelPicker` (Compound, MPI-356)   props: none   slot: `document.createElement('div')` — singleton model overlay opened on `ui:open-model-picker` via `el.open({ models, modelId })`. The Block owns the (workspace-filtered) list AND applies the pick — the picker holds no model logic. Its `settings` event opens `MpiModelSettings({ modelId })`.
- *(no model manager here — MpiModelManager is the shell-hosted Model Library overlay, not mounted by MpiGroupHistoryBlock)*

**Image groups** (`_group.type !== 'video'`):
- `MpiCanvasViewer`   props: `{ initialImageUrl, initialIdx, initialItem, groupId }`   slot: `#centre-slot` — handles crop/mask viewer modes internally; does NOT own any bars. `initialItem` (full HistoryItem) + `groupId` are required for layered-mask TEMP persistence (key = `<projectId>/<groupId>/<itemId>`); omitting them disables persistence silently.
- Tool options in `#right-top-slot`: `MpiToolOptionsCrop`, `MpiToolOptionsMaskBrush`, `MpiToolOptionsMaskDetect`, `MpiToolOptionsMaskPoints`, `MpiToolOptionsResize`, `MpiToolOptionsUpscale` (`kind:'image'`)
- `MpiPromptBox` (Organism) into `#prompt-box-mount` — only when `_hasPromptOps()` true (active model exposes ≥1 enabled prompt op); Block keeps handle in `_pb`

**Video groups** (`_group.type === 'video'`):
- `MpiVideoViewer`   props: `{ fps }`   slot: `#centre-slot`
- `MpiVideoControlBar`   props: `{ fps, showTrim: true }`   slot: `#controls-slot` (Block-owned, full-width row spanning all 3 grid columns below the viewer). Wired to viewer via `viewer.el.attachControlBar(controlBarInstance)` (which internally calls `controlBar.el.attachSurface(viewerSurfaceInstance)`). Block listens to `controlBar.on('range-change')` for trim persistence (debounced 250ms POST to `/project-media/.../update-meta`).
- Tool options in `#right-top-slot`: `MpiToolOptionsCrop`, `MpiToolOptionsUpscale`, `MpiToolOptionsInterpolate`, `MpiToolOptionsPrompt` (prompt mode, video + frame-ops-capable model: `_modelHasFrameOps()` — any `i2v*`/`v2v*` op)
- `MpiPromptBox` (Organism) into `#prompt-box-mount` — gated by `_shouldShowPromptBox() = _hasPromptOps() || _modelHasFrameOps()`. `_modelHasFrameOps()` matches any `supportedOps` starting with `i2v` or `v2v`. Frame-ops capability bypass keeps PromptBox visible BEFORE any chip lands so the user can drop a start/end-frame image (or input video) from outside; the existing media-change listener unlocks the op as soon as a chip is staged. Block keeps handle in `_pb`.

> **Video-history workspace gates:**
> - `#right-top-slot` visibility under `--prompt-active` is `:empty`-scoped — slot stays visible whenever a child mounts. Image-history prompt mode keeps slot empty + hidden.
> - `_applyPreview` in MpiGroupHistoryBlock short-circuits for `isVideo`. Latent previews are PNGs and cannot load into `<video>`; viewer stays on the previously-loaded video so the user can queue parallel ops. Mascot + StatusBar still drive feedback.

---

## MpiToolOptions* (Organisms — js/components/Organisms/MpiToolOptions<Name>/)

Self-contained tool-options compounds. Each mounts into `#right-top-slot` via the Block mediator. No bars inside viewers.

**Pattern:** `setup` enters viewer mode → owns controls → `destroy` evaluates mask + exits viewer mode. No apply buttons on mask panel (PromptBox drives ops). No cancel buttons.

- `MpiToolOptionsCrop`   props: `{ viewer, kind: 'image'|'video' }`   — family `MpiRadioGroup` (RATIO/FREE) + orientation `MpiRadioGroup` (icon-only, RATIO only) + ratio `MpiRadioGroup` (icon-only, hidden for FREE, backed by `CROP_RATIOS` pure-aspect table incl cinema 2:1/1.85:1/21:9/2.39:1) + "Divisible by" `MpiInput` (default 16, both modes, above Apply) + apply (image) / snapshot+save (video) buttons. Persists `{ family:'ratio'|'free', orientation, label, divisible_by }` under `project.toolSettings.crop` via `settings:tool:update` (toolKey `'crop'`). Pushes ratio to `viewer.el.setCropRatio(ratio|null)` — `null` = FREE (no aspect lock). Exposes `el.getDivisibleBy()`. On apply, each output W/H is rounded to `divisible_by` via `roundToDivisible` (js/utils/cropRounding.js) — image in `MpiCanvasViewer._runCrop`, video in `MpiGroupHistoryBlock._handleCropSaveVideo` (sends `absoluteCropPx`; `routes/videoCrop.js` uses it directly and skips even-snap). Emits `apply { kind: 'image'|'video-save'|'video-snapshot' }`. Crop drag honors Shift modifier (scales from rect center) via `Hotkeys.register('shift', …)` inside `CropManager`/`cropTool`.
- **The mask tool family (MPI-371, split MPI-381)** — one rail icon per masking method inside the `Mask` group, no switcher, no source radio. **One job each: ONLY the Brush tool paints.** Each tool owns only its own controls and mounts the shared compounds. None emits `apply`. Rail modes are `maskBrush` / `maskAdjust` / `maskDetect` / `maskPoints` / `maskText` / `maskShapes`; the viewer knows only `'mask'`, bridged by `MpiGroupHistoryBlock._viewerModeFor()`. **Every mask tool MUST be in the `_MASK_TOOLS` set** — teardown, the PromptBox gate and that bridge all hang off it, and a miss is silent; `tests/mask-tool-registry.test.cjs` guards it. Everything persists under the SINGLE `'mask'` tool key, so settings survive a swap between mask tools. Auto-detect composites picked thumbs ONTO existing mask; Detect does NOT clear existing paint.
  - `MpiToolOptionsMaskBrush` props: `{ viewer }` — owns NOTHING of its own: it is `MpiMaskStrip` with `brush: true` and no detect row. **No `.css` file by design**, so it has no `preloadStyles.js` entry. Mount calls `setMaskPointsMode(false)`; `destroy` calls `evaluateMask()` then `exitMode()`.
  - `MpiToolOptionsMaskDetect` props: `{ viewer }` — detection-model `MpiRadioGroup` (Face / Hand / Person) + box/segment `MpiRadioGroup`, then `MpiMaskDetectRow` + `MpiMaskStrip` (`brush: false`). Mount calls `setMaskPointsMode(false)`; `destroy` calls `evaluateMask()` then `exitMode()`.
  - `MpiToolOptionsMaskPoints` props: `{ viewer }` — Scope slider (raw `SAMDetectorCombined.threshold` as 30–99, deliberately NOT remapped) + info box + Clear points, then `MpiMaskDetectRow` + `MpiMaskStrip` (`brush: false`). Mount calls `setMaskPointsMode(true)`; **`destroy` MUST call `setMaskPointsMode(false)` before `evaluateMask()`** — points mode owns the right mouse button and suppresses the image context menu.
  - `MpiMaskStrip` (Compound) props: `{ viewer, brush = true, dest = 'mask' }` — the ONE shared bottom strip on every mask tool: paint/erase `MpiRadioGroup` (**optional**) + invert + **B/W view** + clear `MpiButton` + **brush preset `MpiDropdown`** (MPI-435, ten procedural dabs off `managers/brushDab.js`; shown only when `brush` AND the destination declares `setPreset`) + opacity slider. `brush: false` drops the pair AND its B/E `Hotkeys.bind` AND calls `viewer.el.setMaskPaintEnabled(false)` — without that last one a drag still paints on a tool with no brush control (MPI-381). Active states via `.mpi-mask-strip__invert--on` / `.mpi-mask-strip__bw--on`; B/W adds `.mpi-mask-strip--bw` on the root and disables the opacity input. **`dest` picks the DESTINATION (MPI-375):** a `DESTINATIONS` table maps `'mask'` / `'paint'` / `'composite'` to the viewer method names and the settings key — a new destination is a new ROW there, never a branch in `setup()`. `dest: 'paint'` drops invert + B/W (`maskDisplayToggles: false`), which are meaningless for real colour; `dest: 'composite'` also drops the OPACITY slider (`opacitySlider: false`) AND the preset picker (`setPreset: null`) because a composite is a hard cut — a display alpha or a feathered/scattered dab would make the preview disagree with the file Sharp writes — and sets `defaultBrush: 'eraser'`. Dropped rows are not rendered, not hidden, because a class carrying `display` outranks `[hidden]`.
  - `MpiMaskDetectRow` (Compound) props: `{ viewer }` — `MpiAutoMaskThumbs` slot (viewer-owned node, re-parented, NEVER destroyed) + Detect button + Add / Subtract, gated as a unit on `generationQueueCount`. Brush and Shapes (MPI-368) mount only the strip.
  - **A tool swap must NOT clear the mask** — `manualCanvas` + `subtractCanvas` are the user's work; only the auto layer is disposable. No mask tool's mount path may call `clearMask()`.
- **The PAINT group (MPI-375)** — a SECOND family beside the mask tools, registered in `_PAINT_TOOLS` (not `_MASK_TOOLS`) in `MpiGroupHistoryBlock`. Its artifact is the RGBA paint layer, not a mask; it keeps the PromptBox via `_isCanvasTool` and maps to the viewer's own `'paint'` mode through `_viewerModeFor()`. Full subsystem: `docs/painting.md`.
  - `MpiToolOptionsPaint` props: `{ viewer }` — `MpiColorPicker` + Apply `MpiButton` + `MpiMaskStrip` mounted `{ brush: true, dest: 'paint' }`. Mount calls `enterMode('paint')` and restores `color` from `toolSettings.paint`; `destroy` calls `exitMode()`. **Apply is gated on `typeof viewer.el.applyPaint === 'function'` and renders DISABLED when absent** — the optional-call idiom would otherwise swallow its own click. Apply flattens server-side (`POST /project/apply-paint`) and emits `paint-applied`; it never round-trips the source as base64.
  - Paint methods on `MpiCanvas` (`setPaintColor`, `getPaintOpacity`, `clearPaint`, …) MUST also be listed in the `_methods` **allowlist** — a name missing there is `undefined` on `el` and fails silently. `tests/mask-tool-registry.test.cjs` guards the paint family the same way it guards the mask family.
- **The SHAPE gizmo (MPI-368)** — ONE component under TWO groups, the second engine shared the way `brushDab.js` is. `TOOL_OPTIONS_REGISTRY` maps **both** `maskShapes` (in `_MASK_TOOLS`) and `paintShapes` (in `_PAINT_TOOLS`) to the same `MpiToolOptionsShapes`; `mountOptions()` passes `mode` into every options compound, which is what lets one component pick its destination. Full subsystem: `docs/masking-shapes.md`.
  - `MpiToolOptionsShapes` props: `{ viewer, mode: 'maskShapes'|'paintShapes' }` — kind `MpiRadioGroup` (rect / triangle / ellipse, icon-only) + two commit `MpiButton`s + a re-centre `MpiButton` + `MpiMaskStrip` (`brush: false`, `dest` from the mount). A `MOUNTS` table — not `if (isPaint)` — holds the per-destination differences, same shape as `MpiMaskStrip.DESTINATIONS`; **an unknown `mode` THROWS**, because falling back to `'mask'` would rasterise into the wrong layer while the rail still looked right. Commit words differ on purpose: mask gets **Add / Subtract**, paint gets **Fill / Erase** ("subtract" already names a mask LAYER). Mount calls `enterMode('mask'|'paint')`, `setMaskPointsMode(false)` on the mask mount only, then `setShapeMode(dest)`; `destroy` calls `setShapeMode(null)` + `clearShape()` + (mask only) `evaluateMask()` + `exitMode()`.
  - Shape methods on `MpiCanvas` (`setShapeMode`, `setShapeKind`, `getShapeKind`, `hasShape`, `resetShape`, `clearShape`, `commitShape`) are in the `_methods` **allowlist** and re-exposed on `MpiCanvasViewer.el` — same silent-`undefined` trap as the paint family.
  - **`shapeMode` is a FLAG (`null`|`'mask'`|`'paint'`) inside the existing mask/paint canvas mode, not a fourth `CANVAS_MODES` entry** — armed like `pointsMode`. It decides one thing: where a commit lands. `commitShape(op)` hands a path BUILDER `(scale) => Path2D` to `MaskManager.commitShape()` or `PaintManager.commitShape()` so each applies its OWN `_scale` (mask 1536, paint 4096); a path built for one is silently offset in the other.
  - **An uncommitted gizmo is a PREVIEW** — `MpiCanvasViewer.discardPreview()` extends to call `clearShape()`; never drop it at the `mountOptions()` call site. The shape SURVIVES its commit, so three ellipses is three drags.
- **ADJUST, on BOTH layers (MPI-382 mask, MPI-436 paint)** — the THIRD instance of one-component-two-mounts, after Shapes and Composite, and the pattern is now the house default rather than a special case. `TOOL_OPTIONS_REGISTRY` maps **both** `maskAdjust` (in `_MASK_TOOLS`) and `paintAdjust` (in `_PAINT_TOOLS`) to the same `MpiToolOptionsMaskAdjust`, which reads `props.mode`. Full subsystem: `docs/masking-adjust.md`.
  - A `DEST` table — not `if (isPaint)` — holds the differences, same shape as `MpiMaskStrip.DESTINATIONS` and `MpiToolOptionsShapes.MOUNTS`: the four `begin`/`preview`/`apply`/`end` calls per layer, plus two flags. Paint adds an `MpiColorPicker` (grow's new ring, the band and the Fill are all in it, sharing the `paint` tool-settings key with the Paint panel). **Fill Holes is on both** since MPI-566 — the row carries a `fill` fn and its tooltip, not a boolean, because only the composite differs. Unknown `mode` falls back to `maskAdjust` — unlike Shapes, which THROWS, because Adjust's mask path is the pre-existing default rather than a coin flip between two layers.
  - `MpiMaskStrip` is mounted `brush: false` with **`dest` from the table** — miss that and Clear and the opacity slider drive the mask from inside the paint tool.
  - Paint's Apply must **NOT** call `onMaskStrokeEnd` (the viewer's ONE mask publish path, which re-gates the op strip) — an adjustment to paint is not a mask change. Same line `commitShape()`'s paint branch already draws. `destroy` calls `evaluateMask()` on the mask mount only.
  - **An unapplied ADJUSTMENT is a preview on both layers** — `discardPreview()` drops the paint one too, even though the paint LAYER never extends that seam (a stroke is committed pixels, MPI-375). `PaintManager.init()` drops it as well, so a preview cannot outlive the pixels it previewed.
  - **LAYER CONVERSION (MPI-439)** — `maskToPaint()` / `paintToMask()` on `MpiCanvas` (both in the `_methods` **allowlist**, both re-exposed on `MpiCanvasViewer.el`), driven from the image context menu in `MpiGroupHistoryBlock`, never by reaching into a canvas. Both are a COPY and a MERGE, and each records its own layer-wide undo entry after the empty-source guard. **Only `paintToMask()` calls `onMaskStrokeEnd`** — it changes what the op strip gates on; `maskToPaint()` must not, same line paint's Apply draws above. The Block resolves the colour from `getToolSettings(project, 'paint').color`, NOT from `PaintManager.color`, which is panel state and holds the module default until a paint panel has mounted (MPI-447).
  - Paint Adjust methods on `MpiCanvas` (`beginPaintAdjust`, `previewPaintAdjust`, `applyPaintAdjust`, `endPaintAdjust`, `hasPaintAdjustPreview`) are in the `_methods` **allowlist** — same silent-`undefined` trap as the rest of the paint family. Radii cross the boundary in IMAGE px and `PaintManager` applies its own `_scale` (mask 1536, paint 4096).
- **The COMPOSITE group (MPI-373)** — the THIRD family, in its own `_COMPOSITE_TOOLS` set, and the one that breaks the pattern the other two set: it IS a canvas tool (`_isCanvasTool`, for teardown and the mode bridge) but is the ONLY group that **DROPS the PromptBox** — it is absent from `_modeKeepsPromptBox`, and those two predicates **must not be collapsed into one**, which is the obvious-looking edit that hands the box straight back. Rail modes `maskComp` / `paintComp`, both mapped by `_viewerModeFor()` to a real fourth canvas mode `'composite'` — a MODE, not a flag like `shapeMode`, because the cut brush competes for the pointer. `CANVAS_MODES` in `MpiCanvasViewer` **and** `_viewerModeFor()` must BOTH know it (MPI-375 shipped a dead tool by missing one). Full subsystem: `docs/composite.md`.
  - `MpiToolOptionsComposite` props: `{ viewer, mode: 'maskComp'|'paintComp', clipboard }` — ONE hint line (which doubles as the panel's ERROR surface), ONE `MpiMediaSlot`, an Apply `MpiButton`, and `MpiMaskStrip` mounted `{ brush: mount.brush, dest: 'composite' }`. A `MOUNTS` table holds the per-front-end differences and an unknown `mode` **THROWS**, same ruling as `MpiToolOptionsShapes`. Mount calls `enterMode('composite')`; `destroy` clears the change callback then `exitMode()`. Apply is gated on BOTH an image underneath and a non-empty cut, and renders **disabled, not inert**.
  - `MpiMediaSlot` (Compound) props: `{ label, empty?, canPaste(), readPaste() }` — a dumb one-media drop point; `el.getValue()` / `el.setValue(v)` / `el.clear()`, emits `change`. The panel SEEDS it on mount from `_compositeImage`, an app-local block-scoped buffer written by **`Send to Composite` on the image-viewer context menu** — not by selecting a second entry, and not from the history list (`Copy image` lived there briefly and was removed).
  - **There is no mask slot.** `maskComp` reads the mask already on the selected entry through `MpiCanvas.setCompositeHoleFromMask()`, which takes `MaskManager.getURL()` with **NO arguments** (white-on-transparent). The `('black','white')` overload every prompt-tool consumer uses is OPAQUE, and the hole is consumed by **alpha** on the canvas but by **luminance** on the server — feeding the opaque one cuts the whole frame on screen and only the white part on disk.
  - Composite methods on `MpiCanvas` (`setCompositeUnderlay`, `setCompositeHoleFromMask`, `hasCompositeHole`, `getCompositeURL`, `clearComposite`, `resetComposite`, `setOnCompositeChange`, …) are in the `_methods` **allowlist** and re-exposed on `MpiCanvasViewer.el` — same silent-`undefined` trap as the paint and shape families.
- `MpiToolOptionsResize` props: `{ viewer, kind: 'image'|'video', currentItem? }` — width/height `MpiInput`, method/proportion/crop-position `MpiDropdown`, `MpiColorPicker` for pad color, divisible-by `MpiInput`, flip/rotation `MpiRadioGroup`, inline preview `<img>` slot, Apply `MpiButton`. Live preview runs the **image** `resize` workflow on a 512px-longest-edge thumbnail extracted from `viewer.el.getSourceElement()` (HTMLImageElement or HTMLVideoElement), with `width`/`height`/`divisible_by` proportionally scaled to thumb space. Result paints into the inline preview slot — viewer is never touched. Apply appends a new full-resolution entry via `startGeneration` (`resize` for image, `resizeVideo` for video); preserves the source. Persists controls under `project.toolSettings.resize` via `settings:tool:update`.
- `MpiToolOptionsUpscale`   props: `{ viewer, onApply }`   — `MpiOptionSelector` (factor) + `MpiDropdown` (model) + run. Emits `apply { factor, model }`.
- `MpiToolOptionsInterpolate`   props: `{ viewer, onApply }`   — `MpiOptionSelector` (multiplier) + run. Emits `apply { multiplier }`.
- `MpiToolOptionsPrompt`   props: `{ promptBox, project }`   — video-history-only toolbar. Two frame thumbs (Start / End) with role-tagged drop targets + swap button + clear-slot `x` + two action `MpiButton`s (Extend, Create new). Subscribes to PromptBox `media-change` to mirror chips by role via `promptBox.el.getMediaByRole(role)`. Drop on thumb → uploads with operation `frame-drop` → `promptBox.el.injectMedia({ url, mediaType: 'image', role })`; right-click frame capture uses operation `frame-capture`. Both staging operations are excluded from landing recent thumbnails. Swap fires `promptBox.el.swapMediaRoles('startFrame', 'endFrame')`. `x` fires `promptBox.el.removeMediaByRole(role)`. Buttons emit `prompt-box-tools:extend` / `prompt-box-tools:create-new` on the Events bus. Single listener lives in MpiGroupHistoryBlock — do NOT pre-wire elsewhere. Thumb sizing is CSS-only (`max-height` + `object-fit: contain`); no aspect-ratio prop or JS measurement.

---

## MpiVideoViewer (Organism — js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js)

Wraps a `MpiVideoSurface` + crop overlay canvas + `MpiViewerCorners` chip strip. Mounted by `MpiGroupHistoryBlock` for video groups. Tool bars are owned by `MpiToolOptions*` compounds — NOT by the viewer. **Control bar is NOT internal**: the parent Block mounts `MpiVideoControlBar` in its own `#controls-slot` and wires it via `viewer.el.attachControlBar(instance)`. This lets the bar span the full app window and lets non-video surfaces reuse the bar (e.g. audio-only via `showTrim: false`) without dragging the viewer along.

Pan/zoom transform targets the actual `.mpi-video-surface__video` element, not `.mpi-video-viewer__player`, for cross-platform hardware-video compositor compatibility. Wheel zoom works while video tools are selected; crop mode blocks left-drag pan only so crop-handle dragging remains unambiguous.

- `MpiVideoSurface`     props: `{ fps }`   slot: `[data-mount="surface"]` inside viewer stage
- `MpiViewerCorners`    no props          slot: `#corners-mount` inside viewer stage

**Instance API (on `el`):** `attachControlBar(instance)` / `detachControlBar()`, `getSurfaceInstance()`, `loadVideo(url, meta)` — `meta.fps`/`meta.frameCount`/`meta.trim` proxied to the attached control bar; `meta.trim = { in, out }` propagates as `setPendingTrim` (one-shot, applied on next `loadedmetadata`). Plus `enterCropMode(rect)`, `exitCropMode()`, `getCropRect()`, `setCropRatio(ratio)`, `captureSnapshot({ time })`, `getSourceElement()`, `resetView()`, `setRangeQuiet(in, out)`, `getRange()`, `setTopRight(items)`, `enterUpscaleMode()`, `exitUpscaleMode()`, `enterInterpolateMode()`, `exitInterpolateMode()`, `destroy()`.

> Control bar lifetime is owned externally — `viewer.destroy()` only `detachSurface()` on the attached bar; it does NOT destroy it.

---

## projectUI.js (landing page — mounted once at boot)

- `MpiProjectDropOverlay`   props: `{ onDrop({ folderPath, source }) }` callback   slot: `document.createElement('div')` appended to `#page-landing` — full-area OS drop target for project folders / `project.json`; shown/hidden via `#page-landing` `dragenter`/`dragleave`/`drop` listeners (drag counter prevents flicker); `onDrop` calls `addProjectByFolder()` then `loadProjectGrid()`. Feature-gated on `window.require` — skipped in plain-browser dev mode.
- `MpiNewProject`, `MpiOkCancel` (delete-confirm)   slot: `document.createElement('div')` — lazy singletons shown on user action; not mounted until first trigger.
- Landing project rows (one per project)   slot: `#projectGrid` children — rebuilt on every `loadProjectGrid()`. **NOT a component:** since the Stage redesign these are hand-built `.mpi-landing__pl-row` divs from `_buildProjectRow()` in `js/shell/projectUI.js`. `MpiProjectCard` is imported there but **never instantiated** — it is dead on Landing, so edit `_buildProjectRow` + `styles/shell/landing.css`, not the component (see `docs/workspaces.md` § Landing). Per-row stats (asset count + bytes-on-disk) come from `fetchStats()` in `js/services/projectStatsService.js`; in-flight fetches are aborted via the module-local `_statsBatchAC` AbortController when the grid rebuilds, so late responses don't write into rows that no longer exist.
- **`#landingActions` slot:** plain `<a>` text links (`Settings · Hotkeys · About`) — NOT `MpiButton`s. Each click dispatches `Events.emit('slide-over:open', { title, component })` where `component` is one of `MpiSettings | MpiHotkeys | MpiAbout` (imported as content blueprints, not mounted directly). Hero version label `Cubric Studio · v${APP_VERSION}` mounts at `#heroVersion`.
- **`MpiSlideOver`**   import-side-effect at module load: `import '../components/Compounds/MpiSlideOver/MpiSlideOver.js'` registers the module-level `Events.on('slide-over:open', ...)` handler. No direct mount call. The handler mounts a fresh instance per open into `document.createElement('div')`, appended to `document.body` by `el.open()`. On close, `_doClose` destroys the content instance (MPI-177) before removing the panel node (`transitionend` + 400ms backstop).

> **MpiSettings is NOT mounted directly anymore.** It is a *content component* of `MpiSlideOver` — its body element is mounted inside `.mpi-slide-over__body` via `props.component.mount(bodyEl)` from inside `MpiSlideOver.setup()`. The legacy `el.show()/el.hide()` methods are gone. Field initialisation runs via `el.onOpen()`, which `MpiSlideOver` calls once on every open. Internal mounts inside `MpiSettings._initFields()` are unchanged:
> - `MpiCheckbox`   props: `{ checked: Storage.getAutoStartComfy(), label:'Auto-start ComfyUI on Launch' }`   slot: `#mpiSettingsAutoStartSlot`
> - ~~`MpiInput` (ComfyUI URL) — slot `#mpiSettingsComfyUrlSlot`~~ **REMOVED.** No such slot, label or value exists anywhere in `js/` (verified 2026-08-03). Settings has no user-editable ComfyUI address: the local engine's port is owned by `COMFYUI_PORT` in `routes/shared.js` (48188 since MPI-434 — NOT ComfyUI's 8188 default, see the comment there), and the remote address comes from `MpiRunpodSettings`. Do not re-add this row from an old draft.
> - `MpiInput` (ComfyUI path)   props: `{ label:'ComfyUI Models Path', placeholder:'Default (internal engine)', value }`   slot: `#mpiSettingsComfyRootPathSlot`
> - `MpiButton` (Browse)   props: `{ text:'Browse', variant:'secondary', size:'md', extraClasses:'mpi-settings__browse-btn' }`   slot: `#mpiSettingsBrowseBtnSlot`
>
> **`MpiRunpodSettings` (MPI-177):** the whole RunPod Remote Engine section is its own Compound. Mounted ONCE in `MpiSettings.setup()` (not per `onOpen`) — props: `{}`, slot: `#mpiSettingsRunpodMount`. `MpiSettings.el.onOpen()` forwards to `_runpodInst.el.onOpen()` (runs `_initRunpodSection`); `MpiSettings.el.destroy()` destroys it. Its internal mounts (RunPod toggle/key/DC/volume/GPU/connect controls) all target `#mpiSettingsRunpod*` slots inside its own template.

---

## shell.js (global singletons — mounted once at startup)

- `MpiErrorDialog`     props: none   slot: `document.createElement('div')` — shown on `ui:error` event
- `MpiChangelogDialog` props: none   slot: `document.createElement('div')` — "What's New" overlay. Shown once per `APP_VERSION` by `_maybeShowChangelog()` in `_bootApp`, AFTER engine/deps gates + dev-state restore, BEFORE optional Comfy auto-start. Skipped when `Storage.getLastSeenChangelogVersion() === APP_VERSION` or `getReleaseNotes(APP_VERSION)` has no content. Content set via `el.open({ version, stage, notes })`; internally mounts `MpiButton` (Done) + `MpiIcon` (per-section). Reads notes from `js/data/releaseNotes.js`. NOT an updater.
- `MpiStartingComfy`   props: none   slot: `document.createElement('div')` — shown on `comfy:starting`, hides on `comfy:ready`
- `MpiModelManager` (the **Model Library** overlay)   props: none   slot: `document.createElement('div')` — lazy singleton mounted by shell on first `models:open`; self-hosts an `MpiOverlay(mountTarget:'body')` + an in-overlay right-drawer detail panel. Shell calls `el.open()` each time (MPI-215). Reserved slide-over stays for Settings/Hotkeys/Queue only.
- `MpiFlowLibrary` (the **Flow Library** overlay, MPI-256)   props: none   slot: `document.createElement('div')` — lazy singleton mounted by shell on first `flows:open`; self-hosts an `MpiOverlay(mountTarget:'body')` + a right-drawer detail panel. Tiles come from the shared `MpiTileSheet` Primitive (MPI-356 — it owns the `.mpi-tile*` CSS and the sheet grid for all three surfaces: Model Library, Flow Library, model picker; consumers keep their own state logic and pass the state row in as HTML). `.mpi-detail*` is still a GLOBAL selector borrowed from MpiModelManager.css. Shell calls `el.open()` each time. **No longer dev-gated (MPI-589)** — `flows:open` is emitted by the Landing nav, the gallery bar's Flows button and the Tab ring, all user routes; only the **Ctrl+Tab dev radial** is still `APP_CONFIG.dev_mode`-gated (MPI-338 moved it off the main Tab radial). **A tile press does not always open the drawer (MPI-638):** `_pick` emits `flow:open` DIRECTLY when the flow is available AND `state.currentPage === PAGE_GALLERY`; the drawer is for an unready flow (Install lives there) or for Landing (where `flow:open` would land nowhere).
- `MpiBaseFlow` (the **Flow** overlay frame, MPI-256)   props: `{ flow: FlowDef, initialInputs?: Object }`   slot: `document.createElement('div')` — mounted by shell on `flow:open {flowId}` with the resolved descriptor **and nothing else** (destroys any prior active Flow first). **There is no per-Flow component (MPI-572):** the `uiComponent` prop, the name→blueprint map and `MpiFlowHeadSwap` are all deleted, because a component cannot ride in a third-party Flow manifest. Self-hosts an `MpiOverlay(mountTarget:'main-area')`. `el.open()` shows it; Back-to-Library = `el.close()` + `flows:open`. CLOSING DESTROYS IT (MPI-345): the frame re-emits its overlay's `close` and the shell destroys the instance one tick later — a hidden-but-alive Flow kept its global `generation.run` hotkey and queued a phantom generation on the next Ctrl+Enter. Inputs survive in `state.s_flowInputs`, and every open remounts fresh.
- `MpiMemoryMonitor`   props: none   slot: `#memory-monitor-mount`
- `MpiProjectName`     props: `{ projectName }`   slot: `#project-name-mount`
- `#prompt-box-mount` slot   declared in `index.html` at `#app-shell` level — Blocks (Gallery, History) mount `MpiPromptBox` Organism into it directly; slot persists across workspace switches, so each Block MUST destroy its prior `_pb` handle before remount AND in `el.destroy`.

> **Rule:** Never mount any of the above singletons inside workspace Blocks. Use Events to trigger them.

---

## MpiGalleryGrid.js (Compound: grid layout + card rendering)

MpiGalleryGrid is now a Compound that handles both justified layout and card display (logic merged from deleted MpiGroupCard).

**Primitives mounted:**
- `MpiProgressBar` (size slider)   props: `{ min:1, max:5, step:1, value:3, interactive:true, wheel:true, info:'Size: {value}' }`   slot: `.mpi-gallery-grid__slider-wrap`
- `MpiButton` (info toggle)   props: `{ icon:'info', size:'sm', variant:'ghost', toggleable:true, active, info }`   slot: `.mpi-gallery-grid__info-btn-slot`
- `MpiButton` ×6 (tab buttons)   props: `{ text, variant:'ghost', size:'sm', extraClasses:'mpi-gallery-grid__tab[ mpi-gallery-grid__tab--active]' }`   slot: `.mpi-gallery-grid__tab-slot[data-order]` / `.mpi-gallery-grid__tab-slot[data-filter]` — active class toggled via `_syncTabActive()` on `state.gallerySort` change; click handlers write to `state.gallerySort`
- `MpiCheckbox` (card selection)   props: `{ checked: false }`   slot: `.mpi-group-card__select-wrap` — mounted per card inside `_makeCard()`; `on('change')` drives selection state

**Card rendering:**
- Cards are now rendered as DOM elements (not components)
- Card logic (generating state, preview, drag) integrated directly
- One card per ItemGroup in `.mpi-gallery-grid__grid` with justified layout
- Generating cards detected by `isGenerating` flag and rendered in `.mpi-gallery-grid__generating-slot`

**Video card rendering:**
- Video groups (`group.type === 'video'`) swap `<img>` thumb for native `<video>` element (`_swapThumbToVideo`)
- Video element: `muted`, `loop`, `playsInline`, `preload='metadata'` — first frame shows at rest, hover triggers `play()`/`pause()`
- No canvas/poster extraction — browser/Electron decodes natively

**Public API (on `instance.el`):**
- `setGroups(groups)` — replace all groups and re-render; generating cards flow through `isGenerating` flag
- `updatePreview(tempId, url)` — push latent preview to generating card during image generation
- `removeCard(groupId)` — remove single card from grid and `_cardMap`
- `setSelectionMode(bool)` — toggle selection mode CSS on all cards

---

## MpiPromptBox.js (internal mounts)

- `MpiInput` (textarea)   props: `{ type:'textarea', placeholder:'Type your prompt...', value }`   slot: `#textarea-slot`
- `MpiButton` (expand-lock)   props: `{ icon:'chevronDown', iconActive:'chevronUp', info, size:'sm', variant:'ghost', toggleable:true, active: !isExpansionLocked }`   slot: `#expand-lock-slot`
- `MpiButton` (copy)   props: `{ icon:'copy', variant:'ghost', size:'sm', info }`   slot: `#copy-btn-slot`
- `MpiButton` (model button, MPI-356)   props: `{ variant:'secondary', size:'sm', info:'Change model', extraClasses:'mpi-prompt-box__settings-trigger' }`   slot: `#settings-badge-slot` — was the composite "MODEL · OPERATION" settings trigger; the op half went to the strip and the popup to the cogwheel, so it now only emits `ui:open-model-picker`. Its label is a badge span (`model.name` + `tierLetterFor(model)` + batch ×N).
- `MpiButton` (cogwheel — parameters popup trigger, MPI-356)   props: `{ icon:'settings', variant:'secondary', size:'sm', info:'Generation parameters' }`   slot: `#settings-cog-slot` — sits right AFTER the model button (bar order: neg · prompt · enhance · model · **cog** · engine · run) and shares its `secondary` variant. Grid columns are all `auto` except the prompt's `1fr`, so DOM order alone sets the position.
- `MpiButton` (negative toggle)   props: `{ icon:'check', iconActive:'negative', info, size:'sm', variant:'primary', toggleable:true, active:isNegativeMode }`   slot: `#bottom-neg-slot` — only when `includeNegative` prop is true
- `MpiButton` (run/stop)   props: `{ icon:'play', iconActive:'stop', info, size:'md', variant:'primary', toggleable:true, active:isGenerating }`   slot: fresh div appended to `#bottom-right-slot`
- `MpiRadioGroup` (op strip, MPI-356)   props: `{ options: _opChoices() mapped to { label: short, value, info, disabled }, value: activeOperation, name:'operation', size:'sm' }`   slots: **TWO mounts of the same choice list** — `#op-strip-slot` on the bar AND `#op-strip-popup-slot`, the settings popup's header (it replaced the SETTINGS badge; the popup covers the bar strip while open, so the op has to stay reachable from inside it). Both emit the same `workspace:set-operation`, and `_refreshOpStrip` rebuilds both, so they cannot disagree. A capture-phase click listener on `popupNode` records in-popup clicks BEFORE the strip remounts — without it the outside-click dismiss sees a detached target and closes the popup on every op change. The bar mount floats ABOVE the bar (absolute, `bottom:100%`, right-aligned) so the bar keeps its compact height. Destroyed + remounted on every model/media/mask change (`_refreshOpStrip`), which re-seeds `value` so selection can't drift from `activeOperation`. A single-op model still renders its ONE chip. Selecting emits `workspace:set-operation` — the box never sets the op itself.
- `PromptBoxControl components` (e.g. `qualityTier`, `ratio`, `batch`, `duration`, `motionIntensity`, `previewStage`)   props: `{ model }`   slot: `#settings-op-slot` (inside the settings popup, not the bottom bar) — one control per operation's `components[]` array; cleared and remounted on operation change. `qualityTier` is a no-op for orientation-mode models (renders nothing) and only mounts UI for `RATIO_MODES[model.type] === 'quality'`. The mount loop wraps each `ctrl.mount()` in try/catch + `clientLogger.error` so a single failing control no longer blocks subsequent controls in the same op.

---

## MpiCompareOverlay.js (internal mounts)

- `MpiOverlay`   props: `{ closable: true }`   slot: `document.createElement('div')`
- `MpiCanvas`   props: none (lazy, created on first `open()` call)   slot: `#canvas-wrap`

---

## MpiFlowLibrary.js (internal mounts, MPI-256)

- `MpiOverlay`   props: `{ closable: true, mountTarget: 'body' }`   slot: `document.createElement('div')`
- `MpiTileSheet` (one per output-type section, MPI-634)   props: `{ items }`   slot: appended to `#flow-body-slot`. Its `select` goes to `_pick`, NOT straight to `openDetail` — see the MPI-638 note on the singleton entry above.
- `MpiDropdown` (model pick, MPI-590/599)   props: `{ options: <ALL candidates in the slot, installed or not>, value: <the resolved id> }`   slot: `#flow-detail-model-<i>` — ONE per CHOOSABLE slot (`flowModelChoices`). **Offering uninstalled candidates is the point:** this drawer asks "which one do I download". The run slide's twin asks "which one do I run" and filters to installed — do not make the two match. The field caption is the slot's `label` only when the flow declares 2+ slots, else the generic `Model` (MPI-638).
- `MpiButton` (detail footer Open/Install/Cancel)   props: `{ text:'Open'|'Install models'|'Verify licence'|'Review licence'|'Cancel', variant:'primary'|'secondary', size:'md', disabled?: !canOpen }`   slot: `#flow-detail-actions` — rebuilt on each `openDetail()`. Open (all models installed) emits `flow:open {flowId}`; Install drives each missing model's `downloadService.start` (its LABEL names the outstanding licence errand, MPI-666); Cancel appears in the installing state beside the aggregated bar.
- `MpiButton` (detail footer **Uninstall**, MPI-682)   props: `{ text:'Uninstall', variant:'secondary', size:'md' }`   slot: `#flow-detail-actions`, beside Open — rendered ONLY when the flow is `available` AND declares its own `requiredDeps`. **The gate is not cosmetic:** a models-only flow owns nothing to free (its weights come off in the Model Library) and a button here would read as an offer to delete the model itself — the same gate the plugin row uses in `MpiModelManager._pluginTile`. It frees `flow.requiredDeps` ONLY, under `flowDepKey(flow.id)`: that key is what releases `_flowRequiredDepIds(excludeUninstallId)` server-side, and a model id there returns 200 and frees nothing. Never `getFlowDependencies()` — that unions a `requiredPlugins` plugin's deps in for the INSTALL payload. The footer is `flex-direction: column` here (MPI-259), so Open and Uninstall stack full-width rather than sitting side by side as in the Model Library.
- `MpiOkCancel` (uninstall confirm, MPI-682)   props: `{ title:'Uninstall', okLabel:'Uninstall', cancelLabel:'Cancel' }`   slot: `ce('div')`, self-portals to body — mounted ONCE at setup, not per `openDetail()`, and torn down in `el.destroy()`. Body text is set per-use through `#text-slot`. Its `ok` awaits `downloadService.uninstall(...)` and then `await reSyncInstalledModels()` — **that re-sync IS the repaint, not belt-and-braces**: `downloadService` re-syncs only inside its `download:uninstalled` SSE listener and `_eventSource` is created lazily by the first download, so a session that has installed nothing has none and the dep-status cache would stay pre-uninstall forever (measured live, MPI-682).

**No LoRA cogwheel here (MPI-638).** MPI-608 mounted one per rack-bearing slot in this drawer and MPI-613 mounted another on the run slide; both were live at once. The drawer now only ever shows a flow whose weights are NOT on disk, so a rack for it configures nothing. The cogwheel lives beside its model dropdown on the run slide — see the `MpiBaseFlow.js` section.

---

## MpiBaseFlow.js (internal mounts, MPI-256)

**There is NO per-Flow component (MPI-572).** The shell mounts `MpiBaseFlow` with the descriptor and nothing else; the `_flowComponents` name→blueprint map and the last flow component (`MpiFlowHeadSwap`) are both deleted. A component cannot ride in a third-party Flow manifest, so everything a flow needs is declarable — a knob is a `fields` entry, a gizmo's output is a step's `param` binding. Do not add one back; add a field type in `_buildField` instead.

- `MpiOverlay`   props: `{ closable: true, mountTarget: 'main-area' }`   slot: `document.createElement('div')`
- `<declared fields>` — NOT a mount of its own. Flow-level `fields` render through `buildField` (`js/utils/declaredFields.js`) into `.mpi-base-flow__content`; each type mounts its own Primitive (select=MpiDropdown, radio=MpiRadioGroup, button=MpiButton, toggle=MpiCheckbox, number/text=MpiInput, slider=MpiProgressBar)
- `MpiButton` (Run)   props: `{ text:'Generate', variant:'primary', size:'md' }`   slot: `.mpi-base-flow__gen` (built with `ce()`, not an id)
- `MpiDropdown` (model pick, MPI-638)   props: `{ options: <installed candidates, labelled by disambiguatedName(id, slot.models)>, value: <the resolved id> }`   slot: `.mpi-base-flow__model-pick` inside `.mpi-base-flow__models` → `.mpi-base-flow__content` — ONE per model slot that has MORE THAN ONE INSTALLED candidate, from `flowModelSlots(flow)` + `flowModelIds(flow)`. A slot with one installed candidate renders a `.mpi-base-flow__model-name` span instead: a one-option dropdown claims a choice that is not there. A change calls `setFlowModel` then repaints the ROW (`_paintModelSlots`), never `_renderSlide()` — that tears down and replays the result pane
- `MpiButton` (LoRA cogwheel, MPI-613/638)   props: `{ icon:'settings', size:'sm' }`   slot: the same `.mpi-base-flow__model-pick`, immediately right of that slot's dropdown — ONE per rack-bearing slot (`loras: true`). **No text label**: the dropdown beside it names the model, which is what retired the per-slot captions ("Render model" / "Edit model"); `aria-label`/`info` carry "LoRAs for &lt;model&gt;". Gated on `state.currentProject` (the dropdown is not — it needs no project). Destroyed with the dropdowns in `_destroyModelBtns()`, called from `_teardownSlide()`, since the run slide is rebuilt on every navigation
- `MpiModelSettings` (MPI-613)   props: none   slot: `document.createElement('div')` — mounted LAZILY on the first cogwheel click, and opened DIRECTLY (`.el.open({ modelId })`), **not** via `ui:open-model-settings`. That event is listened for only by the two workspace Blocks, so a flow opened from the landing page would emit into nothing; owning the instance also stops a Block's listener opening a SECOND panel over a live flow. Outlives the slide — destroyed in `el.destroy()`, not `_teardownSlide()`

---

## MpiModelSettings.js (internal mounts)

- `MpiOverlay`   props: `{ closable: true }`   slot: `document.createElement('div')`
- `MpiDropdown` (upscale)   props: `{ options: upscaleOptions from state.upscaleModels, value, placeholder }`   slot: `.mpi-model-settings__upscale-slot`; remounted on each `open()` call
- `MpiTreePicker` (lora slot ×6)   props: `{ options: loraOptions from state.availableLoras, value, placeholder, searchPlaceholder:'Search LoRAs…', stripExtension:true, extraClasses: missing ? 'mpi-tree-picker--missing' : '' }`   slot: per-slot `dropHost` div; remounted on each `open()` call. Searchable folder tree (MPI-233) — replaced the flat `MpiDropdown` at BOTH flat (`_mountLoraSlots`) and staged (`_mountStagedLoraSlots`) sites. Value stays the full path string (heal/inject untouched).
- `MpiInput` (model strength ×6)   props: `{ type:'number', size:'sm', value, min:-2, max:2, step:0.05, decimals:2 }`   slot: per-slot `strengthsEl`
- `MpiInput` (clip strength ×6)   props: same pattern as model strength
- `MpiFolderDrop` (one per configured folder)   props: `{ folderPath, bucket, primary, onImport }`   slot: `[data-drop="loras"]` / `[data-drop="upscale_models"]`; sourced from `GET /comfy/model-folders`; remounted per `open()` via render-token-guarded async `_renderDropZones` (guard prevents duplicate zones when the live-rerender fires mid-fetch). Also mounted in `MpiSettings` External Connections.
  - Missing-model UX: a selected LoRA/upscale absent from `state.availableLoras`/`upscaleModels` shows red (LoRA: `mpi-tree-picker--missing`; upscale: `mpi-dropdown--missing`) + a synthetic `(missing)` option. A relocated file self-heals by UNIQUE basename (path updated, persisted); ambiguous same-name across folders stays red. LoRA missing → blocking `ui:warning` at generate; upscale missing → fall back to SIAX + warn. The picker live-rerenders on `state:changed` for those keys while open.

---

## MpiFolderDrop (Primitive: model-folder drop zone — js/components/Primitives/MpiFolderDrop)

Labeled model folder that is also an OS drop target. Resolves the dropped file's
disk path via Electron `webUtils.getPathForFile` and POSTs `/comfy/import-model`
to COPY it into that folder (409 → `window.confirm` replace). `onImport(filename)`
fires after success (callers call `loadAssets()`). Drop does **preventDefault only,
NOT stopPropagation** — the gallery's window-level drop cleanup must still fire, or
its media-drop overlay sticks open. Browser dev mode (no `webUtils`) ignores drops.

---

## MpiVideoSurface.js (Compound — js/components/Compounds/MpiVideoSurface — bare surface)

Owns the bare `<video>` element + a sibling **exact-frame canvas overlay** (`.mpi-video-surface__frame`, `data-frame="true"` shows it) + click-to-toggle-play (skipped on `[data-no-toggle]` ancestors). No internal sub-component mounts. Preserves loop-disable/seeked-restore dance + frame-step wrap-on-loop semantics. Frame-step works in integer frame space (`round(t * effFps)`) — float comparisons at range edges drift by a frame. **Frame-accurate step/scrub (MPI-283):** `frameStep` decodes the exact frame via `js/services/frameSink.js` (mediabunny/WebCodecs), paints the canvas overlay, THEN moves `video.currentTime`; falls back to a native `+0.25·fs` seek when the sink can't decode (`canDecode` gate → null). `_effectiveFps` = `frameCount/duration` when both known (true PTS spacing), else declared `fps`. See `docs/video-player.md`.

**Instance API (on `el`):** `_setSrc`, `_play`, `_pause`, `seek(seconds)`, `frameStep(direction, range?)` (`range = { rangeIn, rangeOut, loop }` — when present, wraps at range edges; `loop` is required when caller has disabled native `video.loop` for range emulation), `getVideoElement`, `_setFps`, `_setFrameCount`, `getFps`, `getFrameCount`, `_setVolume`, `_setMuted`, `destroy`. Emits component-local `play/pause/ended/timeupdate/loadedmetadata/volumechange`.

---

## MpiVideoControlBar.js (Compound — js/components/Compounds/MpiVideoControlBar — transport + trim)

Owns play/frame±/loop/audio/fullscreen/frames-toggle buttons + time display + (optional) embedded `MpiTrimBar`. Drives a sibling `MpiVideoSurface` via `attachSurface(instance)`. Owns the 6 video hotkeys + 3 trim hotkeys (trim hotkeys only when `showTrim` is true). Hotkeys are bound on `attachSurface`, unbound on `detachSurface`/`destroy`. Loop intent is tracked separately from `video.loop`: when the active range is a strict subset of the clip, native `video.loop` is forced off and the loop is emulated via `timeupdate` (`seek(_in)` at `_out` if loop on; `_pause()` otherwise). Range-loop emulation gates on `!video.paused` so frame-step (which pauses first) is not re-routed.

**Layout:** single horizontal row, `[left buttons + time] [trim flex:1] [right buttons]`. Mounted full-width by the parent Block (see `#controls-slot` mount above); not embedded inside the viewer.

**Props:**
- `fps` (number, default 24)
- `showTrim` (boolean, default `true`) — when `false`, no `MpiTrimBar` mount; trim hotkeys/range API become no-ops; `getRange()`/`getValue()` return `null`. Use for audio-only or trim-less surfaces.

- `MpiButton` (play, frame-back, frame-forward, frames-toggle, loop, mute, fullscreen) — slots `[data-mount="play|frame-back|frame-forward|frames-toggle|loop|mute|fullscreen"]`
- `MpiProgressBar` (volume) — slot `[data-mount="volume"]`
- `MpiTrimBar` — slot `[data-mount="trim"]` (only when `showTrim`; props: `{ duration: 0, fps, value: 0, inPoint: 0, outPoint: 0 }`; updated via `setDuration`/`setRangeQuiet`/`setFrameCount` on surface `loadedmetadata`)

**Frame-index coordinate law (MPI-283):** `setFrameCount(n)` is pushed into the trim bar so playhead/handles map in integer-frame space. `_displayTime(currentTime)` snaps to the exact frame's TRUE time (`idx/effFps`) — it does NOT apply the `idx/lastIdx·dur` normalization (that lives only in `MpiTrimBar._pctOf`); applying it in both places shifts the echoed playhead one frame off the drop position. See `docs/video-player.md`.

**Instance API (on `el`):** `attachSurface(instance)`, `detachSurface()`, `setRange(Quiet)`, `getRange`, `getValue`, `setVolume`, `setMuted`, `setFrameCount`, `setFps`, `setPendingTrim(in, out)` (one-shot for next `loadedmetadata`; no-op when `showTrim: false`), `destroy`. Emits `loop-change`, `range-change`.

---

## MpiTrimBar.js (Compound — js/components/Compounds/MpiTrimBar — two-handle trim seek bar)

Self-contained 28px track + two trim handles (in/out, ±8px overflow w/ 10×3 caps) + 2px playhead w/ triangle arrow + 12% heat selection fill. Stage tokens only. No internal sub-component mounts. Pointer drag coalesces on RAF; commits on `pointerup`. Track click drags playhead from cursor. **Frame-index mapping (MPI-283):** optional `frameCount` prop + `setFrameCount(n)`; when set, `_snap`/`_pctOf`/`_eventToSeconds` map in integer-frame space (`effFps = frameCount/duration`, position `idx/(frameCount-1)` so frame 0→0% / last→100%) to MATCH `MpiVideoControlBar._displayTime` — this is what removes the playhead drop-then-echo jump. Falls back to `time/duration` when `frameCount` is unset.

**Instance API (on `el`):** `setDuration`, `setFps`, `setValue(Quiet)`, `setRange(Quiet)`, `getValue`, `getRange`, `destroy`. Emits component-local `seek`, `in-change`, `out-change`, `range-change`.

---

## MpiHistoryTools.js (internal mounts)

Builds its own tool list from `mode: 'image'|'video'` prop. All tools — flat or grouped — render as `MpiButton`. Multi-item groups stack their sub-tools as flat buttons directly under the group label (no popup, no portal). New tools added to a group auto-stack.

- `MpiButton` (every tool)   props: `{ icon, size:'sm', variant:'ghost', info, toggleable:false, active, disabled, extraClasses:'mpi-ibtn--rail' }`   slot: per-button wrapper div appended to the group's `__slot` — wrapper required because `ComponentFactory.mount` writes `container.innerHTML` and would clobber siblings otherwise. `toggleable:false` enforces radio behaviour (re-click = no-op)

**Image mode tools:** `prompt`, `crop`, `resize`, `imageUpscale`, `mask`
**Video mode tools:** `prompt`, `crop`, `resizeVideo`, `videoUpscale`, `interpolate`

**Instance API (on `el`):**
- `setMode(mode)` — activate programmatically; emits `activate { mode }`; re-activating current = no-op
- `setDisabled(map)` — bulk update `{ [toolMode]: { disabled, reason? } }`; accepts top-level and sub-modes
- `getActiveMode()` — read current mode
## Gallery Preview Lifecycle

`MpiGalleryGrid.updatePreview(tempId, url)` must keep the generating spinner visible until the preview image's own `load` event fires. Do not hide the spinner immediately after assigning `img.src`; WAN/video workflows can emit early preview URLs while models are still loading.
