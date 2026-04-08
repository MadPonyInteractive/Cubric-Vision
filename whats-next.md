```xml
<current_state>

## Deliverable Status

| Item | Status |
|------|--------|
| MpiCanvas Primitive (activeMode mutual exclusion) | Complete |
| MpiHistoryTools Compound | Complete |
| MpiToolActionBar Compound | Complete |
| groupHistory — crop tool | Complete (uses MpiToolActionBar) |
| groupHistory — mask tool | Complete (uses MpiToolActionBar) |
| groupHistory — modechange wiring | Complete |
| MpiCompareOverlay / gallery compare | Complete |
| gallery.js workspace | Complete |
| commandExecutor.js | Complete |
| groupHistory — selection mode + MpiSelectionBar | Complete |
| groupHistory — crop bar fix (shared mount container bug) | Complete |
| All other previously completed items | Complete |

## Known Issues (test findings — fix first next session)

> These were observed during testing after the mask/crop session. Fix before any new work.

1. **[Issue 1]** — *[describe what you saw]*
2. **[Issue 2]** — *[describe what you saw]*

*(Fill in from your test notes before the next session starts.)*

</current_state>

<work_remaining>

## 1. groupHistory — mask painting needs `_hasMask` to track drawn pixels

Currently `_hasMask` is set to `true` only when the user presses "Apply Mask" in the bar.
It should also become `true` as soon as the user actually paints anything on the canvas,
so that mask-dependent operations unlock in real time rather than only after Apply.

### How
Wire `onBrushSizeChange` callback (already called on every stroke via wheel) — or better,
add an `onMaskPaint` callback to `MpiCanvas`/`MaskManager` that fires on the first paint stroke.
In groupHistory: `onMaskPaint: () => { if (!_hasMask) { _hasMask = true; _refreshOpOptions(); } }`

---

## 2. groupHistory — video group support

- `_showEntry()` calls `_canvas.loadImage()` which fails silently for `.mp4` items
- Detect `item.type === 'video'` and swap `canvasWrap` (hide) for `MpiVideoPlayer` (show)
- Reverse swap for image items
- `_showCompare` for video groups: skip or handle separately

---

## 3. gallery.js — download handler

File: `js/workspaces/gallery/gallery.js` line ~76
Still a `console.log` stub. Needs:
- ZIP selected groups' media files (all history items' `filePath` values)
- Trigger browser download
- New server route `POST /project/download-groups` that zips and streams

---

## 4. MpiGroupCard display name not updating

Gallery media cards show a static name that does NOT update when `selectedIndex` changes
(after crop/generation adds a new entry). Thumbnail updates but label does not.
Fix in `MpiGroupCard` and/or `MpiGalleryGrid` to re-render label from
`group.history[group.selectedIndex].operation` on data refresh.

---

## 5. gallery.js onComplete — use _persistGroups()

File: `js/workspaces/gallery/gallery.js` lines ~321–328
Inline `fetch('/update-project', ...)` in `onComplete` should use `_persistGroups()`. Minor cleanup.

---

## 6. modelRegistry.js — runtime installed check

`installed: false` hardcoded in all model definitions. Server needs to check disk and return status.

---

## Deferred / Low priority

- `state.js` legacy flat properties (`g_currentGuide`, `g_promptEN`, `g_images`, etc.) — remove when old workspace references confirmed gone
- `PAGE_WORKSPACE` deprecated alias in `router.js` — remove when confirmed unused
- `MpiSelectionBar` — not yet in `js/pages/components.js` dev gallery

</work_remaining>

<critical_context>

## MpiCanvas API

```js
const inst = MpiCanvas.mount(wrapperEl, {
    onBrushSizeChange: (size) => {},
    onBrushTypeChange: (type) => {},  // 'brush' | 'eraser' — fired by B/E hotkeys
});
const canvas = inst.el;

canvas.activeMode = 'crop' | 'mask' | 'compare' | 'none';  // mutual exclusion built-in
inst.on('modechange', ({ mode }) => {});

await canvas.loadImage(url);            // resets mode to 'none'
await canvas.loadComparisonImage(url);  // sets mode to 'compare'
canvas.clearMask();
canvas.flipMaskColor();
canvas.getMaskDataURL('black', 'white');
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

## groupHistory mask flow

- `_hasMask` (bool) — true after user presses "Apply Mask"; controls `hasMask` in `_opOptions` context
- `_refreshOpOptions()` — re-evaluates available ops and updates dropdown; call whenever `_hasMask` changes
- On generate: `maskDataUrl = _hasMask ? _canvas.getMaskDataURL('black', 'white') : null` passed to `runCommand`
- Mask cleared on: card selection (`_selectEntry`), generation complete (`onComplete`)
- `_hasMask` reset to `false` on the same events + on mask bar "Cancel" and "Clear"

## Architecture Rules

- **Tier 1 Primitives**: Cannot import anything from components
- **Tier 2 Compounds**: Can only import Primitives (+ data/, utils/, events.js, state.js)
- **Tier 3 Blocks**: Can import Primitives + Compounds
- Workspaces (gallery.js, groupHistory.js): NOT components — plain `mount()` functions, CAN import anything

## Key file locations

- MpiCanvas: `js/components/Primitives/MpiCanvas/MpiCanvas.js`
- MpiCanvas managers: `js/components/Primitives/MpiCanvas/managers/`
- MpiHistoryTools: `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js`
- MpiToolActionBar: `js/components/Compounds/MpiToolActionBar/MpiToolActionBar.js`
- MpiSelectionBar: `js/components/Compounds/MpiSelectionBar/MpiSelectionBar.js`
- groupHistory workspace: `js/workspaces/groupHistory/groupHistory.js`
- groupHistory CSS: `js/workspaces/groupHistory/groupHistory.css`
- Gallery workspace: `js/workspaces/gallery/gallery.js`
- Component type definitions: `js/components/types.js`
- Preload manifest: `js/shell/preloadStyles.js`
- Event bus: `js/events.js`
- App state: `js/state.js`
- Router: `js/router.js`
- ComfyUI mapping rules: `.agents/workflows/comfyui_mapping_rules.md`

## #tool-container class — MUST NOT be wiped

`#tool-container` has `class="tool-container"` hardcoded in index.html.
When groupHistory mounts, it ADDS `gh-workspace`. When leaving, ONLY `classList.remove('gh-workspace')`.
NEVER use `element.className = ''` on this element.

## MpiCanvas destroy rule

InputController attaches listeners to `window`. MUST call `canvas.destroy()` when unmounted.
groupHistory.js: MutationObserver on `document.body` watches for container leaving DOM →
calls `_canvas.destroy()` and `Events.off('workspace:set-operation', _onSetOp)`.

</critical_context>
```
