# Splat Workspace & Asset Type — Investigation Findings

> Read-only investigation. No repo files were modified.
> Sources: `docs/workspaces.md`, `.claude/rules/workspaces.md`, `docs/project-integrity.md`,
> `js/router.js`, `js/shell/navigation.js`, `js/shell/preloadStyles.js`,
> `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`,
> `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`,
> `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js`,
> `js/components/Primitives/MpiCanvas/MpiCanvas.js`,
> `js/components/shaderBackground.js`,
> `js/data/projectModel.js`, `routes/projects.js`, `package.json`.

---

## Q1 — What it takes to add a 4th workspace

### Files to CREATE

| File | Purpose |
|---|---|
| `js/components/Blocks/MpiSplatViewerBlock/MpiSplatViewerBlock.js` | The new Block |
| `js/components/Blocks/MpiSplatViewerBlock/MpiSplatViewerBlock.css` | Block styles |
| `styles/shell/splat-viewer.css` (optional) | If shell-level styles are needed |

### Files to EDIT (with line references)

| File | What changes | Where |
|---|---|---|
| `js/router.js` | Add `export const PAGE_SPLAT_VIEWER = 'splat-viewer';` | After line 13 (current PAGE_GROUP_HISTORY definition) |
| `js/shell/navigation.js` | Import the new constant; add a `if (page === PAGE_SPLAT_VIEWER)` branch in `handleNavigation()` (lines 147–180); add a `case PAGE_SPLAT_VIEWER:` in `_importView()` switch (lines 387–399) | Lines 23, 147–180, 386–399 |
| `js/shell/preloadStyles.js` | Add `'js/components/Blocks/MpiSplatViewerBlock/MpiSplatViewerBlock.css'` to `PRELOAD_COMPONENT_STYLES` | Blocks section at line 108–109 |
| `js/components/types.js` | Document the Block's exported props | After existing Block docs |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | Intercept `open-group` for `group.type === 'splat'` and route to `PAGE_SPLAT_VIEWER` instead of `PAGE_GROUP_HISTORY` | Line 225–227 |

### Nothing else is mandatory

The `#prompt-box-mount` slot is shell-owned (`index.html`) and persists across workspaces. A Block simply does not mount into it if it has no prompt (see Q3 below). There is no workspace registry or manifest to update — the switch in `_importView()` IS the registry.

---

## Q2 — How navigation tears a workspace down

`navigation.js:190–206` — `_destroyCurrentBlock()`:

```js
async function _destroyCurrentBlock() {
    if (!_currentBlock) return;
    const block = _currentBlock;
    _currentBlock = null;
    try {
        if (block.el && typeof block.el.destroy === 'function') {
            await block.el.destroy();
            block.el.remove?.();
        } else {
            await block.destroy?.();
        }
    } catch (err) {
        clientLogger.error('navigation', 'destroy() threw for previous block', err);
    }
}
```

Called from `_loadView()` before `_toolContainer.innerHTML = ''` (line 225). Navigation also resets `Overlays` via `Overlays.reset()` before loading the new view.

### Real Block destroy — MpiGroupHistoryBlock (lines 2906–2940)

```js
el.destroy = async () => {
    clearTimeout(_mascotLingerTimer);
    _previewPlayer.stop();
    _options?.destroy?.();
    _options = null;

    if (viewer?.el && typeof viewer.el.destroy === 'function') {
        await viewer.el.destroy();   // MpiCanvasViewer or MpiVideoViewer
        viewer.el.remove?.();
    } else {
        await viewer?.destroy?.();
    }

    _unsubs.forEach(fn => fn?.());          // all Events.on / onState subscriptions
    window.removeEventListener('dragenter', _onHistDragEnter);
    window.removeEventListener('dragleave', _onHistDragLeave);
    window.removeEventListener('dragover',  _onHistDragOver);
    window.removeEventListener('drop',      _onHistDrop);
    _dropOverlay.el.destroy?.();
    _dropOverlay.el.remove();
    historyList.destroy?.();
    historyTools.destroy?.();
    _historyDeleteDialog.destroy?.();
    _settingsOverlay.destroy?.();
    _modelPicker.destroy?.();
    _pb?.el?.destroy?.();   // PromptBox — null-safe
    _pb = null;
    if (_compareOverlay) {
        try { _compareOverlay.el.hide?.(); } catch (_) {}
        _compareOverlay.el.destroy?.();
        _compareOverlay = null;
    }
};
```

