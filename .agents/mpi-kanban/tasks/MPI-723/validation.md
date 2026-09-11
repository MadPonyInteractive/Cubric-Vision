# MPI-723 — validation

## What shipped

`js/services/mediaImportService.js` — one app-lifetime `Events.on('media:imported')`, started
once from `js/shell.js:195` beside `startProjectStats()`. It builds the item
(`createVideoItem` / `createAudioItem` / `createImageItem`), builds the `ItemGroup`, and calls
`addGroup()`. It does **not** navigate, select, open or toast. `MpiGalleryBlock`'s own
`media:imported` listener is gone; its existing `project:group-added` listener
(`MpiGalleryBlock.js:1572`) is what repaints the grid, for every group add rather than only
for imports.

## Evidence

| Check | Result |
|---|---|
| `npm run lint` / `npm run lint:components` | clean |
| `npm test` | **921 pass / 0 fail** (918 before, +3 from the new guard) |
| `npm run test:desktop` | **52 pass / 1 fail** — `mask-temp-store.spec.js` timed out at 30s under full-suite load and passes alone in 1.7s. Unrelated file, unrelated event; flake, not this card |
| `tests/media-import-single-listener.test.cjs` (new) | 3/3. Asserts exactly two `media:imported` subscribers tree-wide (`mediaImportService` + `projectStatsService`, which only refreshes a byte count), none under `js/components/`, and that the shell starts the service |
| `tests/desktop/media-import-outside-gallery.spec.js` (new) | 2/2 in a real Electron instance |

**The desktop spec was negative-controlled.** With `startMediaImport()` commented out in
`js/shell.js`, test 1 fails on `expect(after.ids).toHaveLength(2)` — the group is never built,
which is exactly the bug. Restored and re-run green.

Test 1 sits on `PAGE_GROUP_HISTORY`, emits `media:imported`, and asserts three things: the
project gained a group, `state.currentPage` is still `group-history` with the same `groupId`
(the no-navigation constraint), and the new group is in `project.json` on disk. Test 2 runs the
gallery path — `import-started` mounts the `tmp-1` placeholder, `import-settled` + `imported`
swap it for the real group, and the grid ends with **exactly one** card whose id is the real
group's. No duplicate, no stuck placeholder.

Steps 2 and 5 of the plan's verification (the big-zone Place fill, the video-history chip path)
are unchanged code: `git diff` touches neither `MpiMediaDropOverlay`, `_fillPlaceSlotFromFile`,
nor the `isVideo` branches in `MpiGroupHistoryBlock`.

## One behaviour change, deliberately taken

The card used to be prepended optimistically inside the import handler, before `addGroup`
resolved. It now appears on `project:group-added`, which `addGroup` emits **after**
`persistGroups()` writes `project.json` — so the swap from spinner to card costs one local HTTP
round trip instead of a microtask. Measured as invisible in the desktop spec. If a slow disk
ever makes it visible, the fix is to move the emit in `addGroup` to just after the state
mutation (the group has entered the project at that point; persist is durability), not to
reinstate a second paint path in the Block.

## MPI-678: the Record gate is no longer load-bearing

MPI-678 gated Record to the gallery **because** `media:imported`'s only listener lived in
`MpiGalleryBlock` — recording from group-history would have written the file and its sidecar to
disk and built nothing. That reason is gone. A recording made from anywhere becomes a card now.

Removing the gate is **out of scope here** and is a product call, not a technical one: nobody
has decided what Record should do from inside a history entry. The three comments that stated
the old reason (`navigation.js`, `MpiProjectName.js`, `MpiGalleryBlock.js`) now say so, and
`docs/gallery.md` records it.

## What is committed, and what is not

MPI-678 is parked in `doing` with **uncommitted** Record work in four files this card also
touches, and its hunks are fused with this card's comment fixes — they cannot be split.

- **Committed here:** `js/services/mediaImportService.js`, `js/shell.js`, `js/events.js`,
  `docs/events.md`, both new tests, and `MpiGalleryBlock.js` — the last as a hand-built index
  blob (HEAD + this card's three edits only), so MPI-678's `grid.on('record')` WIP stayed in
  the worktree.
- **Left in the worktree, riding with MPI-678:** the comment rewrites in `js/shell/navigation.js`
  and `MpiProjectName.js`, the `docs/gallery.md` sections, and the `MpiGalleryBlock.js:146`
  comment in its MPI-678-rewritten form. All four are **comment/doc only** — no behaviour of
  this card depends on them. Whoever commits MPI-678 carries them.

## Open

The plan's verify mode is **user-ux**. The runtime behaviour is proven in a real Electron
instance, but the real-hands check — drop an OS image on the history PromptBox in the running
app and confirm a card appears in the gallery while the view stays put — is Fabio's.
