```xml
<original_task>
Fix two mask-related bugs in groupHistory.js:
1. Mask not being sent to ComfyUI correctly — the painted mask was not reaching the workflow.
2. Mask visual feedback disappearing when a different history entry is selected.
</original_task>

<work_completed>

## Bug 1: Mask not sent to ComfyUI

### Root cause chain (multi-step investigation)

**Step 1 — Missing param in commandExecutor.js**
`_buildParams()` in `js/services/commandExecutor.js` was building the params map for
ComfyUI injection but never included the mask. `maskDataUrl` was passed to `runCommand()`
from groupHistory.js but silently dropped.

Fix: Added to `_buildParams()` (line ~88):
```js
if (payload.maskDataUrl) params['Input_Mask'] = payload.maskDataUrl;
```
`comfyController.runWorkflow` already handled `Input_Mask` in its `assetMap` — uploads as
`mpi_input_mask.png` and injects filename into the node titled `Input_Mask`. One-line fix.

**Step 2 — Mask canvas GPU corruption (Chromium premultiplied alpha bug)**
After fixing the param, the mask was uploading but arriving as a uniform grey/white image
with no visible strokes. Debug logging revealed:
- `paint()` correctly writes `[255,255,255,255]` to the mask canvas immediately after each stroke
- But `getURL()` reads those same pixels back as `[255,255,255,26]` — alpha dropped from 255 to ~26

Cause: Chromium's hardware-accelerated canvas GPU backend corrupts offscreen canvas pixel
data when that canvas is used as a `drawImage()` source on another canvas. In `_CanvasCore.draw()`,
`this.ctx.drawImage(this.mask.maskCanvas, 0, 0)` renders the mask canvas onto the display canvas
at `globalAlpha = 0.7`. Chromium's GPU compositor then wrote the composited alpha back into the
SOURCE canvas (`maskCanvas`), corrupting subsequent `getImageData()` reads.

Fix: `js/components/Primitives/MpiCanvas/managers/MaskManager.js` — constructor line:
```js
// Before:
this.maskCtx = this.maskCanvas.getContext('2d');
// After:
this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
```
`willReadFrequently: true` forces the context into software rendering mode, bypassing the
GPU entirely and preventing the readback corruption.

**Step 3 — `getURL()` source-in composite unreliable**
The original `getURL(bg, fg)` used `globalCompositeOperation = 'source-in'` to recolor the
mask canvas pixels. This proved unreliable in practice (produced grey instead of clean black/white),
likely due to interaction with the GPU corruption above or browser-specific composite behavior.

Fix: Replaced the entire `getURL()` method with a direct pixel-mapping approach using
`getImageData` / `putImageData`. For each pixel: if alpha > 0 → write fg color at full opacity;
else → write bg color at full opacity. No compositing, no ambiguity.

**Step 4 — Mask color convention (inverted)**
After the above fixes the mask was uploading with visible strokes, but ComfyUI was detailing
the WRONG area (the area the user did NOT paint). Confirmed by inspecting the uploaded mask PNG.

The ComfyUI workflow (`sdxl_detailer.json` node `1555`, `Input_Mask` LoadImage) feeds into
`MaskDetailerPipe` which processes **white areas**. Our initial call `getMaskDataURL('black', 'white')`
produced white where the user painted — should have worked. Then we tried `('white', 'black')` —
also wrong in a different way. Finally confirmed directly in the ComfyUI workflow UI: the mask
needs **white = painted (processed area), black = background**. The user paints white strokes on
the mask canvas, so `getMaskDataURL('black', 'white')` is correct.

Current call in groupHistory.js line ~557:
```js
// ComfyUI convention: white = masked (processed), black = background
const maskDataUrl = _hasMask ? _canvas.getMaskDataURL('black', 'white') : null;
```

## Bug 2: Mask visual disappears on history entry switch

`_selectEntry()` previously called `_canvas.clearMask()` before loading the new entry,
discarding any painted mask with no way to recover it.

Fix: Added `_maskStore` (a `Map<index, dataURL>`) to `groupHistory.js`:
- Before switching away: if `_hasMask`, save current mask as data URL keyed by `_selectedIdx`
- After loading new entry's image: restore saved mask for the new index if one exists
- On delete: remove the deleted index's entry from `_maskStore`
- On generation complete: `_maskStore.clear()` (all masks stale after new entry added)

Key detail: the restore happens in a `.then()` after `_showEntry()` because `loadImage()` calls
`mask.init(w, h)` which clears the canvas — must restore AFTER the image load completes.

## Files modified

| File | Change |
|------|--------|
| `js/services/commandExecutor.js` | Added `Input_Mask` to `_buildParams()` |
| `js/components/Primitives/MpiCanvas/managers/MaskManager.js` | `willReadFrequently: true` on maskCtx; rewrote `getURL()` to use pixel mapping |
| `js/workspaces/groupHistory/groupHistory.js` | Added `_maskStore` Map; rewrote `_selectEntry()` to save/restore masks; mask cleared on delete and generation complete |
| `whats-next.md` | Updated mask convention docs |
| `MaskManager_OLD.js` | Deleted (was a temp reference copy) |

</work_completed>

<work_remaining>

## 1. modelRegistry.js — runtime installed check

`installed: false` hardcoded in all model definitions. Server needs to check disk and return status.

---

## 2. groupHistory — video group support

Deferred — no ComfyUI workflow for video yet, and the video player component is being
refactored into three separate pieces (preview, controls, selection) before this is tackled.

- `_showEntry()` calls `_canvas.loadImage()` which fails silently for `.mp4` items
- Detect `item.type === 'video'` and swap `canvasWrap` (hide) for new video preview component (show)
- Reverse swap for image items
- `_showCompare` for video groups: skip or handle separately

---

## Deferred / Low priority

- `state.js` legacy flat properties (`g_currentGuide`, `g_promptEN`, `g_images`, etc.) — remove when old workspace references confirmed gone
- `PAGE_WORKSPACE` deprecated alias in `router.js` — remove when confirmed unused
- `MpiSelectionBar` — not yet in `js/pages/components.js` dev gallery

</work_remaining>

<attempted_approaches>

## `getURL()` source-in composite approach
Original code used `globalCompositeOperation = 'source-in'` to recolor mask pixels.
Produced uniform grey output instead of clean black/white mask. Root cause was the GPU
corruption making the source canvas data unreliable before we found `willReadFrequently`.
Replaced with direct `getImageData` pixel mapping — reliable regardless of GPU state.

## `_parseColor()` CSS helper in getURL
Tried parsing `'white'`/`'black'` CSS strings via a 1×1 canvas fill + readback to get RGB
components. This was overly complex and potentially affected by the same GPU readback issues.
Replaced with a simple hardcoded check: `bg === 'white'` → `[255,255,255]`, else `[0,0,0]`.

## Mask color convention iterations
Went through three iterations on the bg/fg arguments:
1. `('black', 'white')` — initial guess, wrong (white on black, ComfyUI processed wrong area)
2. `('white', 'black')` — tried after researching ComfyUI conventions, still wrong
3. Back to `('black', 'white')` — confirmed correct by directly testing in the ComfyUI workflow UI

The confusion: the actual bug masking (pun intended) the convention issue was the GPU corruption
making the mask all-uniform regardless of arguments. Once that was fixed, convention could be
tested empirically.

## Debug logging added and removed
Several rounds of debug logs were added to `MaskManager.js` (`paint()`, `getURL()`) and removed
once the root cause was found. No debug logs remain in production code.

</attempted_approaches>

<critical_context>

## Chromium GPU canvas corruption — willReadFrequently

**This is the most important discovery of this session.**

When an offscreen canvas (not in the DOM) is used as a `drawImage()` source on another
hardware-accelerated canvas, Chromium's GPU compositor can corrupt the source canvas's
internal pixel buffer. Subsequent `getImageData()` reads return wrong values — specifically
alpha channels get multiplied down (observed: painted pixels at alpha=255 read back as alpha=26-30).

**Fix**: Always create off-screen canvases that will be read via `getImageData` with:
```js
ctx = canvas.getContext('2d', { willReadFrequently: true });
```
This forces software rendering for that context, preventing GPU corruption.

**Applies to**: Any canvas used both as a `drawImage` source AND read via `getImageData`.
`MaskManager.maskCanvas` is the current case. If similar patterns appear elsewhere, apply
the same fix.

## ComfyUI mask convention

Confirmed directly in the workflow UI: `MaskDetailerPipe` processes **white areas**.
- White pixel = area to be detailed/inpainted
- Black pixel = background, untouched

Call: `canvas.getMaskDataURL('black', 'white')` → black background, white strokes where user painted.

The `Input_Mask` node in `sdxl_detailer.json` is node `1555` (LoadImage, titled `Input_Mask`).
Its output port `[1]` (MASK) feeds into the `auto mask` if/else (node `1594`), which routes to
`MaskDetailerPipe` when `Auto_Mask` boolean is false (default).

## Mask canvas vs display canvas — separate lifetimes

`MaskManager.maskCanvas` is an offscreen canvas sized to the image dimensions (e.g. 1742×980).
The display canvas (`_CanvasCore.canvas`) is sized to the container (viewport size).
They are completely separate. `draw()` reads FROM maskCanvas (via `drawImage`) onto the display
canvas — it never writes back to maskCanvas. The GPU corruption was a Chromium-specific exception
to this rule.

## _maskStore save/restore timing

`_selectEntry()` saves the mask BEFORE calling `_showEntry()`. Restore happens in `.then()`
AFTER `_showEntry()` resolves, because `loadImage()` → `mask.init(w, h)` clears the canvas.
Order must be preserved: save → load image → restore.

## ComfyUI mapping rules

See `.agents/workflows/comfyui_mapping_rules.md`. Key points:
- Never use hardcoded node IDs — always match by `_meta.title`
- `Input_Image` → uploads as `mpi_input_image.png`, injects filename into `inputs.image`
- `Input_Mask` → uploads as `mpi_input_mask.png`, injects filename into `inputs.image` (LoadImage node)
- `Output` (case-insensitive) → the only node whose images are captured as results
- `Seed` → `inputs.int` on MpiInt node

## MpiCanvas API

```js
const inst = MpiCanvas.mount(wrapperEl, {
    onBrushSizeChange: (size) => {},
    onBrushTypeChange: (type) => {},  // 'brush' | 'eraser' — fired by B/E hotkeys
});
const canvas = inst.el;