**Contract:** Block must define `el.destroy = async () => { ... }` that (a) calls `destroy()` on every mounted sub-component, (b) calls every `_unsubs` fn returned by `Events.on` / `Events.onState`, (c) removes any `window.addEventListener` listeners that were NOT added via `on()` from `dom.js`, and (d) cancels any active RAF/animation loops.

---

## Q3 — Is PromptBox mandatory?

No. The rules file says the Block "keeps the handle in `_pb`" and calls `_pb?.destroy?.()` in `el.destroy` — the null-safe `?.` is load-bearing. A Block that never calls `MpiPromptBox.mount()` is valid. The `#prompt-box-mount` slot declared in `index.html` simply stays empty.

The Splat Viewer Block should:
- NOT mount `_pb` (no prompt, no model picker)
- Still have `_pb = null` and `_pb?.destroy?.()` in its destroy for forward safety
- NOT emit `ui:open-model-picker` or `models:open`

---

## Q4 — How a user GETS to the Splat Viewer workspace

### Current path: gallery card → Group History

`MpiGalleryGrid.js:1159–1183` handles card click. For non-preview, non-selection clicks:

```js
} else if (!_isPreviewNow) {
    emit('open-group', { group });   // line 1181
}
```

`MpiGalleryBlock.js:225–227` handles the event:

```js
grid.on('open-group', ({ group }) => {
    navigate(PAGE_GROUP_HISTORY, { groupId: group.id });
});
```

### Adding a Splat Viewer branch

The `grid.on('open-group')` handler at `MpiGalleryBlock.js:225` is the ONE choke point. Change it to:

```js
grid.on('open-group', ({ group }) => {
    if (group.type === 'splat') {
        navigate(PAGE_SPLAT_VIEWER, { groupId: group.id });
    } else {
        navigate(PAGE_GROUP_HISTORY, { groupId: group.id });
    }
});
```

No changes to `MpiGalleryGrid.js` required — the event surface already carries the full `group` object with its `type` field. The audio card exception at line 226 (`if (group?.type === 'audio') return;`) shows this pattern is already used.

---

## Q5 — On-disk project shape

### `project.json`

```json
{
  "id": "<uuid>",
  "name": "My Project",
  "folderPath": "C:\\...\\projects\\my-project",
  "createdAt": "...",
  "updatedAt": "...",
  "thumbnail": null,
  "schemaVersion": 3,
  "itemGroups": [
    {
      "id": "<uuid>",
      "type": "image",
      "name": "t2i_001",
      "createdAt": "...",
      "selectedIndex": 0,
      "open": false,
      "favourite": false,
      "history": ["<uuid-of-sidecar>"]
    }
  ],
  "modelSettings": {},
  "toolSettings": {},
  "sequenceCounters": { "t2i": 2, "edit": 7 }
}
```

`itemGroups[i].history[]` contains UUID STRINGS ONLY — not full objects.

### `.meta/<uuid>.json` sidecar (from `docs/project-integrity.md`)

```json
{
  "id": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "type": "image",
  "filePath": "/project-file?path=C%3A%5C...%5Ct2i_001.png",
  "operation": "t2i",
  "displayName": "t2i_001",
  "prompt": "a hamster in the snow",
  "negativePrompt": "",
  "seed": 42,
  "modelId": "sdxl-realistic",
  "createdAt": "2026-04-15T10:35:22.340Z",
  "name": null,
  "uploaded": false,
  "pixelDimensions": { "w": 1024, "h": 1024 },
  "generationMs": 15087
}
```

Video sidecars add: `thumbPath`, `fps`, `duration`, `frameCount`, `hasAudio`, `sourceItemId`.

**Media files** live at `<projectFolder>/Media/<filename>`. Sidecar `filePath` is a server URL `/project-file?path=<encoded-absolute-path>`, not a bare filename.

---

## Q6 — Media type vocabulary and blast radius

### Where the vocabulary is DEFINED

