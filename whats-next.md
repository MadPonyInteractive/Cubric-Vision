```xml
<original_task>
Continue building the MpiAiSuite generative AI project workspace system. Specific session goals:
1. Fix the upscaler workflow failing due to blob URL not being uploaded correctly
2. Build project persistence: save generated images to disk with a readable naming convention (operation_NNN.png), sidecar metadata in Media/.meta/, garbage collection of orphaned sidecars
3. Build MpiCompareOverlay compound component wrapping InteractiveCanvas in comparison mode
4. Wire the compare button in gallery.js to open MpiCompareOverlay with the two selected groups' selectedItems
5. Fix card display names to use filename (no extension, truncated to 28 chars) instead of prompt slice
</original_task>

<work_completed>

## Bug Fix — Blob URL not uploaded for upscaler Input_Image
File: `js/services/comfyController.js` lines 310–316

The path-normalization branch checked `!val.startsWith('http')` but blob URLs start with `blob:http` — so they don't match and were being wrapped as `/project-file?path=blob%3A...`, causing a server 404. Then the upload branch also missed them (no `blob:` check).

Fix: added `!val.startsWith('blob:')` to the normalization guard, and added `val.startsWith('blob:')` to the upload condition. Blob URLs are renderer-local and `_uploadImage` can fetch them directly via the browser's fetch API.

## Server Route — POST /project/save-generation
File: `routes/projects.js` (added before Project Templates section, ~line 477)

- Accepts `{ folderPath, comfyViewUrl, operation, meta: { prompt, negativePrompt, seed, modelId } }`
- Derives extension from the ComfyUI view URL's `filename` query param
- Sanitises operation key to a safe prefix (max 24 chars, alphanumeric/underscore/dash only)
- Scans `Media/` for existing files matching `<prefix>_NNN.*` pattern, picks next sequence number
- Downloads image from ComfyUI server-side using existing `streamDownload` helper from `routes/shared.js`
- Saves as `Media/<operation>_NNN.ext` (e.g. `t2i_001.png`, `upscaled_002.png`)
- Writes sidecar to `Media/.meta/<filename>.json` with operation, prompt, negativePrompt, seed, modelId, createdAt
- Garbage-collects orphaned sidecars on every call (scans `.meta/`, removes any `.json` whose media file no longer exists) — non-fatal
- Returns `{ success, filename, relativePath, filePath }` where `relativePath` is e.g. `"Media/t2i_001.png"`
- Also imported `COMFYUI_PORT` and `streamDownload` from `routes/shared.js` at the top of projects.js

## gallery.js — onComplete wired to persistence
File: `js/workspaces/gallery/gallery.js`

- `onComplete` is now `async`
- After getting `urls[]` from ComfyUI, calls `POST /project/save-generation`
- Added `if (!res.ok) throw new Error(...)` guard before `.json()` to prevent SyntaxError when server returns HTML error pages
- On success: `filePath = /project-file?path=<encoded filePath>`, `displayName = filename without extension`
- On failure: logs warning, falls back to comfy view URL (ephemeral), `displayName = operation`
- Card name = `displayName` truncated to 28 chars with `…`
- After building group, calls `POST /update-project` fire-and-forget to write `itemGroups` back to `project.json`
- Added imports: `getSelectedItem` from projectModel, `MpiCompareOverlay` from the new compound

## gallery.js — compare handler wired
File: `js/workspaces/gallery/gallery.js`

Replaced `console.log` stub with real implementation:
```js
const _compareOverlay = MpiCompareOverlay.mount(document.createElement('div'));
grid.on('compare', ({ groups: g }) => {
    const itemA = getSelectedItem(g[0]);
    const itemB = getSelectedItem(g[1]);
    if (!itemA || !itemB) return;
    _compareOverlay.el.open(itemA, itemB);
});
```
Uses `getSelectedItem()` — each group's `history[selectedIndex]` item.

## MpiCompareOverlay (NEW Compound)
Files created:
- `js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js`
- `js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.css`

Architecture:
- Wraps `MpiOverlay` (Primitive) as its base — gets Stash Pattern, OverlayManager queue, Escape-to-close for free
- Instantiates `InteractiveCanvas` lazily on first `open()` call
- Template: `.mpi-compare-overlay` root with `.mpi-compare-overlay__labels` (Before/After floating labels) + `.mpi-compare-overlay__canvas-wrap`

Public API:
- `el.open(itemA, itemB)` — resolves both items' filePaths to URLs, shows overlay, loads `loadImage(urlA)` then `loadComparisonImage(urlB)`
- `el.hide()` — destroys canvas (cleans up InputController's window-level event listeners), then calls overlay hide
- Emits `'close'` forwarded from MpiOverlay

`_resolveUrl(item)` helper:
- Passes through URLs starting with `http`, `blob:`, `data:`, or containing `project-file` unchanged
- Wraps raw disk paths in `/project-file?path=...`

`_truncate(str)` helper — max 28 chars with `…`

Labels show filename-without-extension or item.name, truncated.

CSS:
- Overrides MpiOverlay container `max-width` to 100% via `:has()` selector so compare fills full width
- Canvas wrap fills remaining height with `flex: 1`
- Labels positioned absolute, top 0.75rem, left/right — glass effect with `backdrop-filter: blur`

## Registration of MpiCompareOverlay
- `js/shell/preloadStyles.js` — CSS added to PRELOAD_COMPONENT_STYLES array
- `js/components/types.js` — JSDoc typedef added (MpiCompareOverlayProps)
- `js/pages/components.js` — import added + gallery demo (`preview-compare-overlay-default`) with two picsum.photos placeholder images
- `templates/tpl-components.html` — `comp-card` slot added for `preview-compare-overlay-default`

## Bug Fix — Drag from card to PromptBox double-slash URL
File: `js/components/Compounds/MpiPromptBox/MpiPromptBox.js` line 188

Was: `` url: `/${filePath}` `` — prepended `/` to a filePath that is already `/project-file?path=...`, producing `//project-file?...`
Fixed: `url: filePath` — filePath is already a complete URL or API path, no prefix needed.

