# MpiCanvas Pixi Display Refactor

**Date:** 2026-04-27
**Goal:** Replace single-canvas display (2D `ctx.scale` + scaled `drawImage`) with two-canvas stack: Pixi WebGL canvas displays adjusted base image directly (no bitmap copy), 2D overlay canvas handles mask/crop/grid at image native px. Pan/zoom via CSS transform on parent stack (GPU compositor). Brush indicator + comparison slider drag handle live on screen-space UI layer.

**Why:** Current pipeline has three problems:
1. Pixel smoothing bug — `imageSmoothingEnabled = false` is bypassed by Chromium SkiaRenderer on fractional `ctx.scale` calls. User cannot see actual pixels at high zoom (raw validation requires this).
2. 4K zoom lag — `drawImage` re-rasterizes 16M source pixels into ~1M backing buffer every pan/zoom frame.
3. GPU→CPU→GPU bitmap roundtrip — Pixi renders to its own canvas, then `createImageBitmap` copies, then 2D canvas draws bitmap. Wasted per slider change.

**Architecture (Path B — confirmed with user):**
```
<div class="mpi-canvas">                          ← MpiCanvas root, container px
  <div class="mpi-canvas__stack"                  ← image native px, transformed
       style="transform: translate(x,y) scale(s)">
    <canvas data-role="pixi"/>                    ← Pixi WebGL, image-rendering: pixelated
    <canvas data-role="overlay"/>                 ← 2D, mask + crop + grid (transparent)
  </div>
  <canvas data-role="screen-ui"/>                 ← 2D, container px, brush + slider drag handle
</div>
```

**Constraints:**
- All MpiCanvas public API on `instance.el` stays backward-compatible (loadImage, setMaskingMode, getCropRect, maskCanvas, scale/offsetX/offsetY, setProcessedImage/clearProcessedImage, `'modechange'` event, etc.). MpiCanvasViewer + MpiCompareOverlay + MpiToolOptionsRaw untouched.
- Pixi shader logic in `rawGpuPipeline.js` untouched. Only output target changes (canvas owned by MpiCanvas, mounted directly).
- Mask/crop/grid logic in managers stays — coords already in image native px.
- Effects on mask: not needed (Comfy handles).
- Scope: history workspace / raw editing only. Gallery/thumbnails/cards stay as plain `<img>` (already are).

---

## Pre-flight: Read these first

