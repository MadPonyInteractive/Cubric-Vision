# Plan: Raw Image Adjustments Tool

**Tracker:** feat_mo9gv6aje8qpn0  
**Scope:** Group History workspace, image only (video-extensible API)

---

## Architecture Summary

- **Preview:** CSS filters (instant, 0ms) for exposure/shadows/saturation/sharpening/NR. Debounced Sharp call (300ms) for dehaze + per-color calibration preview (these can't be CSS).
- **Apply:** Single POST `/api/image/adjust` → Sharp pipeline → saves new file → new history entry (same pattern as videoCrop).
- **UI:** New `MpiRawConfig` Compound (scrollable slider panel) mounted in `MpiToolActionBar.topSlot`. New `bipolar` variant on `MpiProgressBar` (fill from center, negative left, positive right).
- **No Python needed.** Dehaze = dark channel prior in JS. Per-color calibration = HSL range masking in Sharp pipeline.

---

## Parameters & Ranges

| Param | Key | Range | Default | Preview method |
|---|---|---|---|---|
| Exposure | `exposure` | -3.0 → +3.0 EV | 0 | CSS `brightness()` |
| Shadows | `shadows` | -100 → +100 | 0 | CSS `brightness()` on darks (approximate) |
| White Balance | `whiteBalance` | -100 → +100 (temp) | 0 | CSS `hue-rotate()` approx |
| Saturation | `saturation` | -100 → +100 | 0 | CSS `saturate()` |
| Dehaze | `dehaze` | -100 → +100 | 0 | Debounced Sharp |
| Grain | `grain` | 0 → 100 | 0 | CSS + OffscreenCanvas noise overlay |
| Point Curve | `curve` | -100 → +100 (midtone lift/pull) | 0 | CSS `contrast()` + `brightness()` |
| Noise Reduction | `noiseReduction` | 0 → 100 | 0 | CSS `blur()` (subtle) |
| Sharpening | `sharpening` | 0 → 100 | 0 | CSS custom filter |
| Hue per color | `hueR/G/B/C/M/Y` | -180 → +180 | 0 | Debounced Sharp |
| Sat per color | `satR/G/B/C/M/Y` | -100 → +100 | 0 | Debounced Sharp |

---

## To-Dos

### Phase 1 — MpiProgressBar `bipolar` variant

- [ ] **1.1** Add `bipolar` CSS variant to `MpiProgressBar.css`  
  Fill grows from center (50%). Left of center = `--danger` color, right = `--primary`. Handle at center = default position.

- [ ] **1.2** Update `MpiProgressBar.js` template + setup to support `bipolar` prop  
  When `bipolar: true`: shift fill origin to center. Value 0 = center. JS must compute `fillLeft` and `fillWidth` from center based on value/min/max.

---

### Phase 2 — `MpiRawConfig` Compound

- [ ] **2.1** Create `js/components/Compounds/MpiRawConfig/MpiRawConfig.css`  
  Scrollable panel, max-height ~320px, overflow-y auto. Sections: "Light", "Color", "Detail", "Color Calibration". Use `.mpi-cfg` shared rules (like MpiStyleConfig/MpiCameraConfig).

- [ ] **2.2** Create `js/components/Compounds/MpiRawConfig/MpiRawConfig.js`  
  - Mounts `MpiProgressBar` (bipolar, interactive, handle) for each param.
  - Groups: Light (exposure, shadows, curve), Color (whiteBalance, saturation, dehaze), Detail (sharpening, noiseReduction, grain), Calibration (hueR/G/B, satR/G/B — collapsed by default).
  - Emits `change { values: Object }` on any slider input.
  - Props: `value` (initial values object), `onPreview(values)` callback.
  - `el.reset()` public method — resets all sliders to 0.

- [ ] **2.3** Register `MpiRawConfig.css` in `js/shell/preloadStyles.js`

- [ ] **2.4** Document `MpiRawConfig` props in `js/components/types.js`

---

### Phase 3 — CSS Preview Engine

- [ ] **3.1** Create `js/utils/rawPreview.js`  
  Pure function: `buildCSSFilter(values) → string`  
  Maps: exposure → `brightness()`, saturation → `saturate()`, noiseReduction → `blur()`, curve → combined `brightness()+contrast()`, sharpening → no direct CSS (skip or use SVG filter).  
  Returns CSS filter string to apply to canvas `<img>` element.

- [ ] **3.2** Create `js/utils/rawPreviewDebounced.js`  
  Wraps a 300ms debounced call to `/api/image/adjust?preview=true` for dehaze + per-color calibration params. Returns a blob URL for `<img>` src swap.

---

### Phase 4 — Node.js Route `/api/image/adjust`

- [ ] **4.1** Create `routes/imageAdjust.js`  
  POST `/api/image/adjust`  
  Body: `{ imagePath: string, params: AdjustParams, preview?: boolean }`  
  - `preview: true` → resize to 800px max, return as base64 PNG (fast)
  - `preview: false` → full res, save to project media folder, return `{ outputPath }`  
  Sharp pipeline order: linearize → whiteBalance → dehaze → modulate (saturation) → per-color HSL → curve (gamma) → sharpen → blur (NR) → grain composite.

- [ ] **4.2** Implement `applyDehaze(sharpInstance, strength)` in `routes/imageAdjust.js`  
  Dark channel prior: estimate atmospheric light, subtract haze via linear blend. Pure JS + Sharp `.raw()` pixel access.

- [ ] **4.3** Implement `applyGrain(sharpInstance, strength, seed)` in `routes/imageAdjust.js`  
  Generate noise buffer matching image dimensions. Composite over image at low opacity.

- [ ] **4.4** Implement per-color HSL calibration in `routes/imageAdjust.js`  
  For each of R/G/B/C/M/Y: isolate pixels in hue range, shift hue + saturation, blend back. Use Sharp `.raw()` + pixel loop.

- [ ] **4.5** Register route in `server.js` (or wherever routes are mounted — check existing pattern).

---

### Phase 5 — Raw Tool in Group History

- [ ] **5.1** Read `.claude/rules/components.md` before starting this phase.

- [ ] **5.2** Add `raw` tool activation logic to `MpiGroupHistoryBlock.js`  
  Pattern: same as crop/mask tool activation. On activate: mount `MpiRawConfig` in topSlot, show `MpiToolActionBar` with actions `[reset, cancel, apply]`. On deactivate: destroy `MpiRawConfig` instance, hide bar.

- [ ] **5.3** Wire `MpiRawConfig` `change` event → `rawPreview.buildCSSFilter()` → apply to canvas image element via CSS filter property (instant).  
  Also trigger debounced Sharp preview for dehaze/per-color params.

- [ ] **5.4** Wire `apply` action:  
  POST `/api/image/adjust` (full res, `preview: false`) → receive `outputPath` → call existing `addHistoryEntry()` pattern → new card appears → deactivate raw tool.

- [ ] **5.5** Wire `reset` action → `rawConfig.el.reset()` → clear CSS filter → update preview.

- [ ] **5.6** Wire `cancel` action → clear CSS filter → destroy panel → hide bar.

- [ ] **5.7** Add `raw` tool button to Group History toolbar (wherever crop/mask buttons live).

---

### Phase 6 — Tracker Update

- [ ] **6.1** Update tracker item `feat_mo9gv6aje8qpn0` status to `in-progress` when work begins, `done` when complete.

---

## Sharp Param Mapping (reference for Phase 4)

```js
// Exposure: EV stops → linear multiplier
const expMult = Math.pow(2, params.exposure); // e.g. +1 EV = 2x
sharp.linear(expMult, 0);

// Saturation
sharp.modulate({ saturation: 1 + params.saturation / 100 });

// White balance (temp): shift R/B channels
const t = params.whiteBalance / 100;
sharp.tint({ r: 1 + t * 0.2, g: 1, b: 1 - t * 0.2 });

// Point curve (midtone): gamma approximation
// curve=0 → gamma=1, curve=+100 → gamma=0.5 (lighten), curve=-100 → gamma=2 (darken)
const gamma = 1 / (1 + params.curve / 100);
sharp.gamma(gamma);

// Sharpening
sharp.sharpen({ sigma: 0.5 + params.sharpening / 100 * 2 });

// Noise reduction
sharp.blur(params.noiseReduction / 100 * 2); // 0 = no blur, 100 = sigma 2
```

---

## File List (new files)

- `js/components/Compounds/MpiRawConfig/MpiRawConfig.js`
- `js/components/Compounds/MpiRawConfig/MpiRawConfig.css`
- `js/utils/rawPreview.js`
- `js/utils/rawPreviewDebounced.js`
- `routes/imageAdjust.js`

## Files Modified

- `js/components/Primitives/MpiProgressBar/MpiProgressBar.js` (bipolar variant)
- `js/components/Primitives/MpiProgressBar/MpiProgressBar.css` (bipolar variant)
- `js/shell/preloadStyles.js` (register MpiRawConfig.css)
- `js/components/types.js` (document MpiRawConfig props)
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` (raw tool wiring)
- `server.js` or equivalent (register route)
