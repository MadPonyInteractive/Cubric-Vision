```xml
<original_task>
Continue building MpiAiSuite from the previous session's whats-next.md. Specific goals this session:
1. Fix compare overlay labels showing raw encoded URL paths instead of filenames
2. Implement delete handler for gallery cards (was console.log stub)
3. Handle missing media files gracefully (file deleted from disk manually)
4. Add spinner to generating cards while waiting for ComfyUI latent preview
5. Remove "Generating..." overlay label once latent preview starts displaying
</original_task>

<work_completed>

## Compare overlay labels — filename extraction fix
File: `js/components/Compounds/MpiCompareOverlay/MpiCompareOverlay.js` lines 138–150

`_basenameNoExt()` now decodes `project-file?path=C%3A...` URLs before extracting the filename.
Before: displayed `C%3A%5CAI%5CMpi%5CMpiAiSuite%5CMpi%...`
After: displays `t2i_001`

Fix: checks `filePath.includes('project-file')`, extracts and `decodeURIComponent`s the `path=` query param, then does the normal basename+extension-strip logic.

## Delete handler — fully implemented
Files modified:
- `js/workspaces/gallery/gallery.js`
- `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`

### gallery.js changes
- Added imports: `removeGroupFromProject`, `updateGroupInProject` from projectModel; `MpiOkCancel` from Compounds
- Added `_persistGroups()` helper — shared by delete, GC, and future callers; fires `POST /update-project` fire-and-forget
- Replaced `console.log` stub with full delete flow:
  - `_pendingDeleteGroups` captured on `grid.on('delete', ...)`
  - `_deleteDialog.on('ok', ...)` registered once at mount (avoids stacking listeners)
  - On confirm: iterates all history items, extracts filename from `/project-file?path=...` URL via regex, fires `DELETE /project-media/:id/:filename?folderPath=...` per file
  - Removes groups from `state.currentProject` via `removeGroupFromProject` loop
  - Calls `_persistGroups()` to write updated `itemGroups` to project.json
  - Calls `grid.el.removeCard(group.id)` for each deleted group

### MpiGalleryGrid.js changes
- Added `removeCard(groupId)` public API method:
  - Removes wrapper element from DOM
  - Removes from `_cardMap` and `_groups`
  - Removes from `_selectedIds`
  - Exits selection mode if nothing remains selected; otherwise updates count

## Missing media GC — card-level onerror → promote or remove
Files modified:
- `js/components/Compounds/MpiGroupCard/MpiGroupCard.js`
- `js/components/Compounds/MpiGroupCard/MpiGroupCard.css`
- `js/components/Blocks/MpiGalleryGrid/MpiGalleryGrid.js`
- `js/workspaces/gallery/gallery.js`

### MpiGroupCard.js
- `_render()` now sets `thumb.onload` and `thumb.onerror` before assigning `thumb.src`
- `onload`: removes `mpi-group-card--missing` class
- `onerror`: adds `mpi-group-card--missing` class (CSS `::after` covers the broken icon), then emits `'media-missing' { group, itemId }`

### MpiGroupCard.css — `--missing` state
```css
.mpi-group-card--missing .mpi-group-card__media::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--surface-3);
}
```
Covers the broken browser image icon with the media container's background color.

### MpiGalleryGrid.js
- Added import: `removeHistoryEntry` from projectModel
- `_makeCard()` now wires `card.on('media-missing', ...)`:
  - If `group.history.length <= 1`: calls `el.removeCard(g.id)` + emits `'gc-remove' { groupId }`
  - Otherwise: calls `removeHistoryEntry(g, missingIdx)` to prune that entry, updates `_groups[idx]`, calls `card.el.setDone(pruned)` to re-render with next entry, emits `'gc-group' { group: pruned }`
- Added to JSDoc emits: `'gc-group'` and `'gc-remove'`

### gallery.js GC handlers
- `grid.on('gc-group', ...)`: updates `state.currentProject` via `updateGroupInProject`, calls `_persistGroups()`
- `grid.on('gc-remove', ...)`: updates `state.currentProject` via `removeGroupFromProject`, calls `_persistGroups()`

## Spinner on generating cards
Files: `MpiGroupCard.js`, `MpiGroupCard.css`

- Added `<div class="mpi-group-card__spinner">` to template, inside `.mpi-group-card__preview`
- `_applyGenerating(true)` shows the spinner (`spinner.style.display = ''`)
- `updatePreview(url)` hides the spinner (`spinner.style.display = 'none'`) when first latent preview arrives
- CSS: spinner is `position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%)`, `z-index: 2`, rotating border animation
- `@keyframes` includes `translate(-50%, -50%)` in both `from` and `to` to prevent drift during rotation

## "Generating..." overlay label — removed
The `<div class="mpi-group-card__generating-label">Generating...</div>` element was removed entirely from the template. The card footer's `mpi-group-card__name` already shows "Generating..." (set by `addGeneratingCard`), so the overlay label was redundant and was obscuring the latent preview. All associated CSS was also removed.

## Note: `_persistGroups()` deduplication
The `onComplete` handler in gallery.js still has its own inline `fetch('/update-project', ...)` — this was not refactored to use `_persistGroups()` since it was working and the session focused on the specific tasks above. Low-priority cleanup for a future session.

</work_completed>

<work_remaining>

## 1. groupHistory workspace — full build (highest priority)
File: `js/workspaces/groupHistory/groupHistory.js` (currently placeholder HTML only)

Layout needed:
- Left toolbar: image ops (upscale, detail, crop, compare) or video ops depending on group.type
- Centre: large view of selected entry — `<img>` for image, MpiVideoPlayer for video
- Right panel: history cards — thumbnail, operation label, model, date; click → `promoteSelectedIndex`
- PromptBox at bottom (locked to group's type, same as gallery)
- MpiProjectName: `setGalleryLabel('Gallery')` + `setGroupLabel(group.name)`
- Compare in group history: user selects 2 history entries → `MpiCompareOverlay.open(itemA, itemB)`
- Data loading: `state.currentPage` router passes `{ groupId }` — find group by id in `state.currentProject.itemGroups`

## 2. gallery.js — download handler
File: `js/workspaces/gallery/gallery.js` line ~76

Still `console.log` stub. Should:
- Zip selected groups' media files (all history items' `filePath` values)
- Trigger browser download
- New server route `POST /project/download-groups` that zips and streams

## 3. gallery.js onComplete — use _persistGroups()
File: `js/workspaces/gallery/gallery.js` lines ~321–328

The inline `fetch('/update-project', ...)` in `onComplete` should be replaced with `_persistGroups()` for consistency. Minor cleanup.

## 4. Video workflow support — needs testing
User plans to add a video workflow. `save-generation` derives extension from ComfyUI view URL filename param — should handle `.mp4`, `.webm` etc. automatically. End-to-end untested pending user adding a workflow file.

## 5. state.js legacy cleanup (deferred — confirmed by user)
Legacy flat properties: `g_currentGuide`, `g_promptEN`, `g_images`, `toolComfySettings`, `runningComfyTool`, `detailerInputImage` — dead, remove when old workspace references confirmed fully gone.

## 6. modelRegistry.js — runtime installed check
`installed: false` hardcoded in all model definitions. Server needs to check disk and return installed status.

## 7. MpiSelectionBar — add to dev gallery
Not yet in `js/pages/components.js`. Low priority.

## 8. navigation.js JSDoc stale comment (cosmetic)
`_syncRadial` has a stale comment block referencing old pattern.

## 9. PAGE_WORKSPACE deprecated alias
`router.js` still exports `PAGE_WORKSPACE = 'gallery'` — remove when confirmed unused.

</work_remaining>

<attempted_approaches>

## Broken image icon — many failed attempts

**Attempt 1**: `thumb.src = ''` in onerror
Result: Setting `src = ''` triggers another `onerror` (browser treats empty string as a failed relative URL request), causing an infinite loop.

**Attempt 2**: `thumb.onerror = null; thumb.removeAttribute('src')`
Result: User reported the broken icon was still visible. `removeAttribute` leaves the `<img>` element in a "no source" state but some browsers still display the broken icon placeholder briefly or permanently depending on render timing.

**Attempt 3**: `thumb.style.visibility = 'hidden'` before setting src, `onload` clears it
Result: `visibility: hidden` reserves space and browsers can still paint the broken icon into it.

**Attempt 4**: `thumb.style.opacity = '0'` before setting src, `onload` clears it
Result: User reported icon still visible. `opacity: 0` does hide the icon but the timing of when onerror fires vs when the browser first renders the broken placeholder can leave a flash.

**Final working approach**: CSS `::after` overlay on `--missing` class
The `mpi-group-card--missing` class adds a `::after` pseudo-element with `position: absolute; inset: 0; background: var(--surface-3)` that sits on top of the `<img>` element and covers the broken icon. `onload` removes the class. This works because it doesn't fight the browser's native broken-image rendering — it just covers it.

## "Generating..." label — removal vs fade
Tried a CSS fade approach using `--has-preview` class toggled when `updatePreview` fires. This failed because some workflows never send preview images (latent previews), so `updatePreview` never fires and the label stayed forever. Final fix: removed the label element entirely from the template. The footer card name already shows "Generating..." making the overlay label redundant.

## Delete listener stacking
Initially registered `_deleteDialog.on('ok', ...)` inside `grid.on('delete', ...)`. The ComponentFactory `on()` method pushes callbacks to an array (no deduplication), so each time delete was triggered it stacked another listener, causing multiple delete operations on one confirm click. Fixed by registering the `ok` handler once at mount time and using `_pendingDeleteGroups` variable to capture the current selection.

</attempted_approaches>

<critical_context>

## Architecture Rules
- **Tier 1 Primitives**: Cannot import anything from components
- **Tier 2 Compounds**: Can only import Primitives (+ data/, utils/, events.js, state.js)
- **Tier 3 Blocks**: Can import Primitives + Compounds
- gallery.js is a workspace — it CAN import Compounds directly

## ComponentFactory pattern — critical gotcha
- `el = container.firstElementChild` — `el` IS the root DOM element
- NEVER do `el.querySelector('.same-class-as-root')` — searches descendants only, returns null
- `instance.on(event, cb)` pushes to an array — no deduplication. Register handlers once at mount, not inside event callbacks.

## filePath convention (post-persistence)
After `save-generation` succeeds, `item.filePath` is `/project-file?path=C%3A%2F...` — a server-relative API URL. Code that receives a `filePath` must handle all cases:
- Raw disk path: `C:\Projects\...\t2i_001.png`
- API URL: `/project-file?path=...` (already resolvable by browser, contains `project-file`)
- Comfy view URL (ephemeral fallback): `http://127.0.0.1:8188/view?filename=...`
- Blob URL (from file drop): `blob:http://127.0.0.1:3000/...`

