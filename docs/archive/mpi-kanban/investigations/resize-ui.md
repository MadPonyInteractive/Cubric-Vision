# Resize tool — UI/Tool surface findings

## 1. MpiHistoryTools tool list shape

**File:** `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js:41-89`

IMAGE_TOOLS structure:
```javascript
const IMAGE_TOOLS = [
    {
        mode: 'prompt',
        label: 'Prompt',
        group: [
            { mode: 'prompt', icon: 'chat', info: 'Prompt' },
        ],
    },
    {
        mode: 'transform',
        label: 'Transform',
        group: [
            { mode: 'crop', icon: 'crop', info: 'Crop' },
            // resize — not yet implemented; slot reserved
        ],
    },
    {
        mode: 'mask',
        label: 'Mask',
        group: [
            { mode: 'mask', icon: 'brush', info: 'Mask' },
        ],
    },
];

const VIDEO_TOOLS = [
    {
        mode: 'prompt',
        label: 'Prompt',
        group: [
            { mode: 'prompt', icon: 'chat', info: 'Prompt' },
        ],
    },
    {
        mode: 'transform',
        label: 'Transform',
        group: [
            { mode: 'crop', icon: 'crop', info: 'Crop' },
        ],
    },
    {
        mode: 'enhance',
        label: 'Enhance',
        group: [
            { mode: 'videoUpscale', icon: 'upscaler', info: 'Upscale' },
            { mode: 'interpolate', icon: 'interpolate_stroke', info: 'Interpolate' },
        ],
    },
];
```

**Slot for resize:** Add `{ mode: 'resize', icon: 'resize', info: 'Resize' }` to the `transform` group in BOTH IMAGE_TOOLS (line 53) and VIDEO_TOOLS (line 79).

## 2. MpiToolOptionsCrop as parallel

**File:** `js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.js`

**Props shape (line 14-16):**
```javascript
@param {object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
@param {'image'|'video'} kind - Determines which viewer API to call
```

**Emit shape (line 18):**
```javascript
'apply' { kind: 'image' | 'video-save' | 'video-snapshot' }
```

**Mount lifecycle:**
- Setup enters viewer mode: `viewer.el.enterCropMode?.()` (video) or `viewer.el.enterMode?.('crop')` (image) — line 100-101
- Destroy exits viewer mode: `viewer.el.exitCropMode?.()` (video) or `viewer.el.exitMode?.()` (image) — line 207-208
- Local state: `_family`, `_orientation`, `_label` — line 90-92

**Key viewer API calls:**
- `viewer.el.setCropRatio(ratio)` — line 104, 161
- `viewer.el.setOrientation(value)` — never called; crop uses only setCropRatio
- **No equivalent: `runCrop` / `getCropRect` called from mediator, not from options compound**

**Block-side wiring (MpiGroupHistoryBlock.js:255-259):**
```javascript
if (mode === 'crop') {
    if (payload.kind === 'image')            return viewer.el.runCrop?.();
    if (payload.kind === 'video-snapshot')   return _handleCropSnapshot();
    if (payload.kind === 'video-save')       return _handleCropSaveVideo();
    return;
}
```

Template has three action slots (line 76-81):
- `#family-slot` — MpiDropdown
- `#orient-slot` — MpiRadioGroup (sdxl/flux only)
- `#ratios-slot` — MpiRadioGroup (icon-only)
- `#actions-slot` — MpiButton(s)

## 3. Right-top slot mount path

**File:** `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:207-248`

**Mediator function:**
```javascript
async function mountOptions(mode) {
    _options?.destroy?.();
    _options = null;

    const slot = qs('#right-top-slot', el);
    if (slot) slot.innerHTML = '';

    el.classList.toggle('mpi-group-history-block--prompt-active', mode === 'prompt');

    if (mode === 'prompt') {
        if (!isVideo) await viewer.el.swapToPreview?.();
        if (!_pb?.el) _mountPromptBoxIfNeeded();
        if (_hasPromptOps()) _pb?.el?.show();
        return;
    }

    if (!isVideo) await viewer.el.swapToCanvas?.();

    _pb?.el?.hide();
    if (!mode) return;

    const Compound = TOOL_OPTIONS_REGISTRY[mode];
    if (!Compound || !slot) return;

    _options = Compound.mount(slot, { viewer, kind: modeKind });
    _options.on?.('apply', (payload) => _handleApply(mode, payload));
}
```

