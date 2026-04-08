```xml
<original_task>
Fix a bug where the crop tool and compare tool in the groupHistory workspace could be active
simultaneously on the InteractiveCanvas (now MpiCanvas), since the canvas had no mutual exclusion
between its modes. The broader goal was to build a scalable, robust system — not a temporary patch.
</original_task>

<work_completed>

## 1 — activeMode mutual exclusion on the canvas

Added `_activeMode: 'none' | 'mask' | 'crop' | 'compare'` as the single source of truth to
the canvas engine. The `activeMode` setter atomically sets the correct manager flag to `true` and
all others to `false`, then calls `input.updateCursor()` and `draw()`.

All three legacy boolean setters (`isMaskingMode`, `isCroppingMode`, `isComparisonMode`) were
converted to shims that delegate to `activeMode`, so all existing call sites continue to work
without changes.

`loadImage()`, `clearImage()`, and `loadComparisonImage()` were also updated to set `_activeMode`
directly (bypassing the setter to avoid duplicate redraws) when they internally reset manager flags.

---

## 2 — InteractiveCanvas promoted to MpiCanvas Primitive

Architectural decision: the raw `InteractiveCanvas` class was a "rogue" — not part of the
ComponentFactory system. It was promoted to a proper Tier 1 Primitive (`MpiCanvas`) so that:
- Compounds (`MpiCompareOverlay`) and Blocks can import it via the standard `.mount()` pattern
- It participates in the event system (`emit('modechange', { mode })`)
- Future agents know it is a first-class component with a typedef in `types.js`

### Files created
- `js/components/Primitives/MpiCanvas/MpiCanvas.js`
  The factory-wrapped Primitive. Contains `_CanvasCore` class (private, not exported) — the
  full canvas engine. `ComponentFactory.create()` shell wraps it: `template` returns a single
  `<div class="mpi-canvas">`, `setup` instantiates `_CanvasCore` and proxies all properties and
  methods onto `el` so callers use `canvas.el.loadImage()` etc. directly.
  Emits `'modechange' { mode }` whenever `activeMode` changes.

- `js/components/Primitives/MpiCanvas/managers/ViewManager.js`
- `js/components/Primitives/MpiCanvas/managers/MaskManager.js`
- `js/components/Primitives/MpiCanvas/managers/ComparisonManager.js`
- `js/components/Primitives/MpiCanvas/managers/CropManager.js`
- `js/components/Primitives/MpiCanvas/managers/InputController.js`
  All moved from `js/components/interactiveCanvas/` with updated imports and comment references.

### Files deleted
- `js/components/interactiveCanvas.js` (replaced by MpiCanvas.js)
- `js/components/interactiveCanvas/` folder and all 5 files inside it

---

## 3 — MpiCompareOverlay updated to use MpiCanvas

File: `js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js`

- Import changed: `InteractiveCanvas` → `MpiCanvas`
- `_ensureCanvas()`: `new InteractiveCanvas(canvasWrap)` → `MpiCanvas.mount(canvasWrap)`
- `_canvas` now holds a component instance (`{ el, on, ... }`)
- All canvas API calls changed from `_canvas.loadImage()` → `_canvas.el.loadImage()`
- Destroy calls changed from `_canvas.destroy()` → `_canvas.el.destroy()`

---

## 4 — groupHistory.js updated to use MpiCanvas + modechange wiring

File: `js/workspaces/groupHistory/groupHistory.js`

- Import changed: `InteractiveCanvas` → `MpiCanvas`
- Instantiation changed: `new InteractiveCanvas(canvasWrap)` →
  `const _canvasInst = MpiCanvas.mount(canvasWrap); const _canvas = _canvasInst.el;`
  (`_canvas` still refers to the element directly, so all downstream `_canvas.*` calls are unchanged)
- Added `modechange` listener on `_canvasInst`:
  ```js
  _canvasInst.on('modechange', ({ mode }) => {
      // Sync crop toolbar state
      if (mode !== 'crop' && _isCropMode) {
          _isCropMode = false;
          bottom.classList.remove('gh-workspace__bottom--hidden');
          cropBar.classList.remove('gh-crop-bar--visible');
          cropBtn.el.setActive(false);
      }
      // Sync compare checkbox state
      if (mode !== 'compare' && _compareSet.size > 0) {
          _compareSet.clear();
          _applyCardStates();
      }
  });
  ```
  This is the mutual exclusion fix: when compare mode is entered (2 checkboxes ticked) while crop
  is active, `modechange` fires with `mode='compare'`, handler exits crop mode and resets toolbar.
  When crop button is pressed while compare is active, `modechange` fires with `mode='crop'`,
  handler clears `_compareSet` and calls `_applyCardStates()` to uncheck the checkbox UI.

---

## 5 — types.js updated

Added `MpiCanvasProps` typedef documenting activeMode values, all instance methods, and the
`modechange` event. Placed at the top of the typedef list.

---

## ⚠️ UNTESTED — None of these changes have been run in the browser or Electron.

Confidence is high due to the mechanical nature of the refactor (no logic changes, only import
paths and wrapping), but first test should verify:
1. groupHistory canvas loads images correctly
2. Crop tool activates and deactivates
3. Ticking 2 compare checkboxes while in crop mode: crop exits, compare activates
4. Pressing crop button while 2 checkboxes are ticked: compare exits (checkboxes clear), crop activates
5. MpiCompareOverlay still works in gallery compare flow

</work_completed>

<work_remaining>

## 0. ⚠️ TEST the MpiCanvas refactor (FIRST priority before any new work)

Verify the following in the browser/Electron before continuing:
1. groupHistory canvas loads images and pan/zoom works
2. Crop tool: activates, handles render, ratio bar works, apply/cancel works
3. Compare: tick 2 checkboxes → inline compare slider works
4. Mutual exclusion A: enter crop mode, then tick 2 compare boxes → crop exits, compare activates, cropBar hidden, cropBtn deactivated
5. Mutual exclusion B: tick 2 compare boxes, then press crop button → compare exits (_compareSet cleared, card checkboxes unchecked), crop activates
6. MpiCompareOverlay in gallery: select 2 cards, open compare → overlay with slider works

---

## 1. 🔴 MpiHistoryTools — Canvas tool toolbar component (TOP PRIORITY next session)

A new **Compound** (`js/components/Compounds/MpiHistoryTools/`) that replaces the ad-hoc
`cropBtn` approach in `groupHistory.js` with a proper radio-button toolbar.

### Why this is needed
Currently each toolbar button (crop, and future mask) is wired independently with `setActive(false)`
calls scattered in `groupHistory.js`. As more canvas tools are added this becomes fragile. The
`modechange` handler already provides the mutual exclusion signal — `MpiHistoryTools` should be
the UI component that consumes it.

### Design spec
- Tier 2 Compound (uses `MpiButton` Primitives)
- Accepts a list of tool definitions: `[{ mode: 'crop', icon: 'crop', info: '...' }, ...]`
- Renders `MpiButton` instances with `toggleable: true` in a vertical strip
- Enforces radio behavior internally: activating one button calls `setActive(false)` on all others
- Emits `'activate' { mode }` when a button is pressed (entering a mode)
- Emits `'deactivate' { mode }` when the active button is pressed again (toggling off)
- Exposes `el.syncMode(mode)` — called from `modechange` handler to update button states when
  mode changes from an external source (e.g. compare checkbox enters compare mode, deactivating crop)
  WITHOUT re-emitting `'activate'`/`'deactivate'`

### Integration in groupHistory.js
Replace the current `cropBtn` + manual `_enterCropMode`/`_exitCropMode` with:
```js
const historyTools = MpiHistoryTools.mount(leftBar, {
    tools: [
        { mode: 'crop', icon: 'crop', info: 'Crop image to social media ratio' },
        { mode: 'mask', icon: 'mask', info: 'Paint a mask for detail/inpainting' },
    ]
});
historyTools.on('activate',   ({ mode }) => { _canvas.activeMode = mode; ... });
historyTools.on('deactivate', ({ mode }) => { _canvas.activeMode = 'none'; ... });
_canvasInst.on('modechange',  ({ mode }) => { historyTools.el.syncMode(mode); });
```

---

## 2. groupHistory — mask tool

Depends on MpiHistoryTools (mask button). Mask UI wiring:

- MpiHistoryTools `activate` for `'mask'` → `_canvas.activeMode = 'mask'`
- Brush size slider in leftBar: appears when mask active, hides when inactive
- `_baseCtx` in `_opOptions()` must pass `hasMask: true` when mask has content:
  rebuild `_opOptions` and call `_opDropdown.el.setOptions()` when mask drawn
- On generate with mask: pass `maskDataUrl: _canvas.getMaskDataURL('black', 'white')` to `runCommand`
  (commandExecutor maps this to `Input_Mask` node title in the workflow)
- Clear mask on: card selection, generation complete, cancel

---

## 3. groupHistory — video group support

- `_showEntry()` always calls `_canvas.loadImage()` which fails silently for `.mp4` items
- Detect `item.type === 'video'` and swap `canvasWrap` (hide) for `MpiVideoPlayer` (show)
- Reverse swap for image items
- `_showCompare` for video groups: skip or handle separately

---

## 4. gallery.js — download handler

File: `js/workspaces/gallery/gallery.js` line ~76
Still a `console.log` stub. Needs:
- ZIP selected groups' media files (all history items' `filePath` values)
- Trigger browser download
- New server route `POST /project/download-groups` that zips and streams

---

## 5. MpiGroupCard display name not updating

Gallery media cards show a static name that does NOT update when `selectedIndex` changes
(after crop/generation adds a new entry). Thumbnail updates but label does not.
Fix in `MpiGroupCard` and/or `MpiGalleryGrid` to re-render label from
`group.history[group.selectedIndex].operation` on data refresh.

---

## 6. gallery.js onComplete — use _persistGroups()

File: `js/workspaces/gallery/gallery.js` lines ~321–328
Inline `fetch('/update-project', ...)` in `onComplete` should use `_persistGroups()`. Minor cleanup.

---

## 7. state.js legacy cleanup (deferred)

Legacy flat properties: `g_currentGuide`, `g_promptEN`, `g_images`, `toolComfySettings`,
`runningComfyTool`, `detailerInputImage` — dead, remove when old workspace references confirmed gone.

## 8. modelRegistry.js — runtime installed check

`installed: false` hardcoded in all model definitions. Server needs to check disk and return status.

## 9. MpiSelectionBar — add to dev gallery

Not yet in `js/pages/components.js`. Low priority.

## 10. PAGE_WORKSPACE deprecated alias

`router.js` still exports `PAGE_WORKSPACE = 'gallery'` — remove when confirmed unused.

</work_remaining>

<attempted_approaches>

## Temp-fix approach rejected (this session)
Initial instinct was to add cross-calls: "when crop activates, call `_compareSet.clear()`; when
compare activates, call `_exitCropMode()`". Rejected because with 3+ tools this becomes an O(n²)
web of cross-references. The `activeMode` enum + `modechange` event is the correct single-source-
of-truth approach.

## ToolManager module considered (this session)
Discussed a dedicated `ToolManager` module to sit between the canvas and toolbar. Rejected in
favour of: canvas owns `activeMode` (pure mode state), `MpiHistoryTools` Compound owns toolbar
radio UI, `modechange` event is the bridge. No additional manager class needed.

## ComponentFactory for MpiCanvas — template question
Considered whether `ComponentFactory.create()` was appropriate for a canvas (no static HTML).
Resolved: `template` returns a single wrapper `<div class="mpi-canvas">`, `setup` builds the
`<canvas>` element dynamically inside it via `_CanvasCore`. This is valid and consistent with
how other components build dynamic DOM in `setup`.

## _toolContainer.className = '' — WRONG approach (prior session)
Used in `navigation.js` to clear workspace-specific classes. Wiped the permanent `tool-container`
CSS class, breaking scroll, padding, and layout. Correct fix: `classList.remove('gh-workspace')`.

## Canvas dimming (prior session) — removed by user request
`gh-canvas-wrap--generating` opacity dimming was replaced with `MpiSpinner` overlay.

## MpiCompareOverlay for groupHistory (prior session) — removed by user design decision
Full-screen overlay compare replaced with inline InteractiveCanvas comparison slider.

</attempted_approaches>

<critical_context>

## MpiCanvas API (replaces InteractiveCanvas everywhere)

```js
// Mount
const inst = MpiCanvas.mount(wrapperEl, { onBrushSizeChange: (s) => {} });
const canvas = inst.el;   // all API calls go through inst.el