- `.claude/rules/components.md` — Primitive contract, ComponentFactory, lifecycle/teardown
- `.claude/rules/dos_and_donts.md` — CSS vars, BEM, dom utils
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` (current implementation)
- `js/components/Primitives/MpiCanvas/managers/*.js`
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` — primary caller
- `js/components/Organisms/MpiCompareOverlay/*` — secondary caller
- `js/utils/rawGpuPipeline.js` — Pixi pipeline + `_onBitmap` flow
- `js/components/Compounds/MpiToolOptionsRaw/MpiToolOptionsRaw.js` (lines 156, 350, 476) — pipeline mount + `setProcessedImage` consumers

---

## To-dos

- [x] **1. Build new DOM structure + CSS, keep current rendering working**

  **What:** In `js/components/Primitives/MpiCanvas/MpiCanvas.js`:
  - Replace template with two-canvas stack + screen-UI sibling.
  - `template: () => '<div class="mpi-canvas" style="width:100%;height:100%;display:block;overflow:hidden;position:relative;"><div class="mpi-canvas__stack" style="position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;"></div><canvas class="mpi-canvas__screen-ui" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;"></canvas></div>'`
  - In `_CanvasCore.constructor`, create THREE canvases:
    - `this.baseCanvas` — temporary 2D placeholder (will swap for Pixi canvas in to-do 5). Append to `__stack`. `style.imageRendering = 'pixelated'`. Backing buffer initially 0×0.
    - `this.overlayCanvas` — 2D, append to `__stack`. `style.imageRendering = 'pixelated'`. Backing buffer 0×0.
    - `this.screenUICanvas` — 2D, the existing screen-UI sibling (already in template). Backing buffer = container px.
  - Keep current `this.canvas` and `this.ctx` aliasing to `baseCanvas` for now — every existing draw call still works against `baseCanvas`. Final swap happens in to-do 5.
  - Stack element exposed as `this.stackEl` for transform writes in to-do 4.
  - **No** rendering behavior changes yet. `draw()` still uses `ctx.translate/scale + drawImage` against `baseCanvas` exactly as today.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Reload Electron. Load any image in raw tool. Image still displays as before (smoothed pixels expected — not fixed yet). Pan and zoom still work. No regressions in mask/crop/comparison. Inspect DOM: `.mpi-canvas` contains `.mpi-canvas__stack` and `.mpi-canvas__screen-ui` siblings; stack contains two `<canvas>` children. Console: `console.log('[mpicanvas] dom', { stack: !!core.stackEl, base: !!core.baseCanvas, overlay: !!core.overlayCanvas, screen: !!core.screenUICanvas })` on construction. Look for `[mpicanvas] dom { stack: true, base: true, overlay: true, screen: true }`.

- [x] **2. Size canvases to image native px on \****`loadImage`**\*\*, draw image at native res**

  **What:** Update `loadImage(url)` in `_CanvasCore`:
  - After `img.onload`, set `baseCanvas.width = img.width; baseCanvas.height = img.height` (clamped to `MAX_TEXTURE_SIZE` mirroring rawGpuPipeline.js logic — same util/constant or recompute here).
  - Set `baseCanvas.style.width = img.width + 'px'; baseCanvas.style.height = img.height + 'px'`.
  - Same for `overlayCanvas`.
  - Set stack element size: `stackEl.style.width = img.width + 'px'; stackEl.style.height = img.height + 'px'`.
  - Replace `draw()` body with split renderers:
    - `_renderBase()` — clears `baseCtx`, draws `_processedBitmap ?? img` at `(0,0)` with no transform (1:1). Called on image load and on `setProcessedImage`.
    - `_renderOverlay()` — clears `overlayCtx`, draws comparison clip layer (still using same 2D path, just on overlay canvas instead of base — math simplifies because no `ctx.scale`/`translate`), mask layer at `(0,0)`, crop overlay, grid overlay. All at image native px.
    - `_renderScreenUI()` — clears `screenUICtx`, draws comparison slider line + handle (was `_drawSliderUI`) and brush indicator (was `_drawBrushIndicator`). At container px. Uses current CSS scale (read from ViewManager — see to-do 4) to scale the brush radius for screen-space display.
  - `draw()` becomes: `this._renderBase(); this._renderOverlay(); this._renderScreenUI();`
  - `resize()` no longer mutates `baseCanvas` or `overlayCanvas` size — they're locked to image px. It only updates `screenUICanvas` size and updates view fit (handled by ViewManager → CSS transform — to-do 4).
  - Remove `ctx.translate`/`ctx.scale` from base/overlay draws. Keep them only inside `_renderScreenUI` for the slider/brush positioned via container px.
  - Mask `globalAlpha` for opacity stays.
  - In `_renderOverlay` for grid + crop overlay drawing, line widths are no longer divided by `view.scale` — they're at native px and CSS scale magnifies them on screen. Use literal pixel values that look right when the user is zoomed at fit (later to-do 6 normalizes line widths against current CSS scale).

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Load 4K image in raw tool. Image shows but **may be way too big and overflow container** (no CSS transform applied yet — that's to-do 4). User can scroll within container or image is clipped. The point of this verify is: base image data is rendered 1:1 to its own canvas at native res. Console: `console.log('[mpicanvas] sizes', { imgW: img.width, imgH: img.height, baseW: baseCanvas.width, baseH: baseCanvas.height })`. Look for matching dimensions. Mask/crop/comparison may look broken visually until to-do 4 fits them — that's expected.

- [x] **3. Update \****`MaskManager.init`***\*, \****`CropManager.init`***\*, \****`ComparisonManager`**\*\* to draw against overlay canvas at image native px**

  **What:** Most logic already operates in image native px. Confirmed safe in audit (`/tmp/investigation/03-view-input.md`, `/tmp/investigation/04-comparison.md`). Specific changes:
  - `MaskManager.init(width, height)` already creates own offscreen `maskCanvas` at image px → unchanged. `_renderOverlay` in MpiCanvas does `overlayCtx.drawImage(mask.maskCanvas, 0, 0)` at native res. No transform needed.
  - `CropManager.draw(ctx, imgW, imgH, scale)` — change `scale` arg to be the **CSS scale** (read from `ViewManager` after to-do 4) so handle radius and line widths shown on screen stay constant. Current code uses ctx.scale. Now ctx isn't scaled but CSS is, so handle radius drawn at `radius / cssScale` on overlay canvas → handles look correct size on screen.
  - `_drawComparisonLayer` (in MpiCanvas) — simplify clip math. Since overlay ctx is no longer translated/scaled, `clipX = sliderPos * img.width` (image-px). Drop `((sliderPos * canvasW) - offsetX) / scale` — that was undoing the ctx transform.
  - `_drawGridOverlay` — line widths at native px. Use a small constant like `1` for now; to-do 6 normalizes against current CSS scale.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/CropManager.js`

  **Verify:** With image still overflowing (CSS transform not applied yet), enable mask mode and paint a stroke — stroke shows in correct image-px location on overlay canvas. Switch to crop mode — crop rect appears (handles may look giant since CSS transform not applied). Load comparison image — clip line is at correct image-px x coord. Console: `console.log('[mpicanvas] overlay-renders', { mode: this.activeMode, sliderPos: this.comparison.sliderPos })` on each `_renderOverlay`. Look for that log fires once per draw call.

- [x] **4. Move pan/zoom from ctx transform to CSS transform on stack element; rewire InputController coord math**


  **What:** Per `/tmp/investigation/03-view-input.md`:
  - In `ViewManager`, keep `scale/offsetX/offsetY/minScale/maxScale/isManagedView` properties unchanged (audit ID2 says these are read by callers — public API must stay).
  - Add `getCSSTransform()` returning string `'translate(${offsetX}px, ${offsetY}px) scale(${scale})'`.
  - In `_CanvasCore`, after every state change that affects view (`view.reset`, `handleResize`, wheel zoom in InputController, pan), apply: `this.stackEl.style.transform = this.view.getCSSTransform()`. Add helper `_applyTransform()` that does this and call from anywhere `draw()` is called following a view change.
  - In `_renderBase` and `_renderOverlay`: drop **all** `ctx.translate`/`ctx.scale` calls — they're unused now.
  - `InputController` mouse-to-image-px conversion: replace `(mouseX - view.offsetX) / view.scale` with: `const rect = stackEl.getBoundingClientRect(); const x = (e.clientX - rect.left) / view.scale; const y = (e.clientY - rect.top) / view.scale;`. Math is mathematically equivalent (CSS transform translates the rect AND scales it) — confirmed in audit.
  - Pan handler in InputController — currently mixes `clientX/Y` with `offsetX/Y` (audit flagged at lines 124-125, 158-159). Replace with consistent `clientX/Y` deltas.
  - Wheel zoom math — recompute `offsetX/Y` to keep pixel under cursor stable. Existing math should work since ViewManager state model is unchanged; just ensure `_applyTransform()` runs after.
  - `_drawBrushIndicator` (in `_renderScreenUI`) — uses container px. Mouse coords are already container-px in InputController.getMousePosition.
  - `_drawSliderUI` (in `_renderScreenUI`) — `barX = sliderPos * (rect.width)` where rect = container rect. Stays container-px.
  - Slider hit-test in InputController.isOverSlider — was `Math.abs(clientX - barX_container) < 20`. Must remain container-px (slider is a screen-UI element, not transformed). Confirmed safe.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/ViewManager.js`, `js/components/Primitives/MpiCanvas/managers/InputController.js`

  **Verify:** Load 4K image in raw tool. Image fits container (CSS transform centers + scales). Pan with space-drag — moves smoothly. Zoom with wheel — zooms toward cursor, image stays crisp at all zoom levels (smoothing may still show because Pixi not yet hooked up — base canvas is 2D drawing image with `imageSmoothingEnabled` false; this should now be honored since canvas backing = native size, no fractional scale inside ctx). At 8× zoom, individual pixels should appear as hard squares (Photoshop-like). Mask paint, crop drag, comparison slider drag all work with correct hit-test. Console: `console.log('[mpicanvas] transform', this.stackEl.style.transform)` on each `_applyTransform`. Look for `translate(...)px scale(N)` strings updating during pan/zoom.

- [x] **5. Mount Pixi \****`_app.canvas`***\* directly into stack — replace base canvas, remove \****`_processedBitmap`**\*\* path**

  **What:** Per `/tmp/investigation/01-pixi-pipeline.md`:
  - Add new MpiCanvas API: `setBaseCanvas(externalCanvasEl)` and `clearBaseCanvas()`.
  - `setBaseCanvas(el)`:
    - If `this.baseCanvas` is currently in DOM, remove it.
    - `this.baseCanvas = el`. Append to `stackEl`.
    - Set `el.style.imageRendering = 'pixelated'`.
    - Set `el.style.width = img.width + 'px'; el.style.height = img.height + 'px'` (image native px).
    - Drop reference to `this.baseCtx` — Pixi self-renders, MpiCanvas no longer draws to base.
    - `_renderBase()` becomes a no-op (Pixi owns it). Or remove call entirely.
  - `clearBaseCanvas()`:
    - Remove external canvas from DOM, restore an empty placeholder canvas (so `clearImage` flow + initial state still has a node in `__stack`).
  - In MpiToolOptionsRaw (lines 156, 350, 476):
    - Replace `canvas.setProcessedImage(bitmap)` calls with: `canvas.setBaseCanvas(rawGpuPipeline.getCanvas())` once at mount, then call `rawGpuPipeline.render()` to update — the displayed canvas updates automatically (no copy).
    - Replace `canvas.clearProcessedImage()` with `canvas.clearBaseCanvas()`.
  - In `rawGpuPipeline.js`:
    - Add `getCanvas()` method returning `this._app.canvas`.
    - Remove `_onBitmap` callback path — no longer needed for preview. (Keep the `renderFullRes` / `toBlob` path — used for export, unchanged.)
    - Remove `createImageBitmap(this._app.canvas)` call (`_render` method, line 736).
  - Remove `_processedBitmap` field, `setProcessedImage`, `clearProcessedImage` methods from `_CanvasCore`. Remove proxies in MpiCanvas factory wrapper. Remove the proxy in MpiCanvasViewer (`el.setProcessedImage`, `el.clearProcessedImage` — replace with `el.setBaseCanvas`, `el.clearBaseCanvas`).
  - When raw tool not active (no Pixi mounted): `loadImage` falls back to drawing `img` to a 2D base canvas the same way to-do 2 did. So MpiCanvas keeps a default 2D base canvas; `setBaseCanvas` swaps it for the Pixi canvas; `clearBaseCanvas` swaps back.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/utils/rawGpuPipeline.js`, `js/components/Compounds/MpiToolOptionsRaw/MpiToolOptionsRaw.js`, `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`

  **Verify:** Reload Electron. Open a raw imported image. Adjust exposure/contrast slider — image updates in real-time with **zero perceptible lag** (no bitmap copy roundtrip). Console `console.log('[mpicanvas] base-source', el.tagName, el.width, el.height)` after `setBaseCanvas`: should show `CANVAS NNNN NNNN`. Without raw tool active (e.g., switch to mask mode after raw): base canvas reverts to default 2D, image still shows correctly. Pixels remain crisp at high zoom on Pixi-rendered output.

- [x] **6. Fix MpiCanvas destroy() — properly remove all canvases to eliminate 2D VRAM leak**

  **Context:** Each MpiCanvas mount creates baseCanvas + overlayCanvas at image native px (~51MB each for 4K). Current `destroy()` only removes `this.canvas` alias. overlayCanvas and screenUICanvas stay in DOM → GPU texture backing held until GC → VRAM stacks ~1GB per workspace open/close cycle.

  **What:**
  - `destroy()`: remove `baseCanvas`, `overlayCanvas`, `screenUICanvas`, and `stackEl` from DOM. Set all to null. Cancel all 3 pending rAFs. Disconnect ResizeObserver. Destroy InputController, crop, mask, comparison managers.
  - `clearBaseCanvas()`: already removes external Pixi canvas from DOM — correct. Ensure `baseCanvas` node itself is re-appended (currently just un-hides display:none version — that's fine).
  - Add `console.log('[mpicanvas] destroyed')` at top of destroy for verification.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Open 4K image in history workspace. Note GPU VRAM in Task Manager. Navigate to gallery. VRAM drops back to baseline (no residual 2D canvas backing). Re-open workspace — VRAM returns to same level as first open (no stacking). Console shows `[mpicanvas] destroyed` on nav away.

- [x] **7. Refactor RawGpuPipeline to staged float16 bake architecture for smooth 4K slider interaction**

  **Context:** Current pipeline runs all 8 shaders every frame regardless of which slider changed. At 4K = ~128M pixel ops/frame → lags on 4K. Proposed: each filter stage bakes to float16 RenderTexture. Active slider re-renders only its stage from previous stage's bake (1 pass). On release, bake downstream stages (once, invisible).

  **What:**
  - Replace `_sprite.filters` chain with explicit per-stage `RenderTexture` pipeline:
    - `_stagedRT[i]` — array of `RenderTexture` (format `rgba16float`, same size as canvas)
    - On mount: bake all stages at default params (identity → just copy source through each)
    - `setParams(values)`: identify which stage(s) changed, mark dirty. rAF fires → re-render only dirty stage from `_stagedRT[i-1]`, composite downstream to `_stagedRT[last]`, display
    - On drag start: no remount needed (remove `startDrag`/`endDrag` — rAF + single-pass is fast enough)
    - On drag end: bake all stages (deferred 50ms) so next interaction starts from fresh bakes
  - Stage order (matches current filter order): dehaze → exposure → shadows → hueSat → curves → NR → unsharp → grain
  - `renderFullRes()`: re-bake all stages at full GPU-max res → blob → return (no remount needed)
  - Remove `startDrag`, `endDrag`, `_remount`, `_isDragging` added in this session (superseded)
  - Remove `PREVIEW_MAX` entirely — no more downscaling

  **Files touched:** `js/utils/rawGpuPipeline.js`, `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js` (remove `startDrag`/`endDrag`/`_dragEndTimer` wiring)

  **Verify:** Open 4K raw image. Drag exposure slider rapidly — no lag, no pixelation, image updates at full res. Drag sharpening slider — same. Stack multiple non-zero adjustments, then drag any single slider — still smooth (only 1 pass firing). Apply → baked result matches preview. VRAM stable (float16 RT × 8 stages × 4K ≈ 240MB, constant, no growth).

  **Implementation notes (diverged from plan):**
  - Architecture changed from staged sequential pipeline to **upstream-cache model**: `_upstreamRT[N]` = source + all shaders except N. Drag of slider N = 1 pass of shader N on top of `_upstreamRT[N]`. This correctly handles re-visiting any slider without accumulation.
  - `startDrag(stageIdx)` added to pipeline API — called by MpiToolOptionsRaw on slider `input`. Builds upstream cache lazily (only if invalid).
  - `commitParams()` added — called on slider `change` / mouseup. Rebuilds all 8 upstream caches (56 passes, once per commit). Invalidates all caches on each commit since any slider value change affects every other slider's "all-except-N" bake.
  - `PARAM_STAGE` map added to MpiToolOptionsRaw — maps param keys to stage indices for `startDrag`.
  - float16 RT format NOT used (Pixi v8 `RenderTexture.create` defaults to rgba8unorm — sufficient for preview quality; float16 reserved for future export path).
  - `_previewSprite` reused across all passes (texture/filter swapped per pass) — avoids Pixi display object leak that caused progressive slowdown.
  - `renderer.gc ?? renderer.textureGC` fallback added — `textureGC.run()` deprecated in Pixi v8.15.
  - White balance (`_applyAutoWB`, `_mountPipeline`) fixed: `commitParams()` now called after every `mount()` + `setParams()` to ensure upstream caches reflect new source image immediately.

- [x] **8. Normalize overlay line widths + handle radius against CSS scale; visual polish**

  **What:**
  - `_renderOverlay` + `CropManager.draw` + grid: `lineWidth = baseWidth / view.scale`, dash arrays same. Lines stay constant thickness on screen at all zoom levels.
  - Crop handle radius: `r / view.scale`.
  - Overlay canvas: add `image-rendering: pixelated` explicitly if not set.
  - Brush indicator: already screen-px, no change needed.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/CropManager.js`

  **Verify:** At fit, 1×, 4×, 8× zoom: crop handles, dashed border, grid lines all same on-screen thickness. Mask strokes show crisp pixel edges at 8× zoom.

- [x] **9. Update component documentation rules** *(ask user before applying)*

  **What:** With explicit user permission (CLAUDE.md rule):
  - `.claude/rules/components.md`: Primitives may own multi-canvas DOM trees
  - `.claude/rules/component-mounts.md`: MpiCanvas two-canvas stack description
  - `.claude/rules/component-state.md`: pan/zoom is CSS transform not ctx state
  - `.claude/rules/dos_and_donts.md`: prefer CSS transform over ctx scaling for image surfaces
  - `docs/PROJECT.md`: "Rendering Architecture" section → MpiCanvas + rawGpuPipeline relationship

  **Files touched:** rule files above (after user approves).

  **Verify:** Descriptions match implemented architecture.

---

## Cross-cutting verification at end of plan

After all to-dos complete:
- 4K image: pixels appear as hard squares at 8× zoom (Photoshop parity)
- 4K image: pan/zoom feels smooth at 60fps (CSS GPU compositor)
- Raw tool sliders: real-time response, no lag at 4K (staged float16 bake, 1 pass per frame)
- VRAM stable: no stacking on workspace open/close, Pixi context releases on tool switch
- Mask paint: works at all zoom levels, paints in correct image-px
- Crop overlay: handles look constant size on screen, drag works at all zoom levels
- Comparison slider: drag works, clip line stays at correct image-px x
- No regressions in MpiCompareOverlay, MpiCanvasViewer, MpiToolOptionsRaw
- Plan complete → run `/mpi-component-audit` for ESLint check.
