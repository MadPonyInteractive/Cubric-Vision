# MPI-153 — Add audio filter to gallery

## Findings

**Case (a): audio items already exist in the data model and render in the gallery.**

Audio is a first-class type throughout the codebase:

- `js/data/projectModel.js:122` — `createAudioItem()` factory; `group.type === 'audio'` in the `ItemGroup` typedef (line 149).
- `MpiGalleryBlock.js:47` — `createAudioItem` is imported and used. Audio groups flow into the gallery `itemGroups` array today.
- `MpiGalleryGrid.js:810` — card `_render()` already branches on `isAudio = selected?.type === 'audio' || group.type === 'audio'` and calls `_swapThumbToAudio()` + `_ensureAudioCardControls()`.
- `MpiGalleryBlock.js:199` — `open-group` handler short-circuits for `group?.type === 'audio'` (audio cards are in-place players, not click-through).

Audio items are fully wired — they just have no dedicated filter chip.

**Filter system (all references in `MpiGalleryGrid.js`):**

| Concern | Location |
|---|---|
| HTML slot declarations | `MpiGalleryGrid.js:86–90` — five `<div class="mpi-gallery-grid__tab-slot" data-filter="…">` inside `.mpi-gallery-grid__zone--right` |
| Tab definitions array | `MpiGalleryGrid.js:1486–1494` — `_tabDefs` — one object per sort/filter, rendered in order |
| Filter predicate | `MpiGalleryGrid.js:1303–1309` — `if (filter === 'images') …`, `if (filter === 'videos') …`, etc. inside `_rerenderJustified` |
| State key | `js/state.js:62` — `gallerySort: { order: 'newest', filter: 'all' }` — `filter` accepts the string values defined by `_tabDefs` |
| State comment | same line — lists `'all'|'images'|'videos'|'previews'|'favorites'` (needs `'audios'` added) |

**Icon check:**
`js/utils/icons.js:55` — `'audio'` icon already registered: `<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>`. No new icon needed.

---

## Plan

All changes are in two files. No new files, no CSS additions needed (the `mpi-gallery-grid__tab` class and `mpi-gallery-grid__tab--active` modifier are already used for all other filter chips).

**Step 1 — Add the HTML slot** (`MpiGalleryGrid.js:90`, template block)

In the `template` function's `.mpi-gallery-grid__zone--right` div, add a new slot between `data-filter="videos"` and `data-filter="previews"`:

```html
<div class="mpi-gallery-grid__tab-slot" data-filter="audios"></div>
```

**Step 2 — Add the tab definition** (`MpiGalleryGrid.js:1486–1494`, `_tabDefs` array)

Insert after `{ filter: 'videos', label: 'Videos' }`:

```js
{ filter: 'audios', label: 'Audio' },
```

**Step 3 — Add the filter predicate** (`MpiGalleryGrid.js:1303–1309`, inside `_rerenderJustified`)

Insert before the final `return true;`:

```js
if (filter === 'audios')    return g.type === 'audio';
```

**Step 4 — Update the state comment** (`js/state.js:62`)

Append `'audios'` to the filter union in the inline comment so it stays the documentation source of truth. No runtime behavior changes — comments only.

---

## Risk / verify

**How to verify:**
1. Open the gallery of a project that has audio cards imported via drag-and-drop.
2. Confirm an "Audio" chip appears in the filter row between "Videos" and "Previews".
3. Click "Audio" — only audio cards should remain visible.
4. Click "All" — full gallery restores.
5. Click "Images" and "Videos" to confirm they are unaffected.
6. If no audio assets exist yet in the test project, drag in any `.mp3`/`.wav` file — audio card renders, then apply the filter.

**Caveats:**
- The `audios` filter string is chosen to match the plural pattern of `images` / `videos` / `previews` / `favorites`. This string only needs to be consistent between the slot `data-filter` attribute, the `_tabDefs` entry, and the predicate — it is never stored to disk.
- Audio cards are "imported input" assets only (no generation pipeline in Vision). The chip will show 0 items in projects that have none, which is correct behavior consistent with "Images" showing 0 in a video-only project.
- No CSS changes: the tab chip inherits existing `.mpi-gallery-grid__tab` styles. Audio icon is registered but the current tab design uses text labels only (matching `Images`, `Videos`, `Previews`, `Favs`), so no icon wiring is needed for this chip unless the design intent changes.