// Mode control (mutual exclusion built-in)
canvas.activeMode = 'crop';     // exits all other modes
canvas.activeMode = 'mask';     // exits crop/compare
canvas.activeMode = 'compare';  // exits crop/mask
canvas.activeMode = 'none';     // exits everything

// Legacy boolean setters still work (delegate to activeMode)
canvas.isCroppingMode = true;   // same as activeMode = 'crop'
canvas.isComparisonMode = false; // same as activeMode = 'none'

// Mode event
inst.on('modechange', ({ mode }) => { /* 'none'|'mask'|'crop'|'compare' */ });

// Image loading
await canvas.loadImage(url);           // resets mode to 'none', fires modechange
await canvas.loadComparisonImage(url); // sets mode to 'compare', fires modechange

// Cleanup
canvas.destroy(); // removes canvas, disconnects ResizeObserver, removes window listeners
```

## File locations updated this session
- **MpiCanvas**: `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- **Managers**: `js/components/Primitives/MpiCanvas/managers/` (5 files)
- Old paths `js/components/interactiveCanvas.js` and `js/components/interactiveCanvas/` are DELETED

## MpiCompareOverlay uses _canvas.el.*
`_canvas` in MpiCompareOverlay is now a component instance (not a raw class instance).
All canvas calls go through `_canvas.el.loadImage()`, `_canvas.el.destroy()` etc.

