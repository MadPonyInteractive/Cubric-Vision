# Plan — Unify Drag-Drop Media Behavior (Gallery + History)

## Context

Last session added `MpiGalleryDropOverlay` to the Gallery page so OS file drags over the page show an overlay and import into a new gallery card. History page has no equivalent — inconsistent UX. Additionally, `MpiPromptBox` already has a media drop-zone that silently ignores drops when the current model's operations don't support the dropped media type (`MpiPromptBox.js` lines 204-205, 218-219) — no user feedback.

**Goal**:
1. Extract the gallery overlay into a reusable, dumb media-drop primitive.
2. On **Gallery** page: keep current behavior (card + display) **and also** inject dropped media into the PromptBox if compatible.
3. On **History** page: add the same overlay; dropped media is injected into PromptBox only (no new history entry).
4. On **incompatible drop** (PromptBox or via overlay path): show a warning toast — `"Media type not supported for this model."`

**Out of scope** (next session): Landing/project page drop overlay for `.json` project files / project folders.

---

## Architecture Decisions (confirmed with user)

- **Dumb primitive**: rename `MpiGalleryDropOverlay` → `MpiMediaDropOverlay`. Primitive only handles show/hide + `preventDefault` + a `props.onDrop({file, mediaType})` callback. No upload, no `Events.emit` inside the primitive.
- **PromptBoxService.injectMedia({url, mediaType})**: new service wrapper (mirrors existing `injectPrompts`) delegating to a new `el.injectMedia()` on the component.
- **Compat check + toast live inside `el.injectMedia()`** on `MpiPromptBox`. Returns `true` on success, `false` on reject (after firing toast). Single source of truth — reused by gallery block, history block, and the existing promptbox drop-zone paths.

---

## File-by-file Changes

### 1. Rename + refactor primitive

**Rename directory**: `js/components/Primitives/MpiGalleryDropOverlay/` → `js/components/Primitives/MpiMediaDropOverlay/`

**`MpiMediaDropOverlay.js`** — replace upload + Events.emit block with callback:
- Rename export: `MpiGalleryDropOverlay` → `MpiMediaDropOverlay`
- Remove imports: `state`, `uploadMediaFile`, `clientLogger` (no longer needed here)
- In `setup(el, props)`:
  - Keep `show()`, `hide()`, `dragover` preventDefault, `ui:close-all-popups` listener.
  - Drop handler extracts file + `mediaType` (image/video, else silent return) then calls `props.onDrop?.({ file, mediaType })`. No upload, no emit.
- Update header JSDoc to document the `onDrop` prop and dumb-primitive contract.

**`MpiMediaDropOverlay.css`** — rename class prefix `.mpi-gallery-drop-overlay*` → `.mpi-media-drop-overlay*` (including `@keyframes`). BEM preserved.

### 2. `js/shell/preloadStyles.js`

Update the overlay CSS path to the new directory + filename.

### 3. `js/components/types.js`

- Update the primitive's props doc: new `onDrop({file, mediaType})` callback; show/hide instance API unchanged.
- Add to MpiPromptBox doc: new instance method `el.injectMedia({url, mediaType}) → boolean`.
- Add to PromptBoxService doc: new `injectMedia({url, mediaType}) → boolean`.

### 4. `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`

- Import `MpiToast` from `../../Primitives/MpiToast/MpiToast.js`.
- Add helper `_showIncompatibleToast()`:
  - Create throwaway `div` wrapper (position: fixed; z-index high; pointer-events: none).
  - Append to `document.body`.
  - `MpiToast.mount(wrapper, { message: 'Media type not supported for this model.', variant: 'warning', duration: 3000 })`.
  - On `close` event: remove wrapper.
- Add public method on `el`:
  ```js
  el.injectMedia = ({ url, mediaType }) => {
      if (mediaType === 'image' && !acceptsImage) { _showIncompatibleToast(); return false; }
      if (mediaType === 'video' && !acceptsVideo) { _showIncompatibleToast(); return false; }
      _tryAddMedia({ url, file: null, mediaType, source: 'app' });
      return true;
  };
  ```
- **Replace silent-reject returns** in the existing drop-zone handler with `_showIncompatibleToast(); return;`:
  - Lines 204-205: internal `application/mpi-media` branch — dragging an **item card from the gallery** onto the promptbox. With this change, dragging a video card onto an image-only model (or vice-versa) now fires the toast instead of silently doing nothing.
  - Lines 218-219: native OS-file branch — dropping a file directly onto the promptbox's drop zone.
- Net effect — toast fires on **every** incompatible path: overlay drop (gallery + history), direct OS-file drop on promptbox, and internal card drag from gallery onto promptbox.
- Note: `acceptsImage`/`acceptsVideo` are recomputed on model change — verify they are in scope at the time `injectMedia` is called (they're captured from the current model binding — if they're `let` in setup, new closure reads stay current).

