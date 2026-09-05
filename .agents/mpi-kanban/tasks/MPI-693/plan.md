# MPI-693 — Plan

Two slices, one file. No mode, no toggle, no stored preference, no new CSS.

## Files

| File | Change |
|---|---|
| `js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js` | `_collect()` returns cards; `_buildTile` takes the label; hover-play audio |
| `tests/desktop/media-picker-cards.spec.js` | new spec (see § Verify) |
| `docs/component-contracts.md` | one short section — the picker lists cards, and the `data-src` trap |

---

## Phase 1 — the picker lists cards, not files

`_collect()` (`MpiMediaPicker.js:109`) stops walking `group.history` and returns one entry per group:

```
for (const group of groups) {
    if (group.archived) continue;                                 // MPI-678, already there
    if (_filter !== 'all' && group.type !== _filter) continue;    // g.type, like the gallery
    const item = group.history?.[group.selectedIndex];
    if (!item?.filePath) continue;                                // pending/failed card — no file
    out.push({ item, type: item.type || group.type, label: group.customName || _stripExt(_basename(item.filePath)) });
}
```

Four things to get right:

1. **The type filter reads `group.type`, not the item's.** `_collect()` filtered per item because a
   group may hold mixed types; that only made sense when the tiles *were* items. The picker now
   claims to show the gallery's cards, so it buckets them the way the gallery does
   (`MpiGalleryGrid.js:1858-1860`). Filtering per item would make a card whose selected take is an
   image vanish from the Videos tab the gallery lists it under.
2. **The label is `customName`, else the FILENAME** — the user's rule, and it is deliberately *not*
   the gallery's chain (`customName || selected?.name || group.name`, `MpiGalleryGrid.js:1228`).
   That chain ends at `group.name`, which defaults to the literal string `'Untitled Group'`; a grid
   of tiles all reading "Untitled Group" is worse than the filenames the picker shows today.
3. **The label is carried on the entry.** `_buildTile` currently derives its own name from
   `displayName || basename`; it takes `entry.label` instead, so there is one naming rule in one
   place. Same string feeds the tile caption, the `title` tooltip and the `aria-label` on Preview.
4. **A group whose selected item has no `filePath` is skipped, not drawn broken.** Same rule the
   per-item collect already applied; handing a Flow slot a card with no file resolves to a broken URL.

That is the whole change — the grid, the filter tabs, the upload/mic/voice cards, Preview and the
empty state are all untouched and keep working on the new entry shape.

**One behaviour is lost, and it should be lost knowingly:** a Flow slot can no longer reach a
non-selected history take directly. It is still reachable — select that take on the card in the
gallery, then open the slot — but it is now two surfaces instead of one. Flagging it rather than
hedging: the user asked for cards only.

## Phase 2 — audio plays on hover

In `_buildTile`'s `type === 'audio'` branch, mirror the video branch next to it and the gallery's
audio card (`MpiGalleryGrid.js:870-886`):

- **Create the `<audio>` lazily, on the first `mouseenter`** — not at build time. An element per tile
  at `preload="metadata"` is a metadata fetch for every tile the moment an Audio-filtered picker
  opens, for tiles nobody will hover. Keep it afterwards so replay is instant.
- `audio.volume = Storage.getGalleryVolume()`; **`0` returns early** — a silent play would swap the
  icon to Stop and lie about what is happening (the gallery's own rule, `MpiGalleryGrid.js:875`).
- `mouseenter` → stop the picker's other clip, `play()`. `mouseleave` → `pause()` + `currentTime = 0`.
- Swap the tile glyph `audio` → `stop` on `play`, back on `pause`/`ended`, so a hovering user has a
  visual cue for the sound.
- **Do not put `data-src` on these elements.** `_stopOtherGalleryMedia` in `MpiGalleryGrid.js` selects
  `audio[data-src]` across the whole **document** and runs on every gallery scroll event; the picker
  is portalled to `document.body` by `MpiModal`, so that attribute would hand the gallery a remote
  control over the picker's playback. Keep one module-local `_playing` reference instead.
- Stop playback in `el.hide()` **and** `el.destroy()` — a modal dismissed mid-clip must not keep
  singing behind the Flow.

Nothing is needed for the gallery playing *underneath*: `MpiModal` registers with `Overlays`, and the
grid's `'overlay'` hold already demotes and stops its own media at depth > 0 (`docs/gallery.md`
§ "Media suspension").

The large `_openPreview` layer already autoplays audio with controls and is untouched.

## Conventions this must not break

Icons from `js/utils/icons.js` (`audio`/`stop` both exist), DOM via `ce`/`qs`/`on`, and **every**
listener's unsubscribe into `_unsubs`. No new control is added, so no new component or BEM block.
The `<audio>` elements are children of tiles inside `el`, so `modal.el.destroy()` takes them; the
explicit stop above is about sound, not leaks.

## Verify

1. `npx eslint js/components/Compounds/MpiMediaPicker` — the component ruleset is what catches a raw
   `addEventListener` or a bare form control.
2. New spec `tests/desktop/media-picker-cards.spec.js` (there is no picker spec today):
   - fixture project, one group with 3 history entries and a `customName` → **1** tile, captioned
     with the `customName`;
   - a second group with no `customName` → captioned with its selected item's filename, no extension;
   - an archived group and a group whose selected item has no `filePath` → neither renders;
   - the Videos tab shows a `type: 'video'` group whose selected take is an image;
   - an audio tile: `mouseenter` → its `<audio>` is not paused; `mouseleave` → paused and
     `currentTime === 0`.
   Read `docs/testing-desktop-specs.md` before writing it — the flow-overlay and stubbed-global-state
   traps are live here.
3. Live check in the user's own app (`docs/testing.md` — never take `:3000`): open a Flow audio slot
   on the project from the screenshot and confirm 1 tile per card with the right names.
4. Hover-play is a judgement call as much as a mechanism — confirm with the user that hovering feels
   right (and at what volume) rather than closing on the spec alone.

## Deliberately not doing

- No cards/files toggle and no stored preference — dropped on the user's instruction, 2026-09-05.
- No history drill-down inside the picker. A card→takes expansion here is a second gallery.
- No volume control in the picker. It reads the gallery's, which is the one the user already sets.
