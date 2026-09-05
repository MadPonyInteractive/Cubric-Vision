# MPI-693 — Media picker: persisted Cards/Files mode + audio plays on hover

## What the user asked for (2026-09-05)

Three things, on the pop-up media library (`MpiMediaPicker`, the modal a Flow slot opens):

1. A button that swaps the grid from **displaying the files** to **displaying the card names**.
2. In that mode it shows **only cards**, not every file in the project.
3. The button is **persistent — it survives an app restart**.
4. Separately: **audio should play when a tile is hovered.**

## Why the picker looks the way it does today

`_collect()` (`js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js:109`) walks
`state.currentProject.itemGroups` and pushes **every entry of every group's `history`**. A gallery
card with 14 takes is 14 tiles here, each captioned with its **filename**
(`displayName || basename(filePath)`, extension stripped). The screenshot the user sent is exactly
that: `flowMusicMaker_001 … _014` — one card, fourteen tiles.

The gallery next door does the opposite: one card per group, labelled
`group.customName || selected?.name || group.name` (`MpiGalleryGrid.js:1228`). So the user has
named their cards and the picker ignores those names and shows the raw takes instead.

So the two modes are:

| mode | one tile per | caption | type filter reads |
|---|---|---|---|
| `cards` | ItemGroup (its **selected** item) | the gallery's card label | `group.type` — same as the gallery |
| `files` | history entry (today's behaviour) | filename, ext stripped | the **item's** own type |

The filter difference is not cosmetic. `_collect()` filters per ITEM because a group may hold mixed
types; the gallery filters on `g.type` (`MpiGalleryGrid.js:1858-1860`). Cards mode must match the
gallery — it is claiming to show the same cards.

## Audio on hover

A video tile already plays on hover (`_buildTile`, the `type === 'video'` branch). An audio tile is a
static `renderIcon('audio')` and does nothing. The gallery grid has the behaviour the user wants,
including the details that cost something (`MpiGalleryGrid.js:870-886`):

- volume comes from `Storage.getGalleryVolume()`, and **0 IS the mute** — hover-play is skipped
  entirely at 0 rather than playing silently, because a silent play would swap the icon to Stop and
  lie about what is happening;
- `mouseleave` pauses **and** resets `currentTime = 0`;
- one clip at a time.

## Assumptions taken (say so if wrong)

- **First-launch default is `cards`.** The complaint is that the picker shows raw files, so cards is
  the useful side; after the first toggle the stored value owns it anyway.
- **The toggle is per-app, not per-slot.** One remembered preference for the whole picker.
- The Voice-library panel is untouched — it replaces the grid and has no tiles of its own.
