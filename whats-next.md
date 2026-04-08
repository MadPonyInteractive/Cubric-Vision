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
| All other previously completed items | Complete |

## Known Issues (test findings — fix first next session)

> These were observed during testing after the mask/crop session. Fix before any new work.

1. **[Issue 1]** — *[describe what you saw]*
2. **[Issue 2]** — *[describe what you saw]*

*(Fill in from your test notes before the next session starts.)*

</current_state>

<work_remaining>

## 0. ⚠️ Fix issues from last test session (FIRST priority)

See "Known Issues" above. Fill in before starting.

---

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
