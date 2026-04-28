# Plan: MpiCanvas Two-Canvas Refactor (Pixi-Free)

**Created:** 2026-04-28
**Status:** Drafted, NOT executed yet. Execute via `/mpi-execute-next` after `2026-04-28-revert-raw-gpu.md` completes.
**Goal:** Re-implement the two-canvas stack + CSS-transform pan/zoom architecture from reverted `0e5a130`, **without any GPU pipeline coupling**. Capture display benefits, drop the Pixi dependency.

---

## Why

Reverted `0e5a130` mixed two concerns: (a) two-canvas display refactor + (b) Pixi mount API. The display refactor delivered real, measurable benefits independent of any GPU pipeline. This plan captures (a) cleanly, leaving raw adjustments on the existing server-preview Sharp path.

### Benefits captured

| Benefit | Mechanism |
|---------|-----------|
| Photoshop-pixel parity at high zoom | CSS `image-rendering: pixelated` on stack — bypasses Chromium SkiaRenderer smoothing bug triggered by fractional `ctx.scale` |
| Smooth pan/zoom on 4K+ images | CSS `transform` on stack uses GPU compositor — no `drawImage` re-rasterize of 16M src pixels per frame |
| Simpler mask/crop coord math | Both managers already work in image-native px; new arch removes the `(mouseX - offsetX) / scale` inversion |
| VRAM leak fix | Proper `destroy()` removes all canvas elements + stack from DOM |

### Benefits explicitly NOT captured (out of scope)

- GPU shader pipeline for raw adjustments (replaced by Sharp server preview — sufficient quality, slower interaction acceptable)
- Real-time slider response on 4K (acceptable trade — server preview is debounced)
- Pixi dependency (uninstalled in revert plan)

---

## Architecture

```
<div class="mpi-canvas">                       ← root, container px, overflow:hidden
  <div class="mpi-canvas__stack"               ← image native px, transformed
       style="transform: translate(x,y) scale(s); transform-origin: 0 0">
    <canvas data-role="base"/>                 ← 2D, image native px, draws img + processed bitmap
    <canvas data-role="overlay"/>              ← 2D, image native px, mask/crop/grid (transparent)
  </div>
  <canvas data-role="screen-ui"/>              ← 2D, container px, brush indicator + slider
</div>
```

**Pan/zoom:** ViewManager keeps `scale/offsetX/offsetY` state. After every state change, `stackEl.style.transform = view.getCSSTransform()`. No `ctx.translate`/`ctx.scale` anywhere.

**Coord conversion:** `InputController` mouse → image-px = `(e.clientX - stackRect.left) / view.scale`. Mathematically equivalent to old path; CSS transform applies the same translate+scale to `getBoundingClientRect()`.

---

## Constraints

- **Public API on `instance.el` stays backward-compatible.** All current callers (`MpiCanvasViewer`, `MpiCompareOverlay`, `MpiToolOptionsRaw`, mask/crop consumers) work unchanged.
- **Keep `setProcessedImage(bitmap)` / `clearProcessedImage()` path** — the server-baked Sharp preview returns a bitmap; the raw tool calls `setProcessedImage` to display it. Same flow as pre-`3221984`.
- **No Pixi, no `setBaseCanvas`/`clearBaseCanvas`/`getCanvas` API.** Base canvas is owned by MpiCanvas, drawn via 2D ctx, period.
- **Mask/crop/grid managers stay.** Coord rewires only inside MpiCanvas + ViewManager + InputController.
- **Scope:** History workspace canvas only. Gallery/thumbnails/cards stay as plain `<img>`.

---

## Pre-flight reads

