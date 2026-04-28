# Plan: Raw Adjustments — Replace Sharp with GPU Pipeline

**Created:** 2026-04-26
**Supersedes server-side raw pipeline in:** `docs/plans/2026-04-23-raw-adjustments.md`
**Goal:** Real-time GPU preview on slider drag. Zero server round-trips during interaction. Remove Sharp from raw adjustment flow entirely. Replace crappy Sharp grain with proper film grain.

---

## Stack

| Concern | Tool | Notes |
|---|---|---|
| Exposure, Shadows, Saturation | **glfx.js** | GPU WebGL filters, instant |
| Curve | Existing canvas editor → **PixiJS LUT shader** | Spline output → 256-entry LUT texture |
| White Balance | Existing client pixel sampling | Already works, keep as-is |
| Noise Reduction | **PixiJS shader** (gaussian or bilateral) | Custom fragment shader |
| Grain | **PixiJS NoiseFilter + custom film-grain shader** | Luminance-weighted, monochrome option |
| Per-color calibration (hueR/G/B, satR/G/Y) | **PixiJS HSL range-mask shader** | Custom fragment shader |
| Apply (full-res bake) | Render pipeline to offscreen canvas at full res | Upload baked PNG/JPEG to server, no Sharp |

**Dropped from scope:** dehaze, sharpening (per user decision).

---

## Architecture (Path 1 — Reuse MpiCanvas)

```
MpiCanvas.img (source HTMLImageElement)
        ↓
glfx.js canvas (exposure / shadows / saturation)
        ↓ texture handoff
PixiJS stage (NR → curve LUT → per-color HSL → grain)
        ↓ extract bitmap (full source resolution)
MpiCanvas.setProcessedImage(bitmap)
        ↓
existing MpiCanvas.draw() — ctx.scale + drawImage at user zoom
        ↓ on Apply
pipeline.renderFullRes() → blob → POST /api/image/bake
```

**Why Path 1:** MpiCanvas already does GPU-accelerated `drawImage` at scale via canvas2D. Pipeline produces full-res processed bitmap once per param change. Viewer redraws using existing zoom/pan/crop/mask machinery — zero changes to input handlers.

**Fallback (out of scope this plan):** if Path 1 frame time exceeds 16ms on 24MP at 100% zoom, separate plan to bypass MpiCanvas during raw edit (PixiJS surface as visible canvas, port input handlers).

**New util:** `js/utils/rawGpuPipeline.js` — orchestrates glfx + PixiJS, exposes:
- `mount(srcImg)` — initialize pipeline against image
- `setParams(values)` — push uniforms, schedule render (rAF-throttled), emit processed bitmap
- `renderFullRes()` — returns Promise<Blob> for Apply bake
- `destroy()` — release WebGL contexts, dispose textures

**MpiCanvas API addition:**
- `setProcessedImage(bitmap)` — swap rendered source without resetting view.scale/offset

---

## To-Dos

### Phase 1 — Audit & Setup
- [ ] Audit Sharp usage: `routes/imageAdjust.js` (raw — to remove), `routes/projects.js:833-840` (thumbnails — keep), any others
- [ ] Audit `/api/image/adjust` consumers — confirm only `MpiToolOptionsRaw.js` calls it
- [ ] `npm install pixi.js glfx.js` — verify bundle size acceptable for Electron renderer
- [ ] Test PixiJS NoiseFilter visual quality vs. user expectation for film grain — show comparison samples before committing to it

### Phase 2 — GPU Pipeline Util
- [ ] Create `js/utils/rawGpuPipeline.js` skeleton (mount/setParams/renderFullRes/destroy)
- [ ] Wire glfx.js layer: exposure → brightness, shadows → custom curve, saturation → hueSaturation
- [ ] Wire PixiJS stage with default identity passes
- [ ] Verify color space matches Sharp output (sRGB vs linear-light) on test image
- [ ] rAF-throttle setParams to avoid render thrash

### Phase 2.5 — Profile Path 1 (gate)
- [ ] Wire pipeline → `MpiCanvas.setProcessedImage(bitmap)` minimal end-to-end (identity passes)
- [ ] Profile frame time on 24MP image at 100% zoom while dragging slider
- [ ] Target: < 16ms per param change (60fps). Pass → continue. Fail → STOP, return to brainstorm session for Path 2 plan.