**TOOL_OPTIONS_REGISTRY (line 54-59):**
```javascript
const TOOL_OPTIONS_REGISTRY = {
    crop:         MpiToolOptionsCrop,
    mask:         MpiToolOptionsMask,
    videoUpscale: MpiToolOptionsUpscale,
    interpolate:  MpiToolOptionsInterpolate,
};
```

**Add to registry:** `resize: MpiToolOptionsResize,`

**historyTools listener (line 279-283):**
```javascript
historyTools.on('activate', ({ mode }) => {
    if (_currentSelectionIndices.length > 0) historyList.el.exitSelectMode();
    mountOptions(mode);
    if (!isVideo) viewer.el.setActiveToolLabel?.(TOOL_LABELS[mode] ?? mode);
});
```

**TOOL_LABELS (line 274-277):** Add `resize: 'Resize',` to the object.

## 4. MpiCanvas API surface (crop parallel)

**File:** `js/components/Primitives/MpiCanvas/MpiCanvas.js`

**Mode entry/exit:**
- `canvas.el.activeMode = 'crop'` (setter, line 195-205)
- `canvas.el.isCroppingMode` getter/setter (line 227-228)
- `canvas.el.enterMode?.('crop')` — **does NOT exist; use `activeMode` setter instead**

**Crop API methods:**
- `setCropRatio(ratio)` — line 922
- `getCropRect()` — line 923
- `runCrop()` — **does NOT exist on MpiCanvas; it's on MpiCanvasViewer wrapper**

**Emitted events:**
- `'modechange' { mode: string }` — line 59

**For resize, the parallel would be:**
- Enter: `canvas.el.activeMode = 'resize'` (new mode)
- Exit: `canvas.el.activeMode = 'none'`
- API: TBD for resize (preview injection vs crop rect)
- Event: `'modechange' { mode: 'resize' }` fires automatically

## 5. Available primitives

**MpiInput — number variant:**
- File: `js/components/Primitives/MpiInput/MpiInput.js:1-150+`
- Number mode: type='number' uses `inputmode="decimal"` on hidden text input (line 43-44)
- Props: `{ type: 'number', value, min, max, step, decimals, label, placeholder, size, disabled, error, info }`
- Emits: `'change' { value: string }` (handled internally on blur)
- Usage for resize W/H: `MpiInput.mount(slot, { type: 'number', value: 1024, step: 1, min: 1, label: 'Width' })`

**MpiDropdown — select variant:**
- File: `js/components/Primitives/MpiDropdown/MpiDropdown.js`
- Props: `{ options: [{label, value, disabled?}], value, info }`
- Emits: `'change' { value }`
- Usage for keep_proportion/upscale_method: `MpiDropdown.mount(slot, { options: [...], value: 'crop' })`

**MpiRadioGroup — icon-only and text variants:**
- File: `js/components/Primitives/MpiRadioGroup/MpiRadioGroup.js`
- Props: `{ options: [{label, value, icon?, info?}], value, name, iconOnly: bool }`
- Emits: `'select' { value }`
- Usage for flip/rotation: `MpiRadioGroup.mount(slot, { options: [...], value: 'none', iconOnly: true })`

**MpiButton:**
- File: `js/components/Primitives/MpiButton/MpiButton.js`
- Props: `{ label, icon, variant: 'primary'|'secondary'|'ghost', size: 'sm'|'md', disabled, info }`
- Emits: `'click'`
- Usage for Apply: `MpiButton.mount(slot, { label: 'Apply', icon: 'check', variant: 'primary', size: 'sm' })`

**MpiOptionSelector — buttons variant:**
- File: `js/components/Compounds/MpiOptionSelector/MpiOptionSelector.js:180-210`
- Props: `{ variant: 'buttons', buttons: [{icon, label?, value}], triggerIcon, showPopup }`
- Emits: `'select' { value }`
- NOT suitable for resize (designed for small icon button grids with trigger popup)

**MpiColorPicker:**
- **DOES NOT EXIST YET** — must be created as a new Primitive

## 6. Icon registry

**File:** `js/utils/icons.js:1-98`

**How to register:**
- Add entry to `ICONS` object: `'resize': '<path d="..."/>'`
- Use Material Design 24x24 grid
- No existing 'resize', 'expand', 'scale', or 'transform' glyphs
- **Closest candidate:** `'upscaler'` (arrows pointing up) — line 58, but semantically wrong
- **Recommendation:** Create a new resize icon (double arrow in opposite directions, or scale icon)

## 7. Stage tokens to use

**File:** `styles/01_base.css:44-94`

**Surface palette:**
- `--surface-0`: outermost chrome
- `--surface-1`: panels (use for options container)
- `--surface-2`: raised, inputs (use for input backgrounds)
- `--surface-3`: hover
- `--surface-bar`: status, quiet zones
- `--surface-canvas`: editor canvas (use for canvas grid lines)