canvas.activeMode = 'crop' | 'mask' | 'compare' | 'none';  // mutual exclusion built-in
inst.on('modechange', ({ mode }) => {});

await canvas.loadImage(url);            // resets mode to 'none', clears mask canvas via init()
await canvas.loadComparisonImage(url);  // sets mode to 'compare'
canvas.clearMask();
canvas.flipMaskColor();
canvas.getMaskDataURL('black', 'white'); // ComfyUI convention: white=masked, black=background
canvas.setMaskDataURL(dataUrl);         // async — restores mask from saved data URL
canvas.setCropRatio(ratio);
canvas.getCropRect();
canvas.destroy();
```

## MpiHistoryTools API

```js
const tools = MpiHistoryTools.mount(leftBarEl, {
    tools: [
        { mode: 'crop', icon: 'crop',   info: '...' },
        { mode: 'mask', icon: 'pencil', info: '...' },
    ]
});
tools.on('activate',   ({ mode }) => {});
tools.on('deactivate', ({ mode }) => {});
tools.el.syncMode(mode);  // called from modechange — updates buttons without emitting
```

## MpiToolActionBar API

```js
const bar = MpiToolActionBar.mount(mountEl, {
    leftSlot: someComponentInstance,  // optional — embedded on left side
    actions: [
        { key: 'brush', icon: 'pencil', label: 'Brush', variant: 'ghost',
          toggleable: true, active: true, radioGroup: 'tool', info: '...' },
        { key: 'apply', icon: 'check',  label: 'Apply', variant: 'primary' },
    ],
});
bar.el.show();
bar.el.hide();
bar.el.setActive('brush');   // syncs radio group, no event emitted
bar.on('action', ({ key, active }) => {});
```

## MpiSelectionBar API

```js
const sel = MpiSelectionBar.mount(mountEl, { count: 0 });
// mountEl should use gh-workspace__bottom + gh-workspace__bottom--hidden classes for positioning/visibility
sel.el.setCount(n);   // updates count label; auto shows/hides compare (=== 2) and delete/download (> 0)
sel.on('compare',  () => {});
sel.on('delete',   () => {});
sel.on('cancel',   () => {});
```

## groupHistory mode exclusivity rules

All three bottom-bar modes are mutually exclusive. Source of truth is `_canvas.activeMode` for tool modes;
`_selectMode` boolean for selection. The `modechange` event drives all toolbar show/hide.

- Entering select mode: calls `_exitCropMode()` / `_exitMaskMode()` BEFORE setting `_selectMode = true`
  (so the modechange('none') they fire doesn't accidentally exit select mode)
- Entering crop/mask: fires `modechange` → handler exits select mode (`_selectMode && !_comparingActive`)
- Compare within select mode: `_comparingActive` flag suppresses select mode exit during `_showCompare()`
- Exiting select mode: resets canvas to 'none' if compare was active (`_showEntry` handles this)

## groupHistory mount pattern for bottom bars

ComponentFactory.mount() does `container.innerHTML = html` — mounting two components
into the same container destroys the first. Each bar needs its own slot div:

```js
const _cropBarSlot = ce('div', { className: 'gh-bar-slot' });
cropBar.appendChild(_cropBarSlot);
const cropActionBar = MpiToolActionBar.mount(_cropBarSlot, { ... });