## groupHistory _canvas is still inst.el
In groupHistory.js: `_canvasInst = MpiCanvas.mount(...)`, `_canvas = _canvasInst.el`.
All existing `_canvas.*` calls (loadImage, isCroppingMode, destroy, etc.) work unchanged.
The `modechange` listener is on `_canvasInst` (not `_canvas`).

## modechange mutual exclusion — what it does
When `modechange` fires in groupHistory:
- `mode !== 'crop'` && `_isCropMode` → calls full crop exit: hides cropBar, removes
  `gh-workspace__bottom--hidden`, calls `cropBtn.el.setActive(false)`, sets `_isCropMode = false`
- `mode !== 'compare'` && `_compareSet.size > 0` → clears `_compareSet`, calls `_applyCardStates()`
  to visually uncheck card checkboxes

## Architecture Rules
- **Tier 1 Primitives**: Cannot import anything from components (MpiCanvas is Tier 1)
- **Tier 2 Compounds**: Can only import Primitives (+ data/, utils/, events.js, state.js)
- **Tier 3 Blocks**: Can import Primitives + Compounds
- Workspaces (gallery.js, groupHistory.js): NOT components — plain `mount()` functions, CAN import anything

## ComponentFactory pattern — critical gotcha
- `el = container.firstElementChild` — `el` IS the root DOM element
- NEVER do `el.querySelector('.same-class-as-root')` — searches descendants only, returns null
- `instance.on(event, cb)` pushes to an array — no deduplication. Register once at mount.