Pattern to detect "already a URL": `p.startsWith('http') || p.startsWith('blob:') || p.startsWith('data:') || p.includes('project-file')`

To extract filename from a `/project-file?path=...` URL:
```js
const match = fp.match(/[?&]path=([^&]+)/);
const absPath = decodeURIComponent(match[1]);
const filename = absPath.replace(/\\/g, '/').split('/').pop();
```

## DELETE /project-media route
`DELETE /project-media/:projectId/:filename?folderPath=<encoded>`
- `:projectId` = `project.id`
- `:filename` = just the base filename (e.g. `t2i_001.png`), NOT the full path
- `folderPath` = query param, absolute project folder path
- Automatically removes sidecar `.meta/<filename>.json` if present
- Returns 404 if file not found (non-fatal, ignore in delete handler)

## removeHistoryEntry guard
`projectModel.removeHistoryEntry` has a guard: `if (group.history.length <= 1) return group` — it will NOT remove the last entry. The GC handler in MpiGalleryGrid handles this explicitly: checks `g.history.length <= 1` first and removes the card entirely instead of calling `removeHistoryEntry`.

## MpiButton props.disabled is immutable after mount
Click handler checks `props.disabled` (initial value), not the DOM attribute. Don't pass `disabled: true` at mount if you intend to enable it later.