## Bug Fix — MpiCompareOverlay double-wrapping project-file paths
File: `js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js` `_resolveUrl`

When `filePath` is `/project-file?path=C%3A%2F...` it contains `project-file` — added `p.includes('project-file')` check so it passes through unchanged instead of being re-wrapped.

</work_completed>

<work_remaining>

## 1. groupHistory workspace — full build (highest priority after persistence)
File: `js/workspaces/groupHistory/groupHistory.js` (currently placeholder HTML)

Layout needed:
- Left toolbar: image ops (upscale, detail, crop, compare) or video ops depending on group.type
- Centre: large view of selected entry — `<img>` for image, MpiVideoPlayer for video
- Right panel: history cards — thumbnail, operation label, model, date; click → promoteSelectedIndex
- PromptBox at bottom (locked to group's type, same as gallery)
- MpiProjectName: `setGalleryLabel('Gallery')` + `setGroupLabel(group.name)`
- Compare in group history: user selects 2 history entries → same MpiCompareOverlay.open(itemA, itemB)

Data loading: `state.currentPage` router passes `{ groupId }` — need to find group by id in `state.currentProject.itemGroups`

## 2. Card thumbnail display after page reload
Currently `itemGroups` is now persisted to `project.json` via `/update-project` after each generation. On reload, `GET /get-project` loads them. But `filePath` values stored are `/project-file?path=C%3A%2F...` — these are server-relative URLs. When the app reloads and `MpiGroupCard._render()` sets `thumb.src = filePath`, this should work fine since the `/project-file` route is live. **Needs testing after restart.**

## 3. gallery.js — download handler
File: `js/workspaces/gallery/gallery.js` line ~49

Currently `console.log` stub. Should:
- Zip selected groups' media files (all history items' `filePath` values)
- Trigger browser download
- Probably a new server route `POST /project/download-groups` that zips and streams