- `js/data/projectModel.js:70` — `createImageItem()`: `type: 'image'`
- `js/data/projectModel.js:98` — `createVideoItem()`: `type: 'video'`
- `js/data/projectModel.js:129` — audio item: `type: 'audio'`
- `js/data/projectModel.js:155` — JSDoc: `@property {'image'|'video'|'audio'} type`
- `js/data/projectModel.js:495` — `const _SHARED_TYPES = new Set(['image', 'video'])` — audio explicitly excluded from shared PromptBox settings

The `type` field lives on both the group (`itemGroups[i].type`) and the item sidecar (`item.type`). They are always the same for a given group.

### Switch/branch blast radius for a new `'splat'` type

**Frontend — ~20 locations:**

| File | Line(s) | What changes |
|---|---|---|
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | 226, 283 | Audio-type skip gate; video-only multi-select check |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` | 253 | `isVideo` branch for viewer mount (MpiCanvasViewer vs MpiVideoViewer) |
| `js/components/Compounds/MpiGalleryGrid/MpiGalleryGrid.js` | 925–926, 1028, 1072, 1258, 1636–1637, 1690 | Card render: filter tabs, video hover-play, duration display |
| `js/components/Compounds/MpiHistoryList/MpiHistoryList.js` | 116, 139 | Row thumbnail: `thumbPath` vs `filePath` |
| `js/components/Compounds/MpiCompareView/MpiCompareView.js` | 68 | Returns true only for video items |
| `js/components/Compounds/MpiProjectCard/MpiProjectCard.js` | 94, 104 | Project card thumbnail: `<video>` vs `<img>` |
| `js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js` | 157, 261 | Accept-media filter for type |
| `js/components/Organisms/MpiBaseFlow/MpiBaseFlow.js` | 151, 634, 639 | `noun` string; group output routing |
| `js/managers/projectReconciler.js` | 165, 183 | `isVideo` for synthetic item construction |
| `js/utils/describeAction.js` | 37 | Describe action eligibility |
| `js/utils/promptReuse.js` | 141–142 | Prompt reuse accepts-type check |
| `js/data/projectModel.js` | 302, 495, 503–536 | `resolveFlipTarget` skips audio; `_SHARED_TYPES` set; `getSharedSettings` guard |

**Backend — 5 locations:**

| File | Line(s) | What changes |
|---|---|---|
| `routes/projects.js` | 1394 | Upload type derivation from mediaType |
| `routes/projects.js` | 1491, 1552 | Zip/export loops: skip non-video, skip non-image |
| `routes/videoConcat.js` | 166, 256 | Rejects non-video source sidecars |

**Gallery filter UI** (`MpiGalleryGrid.js:1636–1637`): current tabs are `'images'` and `'videos'`. A splat filter tab would need to be added here too if splat cards should be filterable.

---

## Q7 — Thumbnail generation and storage

**Images:** No `thumbPath`. The gallery card uses `item.filePath` directly (the image is its own thumbnail). `sharp.metadata()` provides dimensions at save time, written into `pixelDimensions`.

**Videos:** `services/ffmpegThumb.js` extracts the first frame at 256px wide, writes `<uuid>.thumb.jpg` into `Media/.meta/`. The sidecar `thumbPath` field is set to a `/project-file?path=...` URL pointing at that file. `MpiGalleryGrid` and `MpiHistoryList` read `item.thumbPath` for the card thumbnail preview.

**For a non-image/non-video asset (a .ply splat):**

A `.ply` file has no inherent pixel thumbnail. Options:
1. **Server-generated at import/capture time** — a render of the splat from a default camera angle, saved as a JPEG beside the `.ply`. The route would write `thumbPath` into the sidecar exactly as `ffmpegThumb.js` does for videos.
2. **Client-captured still** — the Splat Viewer Block captures a WebGL frame when the user first flies through, POSTs it to a new route, which saves it and updates the sidecar `thumbPath`.
3. **Hardcoded placeholder** — a static icon. Simplest but worst UX.

The sidecar `thumbPath` field is the right home for whichever image is chosen.

---

## Q8 — Cross-project copy: single-file or folder-capable?

The route is `POST /project-media/:projectId/add-from-cards` at `routes/projects.js:~2099`.

**Exact copy logic** (lines 2116–2136):

```js
const srcMedia = pathFromProjectFileUrl(item?.filePath);
if (!srcMedia || !(await fs.pathExists(srcMedia))) continue;