## MpiOverlay — Stash Pattern
MpiOverlay stashes `#tool-container` children in a hidden div rather than removing them. MpiCompareOverlay correctly inherits this.

## InteractiveCanvas — InputController cleanup
InputController attaches event listeners to `window`. MUST call `canvas.destroy()` when hiding/unmounting. MpiCompareOverlay's `el.hide` override handles this.

## ComfyUI Mapping Rules
- Title-based injection ONLY — node IDs never hardcoded
- Key titles: `Positive`, `Negative`, `Seed`, `Input_Image`, `Input_Mask`, `Output`
- Only `Output` nodes fire `onComplete`
- commandExecutor loads workflow JSON client-side to build `outputNodeIds` Set before execution

## sidecar strategy
Sidecars live in `Media/.meta/<filename>.json`. GC on every `save-generation` call. No GC on project load.

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
- Status bar: `js/shell/statusBar.js`
- ComfyUI WebSocket controller: `js/services/comfyController.js`
- Command executor: `js/services/commandExecutor.js`
- Client logger: `js/services/clientLogger.js`
- Model registry: `js/data/modelRegistry.js`
- Command registry: `js/data/commandRegistry.js`
- Project data model: `js/data/projectModel.js`
- Gallery workspace: `js/workspaces/gallery/gallery.js`
- GroupHistory workspace: `js/workspaces/groupHistory/groupHistory.js`
- MpiGroupCard: `js/components/Compounds/MpiGroupCard/`
- MpiGalleryGrid: `js/components/Blocks/MpiGalleryGrid/`
- MpiCompareOverlay: `js/components/Compounds/MpiCompareOverlay/`
- MpiOkCancel: `js/components/Compounds/MpiOkCancel/`
- ComfyUI mapping rules: `.agents/workflows/comfyui_mapping_rules.md`
- Component rules: `dev_docs/05_components.md`