### 5. `js/shell/promptBoxService.js`

After `injectPrompts` (line 109), add:
```js
injectMedia({ url, mediaType } = {}) {
    return _instance?.el?.injectMedia?.({ url, mediaType }) ?? false;
},
```

### 6. `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`

- Swap import `MpiGalleryDropOverlay` → `MpiMediaDropOverlay` (from new path).
- Import `PromptBoxService` (if not already).
- Mount overlay with `onDrop` callback. Move the existing upload + `media:imported` emit into the callback (preserving gallery-card creation via the existing `media:imported` listener at lines 370-390). After the `Events.emit('media:imported', ...)`, also call `PromptBoxService.injectMedia({ url: uploaded.filePath, mediaType })`.
- Keep existing window-level dragenter/leave/over/drop listeners that toggle overlay show/hide (no change to drag-counter logic).

### 7. `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`

- Add imports: `MpiMediaDropOverlay`, `uploadMediaFile`, `PromptBoxService` (verify existing), `state`, `clientLogger`.
- In `setup()`, after existing sub-component mounts:
  - Mount `MpiMediaDropOverlay` with an `onDrop` handler that:
    1. Validates `state.currentProject` (warn + return if missing).
    2. `const uploaded = await uploadMediaFile(file, mediaType, project.folderPath, project.id)`.
    3. If `uploaded`, call `PromptBoxService.injectMedia({ url: uploaded.filePath, mediaType })`.
    4. **No `Events.emit('media:imported', …)`** — history does not create a card for imported media.
  - Append overlay `el` into the block.
  - Register window-level `dragenter/dragleave/dragover/drop` listeners that toggle the overlay, using the same drag-counter pattern as `MpiGalleryBlock.js` lines 61-85 (filter out `application/mpi-media` internal drags).
- Update `el.destroy()`: push unsubs + remove all window listeners + call `dropOverlay.el.destroy?.()`.

---

## Migration Safety (rename)

Grep for usages before committing — expect only these:
- `js/shell/preloadStyles.js` — CSS path
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` — import + mount
- `js/components/types.js` — JSDoc
- CSS class names `mpi-gallery-drop-overlay` — should only appear inside the renamed CSS file itself
- No other consumers (History block is new wiring)

Run: `grep -r "MpiGalleryDropOverlay" js/` and `grep -r "mpi-gallery-drop-overlay" js/` after rename — both should return zero results.

---

## Verification

1. **Gallery — compatible drop**: image model, drop image from OS → gallery card appears AND image chip appears in promptbox, no toast.
2. **Gallery — incompatible drop**: image-only model, drop a video → gallery card is still created (current behavior preserved) BUT promptbox shows warning toast and no chip is added. *(Confirm with user whether a card should still be created for incompatible media — current plan preserves existing card-creation behavior regardless.)*
3. **History — compatible drop**: open a history group, drop image → promptbox chip appears, no new history entry, no toast.
4. **History — incompatible drop**: mismatched model, drop media → warning toast, no chip, no entry.
5. **PromptBox direct drop — incompatible OS file**: drop a file directly onto promptbox drop-zone with incompatible model → warning toast (previously silent).
6. **PromptBox direct drop — incompatible internal card**: on gallery page, drag a video item card onto a promptbox bound to an image-only model (or vice-versa) → warning toast, no chip added (previously silent).
6. **Escape closes overlay**: start drag, press Escape → overlay hides (via existing `ui:close-all-popups` subscription).
7. **Cleanup**: navigate away from History page → no window listener leaks (check with devtools or manually by dragging after nav — overlay should not appear).
8. **Console smoke test**: `PromptBoxService.injectMedia({ url: 'file:///existing/image.png', mediaType: 'image' })` on an image model → chip appears. On a video model → toast, returns `false`.

---

## Critical Files

- `js/components/Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.js` (rename + refactor)
- `js/components/Primitives/MpiMediaDropOverlay/MpiMediaDropOverlay.css` (rename + class prefix)
- `js/shell/preloadStyles.js`
- `js/components/types.js`
- `js/components/Blocks/MpiPromptBox/MpiPromptBox.js`
- `js/shell/promptBoxService.js`
- `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js`
- `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js`

---

## Open Question for User (verification step 2)

On the **gallery page**, if a user drops media incompatible with the current model:
- **A (current plan)**: gallery card created as today + promptbox toast (no chip).
- **B**: gallery card created + no toast (card is the "success" signal, promptbox skipped silently).
- **C**: no card, no chip, toast only (fully blocked, unified with history behavior).

Current plan assumes **A**. Flag on review.
