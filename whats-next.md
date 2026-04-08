```xml
<work_completed>

## modelRegistry.js — Runtime Installed Check

### Approach: Option D (client sends dep data to server)

`modelRegistry.js` is the single source of truth. The server cannot import ESM,
so the client posts pre-resolved dep filenames to the server; the server only
does `fs.pathExists` checks and returns results.

### Server — `POST /comfy/models/check` (routes/comfy.js)

Receives: `{ models: [{ id, deps: [{ type, filename }] }] }`
- For `custom_nodes` deps: checks `engine/.../custom_nodes/<filename>`
- For model file deps: checks `engine/.../models/<filename>` (or custom root if set)
- Custom root: uses `getCustomRoot()` from shared.js; tries direct path then
  recursive basename search under the relevant sub-dir
- Returns: `{ success: true, results: { [modelId]: boolean } }`
- Private `_findFile(dir, filename)` helper added for custom root fuzzy lookup

### Client — `syncModelInstalled()` (js/data/modelRegistry.js)

- Builds payload from `MODELS` + `DEPS` (resolves dep ids to `{type, filename}`)
- POSTs to `/comfy/models/check`
- Patches `model.installed` in-place on each MODELS entry
- Called at startup from `shell.js` `_initDataRegistries()`
- Fixed hardcoded `installed: true` → `installed: false` on `sdxl-lustify`

### Cleanup — modelManager.js deleted

`js/managers/modelManager.js` was an orphaned LLM scaffold:
- Hit `/llm/models`, stored results in `state.allModels`
- Exported `refreshModelRegistry`, `getFirstAvailableModel`, `getRequiredModelsForTool`,
  `downloadModel`, `deleteModel` — none consumed outside the file itself
- `state.allModels` was only written/read inside modelManager.js
- Deleted the file, removed `allModels` from `state.js`, removed import + call from `shell.js`

### What `installed` does NOT do yet

`model.installed` is now set correctly at runtime, but nothing reads it yet.
Natural next consumers:
- `getModelsByType()` callers in gallery.js and groupHistory.js — could filter
  to installed-only so the model dropdown only shows ready models
- MpiPromptBox — disable run button if `activeModel.installed === false`
- Gallery card — surface a warning if a group's modelId is no longer installed
  (model was uninstalled after group was created)

No GC / data deletion is planned for uninstalled models — media files remain
valid and viewable; only further generation is blocked. UI should handle the
"no installed model" state gracefully rather than deleting user data.

</work_completed>

<work_remaining>

## 1. Model UI — Zero-installed state + install flow

`syncModelInstalled()` runs at startup and patches MODELS in-place, but nothing
reads `model.installed` yet. The full model management story is:

### 1a. Zero-installed state (gallery / groupHistory)
- If no installed models exist, hide the prompt box / model dropdown entirely
- Show a single clear message: "No models installed. Install a model to get started."
- Link/button to open the model installer

### 1b. Installed-only model dropdown
- `getModelsByType()` callers in gallery.js and groupHistory.js should filter
  to `m.installed === true` so uninstalled models never appear in the dropdown
- MpiPromptBox: disable Run if `activeModel?.installed === false`

### 1c. Gallery card — uninstalled model warning
- If a group's `modelId` refers to a model that is now uninstalled, surface a
  warning on the card (e.g. badge or icon) so the user knows further generation
  is unavailable without reinstalling

### 1d. Model installer UI
- A page/overlay where the user can browse available models (from MODELS in
  modelRegistry.js) and trigger download/install for uninstalled ones
- Uses `POST /comfy/model/download` per dependency
- Shows per-dep progress; marks model installed on completion
- Calls `syncModelInstalled()` after install completes to refresh flags

## 2. Model Garbage Collection (uninstall)

When a model is uninstalled:
- Delete its dep files from disk via a new `POST /comfy/models/uninstall` route
  (mirrors the dep resolution logic in `/comfy/models/check`)
- Call `syncModelInstalled()` after to update `model.installed` flags
- Do NOT delete user media files — groups remain intact and browsable
- UI: disable Run / show warning on affected gallery cards (covered by 1b/1c above)
- Shared deps (e.g. `lustify-7` used by multiple models): only delete if no other
  installed model references the same dep filename

## 3. LLM Models — Future

`modelManager.js` was deleted — it was an orphaned LLM scaffold with no live
consumers. When LLM model support is added it should be built fresh:
- New route module `routes/llm.js` already exists for the server side
- Client side: new manager in `js/managers/` following the same Option D pattern
  (client sends model data, server checks disk)
- LLM models are a separate registry from ComfyUI models — do not conflate

## 4. groupHistory — video group support

Deferred — no ComfyUI workflow for video yet, and the video player component is
being refactored into three separate pieces (preview, controls, selection).

- `_showEntry()` calls `_canvas.loadImage()` which fails silently for `.mp4` items
- Detect `item.type === 'video'` and swap `canvasWrap` for video preview component
- Reverse swap for image items
- `_showCompare` for video groups: skip or handle separately

## 5. Deferred / Low priority

- `state.js` legacy flat properties (`g_currentGuide`, `g_promptEN`, `g_images`, etc.)
  — remove when old workspace references confirmed gone
- `PAGE_WORKSPACE` deprecated alias in `router.js` — remove when confirmed unused
- `MpiSelectionBar` — not yet in `js/pages/components.js` dev gallery

</work_remaining>

<critical_context>

## modelRegistry.js — Architecture Rules

- `js/data/modelRegistry.js` is the **single source of truth** for all ComfyUI models.
- `dev_configs/comfy_workflows.json` is **legacy** — do not use it as reference for
  model/dependency data.
- The server (CJS) cannot import modelRegistry.js (ESM). Use Option D pattern:
  client posts pre-resolved dep data, server only checks disk.
- `syncModelInstalled()` must be called before any UI that reads `model.installed`.
  Currently called non-blocking at startup in `shell.js _initDataRegistries()`.

## Chromium GPU canvas corruption — willReadFrequently

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
- Model registry (source of truth): `js/data/modelRegistry.js`
- Model installed check route: `routes/comfy.js` → `POST /comfy/models/check`

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
| gallery.js onComplete — use _persistGroups() | Complete |
| gallery.js — download handler | Complete |
| MpiGroupCard selected state — footer highlight | Complete |
| MpiGroupCard display name (card label shows selected entry operation) | Complete |
| groupHistory — history entry label shows sequenced filename | Complete |
| modelRegistry.js — runtime installed check | **Complete (this session)** |
| modelManager.js — deleted (orphaned LLM scaffold) | **Complete (this session)** |
| model.installed — wired into UI (gallery, groupHistory, MpiPromptBox) | Not started |
| groupHistory — video group support | Deferred — no workflow yet |

## Open questions

None.

</current_state>
```