</critical_context>

<current_state>

## Deliverable Status

| Item | Status |
|------|--------|
| commandRegistry.js | Complete |
| modelRegistry.js | Complete (installed: false hardcoded) |
| projectModel.js | Complete |
| router.js new page constants | Complete |
| navigation.js rewrite | Complete |
| MpiProjectName 2-level breadcrumb | Complete |
| MpiGroupCard component | Complete |
| MpiSelectionBar component | Complete (not yet in dev gallery) |
| MpiGalleryGrid component | Complete |
| MpiDropdown — disabled options + setOptions API | Complete |
| MpiPromptBox — media drop zone | Complete |
| MpiPromptBox — run/stop generate button | Complete |
| MpiButton | Complete |
| MpiErrorDialog — support hint | Complete |
| MpiCompareOverlay | Complete — labels now show real filenames |
| gallery.js workspace | Complete (compare wired, persistence wired, delete wired, GC wired) |
| commandExecutor.js | Complete |
| clientLogger.js | Complete |
| routes/projects.js POST /project/save-generation | Complete |
| MpiGroupCard spinner | Complete — shows during generation, hides on first latent preview |
| MpiGroupCard missing-file handling | Complete — `--missing` CSS covers broken icon; GC promotes history or removes card |
| gallery.js delete handler | Complete — confirm dialog, fires DELETE per file, updates state + disk |
| gallery.js GC handlers (gc-group / gc-remove) | Complete |
| groupHistory.js workspace | Stub only — placeholder HTML |
| gallery.js download handler | Stub (console.log) |
| Dropped image → new gallery card | Not implemented |
| Model installed-check endpoint | Not started |
| MpiSelectionBar in dev gallery | Not done |
| state.js legacy cleanup | Deferred |
| PAGE_WORKSPACE alias removal | Deferred |

## App Boot / Runtime Status
- Landing page loads. Settings/Help/About overlays work.
- Opening a project navigates to gallery workspace.
- t2i generation works end-to-end: spinner shows, latent preview replaces spinner, image saved to `Media/t2i_NNN.png`, card shows filename, project.json updated.
- Upscale blob URL bug fixed (prior session).
- Compare works: select 2 cards → compare button → MpiCompareOverlay opens with slider and correct filenames in labels.
- Drag card to promptbox works.
- Delete works: confirm dialog → files deleted from disk → cards removed from grid → project.json updated.
- Missing file GC: card with deleted file triggers onerror → if multi-entry history promotes next entry; if last entry removes card → project.json updated.
- groupHistory workspace is a stub — clicking a card navigates there but shows placeholder HTML.

## Not Committed
No git commits made this session. All changes are working tree modifications only.

## Open Questions / Known Issues
1. The broken image icon on missing cards: the `--missing` CSS `::after` approach covers it, but there may still be a brief flash of the browser's native broken icon before the onerror handler fires and the class is applied. Acceptable for now — the GC removes the card anyway shortly after.
2. `onComplete` in gallery.js still has its own inline `fetch('/update-project', ...)` instead of calling `_persistGroups()`. Works correctly, just inconsistent. Low-priority cleanup.
3. Generations that produce no Output node images (`[gallery] Generation completed but no Output node images returned`) leave the generating card briefly then remove it — this is correct behavior, no card is left behind.

</current_state>
```