**Ink palette:**
- `--ink-1`: primary text
- `--ink-2`: secondary
- `--ink-3`: labels, kickers
- `--ink-4`: muted

**Accents:**
- `--accent-heat`: pink-magenta (primary actions)
- `--accent-frost`: cyan (focus rings)
- `--accent-ok`: success/ready
- `--accent-warn`: warning

**Spacing:**
- `--s-1`: 4px, `--s-2`: 8px, `--s-3`: 14px, `--s-4`: 22px, `--s-5`: 32px

**Radius:**
- `--r-1`: 0px (Stage baseline: angular)
- `--r-2`: 4px (small affordances)
- `--r-3`: 12px (large containers)

**Type scale:**
- `--t-sm`: 13px (labels, compact)
- `--t-md`: 15px (body)

## 8. preloadStyles registration

**File:** `js/shell/preloadStyles.js:6-74`

**Pattern:**
```javascript
// Line 64-67: Organisms section
'js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.css',
'js/components/Organisms/MpiToolOptionsMask/MpiToolOptionsMask.css',
'js/components/Organisms/MpiToolOptionsUpscale/MpiToolOptionsUpscale.css',
'js/components/Organisms/MpiToolOptionsInterpolate/MpiToolOptionsInterpolate.css',
```

**For MpiToolOptionsResize:** Add after MpiToolOptionsInterpolate (line 67):
```javascript
'js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.css',
```

**For MpiColorPicker (if Primitive):** Add in Primitives section after line 27:
```javascript
'js/components/Primitives/MpiColorPicker/MpiColorPicker.css',
```

## 9. types.js documentation pattern

**File:** `js/components/types.js:52-80`

**Pattern:**
```javascript
/**
 * @typedef {Object} MpiToolOptionsCropProps
 * @property {Object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @property {'image'|'video'} kind
 *
 * Emits: 'apply' { kind: 'image' | 'video-save' | 'video-snapshot' }
 */
```

**For MpiToolOptionsResize, add after line 80:**
```javascript
/**
 * @typedef {Object} MpiToolOptionsResizeProps
 * @property {Object} viewer - MpiCanvasViewer OR MpiVideoViewer instance
 * @property {'image'|'video'} kind
 *
 * Emits: 'apply' { kind: 'image' | 'video-save' }
 */

/**
 * @typedef {Object} MpiColorPickerProps
 * @property {string} [value='#ffffff'] - Hex color (6-digit)
 * @property {(r: number, g: number, b: number) => void} [onChange] - RGB int callback
 * @property {string} [label=''] - Field label
 * @property {boolean} [disabled=false]
 * @property {string} [info=''] - Tooltip
 *
 * Instance methods:
 *   getRGB()  — returns { r, g, b } as ints 0-255
 *   setRGB(r, g, b)  — set color from RGB ints
 *   setHex(hex)  — set color from 6-digit hex string
 *
 * Emits: 'change' { hex: string, r: number, g: number, b: number }
 */
```

## Key files for this phase

### UI/Tool structure files
- `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js` — add resize to IMAGE_TOOLS/VIDEO_TOOLS transform group
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` — register MpiToolOptionsResize in TOOL_OPTIONS_REGISTRY + TOOL_LABELS

### Viewer wiring files
- `js/components/Primitives/MpiCanvas/MpiCanvas.js` — add activeMode 'resize' (existing pattern applies)
- `js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js` — add resize-specific viewer wrappers (TBD in phase 2)
- `js/components/Organisms/MpiVideoViewer/MpiVideoViewer.js` — add resize-specific video wrappers (TBD in phase 4)

### Primitives & utilities files
- `js/utils/icons.js` — add 'resize' icon entry
- `js/components/Primitives/MpiInput/MpiInput.js` — already exists; use number variant
- `js/components/Primitives/MpiDropdown/MpiDropdown.js` — already exists
- `js/components/Primitives/MpiRadioGroup/MpiRadioGroup.js` — already exists
- `js/components/Primitives/MpiButton/MpiButton.js` — already exists
- `js/components/Primitives/MpiColorPicker/` — **CREATE NEW** (Primitive)

### Config & documentation files
- `js/shell/preloadStyles.js` — register MpiToolOptionsResize.css + MpiColorPicker.css
- `js/components/types.js` — document MpiToolOptionsResizeProps + MpiColorPickerProps
- `styles/01_base.css` — use existing OKLCH tokens; no new vars needed