## 4. gallery.js — delete handler
File: `js/workspaces/gallery/gallery.js` line ~50

Currently `console.log` stub. Should:
- Show `MpiOkCancel` confirm dialog
- On confirm: remove groups from `state.currentProject`, call `/update-project`, delete media files + sidecars from disk
- New server route or reuse existing `/project-media/:projectId` DELETE per file

## 5. Dropped images → new gallery cards (noted as separate task)
When user drops an image file into the PromptBox drop zone WITHOUT running generation, that image should become a new ItemGroup card in the gallery. Currently only generation creates cards. This is a `media-change` event handling gap in `gallery.js`.

## 6. state.js legacy cleanup (deferred — confirmed by user)
Legacy flat properties: `g_currentGuide`, `g_promptEN`, `g_images`, `toolComfySettings`, `runningComfyTool`, `detailerInputImage` — dead, remove when old workspace references confirmed fully gone.

## 7. modelRegistry.js — runtime installed check
`installed: false` hardcoded in all model definitions. Server needs to check disk and return installed status. New endpoint for ComfyUI models needed.

## 8. MpiSelectionBar — add to dev gallery
`MpiSelectionBar` (and MpiGroupCard, MpiGalleryGrid) not yet in `js/pages/components.js` dev gallery. Low priority.

## 9. navigation.js JSDoc stale comment (cosmetic)
`_syncRadial` has a stale comment block referencing old pattern.

## 10. PAGE_WORKSPACE deprecated alias
`router.js` still exports `PAGE_WORKSPACE = 'gallery'` — remove when confirmed unused.

## 11. Video workflow support
User plans to add a video workflow today. commandExecutor `_buildParams` already handles video via `videoItem` → `Input_Image` slot. `save-generation` route uses extension from comfy URL so it will handle `.mp4` etc. correctly. `project-file` route serves any file. Should work end-to-end once workflow is added — needs testing.

</work_remaining>

<attempted_approaches>

## Blob URL fix — first symptom understood incorrectly
Initially thought the `_uploadImage` fetch of a blob URL might fail in the renderer — it doesn't, blob URLs are renderer-local and fetchable. The actual issue was the path-normalization branch running first and wrapping the blob URL as a server path, so the fetch hit the server (which can't resolve blob URLs) instead of the renderer's local blob store.

## save-generation 404 on first test
Route was added correctly but server had not been restarted. The SyntaxError (`Unexpected token '<'`) was Express returning an HTML 404 page; `.json()` choked on it. Fixed by adding `if (!res.ok) throw` before `.json()` call. The underlying route was fine — just needed a server restart.

## Card name showing as `t2i` not `t2i_001` on first test
This was the fallback path executing because save-generation returned 404 (server not restarted). `displayName = operation` = `"t2i"` with no sequence number. After server restart + successful persistence, `displayName = data.filename.replace(/\.[^.]+$/, '')` = `"t2i_001"`. Not a code bug.

## Double-slash URL in drag-to-promptbox
`url: \`/${filePath}\`` was written when filePath was assumed to be a raw disk path. After persistence, filePath became `/project-file?path=...` so prepending `/` broke it. Simple removal of the prefix fixed it.

## Double-wrapping in _resolveUrl (MpiCompareOverlay)
Same root cause as above — `_resolveUrl` was written assuming raw disk paths. `/project-file?path=...` starts with `/`, not `http`/`blob`/`data:`, so it fell through to the wrap branch. Fixed with `p.includes('project-file')` passthrough check.

</attempted_approaches>

<critical_context>

## Architecture Rules
- **Tier 1 Primitives**: Cannot import anything from components
- **Tier 2 Compounds**: Can only import Primitives (+ data/, utils/, events.js, state.js)
- **Tier 3 Blocks**: Can import Primitives + Compounds
- gallery.js is a workspace, not a component — it CAN import Compounds directly