## #tool-container class — MUST NOT be wiped
`#tool-container` has `class="tool-container"` hardcoded in index.html.
`tool-container` CSS provides: `overflow-y: auto`, `padding: 58px 0 0 0`, `display: flex; flex-direction: column`.
When groupHistory mounts, it ADDS `gh-workspace`. When leaving, ONLY `classList.remove('gh-workspace')`.
NEVER use `element.className = ''` on this element.

## groupHistory workspace layout — tool-container dual-class
In groupHistory: `#tool-container` has both `tool-container` AND `gh-workspace` simultaneously.
`gh-workspace` `display:grid` overrides `tool-container` `display:flex`. Both coexist.

## MpiCanvas destroy rule
InputController attaches listeners to `window`. MUST call `canvas.destroy()` when unmounted.
groupHistory.js: MutationObserver on `document.body` watches for container leaving DOM →
calls `_canvas.destroy()` and `Events.off('workspace:set-operation', _onSetOp)`.

## groupHistory inline compare — current behaviour
- 0 checked: single entry view
- 1 checked: no canvas change (current view persists)
- 2 checked: `_showCompare(idxA, idxB)` → `activeMode = 'compare'` → inline slider
- Clicking a card: clears `_compareSet`, calls `_showEntry()` → `activeMode = 'none'`
- Generation: `onPreview` sets `isComparisonMode = false` → `activeMode = 'none'`