- `.claude/rules/components.md` — Primitive contract, ComponentFactory, lifecycle/teardown
- `.claude/rules/dos_and_donts.md` — CSS vars, BEM, dom utils
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` (current post-revert state)
- `js/components/Primitives/MpiCanvas/managers/*.js`
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js`
- `js/components/Organisms/MpiCompareOverlay/*`
- `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js` — confirm `setProcessedImage` usage

---

## To-Dos

- [x] **1. Audit `setProcessedImage` / `clearProcessedImage` consumers**

  **What:** Confirm which components call these methods on the post-revert MpiCanvas. Document the call sites so the new arch preserves them.

  Files to grep:
  - `grep -rn "setProcessedImage\|clearProcessedImage" js/`

  Expected callers (from pre-`3221984` codebase): `MpiToolOptionsRaw.js`, possibly `MpiCanvasViewer.js`. Document each call site (file + line + purpose) in the to-do brief.

  **Verify:** Look at the grep output — confirm a complete list of callers exists, each annotated with what it passes (HTMLImageElement, ImageBitmap, Canvas, or null). Save annotation as a comment block at the top of `js/components/Primitives/MpiCanvas/MpiCanvas.js` for the implementing agent to reference in later to-dos.

- [x] **2. Build new DOM template + CSS, keep current rendering working**

  **What:** In `js/components/Primitives/MpiCanvas/MpiCanvas.js`:
  - Replace template with two-canvas stack + screen-UI sibling.
  - In `_CanvasCore.constructor`, create THREE canvases:
    - `this.baseCanvas` — 2D, append to `__stack`, `style.imageRendering = 'pixelated'`, backing buffer initially 0×0
    - `this.overlayCanvas` — 2D, append to `__stack`, `style.imageRendering = 'pixelated'`, backing buffer 0×0
    - `this.screenUICanvas` — 2D, the screen-UI sibling, backing buffer = container px
  - Keep current `this.canvas` and `this.ctx` aliasing to `baseCanvas` for now — every existing draw call still works against `baseCanvas`. Final split happens in to-do 4.
  - Stack element exposed as `this.stackEl` for transform writes in to-do 5.
  - **No** rendering behavior changes yet. `draw()` still uses `ctx.translate/scale + drawImage` against `baseCanvas` exactly as today.
  - Add `console.log('[mpicanvas] dom', { stack: !!core.stackEl, base: !!core.baseCanvas, overlay: !!core.overlayCanvas, screen: !!core.screenUICanvas })` on construction.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Reload Electron. Load any image in history workspace. Image still displays as before. Pan/zoom still work. Mask/crop/comparison unchanged. In dev tools console, look for `[mpicanvas] dom { stack: true, base: true, overlay: true, screen: true }` on workspace open. Inspect DOM: `.mpi-canvas` contains `.mpi-canvas__stack` + `.mpi-canvas__screen-ui` siblings; stack contains 2 canvas children.

- [x] **3. Size canvases to image native px on `loadImage` (clamp to MAX_TEXTURE_SIZE)**

  **What:** Update `loadImage(url)` in `_CanvasCore`:
  - After `img.onload`, compute clamped dimensions against GPU `MAX_TEXTURE_SIZE` (probe via `gl.getParameter(gl.MAX_TEXTURE_SIZE)` once at module load, fallback `4096`).
  - Set `baseCanvas.width = clampedW; baseCanvas.height = clampedH`.
  - Set `baseCanvas.style.width = clampedW + 'px'; baseCanvas.style.height = clampedH + 'px'`.
  - Same for `overlayCanvas`.
  - Set stack element: `stackEl.style.width = clampedW + 'px'; stackEl.style.height = clampedH + 'px'`.
  - Add `console.log('[mpicanvas] sizes', { imgW: img.width, imgH: img.height, clampedW, clampedH })`.

  Keep current `draw()` logic intact for now (still uses `ctx.translate/scale` against `baseCanvas`). Visual result MAY look wrong at this point (image overflows / no fit) — that's expected; to-do 5 fixes via CSS transform.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Load 4K image. Console shows `[mpicanvas] sizes { imgW: ..., imgH: ..., clampedW: ..., clampedH: ... }` with clampedW/H matching imgW/H if under limit, or clamped to MAX_TEXTURE_SIZE if over. Inspect base canvas in DOM — `width`/`height` attributes match clamped dims. Image may visually overflow — that is expected at this stage.

- [x] **4. Split `draw()` into `_renderBase` / `_renderOverlay` / `_renderScreenUI`**

  **What:** Replace `draw()` body:
  - `_renderBase()` — clears `baseCtx`, draws `_processedBitmap ?? img` at `(0,0)` with no transform (1:1 to native canvas). Called on image load + on `setProcessedImage`.
  - `_renderOverlay()` — clears `overlayCtx`, draws comparison clip layer (math now simpler: no `ctx.scale` undo), mask layer at `(0,0)`, crop overlay, grid overlay. All at image native px.
  - `_renderScreenUI()` — clears `screenUICtx`, draws comparison slider line+handle (was `_drawSliderUI`) and brush indicator (was `_drawBrushIndicator`). At container px. Uses current `view.scale` (read from ViewManager) to scale brush radius for screen display.
  - `draw()` becomes: `this._renderBase(); this._renderOverlay(); this._renderScreenUI();`
  - `resize()` no longer mutates `baseCanvas` / `overlayCanvas` size — they're locked to image px. Only updates `screenUICanvas` and triggers ViewManager fit recompute.
  - Remove `ctx.translate` / `ctx.scale` from base/overlay draws. Keep them ONLY inside `_renderScreenUI` for slider/brush positioned in container px.
  - Mask `globalAlpha` for opacity stays.
  - Add `console.log('[mpicanvas] split-render', { base: tBase, overlay: tOverlay, screenUI: tUI })` once on first draw after load (perf timing).

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Load image. Console shows the `[mpicanvas] split-render` log once on first draw. Image renders (may still visually overflow until to-do 5). Switch to mask mode → mask paints in correct location on overlay canvas. Comparison clip line shows at correct image-px x.

- [x] **5. Move pan/zoom from ctx transform to CSS transform on stackEl; rewire InputController**

  **What:**
  - In `ViewManager`, keep `scale/offsetX/offsetY/minScale/maxScale/isManagedView` properties unchanged (public API).
  - Add `getCSSTransform()` returning string `translate(${offsetX}px, ${offsetY}px) scale(${scale})`.
  - In `_CanvasCore`, after every state change affecting view (`view.reset`, `handleResize`, wheel zoom, pan), apply: `this.stackEl.style.transform = this.view.getCSSTransform()`. Add helper `_applyTransform()` and call from anywhere `draw()` is called following a view change.
  - In `_renderBase` and `_renderOverlay`: drop ALL `ctx.translate`/`ctx.scale` calls — they're unused now.
  - `InputController` mouse-to-image-px: replace `(mouseX - view.offsetX) / view.scale` with `const rect = stackEl.getBoundingClientRect(); const x = (e.clientX - rect.left) / view.scale; const y = (e.clientY - rect.top) / view.scale;`. Mathematically equivalent.
  - Pan handler — use consistent `clientX/Y` deltas. Don't mix `clientX/Y` with `offsetX/Y`.
  - Wheel zoom — recompute `offsetX/Y` to keep pixel under cursor stable. Existing math works since ViewManager state model unchanged; ensure `_applyTransform()` runs after.
  - `_drawBrushIndicator` (in `_renderScreenUI`) — uses container px. Mouse coords already container-px in `InputController.getMousePosition`.
  - `_drawSliderUI` (in `_renderScreenUI`) — `barX = sliderPos * rect.width` where rect = container rect. Stays container-px.
  - Slider hit-test in `InputController.isOverSlider` — stays container-px (slider is a screen-UI element).
  - Add `console.log('[mpicanvas] transform', this.stackEl.style.transform)` on each `_applyTransform`.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/ViewManager.js`, `js/components/Primitives/MpiCanvas/managers/InputController.js`

  **Verify:** Load 4K image. Image fits container (CSS transform centers + scales). Pan with space-drag — moves smoothly. Zoom with wheel — zooms toward cursor, image stays crisp at all zoom levels. At 8× zoom: individual pixels appear as hard squares (Photoshop parity). Mask paint, crop drag, comparison slider drag all hit-test correctly. Console shows `[mpicanvas] transform translate(...)px scale(N)` on each pan/zoom.

- [x] **6. Update MaskManager / CropManager / ComparisonManager to draw at image-native px on overlay canvas**

  **What:** Most logic already operates in image native px. Specific changes:
  - `MaskManager.init(width, height)` already creates own offscreen `maskCanvas` at image px → unchanged. `_renderOverlay` does `overlayCtx.drawImage(mask.maskCanvas, 0, 0)` at native res. No transform needed.
  - `CropManager.draw(ctx, imgW, imgH, scale)` — `scale` arg = current CSS scale (read from ViewManager) so handle radius + line widths shown on screen stay constant. Handle radius drawn at `radius / cssScale` on overlay canvas → handles look correct on screen. Line widths same treatment.
  - `_drawComparisonLayer` (in MpiCanvas) — simplify clip math. Overlay ctx no longer translated/scaled, so `clipX = sliderPos * img.width` (image-px). Drop `((sliderPos * canvasW) - offsetX) / scale` — that was undoing the ctx transform.
  - `_drawGridOverlay` — line widths at native px divided by `view.scale` (handled in to-do 7).

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/CropManager.js`

  **Verify:** Mask: paint a stroke at fit + 4× zoom — stroke shows in correct image-px location. Crop: rect appears, drag corner — corner moves to mouse position at all zoom levels. Comparison: clip line at correct image-px x at all zoom levels. Console: `console.log('[mpicanvas] overlay-renders', { mode: this.activeMode, sliderPos: this.comparison.sliderPos })` fires once per draw call.

- [x] **7. Normalize line widths + handle radius by `view.scale`**

  **What:**
  - `_renderOverlay` + `CropManager.draw` + grid: `lineWidth = baseWidth / view.scale`, dash arrays scaled the same way. Lines stay constant thickness on screen at all zoom levels.
  - Crop handle radius: `r / view.scale`.
  - Overlay canvas: ensure `image-rendering: pixelated` set explicitly.
  - Brush indicator: already screen-px, no change.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/CropManager.js`

  **Verify:** At fit, 1×, 4×, 8× zoom: crop handles look identical size on screen, dashed border same on-screen thickness, grid lines same on-screen thickness. Mask strokes show crisp pixel edges at 8× zoom.

- [x] **8. Fix `destroy()` — remove all 3 canvases + stackEl, cancel rAFs, disconnect ResizeObserver**

  *(Initial pass done — VRAM still leaks. Split follow-up into 8a + 8b.)*

- [x] **8a. Audit workspace teardown — confirm `MpiCanvas.destroy()` actually fires on history workspace exit**

  **What:** VRAM increases every history workspace load → either (a) destroy never called, (b) destroy called but element not removed, (c) destroy called but GPU texture backing never released.

  - Add `console.log('[mpicanvas] destroyed', { hadBase: !!this.baseCanvas })` at top of `destroy()`.
  - Grep `MpiCanvasViewer.js` + workspace mount/unmount logic for `instance.destroy()` calls. Confirm CLAUDE.md cardinal rule "Navigation MUST call `instance.destroy()`" is honored.
  - If destroy never fires → fix by adding `instance.destroy()` to the workspace teardown path.
  - If destroy fires but VRAM still leaks → record finding, hand off to 8b.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js` (log only), possibly workspace mount file (TBD by audit).

  **Verify:** Open history workspace, navigate away, console shows `[mpicanvas] destroyed { hadBase: true }`. If no log → destroy not wired up; fix the wiring. If log fires but VRAM still grows → 8b takes over.

- [x] **8b. Force GPU texture release on destroy — zero canvas dims + close ImageBitmaps + add MaskManager.destroy**

  **Context:** Removing canvas from DOM + nulling refs is not enough. Chromium retains GPU texture backing for canvas elements until GC. ImageBitmap holds GPU memory until `.close()`. MaskManager owns own offscreen canvas (~50MB at 4K) that's never destroyed.

  **What:** In `MpiCanvas.destroy()`:
  - Before removing each canvas: `canvas.width = 0; canvas.height = 0` — forces immediate texture release.
  - If `_processedBitmap` is `ImageBitmap`: call `.close()` before nulling.
  - If `comparison.imgAfter` is `ImageBitmap`: call `.close()`.

  Add `MaskManager.destroy()`:
  - Set `maskCanvas.width = 0; height = 0`, null refs.

  Add `ComparisonManager.destroy()`:
  - Close `imgAfter` if ImageBitmap, null ref.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`, `js/components/Primitives/MpiCanvas/managers/MaskManager.js`, `js/components/Primitives/MpiCanvas/managers/ComparisonManager.js`

  **Verify:** Open 4K image, note VRAM. Navigate away. Console: `[mpicanvas] destroyed`. VRAM drops to baseline. Repeat 5× — VRAM stable, no stacking.

  **Context:** Each MpiCanvas mount creates baseCanvas + overlayCanvas at image native px (~51MB each for 4K). Without proper destroy, GPU texture backing held until GC → VRAM stacks ~1GB per workspace open/close cycle.

  **What:**
  - `destroy()`: remove `baseCanvas`, `overlayCanvas`, `screenUICanvas`, `stackEl` from DOM. Set all to null. Cancel all 3 pending rAFs (`_renderBaseRAF`, `_renderOverlayRAF`, `_renderScreenUIRAF`). Disconnect ResizeObserver. Destroy InputController, crop, mask, comparison managers.
  - Add `console.log('[mpicanvas] destroyed')` at top of destroy.

  **Files touched:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

  **Verify:** Open 4K image in history workspace. Note GPU VRAM in Task Manager. Navigate to gallery (or any other workspace). Console shows `[mpicanvas] destroyed`. VRAM drops back to baseline. Re-open workspace — VRAM returns to same level as first open (no stacking). Repeat 3× — VRAM stable.

- [x] **11. Update component documentation rules** *(ASK USER FIRST per CLAUDE.md cardinal rule 3)*

  **What:** With explicit user permission only:
  - `.claude/rules/components.md`: Primitives may own multi-canvas DOM trees
  - `.claude/rules/component-mounts.md`: MpiCanvas two-canvas stack description
  - `.claude/rules/component-state.md`: pan/zoom is CSS transform, not ctx state
  - `.claude/rules/dos_and_donts.md`: prefer CSS transform over ctx scaling for image surfaces
  - `docs/PROJECT.md`: "Rendering Architecture" section → MpiCanvas display model

  **Files touched:** rule files above (after user approves explicitly).

  **Verify:** Look at the changed sections — confirm descriptions match the implemented architecture. Ask user to spot-check.

- [ ] **9. Prompt-tool: drop canvas, swap to CSS `mask-image` preview**

  **Context:** When user selects Prompt tool, MpiCanvas is overkill — only need image display + painted-mask overlay + pan/zoom. Two image-px canvases (~100MB GPU) wasted. CSS `mask-image` composites mask on GPU with cheap `<img>` elements. Mask painting still needs a canvas, but only mounted while user is actively painting.

  **What:** New primitive `MpiMaskedImagePreview`:
  - DOM: `.mpi-masked-preview` root → `.mpi-masked-preview__stack` (CSS-transform pan/zoom) → 2× `<img>`:
    - `<img class="base">` — the source image
    - `<img class="masked">` with CSS `-webkit-mask-image: url(...)` + `mask-image: url(...)` — the same image clipped by painted mask. Tinted with CSS filter or sits over a colored layer to show "selected" effect.
  - Reuse `ViewManager` from MpiCanvas managers folder (or thin port) for pan/zoom state + `getCSSTransform()`.
  - Mask source = PNG dataURL exported from `MaskManager.maskCanvas.toDataURL()` whenever mask changes.
  - Workspace logic: when `activeTool === 'prompt'` → unmount MpiCanvas (destroy releases GPU), mount MpiMaskedImagePreview. When tool switches back → reverse.
  - Mask paint mode: temporarily mount a small mask-paint canvas only while painting; on commit, export PNG → feed back to overlay `<img>`. Canvas torn down between paints.

  **Files touched:** `js/components/Primitives/MpiMaskedImagePreview/` (new), `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` (tool switch wiring), workspace mount file.

  **Verify:** Select Prompt tool with image loaded. VRAM drops vs Crop/Mask tool (2 image-px canvases gone). Image visible + painted mask shows as "selected area" effect. Pan/zoom smooth. Switch back to Mask tool → MpiCanvas re-mounts, painting works as before. Run a ComfyUI workflow → mask included correctly.

- [x] **10. Cross-cutting validation at fit/1×/4×/8× zoom**

  **What:** Final end-to-end smoke test in Electron desktop.

  Test matrix:
  - **4K image (e.g., 3456×4608):** pixels appear as hard squares at 8× zoom (Photoshop parity). Pan smooth at 60fps. No lag.
  - **Mask paint:** works at all zoom levels, paints in correct image-px.
  - **Crop overlay:** handles look constant size on screen, drag works at all zoom levels.
  - **Comparison slider:** drag works, clip line stays at correct image-px x at all zoom levels.
  - **Raw tool server preview:** still functions (debounced fetch to `/api/image/adjust`), `setProcessedImage(bitmap)` displays result correctly.
  - **VRAM:** stable across 5× workspace open/close cycle (Task Manager).
  - **No regressions:** MpiCompareOverlay, MpiCanvasViewer, MpiToolOptionsRaw all work as before.
  - **ESLint:** run `/mpi-component-audit` — no new violations.

  **Verify:** All bullets pass. Document any edge cases hit + fixes in this plan as addenda. Mark plan complete only when all pass.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `setProcessedImage` consumers break | To-do 1 audits all call sites; to-do 4 preserves the path explicitly |
| Mask coord regression at high zoom | To-do 6 + to-do 10 explicitly test at 4×/8× zoom |
| VRAM leak persists despite destroy fix | To-do 8 verify includes 5× cycle test |
| CSS transform pixel-rounding artifacts | Use `transform-origin: 0 0` + integer offsets where possible; flag in to-do 5 verify |
| ResizeObserver fires during destroy | Disconnect FIRST in destroy(), before nulling refs |

---

## Out of Scope

- Any GPU shader pipeline (Pixi, glfx, etc.) — explicit non-goal
- Real-time slider response on raw adjustments (server preview is acceptable)
- Video canvas refactor (separate concern)
- Gallery/thumbnail rendering changes (already plain `<img>`)