## ComponentFactory pattern — critical gotcha
- `el = container.firstElementChild` — `el` IS the root DOM element
- NEVER do `el.querySelector('.same-class-as-root')` — searches descendants, returns null

## filePath convention (post-persistence)
After `save-generation` succeeds, `item.filePath` is stored as `/project-file?path=C%3A%2F...` — a server-relative API URL, NOT a raw disk path. Any code that receives a `filePath` must handle both cases:
- Raw disk path: `C:\Projects\...\t2i_001.png` or `/absolute/path/...`
- API URL: `/project-file?path=...` (already resolvable by browser)
- Comfy view URL (ephemeral fallback): `http://127.0.0.1:8188/view?filename=...`
- Blob URL (from file drop): `blob:http://127.0.0.1:3000/...`

Pattern to detect "already a URL": `p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')`

## MpiButton props.disabled is immutable after mount
Click handler checks `props.disabled` (initial value), not the DOM attribute. Don't pass `disabled: true` at mount if you intend to enable it later.

## MpiOverlay — Stash Pattern
MpiOverlay stashes `#tool-container` children in a hidden div rather than removing them. This keeps portal/observer lifecycles alive. MpiCompareOverlay correctly inherits this by wrapping MpiOverlay.

## InteractiveCanvas — InputController cleanup
InputController attaches event listeners to `window` (mousemove, mouseup, keydown, keyup). MUST call `canvas.destroy()` when hiding/unmounting, not just remove the DOM element. MpiCompareOverlay's `el.hide` override handles this.

## ComfyUI Mapping Rules
- Title-based injection ONLY — node IDs never hardcoded
- Key titles: `Positive`, `Negative`, `Seed`, `Input_Image`, `Input_Mask`, `Output`
- Only `Output` nodes (case-insensitive title match) fire `onComplete` — prevents history duplication from intermediate save nodes
- commandExecutor loads workflow JSON client-side to build `outputNodeIds` Set before execution

## commandExecutor — execution flow
Returns `Execution` handle synchronously — attach callbacks before async tick. The IIFE inside is async but the handle is returned before it runs.

## sidecar strategy
Sidecars live in `Media/.meta/<filename>.json` — NOT alongside media files. Garbage collection happens on every `save-generation` call. When user deletes media files from disk directly, orphaned sidecars are cleaned on next generation. No explicit "on project load" GC yet (low priority — sidecars are tiny).

## project.json itemGroups persistence
`itemGroups` is now written to `project.json` after each generation via `/update-project`. On load, `GET /get-project` reads it. The `filePath` values in stored items are `/project-file?path=...` URLs which work as long as the server is running and the files exist on disk.

## Video workflow readiness
`save-generation` derives extension from ComfyUI view URL filename param — handles `.mp4`, `.webm`, etc. automatically. `commandExecutor._buildParams` maps `videoItem.url` to `Input_Image` slot (same slot as images — correct for most video workflows). End-to-end untested pending user adding a video workflow file.

## Error / logging architecture
- Server: `routes/logger.js` → `logs/app.log`
- Client: `js/services/clientLogger.js` → `POST /log` → same file
- User-facing: `showError(title, message)` from `shell.js` → MpiErrorDialog
- `clientLogger` swallows its own errors — safe to call from any catch

## File Locations for Key Systems
- Event bus: `js/events.js`
- App state (Proxy): `js/state.js`
- Router: `js/router.js`
- Shell orchestrator: `js/shell.js`
- Navigation logic: `js/shell/navigation.js`
- Status bar: `js/shell/statusBar.js`
- ComfyUI WebSocket controller: `js/services/comfyController.js`
- Command executor: `js/services/commandExecutor.js`
- Client logger: `js/services/clientLogger.js`
- Model registry: `js/data/modelRegistry.js`
- Command registry: `js/data/commandRegistry.js`
- Project data model: `js/data/projectModel.js`
- Gallery workspace: `js/workspaces/gallery/gallery.js`
- GroupHistory workspace: `js/workspaces/groupHistory/groupHistory.js`
- ComfyUI mapping rules: `.agents/workflows/comfyui_mapping_rules.md`
- Component rules: `dev_docs/05_components.md`

