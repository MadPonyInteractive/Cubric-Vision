# Plan: Raw Adjustments — Replace Sharp with GPU Pipeline

**Created:** 2026-04-26
**Supersedes server-side raw pipeline in:** `docs/plans/2026-04-23-raw-adjustments.md`
**Goal:** Real-time GPU preview on slider drag. Zero server round-trips during interaction. Remove Sharp from raw adjustment flow entirely. Replace crappy Sharp grain with proper film grain.

**Use case:** Post-process AI-generated images to add realism (not RAW camera files). Typical user images: 4K–8K. Outlier max: 16K. Profile target accordingly.

---

## Stack

**PixiJS only.** glfx.js dropped (not on npm, 5yr stale, all functionality replicable in PixiJS).

| Concern | Implementation | Notes |
|---|---|---|
| Exposure | PixiJS shader | linear multiplier (2^EV) |
| Shadows | PixiJS shader | lift-only curve |
| Saturation | PixiJS shader | RGB→HSL→adjust S→RGB |
| Sharpening | PixiJS shader (unsharp mask) | gaussian blur subtraction |
| Curve | Canvas editor → PixiJS LUT shader | Spline → 256-entry LUT texture |
| White Balance | Existing client pixel sampling | Keep as-is |
| Noise Reduction | PixiJS shader (separable gaussian or bilateral) | Custom fragment shader |
| Grain | PixiJS custom film-grain shader | Luminance-weighted, monochrome option |
| Per-color calibration (hueR/G/B, satR/G/Y) | PixiJS HSL range-mask shader | Custom fragment shader |
| Dehaze | PixiJS Dark Channel Prior shader chain | Multi-pass: dark channel → atmospheric light → transmission → recover |
| Apply (full-res bake) | PixiJS render to offscreen → blob | Upload to server, no Sharp |

**Shader sourcing strategy:** prefer battle-tested open-source shaders over writing from scratch. Search before writing.

**Sources to mine (in order):**
1. **`shadertoy` skill** (local: `~/.claude/skills/shadertoy`) — use FIRST for film grain, dehaze, color grading, sharpening searches
2. **glfx.js source** (github.com/evanw/glfx.js) — GLSL current, wrapper stale. Copy `brightness`, `hueSaturation`, `unsharpMask`, `noise`
3. **Three.js postprocessing** (github.com/pmndrs/postprocessing) — mature shader collection, MIT
4. **WebGL Fundamentals** (webglfundamentals.org) — image processing examples
5. **RapidRAW** (Rust shaders portable to GLSL) — Lightroom-clone reference

**Rule for executing agent:** for each shader to-do, FIRST invoke `shadertoy` skill to search ShaderToy, then check sources 2-5, port to PixiJS Filter format, attribute license. Write from scratch only if no suitable shader exists.

**Quality caveats:**
- Dehaze: dark-channel-prior implementation, not Adobe-quality. Sky/white-object regions weaker than Lightroom's ML-refined version.
- Grain: custom luminance-weighted shader replaces Sharp's poor implementation.

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

**Fallback (out of scope this plan):** if Path 1 frame time exceeds 16ms on 8K image at 100% zoom, separate plan to bypass MpiCanvas during raw edit (PixiJS surface as visible canvas, port input handlers).

**New util:** `js/utils/rawGpuPipeline.js` — PixiJS pipeline orchestrator, exposes:
- `mount(srcImg)` — initialize pipeline against image
- `setParams(values)` — push uniforms, schedule render (rAF-throttled), emit processed bitmap
- `renderFullRes()` — returns Promise<Blob> for Apply bake
- `destroy()` — release WebGL contexts, dispose textures

**MpiCanvas API addition:**
- `setProcessedImage(bitmap)` — swap rendered source without resetting view.scale/offset

---

## To-Dos

### Phase 1 — Audit & Setup
- [x] Audit Sharp usage: `routes/imageAdjust.js` (raw — to remove), `routes/projects.js:833-840` (thumbnails — keep), any others
- [x] Audit `/api/image/adjust` consumers — confirm only `MpiToolOptionsRaw.js` calls it (lines 324, 544)
- [x] `npm install pixi.js` — installed v8.18.1; 71MB unpacked, ~1-2MB minified in Electron renderer
- [x] Survey shader sources — all effects covered by local `blueprints/.glsl/` shaders (MPI-authored); see `docs/shader-sources.md`

### Phase 2 — GPU Pipeline Util
- [x] Create `js/utils/rawGpuPipeline.js` skeleton (mount/setParams/renderFullRes/destroy)
- [x] Build PixiJS Application with offscreen render target
- [x] Port exposure / shadows / saturation shaders from glfx.js GLSL source (or ShaderToy) → PixiJS Filter
- [ ] Verify color space matches expected output (sRGB vs linear-light) on test image
- [x] rAF-throttle setParams to avoid render thrash

### Phase 2.5 — Profile Path 1 (gate)
- [x] Wire pipeline → `MpiCanvas.setProcessedImage(bitmap)` minimal end-to-end (identity passes)
- [ ] Profile frame time on **8K image** at 100% zoom while dragging slider (primary target) — timing logged to `logs/app.log` via `clientLogger` (`rawGpu frame render=Xms total=Yms`); run manually in Electron after Phase 4 wires sliders
- [ ] Spot-check on 16K (outlier ceiling)
- [ ] Target: < 16ms per param change (60fps) at 8K. Pass → continue. Fail → STOP, return to brainstorm session for Path 2 plan.

