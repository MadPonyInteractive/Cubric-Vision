# Plan: Merge Mask Tools into MpiToolOptionsMask

## Goal
Merge `MpiToolOptionsAutoMask` and `MpiToolOptionsManualMask` into a single `MpiToolOptionsMask`
organism. One panel, one canvas mode (`mask`), additive workflow — user can auto-detect objects
then refine with brush/eraser on the same mask.

## Panel Layout (no apply button, no tabs)
- **Auto section:** model dropdown (`MpiDropdown`) + box/segment (`MpiRadioGroup`) + thumbs strip
  (`MpiAutoMaskThumbs` re-parented) + Detect button
- **Manual section:** brush/eraser as `MpiRadioGroup` (same icons as current buttons)
- **Shared:** invert button + clear button (one each)
- Mask lives on canvas — user uses PromptBox to run operations

## Critical: Additive Composite
When auto-detect result is picked, new mask must OR onto existing canvas pixels, not replace.
Requires new `el.compositeMaskDataURL(dataUrl)` on `MpiCanvasViewer` that composites via
`ctx.globalCompositeOperation = 'source-over'` on the mask canvas layer, then calls
`el.runAutoMaskDetect` / thumb-pick flow uses this instead of raw `setMaskDataURL`.

---

## To-Dos

### Step 1 — Add `compositeMaskDataURL` to `MpiCanvas`
- [x] Read `js/components/Primitives/MpiCanvas/MpiCanvas.js` to find `setMaskDataURL` implementation
- [x] Add `async compositeMaskDataURL(dataUrl)` method that:
  - Loads the incoming dataUrl into a temp `Image`
  - Draws it onto `this.maskCanvas` using `ctx.globalCompositeOperation = 'source-over'`
  - Does NOT clear the existing mask first
  - Calls `this.draw()` after composite
- [x] Verify `MpiCanvas` exports the new method on its instance

### Step 2 — Update `MpiCanvasViewer` auto-mask commit path
- [x] Read `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` lines 160–230
  (`_exitAutoMaskMode`) and lines 185–200 (`onMask` callback inside `runAutoMask`)
- [x] In the `_autoMaskExec.onMask` callback: change `await canvas.setMaskDataURL(dataUrl)`
  → `await canvas.compositeMaskDataURL(dataUrl)` so picked thumbs composite onto existing mask
- [x] In `_exitAutoMaskMode(apply)`: remove the `_exitMode()` call at the end — the merged
  panel always stays in `mask` mode; exiting is handled by the organism's own `destroy()`
- [x] Add `el.compositeMaskDataURL` passthrough on the viewer's public API surface
  (mirrors `el.setMaskDataURL` pattern if one exists, otherwise just expose canvas method)
- [x] Keep `el.enterMode('automask')` path intact for any future standalone use — only the
  new merged panel avoids it; do not delete `automask` mode from viewer

### Step 3 — Create `MpiToolOptionsMask` organism
- [x] Create dir `js/components/Organisms/MpiToolOptionsMask/`
- [x] Create `MpiToolOptionsMask.css` with BEM `.mpi-tool-options-mask__*` — no hardcoded colors,
  CSS vars only. Sections: auto-section, manual-section, shared-row. Style to match existing
  tool-options panels.
