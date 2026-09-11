# A media import outside the Gallery never becomes a card

## Current State

Project mode: scalable-foundation. Card is `todo` / `planned`. Nothing implemented.

Found 2026-09-11 while verifying MPI-721 in the running app. Fabio dropped an OS image file
onto the PromptBox in an image history group: the chip staged correctly, the file landed on
disk — and no gallery card appeared.

**Two drop zones, two owners, already cleanly separated — nothing to fix there.**

- **Big zone** — `MpiMediaDropOverlay`, `position:absolute; inset:0` on the *history block
  root* (`MpiGroupHistoryBlock.js:1039`). Image groups: `_fillPlaceSlotFromFile` → arms the
  Place tool (MPI-454). **This behaviour is correct and must not change.**
- **Small zone** — the PromptBox's own `_handleMediaDrop`. `#prompt-box-mount` lives in
  `index.html:144`, at SHELL level, outside the block root — which is why the full-area
  overlay never covers it and both targets are live at once.

**The hole.** `_importMediaFile` (MPI-721) uploads the file, stages the chip and emits
`media:imported`. That event has exactly ONE listener and it is inside
`MpiGalleryBlock.js:1699`. Navigation destroys the outgoing block before mounting the next,
so only one block is ever mounted — in the history workspace the gallery block is not.
File + sidecar on disk, no `ItemGroup`, no card. A silent orphan.

This is not a new discovery so much as an unfixed one: MPI-678 already hit it and *worked
around* it by hiding the Record button outside the gallery. The reason is written out in
`js/shell/navigation.js:270` and again in `MpiProjectName.js:137`. Both comments become
wrong the moment this card lands — update them.

## Scope (settled with the user 2026-09-11 — do not widen)

1. **The importer must NOT navigate.** A drop in an image history group adds the card to the
   gallery and leaves the user on the group they are editing. Fabio, verbatim: *"I stay on
   the same image history card. Otherwise it's going to send me to a different place where
   I don't want to be working."* No auto-select, no auto-open, no toast demanding attention.
2. Big-zone behaviour is untouched. Do not touch `MpiMediaDropOverlay`, `_fillPlaceSlotFromFile`
   or the Place arming.
3. Video history groups keep today's chip path (`MpiGroupHistoryBlock.js:1064-1068`).
4. Removing the MPI-678 Record gate is **out of scope** — this card makes it possible, a
   later one can spend it. Say so in `validation.md` rather than doing it here.

## Implementation

- [ ] **Split the listener.** `MpiGalleryBlock.js:1699` does two jobs welded together: (a)
      build the item (`createVideoItem` / `createAudioItem` / `createImageItem`), build the
      `ItemGroup`, `addGroup(finalGroup)` — pure project state, nothing gallery about it;
      and (b) `grid.el.setGroups(...)` — the only genuinely gallery-specific half. Move (a)
      into a service (`js/services/mediaImportService.js`, or beside `uploadMediaFile` in
      `mediaUploadService.js` — pick one and say why) with an app-lifetime listener
      registered ONCE from the shell. **Verify:** grep proves exactly one
      `Events.on('media:imported')` in the tree and it is not inside a Block.
- [ ] **Repaint from the group, not the import.** `addGroup()` already persists and emits
      `project:group-added` (`projectService.js:455`). The gallery's remaining half listens
      to that instead, so it repaints for every group add rather than only for imports.
      Watch the double-paint: `MpiGalleryBlock.js:361` also calls `addGroup`, so the block
      must not both prepend locally AND repaint on the event. **Verify:** import from the
      gallery itself — one card, no flicker, no duplicate; the `media:import-started` /
      `media:import-settled` placeholder still swaps cleanly (`:1680`).
- [ ] **Docs + the two stale comments.** `js/shell/navigation.js:270` and
      `js/components/Compounds/MpiProjectName/MpiProjectName.js:137` both state the
      one-listener-in-the-block fact as the reason Record is gallery-only; both are wrong
      after this. `docs/gallery.md` owns the import path. **Verify:** `npm run lint` +
      `npm run lint:components` clean, `npm test`.

## Verification

**Verify mode:** user-ux

1. Image history group → drop an OS image onto the **PromptBox**. Chip stages, AND the
   gallery gains a card. **The view does not move** — still the same group, same entry.
2. Same group → drop onto the **big area**. Still fills the Place slot. No card, no chip.
3. MPI-721's `+` picker → its upload card → same result as (1).
4. Gallery workspace → drop an image on the grid. Exactly one card, spinner swaps to the
   real card with no gap or duplicate.
5. Video history group → drop a start/end frame. Unchanged.
6. Go back to the gallery after (1): the card is there, in the right place, with a thumbnail.

## Preservation Notes

- `docs/gallery.md` owns the import path; `docs/workspaces.md` owns which workspace does what.
- Record the MPI-678 connection in `validation.md`: this card removes the REASON Record is
  gallery-only, so whoever revisits that gate can stop treating it as load-bearing.