const _maskBarSlot = ce('div', { className: 'gh-bar-slot' });
cropBar.appendChild(_maskBarSlot);
const maskActionBar = MpiToolActionBar.mount(_maskBarSlot, { ... });

// MpiSelectionBar has no fixed positioning of its own — give it a bottom-bar wrapper:
const _selBarSlot = ce('div', { className: 'gh-workspace__bottom gh-workspace__bottom--hidden' });
cropBar.appendChild(_selBarSlot);
const selectionBar = MpiSelectionBar.mount(_selBarSlot, { count: 0 });
```

## groupHistory mask flow (current)

- `_hasMask` (bool) — true after user presses "Apply Mask"; controls `hasMask` in `_opOptions` context
- `_maskStore` (Map) — saves mask data URLs per history index; survives entry switches
- `_refreshOpOptions()` — re-evaluates available ops and updates dropdown; call whenever `_hasMask` changes
- On generate: `maskDataUrl = _hasMask ? _canvas.getMaskDataURL('black', 'white') : null` passed to `runCommand`
- Mask cleared on: generation complete (`onComplete`) — `_maskStore.clear()`, `_canvas.clearMask()`, `_hasMask = false`
- Mask SAVED on: `_selectEntry()` before switching if `_hasMask` is true
- Mask RESTORED on: `_selectEntry()` after `_showEntry()` resolves if `_maskStore.get(idx)` exists
- `_hasMask` reset to `false` on: mask bar "Cancel", mask bar "Clear", entry switch to entry with no saved mask

## Architecture Rules

- **Tier 1 Primitives**: Cannot import anything from components
- **Tier 2 Compounds**: Can only import Primitives (+ data/, utils/, events.js, state.js)
- **Tier 3 Blocks**: Can import Primitives + Compounds
- Workspaces (gallery.js, groupHistory.js): NOT components — plain `mount()` functions, CAN import anything

## Key file locations

- MpiCanvas: `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- MpiCanvas managers: `js/components/Primitives/MpiCanvas/managers/`
- MaskManager: `js/components/Primitives/MpiCanvas/managers/MaskManager.js`
- MpiHistoryTools: `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`
- MpiToolActionBar: `js/components/Compounds/MpiToolActionBar/MpiToolActionBar.js`
- MpiSelectionBar: `js/components/Compounds/MpiSelectionBar/MpiSelectionBar.js`
- groupHistory workspace: `js/workspaces/groupHistory/groupHistory.js`
- groupHistory CSS: `js/workspaces/groupHistory/groupHistory.css`
- Gallery workspace: `js/workspaces/gallery/gallery.js`
- commandExecutor: `js/services/commandExecutor.js`
- comfyController: `js/services/comfyController.js`
- ComfyUI workflows: `comfy_workflows/` (e.g. `sdxl_detailer.json`)
- ComfyUI mapping rules: `.agents/workflows/comfyui_mapping_rules.md`
- Component type definitions: `js/components/types.js`
- Event bus: `js/events.js`
- App state: `js/state.js`
- Router: `js/router.js`