### Phase 3 — Custom Shaders (port battle-tested where possible)
For each: search shader sources first, port if found, write from scratch only if needed. Attribute licenses.
- [x] Curve LUT shader: accept 256-entry Float32Array from spline, sample per pixel — `COLOR_CURVES_FRAG` + `lutToTexture()` in rawGpuPipeline.js
- [x] Per-color HSL shader: convert RGB→HSL, mask by hue range (R/G/B/Y bands), shift hue + sat per band, convert back — `HUE_SAT_FRAG` in rawGpuPipeline.js
- [x] Noise reduction shader: separable gaussian (port from Three.js postprocessing) or bilateral if quality demands — `BILATERAL_FRAG` in rawGpuPipeline.js
- [x] Film-grain shader: luminance-weighted noise (port from ShaderToy film-grain examples) — `FILM_GRAIN_FRAG` in rawGpuPipeline.js
- [x] Sharpening shader: unsharp mask (port from glfx.js GLSL source) — `UNSHARP_FRAG` in rawGpuPipeline.js
- [ ] Validate each shader visually against test reference images

### Phase 3.5 — Dehaze Shader Chain
Search ShaderToy and academic GLSL repos for existing Dark Channel Prior implementations before writing.
- [x] Dark channel pass: min(R,G,B) per pixel, then min over 15×15 patch
- [x] Atmospheric light estimation: sample top 0.1% brightest dark-channel pixels (approx: 4×4 grid scan in top-right quadrant, pick darkest-dark-channel winner)
- [x] Transmission map: t = 1 - ω × dark_channel / A (ω ≈ 0.95)
- [x] Optional refinement: guided filter or simple gaussian smooth on transmission — skipped; single-pass limit, transmission clamped to t0 instead
- [x] Recovery: J = (I - A) / max(t, t0) + A (t0 ≈ 0.1)
- [x] Negative dehaze (add haze) = inverse blend toward atmospheric light
- [ ] Validate against test images with haze; flag quality limitations vs Adobe

### Phase 4 — Component Rewire
- [x] Add `setProcessedImage(bitmap)` method to `MpiCanvas` — already existed; proxied via factory
- [x] Update `js/utils/rawPreview.js` — gutted to no-op stub (deprecated)
- [x] Update `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`:
  - Keep all params in `SECTIONS` (exposure, shadows, saturation, dehaze, sharpening, NR, grain, curve, WB, per-color)
  - Drop `_sharpPreview` debounced fetch (no server preview)
  - Drop `_SHARP_ONLY_KEYS`
  - Drop `debounced: true` flags (all instant via GPU)
  - Replace `_applyPreview` body with `pipeline.setParams(values)`
  - Wire curve canvas output to pipeline as LUT via `_pushCurveLUT` / `_makeSplineY`
  - Wire WB pixel-sampling result to pipeline via `_pipeline.mount(correctedImg, ...)`
  - Update `el.destroy` to call `pipeline.destroy()`
- [x] Confirm follows `.claude/rules/components.md`: factory, BEM, destroy contract, Events bus

### Phase 5 — Apply Flow (Bake)But let's see how we do. Uh this might be a long session because might have a lot of bugs. 
- [x] New route `POST /api/image/bake` — accept multipart blob + meta (groupId, itemId, folderPath)
- [x] Route saves blob to `Media/<uuid>.<ext>`, writes `.meta/<uuid>.json`, returns `{ success, item }`
- [x] Pipeline `renderFullRes()` produces blob at original image dimensions
- [x] `applyBtn` handler swaps fetch from `/api/image/adjust` to `/api/image/bake` with FormData

### Phase 6 — Sharp Removal
- [x] Delete `routes/imageAdjust.js`
- [x] Remove route registration from server entry
- [x] Verify `routes/projects.js` Sharp call still works (thumbnails) — keep that import
- [x] If no other Sharp consumers: leave `sharp` in package.json (thumbnails still need it). Otherwise document why retained.

### Phase 7 — Validation
- [ ] Test in Electron desktop (per `feedback_testing_desktop.md` — browser unreliable)
- [ ] Compare bake output against old Sharp output — color/quality regression check
- [ ] Test with large images: 8K (primary), 16K (outlier ceiling) — memory + WebGL context limits
- [ ] Test rapid slider drag — confirm no frame drops
- [ ] Test Apply → history entry → reload entry roundtrip
- [ ] Test reset/destroy lifecycle (no WebGL leaks across tool re-mounts)
- [ ] Remove perf timing logs from `rawGpuPipeline.js` `_render()` — strip `this._t0`, `tRender`, `tTotal`, and the `clientLogger.info` timing line; keep error logs

---

## Risks

| Risk | Mitigation |
|---|---|
| WebGL context limit (~16 per page) | Single shared pipeline instance per viewer; destroy aggressively |
| Color space drift sRGB vs linear | Apply gamma correction in shader if Sharp baseline differs |
| Large image memory blow-up on bake | Tile-based render if image > GPU max texture; fallback to canvas2D bake |
| PixiJS NoiseFilter ≠ proper film grain | Custom luminance-weighted shader from ShaderToy reference |
| Other features depend on `/api/image/adjust` | Audit step Phase 1 must be exhaustive before deletion |
| Ported shader licenses incompatible | Track license per shader in `docs/shader-sources.md`; prefer MIT/CC0/BSD; reject GPL |

---

## Files Touched

**New:**
- `plans/2026-04-26-raw-gpu-pipeline.md` (this file)
- `js/utils/rawGpuPipeline.js`
- `routes/imageBake.js` (replaces imageAdjust.js)

**Modified:**
- `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`
- `js/utils/rawPreview.js`
- `package.json` (+pixi.js)
- Server entry (route registration swap)

**Deleted:**
- `routes/imageAdjust.js`

---

## Out of Scope

- Other Sharp consumers (thumbnails in `routes/projects.js` stay)
- Video raw adjustments (future)
- ML-based dehaze refinement (Adobe-quality requires deep learning model — defer)
