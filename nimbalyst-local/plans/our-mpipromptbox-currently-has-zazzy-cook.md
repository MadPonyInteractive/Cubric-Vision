# Plan: Wire PromptBox Ratio Control

## Context

The `MpiPromptBox` has a ratio sub-control (`MpiRatioSelector`) that mounts in `#bottom-bottom-slot` for `t2i`, `i2i`, `t2v`, and `i2v` operations. Currently:

1. `model.type` is derived by string-matching `model.id` — a brittle heuristic.
2. `WAN_RATIOS` exists in `ratios.js` but is never reached — `'wan'` falls through to SDXL.
3. `MpiRatioSelector` has no way to know whether a model type should render an orientation-toggle or a speed-radio — that mapping is missing entirely.

**Future note:** The ratio selector will eventually move into a settings popup. To make that painless, `MpiRatioSelector` must be fully self-contained — all state and UI-mode logic lives inside it. `PromptBoxControls` passes only `modelType`; nothing ratio-related leaks into the PromptBox itself.

---

## The Core Solution (Option A)

Add a `RATIO_MODES` map to `ratios.js` that declares the UI mode for each `model.type`:

```js
export const RATIO_MODES = {
    flux:  'orientation',   // portrait/landscape toggle
    sdxl:  'orientation',
    wan:   'speed',         // quality-tier radio
    // ltx: 'speed'        ← one line when LTX is added
};
```

`MpiRatioSelector` reads `RATIO_MODES[modelType]` to decide which header to render. `models.js` stays untouched. Adding a future video model type = one line in `ratios.js`, one in `models.js`.

---

## Critical Files

| File | Change |
|---|---|
| `js/utils/ratios.js` | Add `RATIO_MODES`, add `'wan'` case to `getModelRatios()` |
| `js/components/Blocks/MpiPromptBox/MpiPromptBox.js:436` | Pass `model.type` instead of `model.id` |
| `js/components/Blocks/MpiPromptBox/PromptBoxControls.js:28` | Use `opts.modelType` directly; drop string-match heuristic |
| `js/components/Compounds/MpiRatioSelector/MpiRatioSelector.js` | Import `RATIO_MODES`; add speed-radio mode |
| `js/components/Primitives/MpiRadioGroup/MpiRadioGroup.js` | Already exists — import and use |
| `js/components/types.js` | Update `MpiRatioSelectorProps` |

---

## Implementation Steps

### Step 1 — Add `RATIO_MODES` and fix `getModelRatios()` in `ratios.js`

**File:** `js/utils/ratios.js`

Add after the existing ratio constants:

```js
// Maps model.type → which UI mode MpiRatioSelector should use.
// 'orientation' = portrait/landscape toggle. 'speed' = quality-tier radio.
export const RATIO_MODES = {
    flux: 'orientation',
    sdxl: 'orientation',
    wan:  'speed',
};
```

Update `getModelRatios()` to accept an optional `qualityTier` and handle `'wan'`:

```js
export function getModelRatios(modelType, orientation, qualityTier = 'medium') {
    switch (modelType?.toLowerCase()) {
        case 'flux':   return FLUX_RATIOS[orientation] ?? FLUX_RATIOS.portrait;
        case 'social': return SOCIAL_RATIOS;
        case 'wan':    return WAN_RATIOS[qualityTier]  ?? WAN_RATIOS.medium;
        case 'sdxl':
        default:       return SDXL_RATIOS[orientation] ?? SDXL_RATIOS.portrait;
    }
}
```

Remove the two `TODO: Add WAN_RATIOS` comments.

---

### Step 2 — Pass `model.type` from `MpiPromptBox`

**File:** `js/components/Blocks/MpiPromptBox/MpiPromptBox.js:436`

```js
// Before
ctrl.mount(ctrlEl, { modelId: model?.id });

// After
ctrl.mount(ctrlEl, { modelType: model?.type });
```

`model` already holds the full `ModelDef`; `model?.type` is always set. `modelId` is not needed by any control — remove it.

---

### Step 3 — Fix `PromptBoxControls.js`