### Phase 3 — Custom Shaders
- [ ] Curve LUT shader: accept 256-entry Float32Array from spline, sample per pixel
- [ ] Per-color HSL shader: convert RGB→HSL, mask by hue range (R/G/B/Y bands), shift hue + sat per band, convert back
- [ ] Noise reduction shader: separable gaussian (preferred) or bilateral if quality demands
- [ ] Film-grain shader: luminance-weighted noise, optional monochrome, scaled by grain amount
- [ ] Validate each shader visually against Sharp reference output

### Phase 4 — Component Rewire
- [ ] Add `setProcessedImage(bitmap)` method to `MpiCanvas` — swap source without resetting `view.scale/offsetX/offsetY`
- [ ] Update `js/utils/rawPreview.js` — remove CSS filter builder (no longer needed)
- [ ] Update `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`:
  - Drop dehaze + sharpening from `SECTIONS`
  - Drop `_sharpPreview` debounced fetch
  - Drop `_SHARP_ONLY_KEYS`
  - Replace `_applyPreview` body with `pipeline.setParams(values)`
  - Wire curve canvas output to pipeline as LUT
  - Wire WB pixel-sampling result to pipeline (or keep direct img swap)
  - Update `el.destroy` to call `pipeline.destroy()`
- [ ] Confirm follows `.claude/rules/components.md`: factory, BEM, destroy contract, Events bus

### Phase 5 — Apply Flow (Bake)
- [ ] New route `POST /api/image/bake` — accept multipart blob + meta (groupId, itemId, folderPath)
- [ ] Route saves blob to `Media/<uuid>.<ext>`, writes `.meta/<uuid>.json`, returns `{ success, item }`
- [ ] Pipeline `renderFullRes()` produces blob at original image dimensions
- [ ] `applyBtn` handler swaps fetch from `/api/image/adjust` to `/api/image/bake` with FormData

### Phase 6 — Sharp Removal
- [ ] Delete `routes/imageAdjust.js`
- [ ] Remove route registration from server entry
- [ ] Verify `routes/projects.js` Sharp call still works (thumbnails) — keep that import
- [ ] If no other Sharp consumers: leave `sharp` in package.json (thumbnails still need it). Otherwise document why retained.

### Phase 7 — Validation
- [ ] Test in Electron desktop (per `feedback_testing_desktop.md` — browser unreliable)
- [ ] Compare bake output against old Sharp output — color/quality regression check
- [ ] Test with large images (24MP+) — memory + WebGL context limits
- [ ] Test rapid slider drag — confirm no frame drops
- [ ] Test Apply → history entry → reload entry roundtrip
- [ ] Test reset/destroy lifecycle (no WebGL leaks across tool re-mounts)

---

## Risks

| Risk | Mitigation |
|---|---|
| WebGL context limit (~16 per page) | Single shared pipeline instance per viewer; destroy aggressively |
| Color space drift sRGB vs linear | Apply gamma correction in shader if Sharp baseline differs |
| Large image memory blow-up on bake | Tile-based render if image > GPU max texture; fallback to canvas2D bake |
| PixiJS NoiseFilter ≠ proper film grain | Custom shader from start; treat NoiseFilter only as performance reference |
| Other features depend on `/api/image/adjust` | Audit step Phase 1 must be exhaustive before deletion |
| glfx.js abandoned (last commit ~years old) | Acceptable — small enough to vendor/fork if needed |

---

## Files Touched

**New:**
- `plans/2026-04-26-raw-gpu-pipeline.md` (this file)
- `js/utils/rawGpuPipeline.js`
- `routes/imageBake.js` (replaces imageAdjust.js)

**Modified:**
- `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`
- `js/utils/rawPreview.js`
- `package.json` (+pixi.js, +glfx.js)
- Server entry (route registration swap)

**Deleted:**
- `routes/imageAdjust.js`

---

## Out of Scope

- Dehaze (removed per user)
- Sharpening (removed per user)
- Other Sharp consumers (thumbnails in `routes/projects.js` stay)
- Video raw adjustments (future)
