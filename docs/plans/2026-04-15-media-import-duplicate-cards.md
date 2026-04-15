# Bug: Media Import Creates Two Duplicate History Cards

**Status:** Investigating
**Created:** 2026-04-15

## Problem Statement

When a user drops an image or video file from the filesystem into the prompt box in the gallery workspace, two history card groups appear visually — but only one exists in the backend/persistence. Navigating away and back shows only the single correct entry.

## Root Cause Investigation Log

### Confirmed Facts

- **Only 1 entry in backend:** After drop, `project.json` contains exactly one new `itemGroup` for the imported media
- **2 visual cards appear:** The gallery grid renders two cards for the same imported item
- **Navigating away and back shows 1 card:** The duplicate is purely visual — `state` and `project.json` have the correct single entry
- **Generating works correctly:** Running a generation creates exactly 1 card (no duplicate)
- **Playwright confirmed:** After gallery → history → gallery navigation, `Events._listeners.get('media:imported').size === 2` — two active listeners

### Timeline of Changes Made

1. **`MpiPromptBox.js`** — On native file drop: uploads to project media folder, then emits `media-imported` (component event) AND `Events.emit('media:imported')` (event bus)
2. **`MpiGalleryBlock.js`** — Listens to `Events.on('media:imported')` and calls `grid.el.setGroups([finalGroup, ...currentGroups])` to prepend the new card
3. **`routes/projects.js`** — Metadata now written to `Media/.meta/` (was alongside file) — correct
4. **`MpiPromptBox.js`** — `filePath` now constructed as `/project-file?path=<url-encoded absolute path>` — correct

### What Was NOT the Fix

- `_toolContainer.innerHTML = ''` in `navigation.js` — already existed before this task; NOT changed
- No `destroy()` call on block unmount (navigation does not call destroy)
- `MpiGalleryBlock` uses `MutationObserver` cleanup (not verified to work yet)

### Current `MpiGalleryBlock` Handler (relevant section)

```javascript
const _unsubMediaImported = Events.on('media:imported', ({ url, filename, mediaType }) => {
    if (!state.currentProject) return;
    // ... build item and group ...
    state.currentProject = addGroupToProject(state.currentProject, finalGroup);
    _persistGroups();
    const currentGroups = state.currentProject.itemGroups || [];
    grid.el.setGroups([finalGroup, ...currentGroups]);
});

const _observer = new MutationObserver(() => {
    if (!document.contains(el)) {
        _unsubMediaImported();
        _observer.disconnect();
    }
});
_observer.observe(document.body, { childList: true, subtree: true });
```

## Hypotheses

### H1: MutationObserver doesn't fire for navigation's `innerHTML = ''`
If `document.contains(el)` still returns `true` when navigation clears `_toolContainer.innerHTML = ''`, the observer never fires, `_unsubMediaImported()` is never called, and listeners accumulate.

**Test:** Add `console.log` inside the observer callback to confirm it fires when navigating away from gallery.

### H2: `setGroups` called twice within same render cycle
If `addGroupToProject` and `setGroups` somehow execute twice synchronously, `finalGroup` could be prepended twice to the grid's internal `_groups` array.

**Test:** `console.log([finalGroup.id, ...currentGroups.map(g=>g.id)])` inside the handler to see if it's called twice.

### H3: `_rerenderJustified` debounce causes duplicate render
`_rerenderJustified` has a 16ms debounce. If `_groups` array somehow ends up with two copies of the same group ID, the debounce doesn't prevent duplicates — it just delays them.

**Test:** Check `_groups` array length and IDs inside `_rerenderJustified` when it fires.

### H4: Two separate blocks mounted simultaneously
If `handleNavigation` somehow mounts two `MpiGalleryBlock` instances simultaneously (race condition), both would register listeners and both would call `setGroups`.

**Test:** `console.log('MpiGalleryBlock setup called')` at top of `setup()` function. If it fires twice for a single gallery visit, this is the cause.

## Verification Steps

1. Add debug logging to `MpiGalleryBlock` setup and `Events.on` handler
2. Perform drop in gallery, observe console for duplicate logs
3. Navigate gallery → history → gallery, observe listener count via Playwright:
   ```js
   const m = await import('/js/events.js');
   m.Events._listeners.get('media:imported')?.size  // should be 1
   ```

## Files Involved

| File | Change |
|------|--------|
| `js/components/Blocks/MpiPromptBox/MpiPromptBox.js` | Upload on drop, emit events |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | Listen, create card, MutationObserver cleanup |
| `js/shell/navigation.js` | `_toolContainer.innerHTML = ''` — does NOT call destroy() |
| `routes/projects.js` | Metadata to `Media/.meta/`, `filePath` format fix |
