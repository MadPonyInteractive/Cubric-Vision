# Plan: Gallery Page OS-File Drop Target

## Context

Today only `MpiPromptBox` accepts file drops, and it filters by the current model's supported ops. That means a user running a tool that has no model (e.g. video post-processing tools) has no way to bring a video into a project — promptbox rejects it. Gallery media cards drag fine into the promptbox for internal use, but OS filesystem files have no ingress when the current model doesn't support them.

This plan adds a **Gallery-level drop target** that is **model-agnostic** — its intent is "add to library", not "attach to current prompt". History page and future project-folder/`project.json` drop are explicitly out of scope for this iteration.

### Decisions (user-confirmed)
- Model-agnostic import on Gallery drop (accept any image/video).
- Full-area overlay shown on window `dragenter` while files are being dragged.
- Gallery only — no History, no project-folder drop yet.
- Ignore internal `application/mpi-media` drags (only OS files).

## Approach

Reuse the existing ingest pipeline. Gallery emits the same `media:imported` event that `MpiGalleryBlock` already listens to (it creates the ItemGroup and persists). New code is thin: a drag-overlay component + extraction of the upload helper into a shared service so both PromptBox and Gallery use one path.

## Files

### New
- `js/services/mediaUploadService.js` — exports `uploadMediaFile(file, mediaType, projectFolderPath, projectId) -> { filePath, filename, itemId } | null`. Extracted from `MpiPromptBox._uploadToProjectMedia` + `_fileToBase64` (lines 177–219).
- `js/components/Compounds/MpiGalleryDropOverlay/MpiGalleryDropOverlay.js` — compound overlay with `show()`/`hide()`, emits `media:imported` on drop.
- `js/components/Compounds/MpiGalleryDropOverlay/MpiGalleryDropOverlay.css` — BEM styling, CSS vars only.

### Modified
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — mount overlay, wire window-level `dragenter`/`dragleave` with drag-counter, teardown in `destroy()`.
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` — replace inline upload helpers with `uploadMediaFile(...)` import.
- `js/shell/preloadStyles.js` — register `MpiGalleryDropOverlay.css`.
- `js/components/types.js` — document new component props (none required, but register name).

## Design Details

### Drag overlay visibility
Window-level listeners inside `MpiGalleryBlock.setup()` using a drag counter to avoid flicker on nested children:

```js
let dragCounter = 0;
const isFileDrag = (e) =>
    e.dataTransfer?.types?.includes('Files') &&
    !e.dataTransfer.types.includes('application/mpi-media');

const onEnter = (e) => { if (!isFileDrag(e)) return; dragCounter++; overlay.el.show(); };
const onLeave = () => { if (dragCounter > 0 && --dragCounter === 0) overlay.el.hide(); };
const onDrop  = () => { dragCounter = 0; overlay.el.hide(); };

window.addEventListener('dragenter', onEnter);
window.addEventListener('dragleave', onLeave);
window.addEventListener('drop',      onDrop);
```

### Drop handling (inside overlay)
```js
el.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const mediaType = file.type.startsWith('image/') ? 'image'
                    : file.type.startsWith('video/') ? 'video' : null;
    if (!mediaType) return; // silent reject
    const { currentProject } = state;
    const uploaded = await uploadMediaFile(file, mediaType, currentProject.folderPath, currentProject.id);
    if (!uploaded) return;
    Events.emit('media:imported', {
        url: uploaded.filePath,
        filename: uploaded.filename,
        itemId: uploaded.itemId,
        mediaType,
    });
});
```

### Reused event contract
`MpiGalleryBlock.js` lines 339–359 already listens to `media:imported` and does:
- `createImageItem` / `createVideoItem` with `{ filePath, uploaded: true, operation: 'imported' }`
- `createItemGroup`, `appendToHistory`, `addGroup`

No listener change. The payload shape from the overlay matches what the existing listener expects.

### Teardown (MpiGalleryBlock destroy)
```js
el.destroy = () => {
    _unsubs.forEach(fn => fn?.());
    window.removeEventListener('dragenter', onEnter);
    window.removeEventListener('dragleave', onLeave);
    window.removeEventListener('drop',      onDrop);
    overlay.destroy?.();
};
```

Overlay itself stores its own `_unsubs` (Escape via `ui:close-all-popups`) and releases them in its own `destroy()`.

### Edge cases
- **Nested child drag flicker** — drag counter (above).
- **Multiple files dropped** — take `files[0]` only (matches MpiPromptBox behavior).
- **Unsupported MIME** (e.g. `.zip`) — silent reject, overlay hides, no card created.
- **Internal ****`application/mpi-media`**** drag** — filtered out in `isFileDrag()`; overlay never appears for gallery-card drags.
- **Escape during drag** — overlay listens to `ui:close-all-popups` and hides; counter reset on next `drop`/`dragleave`.
- **No current project** — overlay stays hidden (early-return in enter handler if `!state.currentProject`).

## Rules Compliance (per `CLAUDE.md`)
- `ComponentFactory.create()` for both new components.
- BEM: `.mpi-gallery-drop-overlay`, `.mpi-gallery-drop-overlay__message`, `.mpi-gallery-drop-overlay--visible`.
- CSS vars from `styles/01_base.css`; no hardcoded colors.
- Icons (if any) from `js/utils/icons.js`.
- `Events.on/emit` for cross-component; unsubs stored and released in `destroy()`.
- No raw `document.querySelector` — use `dom.js` shorthands.
- No raw `window.addEventListener('keydown')` — Escape handled via existing `ui:close-all-popups` event.
- `state.currentProject` read only; never mutated directly here (existing `media:imported` listener handles persistence).
- Register CSS in `js/shell/preloadStyles.js`; register props/name in `js/components/types.js`.

## Verification

Run app at http://127.0.0.1:3000/ and test:

1. **Happy path — image** — drag a `.png` from Explorer onto gallery. Overlay appears; drop creates a new card, persisted to `project.json`.
2. **Happy path — video with no video model active** — drag an `.mp4`. Overlay appears regardless of current model; drop creates a video card.
3. **Internal drag ignored** — drag an existing gallery card around the grid. Overlay must NOT appear. Card still drags normally into promptbox.
4. **Nested hover stability** — drag file over grid, move across several cards. Overlay stays visible (no flicker).
5. **Unsupported MIME** — drag a `.zip`. Overlay appears on enter, but drop creates no card; overlay hides cleanly.
6. **Escape** — start drag, press Escape. Overlay hides. Re-enter window → reappears.
7. **Navigate away mid-drag** — route to History, then back to Gallery. Confirm no duplicate listeners (check DevTools) and destroy ran.
8. **Promptbox regression** — drag file onto promptbox as before. Still uploads via `uploadMediaFile` (shared service). Gallery overlay should NOT interfere (promptbox handler calls `e.stopPropagation()` or counter still resets on drop).
9. **Logs** — `logs/app.log` tail shows upload endpoint hits and no errors.

## Out of Scope (future plans)
- History page main-area drop → promptbox routing.
- Project-folder / `project.json` drop on Landing or new Project page.
- Batch drop (multiple files at once).