- [x] Create `MpiToolOptionsMask.js`:
  ```
  ComponentFactory.create({
    name: 'MpiToolOptionsMask',
    css: ['js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css'],
    template: () => `
      <div class="mpi-tool-options-mask">
        <div class="mpi-tool-options-mask__section" id="auto-model-slot"></div>
        <div class="mpi-tool-options-mask__section" id="auto-mode-slot"></div>
        <div class="mpi-tool-options-mask__thumbs" id="thumbs-slot"></div>
        <div class="mpi-tool-options-mask__row" id="detect-slot"></div>
        <div class="mpi-tool-options-mask__section" id="brush-slot"></div>
        <div class="mpi-tool-options-mask__row" id="shared-slot"></div>
      </div>
    `,
    setup: (el, props, emit) => { ... }
  })
  ```
  - `setup`: `viewer.el.enterMode('mask')`
  - Mount `MpiDropdown` into `#auto-model-slot` with detection models
    (`viewer.el.getDetectionModels?.() ?? DETECTION_MODELS_FALLBACK`)
  - Mount `MpiRadioGroup` into `#auto-mode-slot` for box/segment
  - Re-parent `MpiAutoMaskThumbs` via `viewer.el.getAutoMaskThumbs?.()` into `#thumbs-slot`
  - Mount Detect `MpiButton` into `#detect-slot` → calls `viewer.el.runAutoMaskDetect()`
  - Mount `MpiRadioGroup` into `#brush-slot` for brush/eraser (icons: `edit`, `eraser`)
    → on change calls `viewer.el.setMaskBrushMode(value)`
  - Mount invert `MpiButton` + clear `MpiButton` into `#shared-slot`
  - Collect all child `destroy` refs in `_children = []`
  - `el.destroy`: call `viewer.el.evaluateMask()`, then `viewer.el.exitMode()`,
    then `_children.forEach(c => c.destroy?.())`
  - No `emit('apply')` — mask is canvas-resident

### Step 4 — Register CSS in `preloadStyles.js`
- [x] Read `js/shell/preloadStyles.js`
- [x] Remove line: `'js/components/Organisms/MpiToolOptionsManualMask/MpiToolOptionsManualMask.css'`
- [x] Remove line: `'js/components/Organisms/MpiToolOptionsAutoMask/MpiToolOptionsAutoMask.css'`
- [x] Add line: `'js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css'`

### Step 5 — Update `types.js`
- [x] Read `js/components/types.js`
- [x] Remove `@typedef MpiToolOptionsManualMaskProps` block
- [x] Remove `@typedef MpiToolOptionsAutoMaskProps` block
- [x] Add `@typedef MpiToolOptionsMaskProps` block:
  ```
  @typedef {Object} MpiToolOptionsMaskProps
  @property {Object} viewer - MpiCanvasViewer instance
  Requires viewer.el: enterMode('mask'), exitMode(), evaluateMask(),
    setMaskBrushMode('brush'|'eraser'), clearMask(), invertMask(),
    getDetectionModels?(), setAutoMaskModel(), setAutoMaskUseBox(),
    runAutoMaskDetect(), getAutoMaskThumbs?(), compositeMaskDataURL()
  ```

### Step 6 — Flatten `mask` tool in `MpiHistoryTools`
- [x] Read `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`
- [x] In `IMAGE_TOOLS`, replace the grouped mask entry:
  ```js
  // BEFORE:
  {
      mode: 'mask',
      icon: 'mask',
      info: 'Mask',
      group: [
          { mode: 'maskManual', icon: 'edit',    label: 'Manual', info: 'Paint a mask by hand'        },
          { mode: 'maskAuto',   icon: 'sparkle', label: 'Auto',   info: 'Auto-detect objects to mask' },
      ],
  },
  // AFTER:
  { mode: 'mask', icon: 'mask', info: 'Mask' },
  ```
- [ ] Verify no other references to `maskManual` or `maskAuto` remain in this file

### Step 7 — Update `MpiGroupHistoryBlock`
- [x] Read `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`
- [x] Replace imports
- [x] Update `TOOL_OPTIONS_REGISTRY`
- [x] Update `_handleApply` guard
- [x] Search file for any remaining `maskManual` or `maskAuto` strings and remove/update them

### Step 8 — Delete old organism directories
- [x] Delete directory `js/components/Organisms/MpiToolOptionsAutoMask/` and all contents
- [x] Delete directory `js/components/Organisms/MpiToolOptionsManualMask/` and all contents

### Step 9 — Verify no dead imports remain
- [x] Grep entire `js/` tree for `MpiToolOptionsAutoMask` — 0 live code refs (comments updated)
- [x] Grep entire `js/` tree for `MpiToolOptionsManualMask` — 0 live code refs
- [x] Grep entire `js/` tree for `maskManual` and `maskAuto` — 0 live code refs (comments updated)

### Step 10 — Ask about gallery
- [ ] Ask user: should `MpiToolOptionsMask` be added to the component gallery
  (`js/pages/components.js`)?
