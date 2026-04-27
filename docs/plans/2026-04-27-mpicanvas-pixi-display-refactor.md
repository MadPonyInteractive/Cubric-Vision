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

- [ ] **1. Build new DOM structure + CSS, keep current rendering working**

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

- [ ] **2. Size canvases to image native px on `loadImage`, draw image at native res**

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

- [ ] **3. Update `MaskManager.init`, `CropManager.init`, `ComparisonManager` to draw against overlay canvas at image native px**

  **What:** Most logic already operates in image native px. Confirmed safe in audit (`/tmp/investigation/03-view-input.md`, `/tmp/investigation/04-comparison.md`). Specific changes:
  - `MaskManager.init(width, height)` already creates own offscreen `maskCanvas` at image px → unchanged. `_renderOverlay` in MpiCanvas does `overlayCtx.drawImage(mask.maskCanvas, 0, 0)` at native res. No transform needed.
  - `CropManager.draw(ctx, imgW, imgH, scale)` — change `scale` arg to be the **CSS scale** (read from `ViewManager` after to-do 4) so handle radius and line widths shown on screen stay constant. Current code uses ctx.scale. Now ctx isn't scaled but CSS is, so handle radius drawn at `radius / cssScale` on overlay canvas → handles look correct size on screen.
  - `_drawComparisonLayer` (in MpiCanvas) — simplify clip math. Since overlay ctx is no longer translated/scaled, `clipX = sliderPos * img.width` (image-px). Drop `((sliderPos * canvasW) - offsetX) / scale` — that was undoing the ctx transform.
  - `_drawGridOverlay` — line widths at native px. Use a small constant like `1` for now; to-do 6 normalizes against current CSS scale.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/CropManager.js`

  **Verify:** With image still overflowing (CSS transform not applied yet), enable mask mode and paint a stroke — stroke shows in correct image-px location on overlay canvas. Switch to crop mode — crop rect appears (handles may look giant since CSS transform not applied). Load comparison image — clip line is at correct image-px x coord. Console: `console.log('[mpicanvas] overlay-renders', { mode: this.activeMode, sliderPos: this.comparison.sliderPos })` on each `_renderOverlay`. Look for that log fires once per draw call.

- [ ] **4. Move pan/zoom from ctx transform to CSS transform on stack element; rewire InputController coord math**

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

- [ ] **5. Mount Pixi `_app.canvas` directly into stack — replace base canvas, remove `_processedBitmap` path**

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

- [ ] **6. Normalize line widths and handle radius against current CSS scale; final visual polish**

  **What:** Once CSS transform handles zoom, lines drawn at constant pixel width on overlay canvas grow with zoom. Fix:
  - In `_renderOverlay` (and `CropManager.draw`, grid overlay): pass `view.scale` as the CSS scale into `lineWidth = baseWidth / cssScale`, dash arrays similarly. So a 1px-on-screen line is drawn as `1 / cssScale` image-px in the overlay canvas.
  - Crop handle radius — same: `r / cssScale`.
  - Re-test all overlay visuals look identical to pre-refactor at fit, 1×, 4×, 8× zoom.
  - Add `image-rendering: pixelated` rule to overlay canvas explicitly (already on base). Mask paint at high zoom should show hard pixel edges.
  - Confirm screen-UI canvas brush indicator still draws at constant container-px size regardless of zoom.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/CropManager.js`

  **Verify:** Load 4K image. At fit, 1×, 4×, 8× zoom: crop handles, crop dashed border, grid lines all look the same on-screen thickness. Brush indicator constant size during zoom. Mask painted strokes show crisp pixel edges at 8× zoom (no anti-aliasing softening).

- [ ] **7. Update destroy() and resize() lifecycle to teardown all three canvases cleanly + ResizeObserver**

  **What:**
  - `destroy()` — remove all 3 canvas elements + stack div from DOM. Disconnect `ResizeObserver`. Destroy InputController. Destroy crop, mask, comparison managers. Clear Pixi canvas reference (don't destroy Pixi — pipeline owns lifecycle).
  - `resize()` (called by ResizeObserver on container change) — only updates `screenUICanvas` size to container px and re-fits view (`view.handleResize` → `_applyTransform()`). Does NOT touch base/overlay sizes (image-px, fixed).
  - Confirm `MpiCompareOverlay` (audit risk: depends on `destroy()`) still cleans up after refactor.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Open raw image, mount mask + crop, switch to compare mode. Navigate away from history workspace (which calls instance.destroy()). Re-enter — fresh MpiCanvas mounts, no leaked canvases, no leaked observers, no leaked InputController. Console `console.log('[mpicanvas] destroyed', { canvases: document.querySelectorAll('.mpi-canvas canvas').length })` immediately after destroy. Look for 0. Resize browser window — image refits without artifacts.

- [ ] **8. Update component documentation rules**

  **What:** Per `/tmp/investigation/06-docs.md`. With user explicit permission per CLAUDE.md cardinal rule 3:
  - `.claude/rules/components.md`: clarify Primitives may own multi-canvas DOM trees if internally managed.
  - `.claude/rules/component-mounts.md`: update MpiCanvas mount section to describe two-canvas stack + screen-UI.
  - `.claude/rules/component-events.md`: confirm `'modechange'` event still fires from MpiCanvas root.
  - `.claude/rules/component-state.md`: clarify pan/zoom is CSS transform, not ctx state.
  - `.claude/rules/dos_and_donts.md`: add note — for transformable image surfaces, prefer CSS transform over canvas ctx scaling.
  - `docs/PROJECT.md`: add brief "Rendering Architecture" section pointing to MpiCanvas + rawGpuPipeline relationship.
  - **Ask user before applying** these doc edits (per CLAUDE.md rule).

  **Files touched:** rule files above (after user approves).

  **Verify:** Look at the updated doc files — confirm new descriptions match implemented architecture (two-canvas stack, CSS transform, Pixi canvas mounted directly, no `_processedBitmap`).

---

## Cross-cutting verification at end of plan

After all to-dos complete:
- 4K image: pixels appear as hard squares at 8× zoom (Photoshop parity)
- 4K image: pan/zoom feels smooth at 60fps (CSS GPU compositor)
- Raw tool sliders: real-time response, no lag (zero-copy Pixi → display)
- Mask paint: works at all zoom levels, paints in correct image-px
- Crop overlay: handles look constant size on screen, drag works at all zoom levels
- Comparison slider: drag works, clip line stays at correct image-px x
- No regressions in MpiCompareOverlay, MpiCanvasViewer, MpiToolOptionsRaw
- Plan complete → run `/mpi-component-audit` for ESLint check.