## Platform / Environment
- Electron 41.0.3 (Windows/Linux/macOS desktop; browser used for dev testing)
- `preventDefault` on range input wheel does NOT work in Electron (known issue)
- `APP_USER_DATA` env var set by `main.js` in packaged build for cross-platform log path
- Server runs on port 3000; ComfyUI on port 8188

</critical_context>

<current_state>

## Deliverable Status

| Item | Status |
|------|--------|
| commandRegistry.js | Complete |
| modelRegistry.js | Complete (t2i, upscale, detail only; installed: false hardcoded) |
| projectModel.js | Complete (addGroupToProject has \|\| [] guard; others do not) |
| router.js new page constants | Complete |
| navigation.js rewrite | Complete (dynamic radial from commandRegistry) |
| MpiProjectName 2-level breadcrumb | Complete |
| MpiGroupCard component | Complete |
| MpiSelectionBar component | Complete (not yet in dev gallery) |
| MpiGalleryGrid component | Complete |
| MpiDropdown — disabled options + setOptions API | Complete |
| MpiPromptBox — media drop zone | Complete (drag URL fix applied) |
| MpiPromptBox — run/stop generate button | Complete |
| MpiButton | Complete |
| MpiErrorDialog — support hint | Complete |
| MpiCompareOverlay | Complete (NEW this session) |
| gallery.js workspace | Complete (compare wired, persistence wired) |
| commandExecutor.js | Complete |
| clientLogger.js | Complete |
| routes/system.js POST /log | Complete |
| comfyController.js blob URL fix | Complete (this session) |
| comfyController.js error wiring | Complete |
| routes/projects.js POST /project/save-generation | Complete (this session) |
| groupHistory.js workspace | Stub only — placeholder HTML |
| gallery.js download handler | Stub (console.log) |
| gallery.js delete handler | Stub (console.log) |
| Dropped image → new gallery card | Not implemented |
| Model installed-check endpoint | Not started |
| MpiSelectionBar in dev gallery | Not done |
| state.js legacy cleanup | Deferred |
| PAGE_WORKSPACE alias removal | Deferred |

## App Boot / Runtime Status
- Landing page loads. Settings/Help/About overlays work.
- Opening a project navigates to gallery workspace.
- PromptBox renders with play button, model dropdown hidden (single model), op dropdown shows all ops.
- **t2i generation works end-to-end**: image saved to `Media/t2i_001.png`, sidecar to `Media/.meta/t2i_001.png.json`, card shows `t2i_001`, project.json updated.
- **Upscale blob URL bug fixed**: dropped image now uploads correctly to ComfyUI before workflow runs.
- **Compare works**: select 2 cards → compare button → MpiCompareOverlay opens with slider.
- **Drag card to promptbox works**: `/project-file?path=...` URL passes through correctly.
- groupHistory workspace is a stub — clicking a card navigates there but shows placeholder HTML.

## Not Committed
No git commits made this session. All changes are working tree modifications only.

## Open Questions
1. When project loads from disk, `itemGroups[].history[].filePath` will be `/project-file?path=...` API URLs. These work for display. For future operations (upscale the selected image), `commandExecutor._buildParams` sets `Input_Image = imageItem.url`. `comfyController._uploadImage` can fetch `/project-file?path=...` URLs (they're server-relative, the browser can fetch them). This should work but is untested after a reload.
2. The `:has()` CSS selector in `MpiCompareOverlay.css` for overriding `MpiOverlay__container max-width` — check browser/Electron compatibility. If `:has()` fails, the compare canvas may be constrained to 600px wide.

</current_state>
```