const id = uuidv4();
const ext = path.extname(srcMedia);
const stem = path.basename(srcMedia, ext).replace(/_\d+$/, '') || 'copied';
const destName = `${stem}_${id.slice(0, 8)}${ext}`;
const destMedia = path.join(mediaDir, destName);
await fs.copy(srcMedia, destMedia);     // <— SINGLE FILE COPY
```

**Answer: SINGLE-FILE ONLY.** The route resolves one `filePath` from the sidecar, constructs one destination filename with `<stem>_<uuid8><ext>`, and calls `fs.copy(srcMedia, destMedia)` — one file to one file. The companion thumb is copied separately (lines 2155–2162) only because it has its own sidecar field `thumbPath`.

**What would need to change for a folder-shaped splat asset:**

If the splat asset is a `.ply` file plus a companion data directory (e.g. `scene.ply` + `scene_splat/`), the copy route must:
1. After copying the `.ply`, detect whether a companion directory exists by convention (e.g. same stem, suffix `_splat/`, OR a new sidecar field `dataPath` pointing at the directory).
2. Copy that directory recursively: `await fs.copy(srcDataDir, destDataDir)` — `fs-extra`'s `copy` handles directories, but the route does not currently call it that way.
3. Update the sidecar being written (`meta.dataPath = ...`) to point at the copied directory.

Alternatively, if the entire splat dataset is stored as a single archive (`.zip` of the `.ply` + data), the existing single-file copy works as-is. That is worth considering as the simpler design.

---

## Q9 — Does anything handle directory-shaped assets?

No. Every item tracked through `history[]` / `.meta/<uuid>.json` points at a single media file via `filePath`. The only directory-aware code in `routes/projects.js` is:

- `migratePreviewAssetsStore()` (line 380+) — migrates the internal `.preview-assets/<item>/` legacy layout. This is internal infrastructure, not a user-visible asset type.
- External project registry (tracks parent directories). Again, internal.

No component, route, or reconciler handles a per-card directory asset. A splat scene stored as a directory would require new conventions in the sidecar schema and new copy/delete/reconcile logic.

---

## Q10 — Existing 3D / WebGL / WebGPU in the codebase

**WebGL is already present — this is NOT the first use.**

| File | Lines | What it does |
|---|---|---|
| `js/components/shaderBackground.js` | 117–119, 188 | Full `webgl` render loop for the landing page plasma shader. `requestAnimationFrame` loop, `cancelAnimationFrame` on stop. A plain module (not a ComponentFactory component). |
| `js/components/Primitives/MpiCanvas/MpiCanvas.js` | 111–116 | One-shot `webgl2`/`webgl` probe to read `MAX_TEXTURE_SIZE`. The GL context is discarded immediately — no render loop. |

**No WebGPU, no Three.js, no gl-matrix.** `package.json` contains none of these. The `mediabunny` package (video decoding) could theoretically use WebGL internally, but nothing in the app code exposes a GL context from it.

A Gaussian splat renderer would be the FIRST 3D render context owned by a UI component, and the first use of WebGL inside the component system. It would NOT be the first WebGL in the app.

---

## Q11 — MpiCanvas: 2D or WebGL? Closest precedent for a render-loop component

### MpiCanvas is 2D-only

`MpiCanvas` (`js/components/Primitives/MpiCanvas/`) creates three `<canvas>` elements, all with `getContext('2d')`:
- `baseCanvas` — image/video pixel rendering
- `overlayCanvas` — mask overlay drawing
- `screenUICanvas` — screen-space UI (handles, gizmo)

The WebGL probe at line 111 is a one-shot `MAX_TEXTURE_SIZE` read — no retained GL context, no render loop. A WebGL 3D context cannot live inside `MpiCanvas` as currently written; it would need a separate canvas element outside the `_CanvasCore` stack.

### Closest precedents for a render-loop component

**1. `shaderBackground.js` (plain module, not a component) — `js/components/shaderBackground.js:188, 218–220`:**
```js
// Start:
animationId = requestAnimationFrame(render);

// Stop:
if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
}
```
This is the only full WebGL render loop in the repo, but it is a plain module with exported start/stop functions, not a ComponentFactory component.

**2. `MpiCanvas._compareRafId` (inside a ComponentFactory component) — `MpiCanvas.js:655–670, 295–315`:**
```js
// Start (kickCompareRaf):
this._compareRafId = requestAnimationFrame(tick);