## #tool-container class — MUST NOT be wiped

`#tool-container` has `class="tool-container"` hardcoded in index.html.
When groupHistory mounts, it ADDS `gh-workspace`. When leaving, ONLY `classList.remove('gh-workspace')`.
NEVER use `element.className = ''` on this element.

## MpiCanvas destroy rule

InputController attaches listeners to `window`. MUST call `canvas.destroy()` when unmounted.
groupHistory.js: MutationObserver on `document.body` watches for container leaving DOM →
calls `_canvas.destroy()` and `Events.off('workspace:set-operation', _onSetOp)`.

</critical_context>

<current_state>

## Deliverable Status

| Item | Status |
|------|--------|
| MpiCanvas Primitive (activeMode mutual exclusion) | Complete |
| MpiHistoryTools Compound | Complete |
| MpiToolActionBar Compound | Complete |
| groupHistory — crop tool | Complete |
| groupHistory — mask tool | Complete |
| groupHistory — modechange wiring | Complete |
| MpiCompareOverlay / gallery compare | Complete |
| gallery.js workspace | Complete |
| commandExecutor.js | Complete |
| groupHistory — selection mode + MpiSelectionBar | Complete |
| groupHistory — mask sent to ComfyUI correctly | Complete |
| groupHistory — mask visual persists across entry switches | Complete |
| groupHistory — `_hasMask` tracks first paint stroke | Scrapped — current behaviour (Apply as trigger) is correct |
| gallery.js onComplete — use _persistGroups() | **Complete (this session)** |
| gallery.js — download handler | **Complete (this session) — downloads selected item per group** |
| MpiGroupCard selected state — footer highlight | **Complete (this session)** |
| MpiGroupCard display name (card label shows selected entry operation) | **Complete (this session)** |
| groupHistory — history entry label shows sequenced filename | **Complete (this session)** |
| groupHistory — video group support | Deferred — no workflow yet; video player component being refactored |
| modelRegistry.js — runtime installed check | Not started |

## What's finalized

All items from the previous session remain solid. This session closed out the remaining
gallery/groupHistory polish: download handler, persist cleanup, card selection styling,
and history entry label consistency (crop_001, upscale_001, etc.).

## Open questions

None.

</current_state>
```
