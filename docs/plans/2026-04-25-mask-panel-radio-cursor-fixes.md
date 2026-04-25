# Mask Panel Radio + Cursor Fixes

**Created:** 2026-04-25
**Status:** Pending

## Context

Mask tool history-tab panel has 3 issues:
1. Box/Segment MpiRadioGroup uses single group-level `info`, so status bar shows same text on both options (only "Box" appears informative).
2. Paint/Eraser are two separate MpiButtons — should be single MpiRadioGroup for consistency with Box/Segment, while preserving B/E hotkeys.
3. MpiCanvas brush indicator (`_drawBrushIndicator`) hardcodes white stroke for both brush and eraser. Eraser should be black.

Decision: extend `MpiRadioGroup` primitive with `el.setValue(val)` so external code (hotkeys) can drive selection cleanly. Scales to N-option radios with N hotkeys.

## Files

- `js/components/Primitives/MpiRadioGroup/MpiRadioGroup.js` — add `setValue` method
- `js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.js` — per-option info on Box/Segment; replace paint/eraser buttons with radio; rewire hotkeys
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` — brush-type aware stroke color in `_drawBrushIndicator`

## To-Dos

- [x] **1. Extend MpiRadioGroup primitive — add ****`setValue(val)`**** method**
  - In `setup`, attach `el.setValue = (val) => {...}` that:
    - Finds button by `data-value="${val}"`
    - Removes `is-active` from all buttons, adds to matching one
    - Sets `props.value = val`
    - Emits `'select' { value, option }` (same shape as click handler)
  - Bail silently if val not found in options.
  - No-op if already selected (skip re-emit) to avoid hotkey loops.

- [x] **2. MpiToolOptionsMask — Box/Segment per-option info**
  - In `MpiToolOptionsMask.js` lines 64-72, change `options` array to per-option `info`:
    - box: `"Create Selections with boxes - Less artifacts but larger area"`
    - segment: `"Precise masking with possible artifacts"`
  - Drop top-level `info: 'Detection mode'`.

- [x] **3. MpiToolOptionsMask — Paint/Eraser → MpiRadioGroup**
  - Replace `brushBtn` + `eraserBtn` MpiButtons (lines 88-99) with single `MpiRadioGroup.mount` into `#brush-slot`:
    - `iconOnly: true`
    - options: `{ label:'Paint', value:'brush', icon:'brush', info:'Paint mask (B)' }`, `{ label:'Erase', value:'eraser', icon:'eraser', info:'Erase mask (E)' }`
    - `value: 'brush'`, `name: 'mask-brush-mode'`
  - Wire `.on('select', ({value}) => viewer.el.setMaskBrushMode?.(value))`.
  - Refactor `_setBrush` / `_setEraser` to call `brushRadio.el.setValue('brush'|'eraser')` instead of toggling button active state. Drop `viewer.el.setMaskBrushMode` direct call from these — radio's `select` event handler will fire it.
  - Keep `Hotkeys.bind('mask.brush.toolbar', _setBrush)` + `mask.eraser.toolbar` bindings unchanged.
  - Push `brushRadio` to `_children` (drop old btn pushes).

- [x] **4. MpiCanvas ****`_drawBrushIndicator`**** — eraser cursor black**
  - File: `js/components/Primitives/MpiCanvas/MpiCanvas.js` line 363.
  - Read `this.mask.brushType` — if `'eraser'`, set `strokeStyle = 'rgba(0, 0, 0, 0.8)'`; else keep `'rgba(255, 255, 255, 0.8)'`.
  - Center dot fill stays white (per user).

- [ ] **5. Verify desktop**
  - Run electron app.
  - Open mask tool history tab.
  - Hover Box → status bar shows box info. Hover Segment → status bar shows segment info.
  - Click Paint/Erase radio buttons → tool switches, viewer responds.
  - Press B → radio highlights Paint, brush mode active. Press E → highlights Erase, eraser mode active.
  - Move cursor on canvas in eraser mode → ring is black. Switch to brush → ring is white.
  - Confirm no console errors.

## Notes

- `MpiRadioGroup.setValue` should be the sole way external code drives selection — keeps state + visual + emit in sync.
- Hotkey handlers fire `setValue` → emits `select` → handler calls `setMaskBrushMode`. Single source of truth.
- Per-option `info` already supported in primitive (line 42 of MpiRadioGroup.js); no primitive change needed for to-do 2.