**File:** `js/components/Blocks/MpiPromptBox/PromptBoxControls.js`

```js
// Before (line 28)
const mt = opts.modelId?.includes('sdxl') ? 'sdxl' : 'flux';
this._instance = MpiRatioSelector.mount(el, {
    modelType: mt,
    initialOrientation: 'portrait',
    value: this.defaultValue,
});
this.value = { label: this.defaultValue, w: 1024, h: 1024 };

// After
this._instance = MpiRatioSelector.mount(el, {
    modelType: opts.modelType ?? 'flux',
    initialOrientation: 'portrait',
    value: this.defaultValue,
});
this.value = { label: this.defaultValue, w: 1024, h: 1024 };
```

The default `w`/`h` of `1024×1024` is still valid — `1:1` exists in every ratio set. `MpiRatioSelector` owns all state from here.

---

### Step 4 — Extend `MpiRatioSelector` with speed-radio mode

**File:** `js/components/Compounds/MpiRatioSelector/MpiRatioSelector.js`

**4a. Imports to add:**
```js
import { MpiRadioGroup } from '../../Primitives/MpiRadioGroup/MpiRadioGroup.js';
import { RATIO_MODES } from '../../../utils/ratios.js';
```

**4b. In `template(props)`:**
- Add `qualityTier = props.qualityTier || 'medium'`.
- Derive mode: `const mode = RATIO_MODES[props.modelType] ?? 'orientation';`
- Replace the `isFlat` orientation-header block:
  - `mode === 'orientation'` → existing portrait/landscape toggle header (unchanged).
  - `mode === 'speed'` → render `MpiRadioGroup.template({ options: ['very_low','low','medium','high','very_high'], value: qualityTier, name: 'speed' })` as the header. No orientation button.
- Pass `qualityTier` to `getModelRatios(modelType, orientation, qualityTier)`.

**4c. In `setup(el, props, emit)`:**
- Add `props.qualityTier = props.qualityTier || 'medium'`.
- Mount `MpiRadioGroup` into the speed-radio header container when `mode === 'speed'`, listen to its `'select'` event:
  ```js
  radioInstance.on('select', ({ value }) => {
      props.qualityTier = value;
      updateUI();
  });
  ```
- Update `updateUI()`:
  - Re-derive `mode` from `RATIO_MODES[props.modelType]`.
  - Pass `props.qualityTier` to `getModelRatios`.
  - Show/hide orientation vs speed header based on `mode`.
- The `isFlat` guard becomes: `const isFlat = mode === 'speed' || modelType === 'social';`

**4d. The `'change'` event on ratio select stays unchanged** — still emits `{ value, w, h }` — so `getInjectionParams()` in `PromptBoxControls` needs no modification.

---

### Step 5 — Update `types.js`

**File:** `js/components/types.js` — find `MpiRatioSelectorProps` and add:
- `qualityTier?: 'very_low'|'low'|'medium'|'high'|'very_high'` — active speed tier (speed-mode only, default `'medium'`)

---

## Data Flow

```
model.type  ──►  MpiPromptBox._refreshOpSlot()
                   └─► ctrl.mount({ modelType })
                           └─► MpiRatioSelector
                                 ├─ RATIO_MODES[modelType] → 'orientation' | 'speed'
                                 ├─ getModelRatios(type, orientation, tier) → ratio array
                                 └─ emit('change', { value, w, h })
                                         └─► PromptBoxControls.ratio.value
                                                 └─► getInjectionParams() → { Width, Height }
```

On model switch: `setModel()` → `_refreshOpSlot()` → fresh `MpiRatioSelector` mount with new `modelType`.

---

## Verification

1. SDXL image model → orientation toggle + 5 SDXL ratios.
2. WAN video model → speed radio (very_low…very_high) + 3 ratios for selected tier.
3. Switch models mid-session → ratio selector updates immediately.
4. Select ratio and run → ComfyUI receives correct `Width` / `Height`.
5. Switch ops (t2i → upscale → t2i) → control disappears and reappears correctly.
