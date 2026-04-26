# Plan: Raw Image Adjustments Tool

**Tracker:** feat_mo9gv6aje8qpn0  
**Status:** Backlog — blocked until right-panel architecture shipped (now done). Resume here.  
**Scope:** Image only (video-extensible API). Group History workspace only.

---

## Architecture Summary

**Pattern:** Exact same pattern as `MpiToolOptionsCrop` / `MpiToolOptionsUpscale`.

- New `MpiToolOptionsRaw` Organism → mounts into `#right-top-slot` via `TOOL_OPTIONS_REGISTRY`
- New `routes/imageAdjust.js` route → `POST /api/image/adjust` → Sharp pipeline → saves file → returns `{ item }` for history append
- **Live preview:** CSS filters applied directly to canvas image element (instant, 0ms). Debounced Sharp call (300ms) for dehaze + per-color calibration (can't do in CSS).
- **Apply:** Full-res Sharp bake → new history entry via `appendToHistory` + `historyList.el.appendEntry` + `viewer.el.loadEntry` pattern (same as crop apply in Block).
- **No `MpiProgressBar` bipolar variant needed yet** — implement it when sliders are being built (Phase 2).

---

## Parameters

| Param | Key | Range | Default | CSS preview | Sharp method |
|---|---|---|---|---|---|
| Exposure | `exposure` | -3.0 → +3.0 EV | 0 | `brightness()` | `.linear(2^ev, 0)` |
| Shadows | `shadows` | -100 → +100 | 0 | `brightness()` approx | `.linear()` lift |
| White Balance | `whiteBalance` | -100 → +100 | 0 | `hue-rotate()` approx | `.tint({ r,g,b })` |
| Saturation | `saturation` | -100 → +100 | 0 | `saturate()` | `.modulate({ saturation })` |
| Dehaze | `dehaze` | -100 → +100 | 0 | debounced Sharp | dark channel prior JS |
| Grain | `grain` | 0 → 100 | 0 | CSS noise overlay | composite noise buffer |
| Point Curve | `curve` | -100 → +100 | 0 | `brightness()+contrast()` | `.gamma()` |
| Noise Reduction | `noiseReduction` | 0 → 100 | 0 | `blur()` | `.blur(sigma)` |
| Sharpening | `sharpening` | 0 → 100 | 0 | none (skip preview) | `.sharpen()` |
| Hue/Sat R/G/B/C/M/Y | `hueR`…`satY` | hue: -180→+180, sat: -100→+100 | 0 | debounced Sharp | HSL range mask + `.modulate()` |

---

## To-Dos

### Phase 1 — `MpiProgressBar` bipolar variant

- [x] **1.1** Add `bipolar` CSS variant to `MpiProgressBar.css`  
  Fill origin at center (50%). Left = `var(--danger)` color, right = `var(--primary)`. Value 0 = center, handle at midpoint.

- [x] **1.2** Update `MpiProgressBar.js` template + setup to support `bipolar: true` prop  
  Compute `fillLeft` and `fillWidth` from center based on normalized value. Track fill div position accordingly.

---

### Phase 2 — `MpiToolOptionsRaw` Organism

- [x] **2.1** Create `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.css`  
  Scrollable panel, `overflow-y: auto`, grouped sections. Use `.mpi-tool-options` shared class pattern (see `MpiToolOptionsCrop.css`).

- [x] **2.2** Create `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js`  
  - Props: `{ viewer }` — MpiCanvasViewer instance  
  - Sections: **Light** (exposure, shadows, curve), **Color** (whiteBalance, saturation, dehaze), **Detail** (sharpening, noiseReduction, grain), **Calibration** (hueR/G/B, satR/G/B — collapsible)  
  - Each param: label + `MpiProgressBar` (bipolar, interactive, handle, wheel)  
  - On any slider `input` event: call `_applyPreview(values)` → CSS filter on canvas image el  
  - On sliders that need debounced Sharp (dehaze, per-color): 300ms debounced POST to `/api/image/adjust?preview=true` → swap canvas src with returned base64  
  - Apply button: POST full-res to `/api/image/adjust` → `emit('apply', { item })`  
  - `el.reset()` public method — zeroes all sliders, clears CSS filter  
  - `el.destroy()` — clears CSS filter, cleans up debounce timers  

- [x] **2.3** Register `MpiToolOptionsRaw.css` in `js/shell/preloadStyles.js`

- [x] **2.4** Document `MpiToolOptionsRaw` props in `js/components/types.js`

---

### Phase 3 — CSS Preview Utility

- [x] **3.1** Create `js/utils/rawPreview.js`  
  Export `buildCSSFilter(values) → string`  
  Maps: exposure → `brightness()`, saturation → `saturate()`, noiseReduction → `blur()`, curve → `brightness()+contrast()`, shadows → partial brightness. Returns composited CSS filter string.  
  Pure function, no side effects. Used by `MpiToolOptionsRaw` on every slider drag.

---

### Phase 3b — Point Curve Editor & Auto White Balance

- [x] **3b.1** Replace `curve` slider in `MpiToolOptionsRaw.js` with quadratic canvas curve editor  
  - Remove `curve` from `SECTIONS` params array (no slider generated)  
  - Add `<canvas class="mpi-tool-options-raw__curve-canvas" id="curve-canvas" width="160" height="160"></canvas>` to Light section template (after shadows, before actions)  
  - Draw: dark background, 3×3 grid lines, histogram silhouette (optional later), white quadratic Bézier from `(0,0)` to `(1,1)` with single draggable control point at `(0.5, 0.5)` default  
  - Control point drag: `mousedown` on canvas → `mousemove` on document → `mouseup` — clamp control point to `[0,1]×[0,1]`  
  - Store `_curvePoint = { x: 0.5, y: 0.5 }`. Map to `curve` value: `curve = Math.round((0.5 - _curvePoint.y) * 200)` (range -100→+100; point above center = positive = lighten)  
  - On drag: update `_values.curve`, call `_applyPreview(_values, 'curve')`, redraw canvas  
  - `el.reset()` must also reset `_curvePoint` to `{x:0.5, y:0.5}` and redraw  
  - CSS: canvas `border-radius: var(--radius-1)`, `background: var(--surface-2)`, `cursor: crosshair`, `width: 100%`, `height: auto`, `aspect-ratio: 1`

- [x] **3b.2** Replace `whiteBalance` slider with "Auto WB" button + value display  
  - Remove `whiteBalance` from `SECTIONS` params array (no slider generated)  
  - Add dedicated row in Color section template: label "White Balance" + value display span + `MpiButton` { label: 'Auto', variant: 'ghost', size: 'sm' }  
  - Auto WB click: POST `{ imagePath, preview: true, autoWB: true }` to `/api/image/adjust` → backend computes grey-world white balance → returns `{ whiteBalance: number }` → update `_values.whiteBalance`, update value display, call `_applyPreview`  
  - `_values.whiteBalance` still used in CSS preview and Sharp apply — just no manual slider  
  - `el.reset()` resets `_values.whiteBalance = 0`, clears value display

---

### Phase 4 — Node Route `POST /api/image/adjust`

- [x] **4.1** Create `routes/imageAdjust.js`  
  ```
  POST /api/image/adjust
  Body: { imagePath, folderPath, params: AdjustParams, preview?: boolean, groupId?, itemId? }
  ```
  - `preview: true` → resize to max 800px, return `{ success, previewBase64: 'data:image/jpeg;base64,...' }` (fast, ~50ms)
  - `preview: false` → full res, save to `<folderPath>/Media/<uuid>.jpg`, write `.meta/<uuid>.json` sidecar, return `{ success, item }` shaped for `appendToHistory`
  
  Sharp pipeline order: linear (exposure) → tint (white balance) → modulate (saturation) → dehaze → per-color HSL → gamma (curve) → sharpen → blur (NR) → grain composite.

- [x] **4.2** Implement `applyExposure(pipeline, ev)` — `pipeline.linear(Math.pow(2, ev), 0)`

- [x] **4.3** Implement `applyShadows(pipeline, v)` — lift-only linear: only affects dark range via offset

- [x] **4.4** Implement `applyDehaze(pipeline, strength)` — dark channel prior in pure JS using Sharp `.raw()` pixel access

- [x] **4.5** Implement `applyGrain(pipeline, strength)` — generate seeded noise buffer, composite at low opacity

- [x] **4.6** Implement per-color HSL calibration — for each R/G/B: isolate hue range in raw pixel data, apply hue shift + sat delta, blend back

- [x] **4.7** Write `.meta/<uuid>.json` sidecar — same shape as `videoCrop.js` sidecar (operation: `'raw'`, modelId: null, etc.)

- [x] **4.8** Register route in `server.js`:
  ```js
  const imageAdjustRoutes = require('./routes/imageAdjust');
  app.use(imageAdjustRoutes);
  ```

---

### Phase 5 — Wire into Group History Block

- [x] **5.1** Read `.claude/rules/components.md` before starting this phase.

- [x] **5.2** Import `MpiToolOptionsRaw` in `MpiGroupHistoryBlock.js`, add to `TOOL_OPTIONS_REGISTRY`:
  ```js
  import { MpiToolOptionsRaw } from '../../Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js';
  // ...
  const TOOL_OPTIONS_REGISTRY = {
      crop:         MpiToolOptionsCrop,
      mask:         MpiToolOptionsMask,
      videoUpscale: MpiToolOptionsUpscale,
      interpolate:  MpiToolOptionsInterpolate,
      raw:          MpiToolOptionsRaw,   // ← add
  };
  ```

- [x] **5.3** Add `raw` to `IMAGE_TOOLS` in `MpiHistoryTools.js`:
  ```js
  const IMAGE_TOOLS = [
      { mode: 'prompt', icon: 'chat',    info: 'Prompt' },
      { mode: 'crop',   icon: 'crop',    info: 'Crop'   },
      { mode: 'mask',   icon: 'mask',    info: 'Mask'   },
      { mode: 'raw',    icon: 'sliders', info: 'Raw'    },  // ← add (add icon to icons.js first)
  ];
  ```

- [x] **5.4** Add `sliders` icon to `js/utils/icons.js` if not present.

- [x] **5.5** Handle `apply` from `MpiToolOptionsRaw` in `_handleApply` inside `MpiGroupHistoryBlock.js`:
  ```js
  case 'raw': {
      const { item } = payload;
      _group = appendToHistory(_group, item);
      _currentIdx = _group.selectedIndex;
      _persistGroup();
      historyList.el.appendEntry(item);
      viewer.el.loadEntry?.(item, _currentIdx);
      viewer.el.setMaskHidden?.(false);
      break;
  }
  ```

---

### Phase 6 — Update Docs & Rules

- [x] **6.1** Add `MpiToolOptionsRaw` to `.claude/rules/component-mounts.md` under `MpiGroupHistoryBlock` image group section.

- [x] **6.2** Add `MpiToolOptionsRaw` to `.claude/rules/component-events.md` under Organisms.

- [x] **6.3** Update tracker item `feat_mo9gv6aje8qpn0` status to `in-review` when complete.

---

## Key File Reference

| File | Action |
|---|---|
| `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.js` | CREATE |
| `js/components/Organisms/MpiToolOptionsRaw/MpiToolOptionsRaw.css` | CREATE |
| `js/utils/rawPreview.js` | CREATE |
| `routes/imageAdjust.js` | CREATE |
| `js/components/Primitives/MpiProgressBar/MpiProgressBar.js` | MODIFY — bipolar prop |
| `js/components/Primitives/MpiProgressBar/MpiProgressBar.css` | MODIFY — bipolar variant |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` | MODIFY — registry + apply handler |
| `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js` | MODIFY — add raw to IMAGE_TOOLS |
| `js/utils/icons.js` | MODIFY — add sliders icon |
| `js/shell/preloadStyles.js` | MODIFY — register MpiToolOptionsRaw.css |
| `js/components/types.js` | MODIFY — document MpiToolOptionsRaw props |
| `server.js` | MODIFY — register imageAdjust route |

---

## Sharp Pipeline Reference

```js
// Exposure: EV stops → linear multiplier
pipeline.linear(Math.pow(2, params.exposure), 0);

// Saturation (1.0 = neutral)
pipeline.modulate({ saturation: 1 + params.saturation / 100 });

// White balance: temp shift via RGB tint
const t = params.whiteBalance / 100;
pipeline.tint({ r: 1 + t * 0.2, g: 1.0, b: 1 - t * 0.2 });

// Point curve: midtone gamma (0 = neutral)
pipeline.gamma(1 / (1 + params.curve / 100));

// Sharpening
pipeline.sharpen({ sigma: 0.5 + params.sharpening / 100 * 2 });

// Noise reduction
if (params.noiseReduction > 0) pipeline.blur(params.noiseReduction / 100 * 2);
```