## groupHistory crop state
`_isCropMode` (boolean) mirrors `_canvas.isCroppingMode` for toolbar UI purposes.
`_enterCropMode()` sets both, shows cropBar, hides bottom PromptBox.
`_exitCropMode()` unsets both, hides cropBar, shows bottom PromptBox.
These functions are still the canonical way to enter/exit crop from the toolbar button.
The `modechange` handler calls them when mode changes externally.

## groupHistory input image injection
Current selected history entry is AUTO-INJECTED as `Input_Image` before `runCommand`:
```js
const resolvedMedia = (!hasDroppedImage && currentItem?.filePath)
    ? [{ url: _resolveUrl(currentItem.filePath), mediaType: 'image', source: 'history' }, ...mediaItems]
    : mediaItems;
```

## groupHistory PromptBox operation filtering
`_opOptions()` excludes `requiresImages === 0 && requiresVideo === 0` (t2i, t2v).
`_baseCtx` = `{ imageCount: 1, videoCount: 0 }` for image groups.
`detail` (requiresMask:true) shows as disabled until mask tool is wired — correct.

## MpiButton props.disabled is immutable after mount
Click handler checks `props.disabled` (initial value snapshot), not the DOM attribute.
For dynamic enable/disable: use wrapper div with opacity/pointer-events toggle.

## ComfyUI Mapping Rules
- Title-based injection ONLY — node IDs never hardcoded
- Key titles: `Positive`, `Negative`, `Seed`, `Input_Image`, `Input_Mask`, `Output`
- Only `Output` nodes fire `onComplete`

## filePath convention
`item.filePath` may be: raw disk path, `/project-file?path=C%3A...`, comfy view URL, blob URL.
`_resolveUrl()` in groupHistory handles all cases.

## MpiOverlay — Stash Pattern
MpiOverlay stashes `#tool-container` children in a hidden div rather than removing them.
MpiCompareOverlay inherits this. Used in gallery.js compare — NOT in groupHistory.

## Platform / Environment
- Electron 41.0.3 (Windows/Linux/macOS desktop; browser used for dev testing)
- `preventDefault` on range input wheel does NOT work in Electron
- Server port 3000; ComfyUI port 8188

