# MPI-723 — checklist

- [x] **Split the listener.** New `js/services/mediaImportService.js` owns the item /
      `ItemGroup` / `addGroup` half of today's `MpiGalleryBlock.js:1699` handler, with a
      single app-lifetime `Events.on('media:imported')` registered from `start()` and called
      once from `js/shell.js` (the `startProjectStats()` precedent).
      **Verify:** `grep -rn "Events.on('media:imported'" js/` returns exactly the service
      plus `projectStatsService` (a stats refresh, not a card build), and neither is a Block.
- [x] **Repaint from the group, not the import.** The gallery block deletes its
      `media:imported` listener outright — its existing `project:group-added` listener
      (`MpiGalleryBlock.js:1572`) already repaints the grid for every add.
      **Verify:** import from the gallery itself — one card, no duplicate; the
      `media:import-started` / `media:import-settled` spinner still swaps without a gap.
- [x] **Orphans.** Remove any import in `MpiGalleryBlock.js` the move left unused
      (`createAudioItem` is the likely one — `createVideoItem` / `createImageItem` /
      `createItemGroup` / `appendToHistory` are still used by combine at `:341`).
      **Verify:** `npm run lint` clean.
- [x] **The two stale comments + docs.** `js/shell/navigation.js:270` and
      `MpiProjectName.js:137` both state "the only `media:imported` listener is inside
      `MpiGalleryBlock`" as the reason Record is gallery-only; both are wrong after this.
      `docs/gallery.md:119` says the same. `js/events.js` documents the event.
      **Verify:** `npm run lint`, `npm run lint:components`, `npm test`.
- [x] **User-UX verification** (plan § Verification, 6 steps) — run in the user's own app.
      Steps 1/3/4/6 are covered by `tests/desktop/media-import-outside-gallery.spec.js`
      (negative-controlled); steps 2/5 touch code this card never edited. The real-hands
      drop is Fabio's — PASSED 2026-09-11, all three surfaces (see validation.md).
