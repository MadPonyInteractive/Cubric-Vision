# MPI-693 — Media picker lists CARDS, not files, and audio plays on hover

## What the user asked for (2026-09-05)

Two things, on the pop-up media library (`MpiMediaPicker`, the modal a Flow slot opens):

1. **List cards only, never files.** One tile per gallery card. If the user gave the card a title,
   show the title; otherwise show the file name. *"Pretty much the same behaviour as the gallery."*
2. **Audio plays when a tile is hovered.**

The first ask arrived as a Cards/Files toggle with a persisted preference; the user cut that on the
same day — no toggle, no stored setting, just cards. That history is why the card's early events
mention a mode.

## Why the picker looks the way it does today

`_collect()` (`js/components/Compounds/MpiMediaPicker/MpiMediaPicker.js:109`) walks
`state.currentProject.itemGroups` and pushes **every entry of every group's `history`**. A gallery
card with 14 takes is 14 tiles here, each captioned with its **filename**
(`displayName || basename(filePath)`, extension stripped). The screenshot the user sent is exactly
that: `flowMusicMaker_001 … _014` — one card, fourteen tiles.

The gallery next door already does the asked-for thing: one card per group, labelled
`group.customName || selected?.name || group.name` (`MpiGalleryGrid.js:1228`).

## "Title, else filename" is already the gallery's rule

Worth stating, because the two descriptions sound like they conflict and do not. `group.name` is set
at group creation to the **filename stem**:

- generation — `truncateCardName(it.displayName || it.operation || firstDisplayName)`
  (`generationService.js:1469`);
- import — `displayName`, itself `filename.replace(/\.[^.]+$/, '')` (`MpiGalleryBlock.js:1747`,
  `routes/projects.js:1442`).

`item.name` is `null` on everything the app creates (`projectModel.js:90/119/150`), so the chain
lands on `group.name` whenever there is no `customName`. So "the user's title, else the file name"
and "the gallery's label chain" are the same string — and using the chain means a picker caption is
byte-identical to the gallery caption beside it, 28-char truncation included.

The only value the chain can produce that is *not* a filename is `createItemGroup`'s default
`'Untitled Group'`, which nothing in the app writes; a legacy or hand-edited `project.json` could
carry it, so the plan keeps a `basename(filePath)` tail behind it.

## Audio on hover

A video tile already plays on hover (`_buildTile`, the `type === 'video'` branch). An audio tile is a
static `renderIcon('audio')` and does nothing. The gallery grid has the behaviour the user wants,
including the details that cost something (`MpiGalleryGrid.js:870-886`):

- volume comes from `Storage.getGalleryVolume()`, and **0 IS the mute** — hover-play is skipped
  entirely at 0 rather than playing silently, because a silent play would swap the icon to Stop and
  lie about what is happening;
- `mouseleave` pauses **and** resets `currentTime = 0`;
- one clip at a time.

## The one thing that is lost

A Flow slot can no longer reach a non-selected history take directly. Still reachable — select that
take on the card in the gallery first, then open the slot — but it is two surfaces now instead of
one. Recorded rather than hedged around: the user asked for cards only.

The Voice-library panel is untouched — it replaces the grid and has no tiles of its own.