// Stop (_stopComparePlayback):
if (this._compareRafId != null) {
    cancelAnimationFrame(this._compareRafId);
    this._compareRafId = null;
}

// destroy():
this._stopComparePlayback();
// ... zero canvas dims, remove from DOM, null refs
```
This is the canonical in-component pattern: store the RAF id, cancel in both the stop function AND `destroy()`.

**3. `MpiLevelMeter.js:125–127`** — audio level meter with its own `raf = requestAnimationFrame(step)`.

### Hosting pattern for a WebGL splat renderer

A new Primitive (e.g. `MpiSplatCanvas`) following the `_compareRafId` pattern:

```js
class MpiSplatCanvas {
    constructor(container, options) {
        this._canvas = document.createElement('canvas');
        this._gl = this._canvas.getContext('webgl2');
        this._rafId = null;
        this._resizeObserver = new ResizeObserver(() => this._onResize());
        container.appendChild(this._canvas);
        this._resizeObserver.observe(container);
        this._startLoop();
    }

    _startLoop() {
        const tick = () => {
            if (!this._gl) return;
            this._render();
            this._rafId = requestAnimationFrame(tick);
        };
        this._rafId = requestAnimationFrame(tick);
    }

    destroy() {
        // 1. Cancel RAF FIRST
        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        // 2. Disconnect ResizeObserver (same as MpiCanvas.destroy:295)
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        // 3. Release GL context immediately (not relied on by shaderBackground — it never destroys)
        this._gl?.getExtension('WEBGL_lose_context')?.loseContext();
        this._gl = null;
        // 4. Zero canvas dims to release GPU texture backing (MpiCanvas.destroy:316)
        if (this._canvas) { this._canvas.width = 0; this._canvas.height = 0; }
        // 5. Remove from DOM
        this._canvas?.parentNode?.removeChild(this._canvas);
        this._canvas = null;
    }
}
```

This follows the exact pattern in `MpiCanvas.destroy()` (lines 295–340): disconnect ResizeObserver first, then stop loops, zero dims, remove from DOM, null all refs.

---

## Summary Table

| Question | Answer |
|---|---|
| Q1 | 5 files to edit, 2 files to create — router, navigation, preloadStyles, GalleryBlock (routing branch), types + new Block + Block CSS |
| Q2 | Navigation calls `await block.el.destroy()` then `remove()` before clearing `innerHTML`. Block must collect subscriptions in `_unsubs[]` and call them all; cancel RAFs; destroy sub-components; null all refs. |
| Q3 | PromptBox is OPT-IN per Block — the Splat Viewer can omit it entirely. |
| Q4 | Card click → `MpiGalleryGrid` emits `open-group` → `MpiGalleryBlock` handles it. Add a `group.type === 'splat'` branch there; zero changes to the grid component needed. |
| Q5 | `project.json` + `Media/<file>` + `Media/.meta/<uuid>.json`; sidecar is the single source of truth for all item metadata. |
| Q6 | ~25 branches across 15 files (see table in Q6). Most are simple `=== 'video'` vs `=== 'image'` guards; a new `'splat'` type mostly falls through existing else-branches correctly but the viewer selector, gallery filter tabs, thumbnail handling, and reconciler all need explicit awareness. |
| Q7 | Images use `filePath` as thumbnail; videos use `ffmpegThumb`→`thumbPath`. A splat needs a server-generated or viewer-captured still written to `thumbPath`. |
| Q8 | SINGLE-FILE ONLY. `fs.copy(srcMedia, destMedia)` with one resolved path. A folder-shaped splat asset requires the copy route to also recurse a companion directory. Consider storing as a single archive instead. |
| Q9 | NONE. No existing code handles a directory-shaped card asset. New conventions needed. |
| Q10 | WebGL already present in `shaderBackground.js` (full render loop) and `MpiCanvas.js` (one-shot probe only). No WebGPU, Three.js, or gl-matrix. A 3D splat renderer would be the first GL context inside a component. |
| Q11 | `MpiCanvas` is 2D-only. Closest component precedent for a render loop is `MpiCanvas._compareRafId` (cancel in `destroy()`). `shaderBackground.js` is the only full WebGL loop but is not a component. A new `MpiSplatCanvas` Primitive following the `_compareRafId` + `MpiCanvas.destroy()` resource-release pattern is the correct host. |