## File Locations for Key Systems
- Event bus: `js/events.js`
- App state (Proxy): `js/state.js`
- Router: `js/router.js`
- Shell orchestrator: `js/shell.js`
- Navigation logic: `js/shell/navigation.js`
- Workspace layout CSS: `styles/shell/workspace.css`
- Main HTML: `index.html` (line 108: `<main id="tool-container" class="tool-container">`)
- ComfyUI WebSocket controller: `js/services/comfyController.js`
- Command executor: `js/services/commandExecutor.js`
- Model registry: `js/data/modelRegistry.js`
- Command registry: `js/data/commandRegistry.js`
- Project data model: `js/data/projectModel.js`
- Gallery workspace: `js/workspaces/gallery/gallery.js`
- GroupHistory workspace: `js/workspaces/groupHistory/groupHistory.js`
- GroupHistory CSS: `js/workspaces/groupHistory/groupHistory.css`
- **MpiCanvas (NEW)**: `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- **MpiCanvas managers (NEW)**: `js/components/Primitives/MpiCanvas/managers/`
- MpiGroupCard: `js/components/Compounds/MpiGroupCard/`
- MpiGalleryGrid: `js/components/Blocks/MpiGalleryGrid/`
- MpiCompareOverlay: `js/components/Compounds/MpiCompareOverlay/` (used in gallery.js only)
- MpiOkCancel: `js/components/Compounds/MpiOkCancel/`
- MpiSpinner: `js/components/Primitives/MpiSpinner/MpiSpinner.js`
- MpiVideoPlayer: `js/components/Blocks/MpiVideoPlayer/MpiVideoPlayer.js`
- Component type definitions: `js/components/types.js`
- Component architecture rules: `dev_docs/05_components.md`
- ComfyUI mapping rules: `.agents/workflows/comfyui_mapping_rules.md`

</critical_context>

<current_state>

## Deliverable Status

| Item | Status |
|------|--------|
| commandRegistry.js | Complete |
| modelRegistry.js | Complete (installed: false hardcoded) |
| projectModel.js | Complete |
| router.js new page constants | Complete |
| navigation.js — workspace class cleanup fix | Complete |
| MpiProjectName 2-level breadcrumb | Complete |
| MpiGroupCard component | Complete |
| MpiSelectionBar component | Complete (not yet in dev gallery) |
| MpiGalleryGrid component | Complete |
| MpiDropdown — disabled options + setOptions API | Complete |
| MpiPromptBox — media drop zone | Complete |
| MpiPromptBox — run/stop generate button | Complete |
| MpiButton | Complete |
| MpiErrorDialog — support hint | Complete |
| MpiCompareOverlay | Complete — updated to use MpiCanvas |
| gallery.js workspace | Complete (compare, persistence, delete, GC all wired) |
| commandExecutor.js | Complete |
| clientLogger.js | Complete |
| routes/projects.js POST /project/save-generation | Complete |
| MpiGroupCard spinner + generating state | Complete |
| gallery.js delete + GC handlers | Complete |
| groupHistory.js — PromptBox operation context | Complete |
| groupHistory.js — upscale input image injection | Complete |
| groupHistory.js — inline compare | Complete |
| groupHistory.js — spinner instead of canvas dim | Complete |
| groupHistory.js — header spacer | Complete |
| groupHistory — crop tool | Complete |
| **MpiCanvas Primitive (NEW)** | **⚠️ Code complete, UNTESTED** |
| **activeMode mutual exclusion (NEW)** | **⚠️ Code complete, UNTESTED** |
| **modechange wiring in groupHistory (NEW)** | **⚠️ Code complete, UNTESTED** |
| MpiHistoryTools Compound | Not started — TOP PRIORITY next session |
| groupHistory — mask tool | Not started (blocked on MpiHistoryTools) |
| groupHistory — video entries | Partial — MpiVideoPlayer swap not implemented |
| gallery.js download handler | Stub (console.log) |
| MpiGroupCard display name update | Not implemented |
| Model installed-check endpoint | Not started |
| MpiSelectionBar in dev gallery | Not done |
| state.js legacy cleanup | Deferred |
| PAGE_WORKSPACE alias removal | Deferred |

## Open Questions / Known Issues

1. **⚠️ MpiCanvas untested** — All changes this session are working-tree only, zero runtime
   verification. Must test before building on top (especially before MpiHistoryTools).

2. **groupHistory top spacing** — Needs visual confirmation. If `tool-container` 58px padding
   still isn't enough, increase `grid-template-rows` first row from `0px` to `8px`–`10px`.

3. **groupHistory video entries** — `_canvas.loadImage()` fails silently for `.mp4`. No crash
   but video won't display. MpiVideoPlayer swap not yet implemented.

4. **detail operation gating** — Correct behaviour: shows as disabled until mask tool wired.

5. **MpiGroupCard display name** — Static name doesn't update when `selectedIndex` changes.
   Fix in `MpiGroupCard`/`MpiGalleryGrid` to use `group.history[group.selectedIndex].operation`.

6. **No git commits this session** — All changes are working tree only.

## Files Modified / Created This Session
- **CREATED** `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- **CREATED** `js/components/Primitives/MpiCanvas/managers/ViewManager.js`
- **CREATED** `js/components/Primitives/MpiCanvas/managers/MaskManager.js`
- **CREATED** `js/components/Primitives/MpiCanvas/managers/ComparisonManager.js`
- **CREATED** `js/components/Primitives/MpiCanvas/managers/CropManager.js`
- **CREATED** `js/components/Primitives/MpiCanvas/managers/InputController.js`
- **DELETED** `js/components/interactiveCanvas.js`
- **DELETED** `js/components/interactiveCanvas/` (entire folder)
- **MODIFIED** `js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js` — import + usage
- **MODIFIED** `js/workspaces/groupHistory/groupHistory.js` — import, instantiation, modechange handler
- **MODIFIED** `js/components/types.js` — MpiCanvasProps typedef added

</current_state>
```
