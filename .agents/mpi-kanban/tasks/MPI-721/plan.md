# History workspace: stage reference images from a + button, with the active entry as a visible numbered chip

## Current State

Project mode: scalable-foundation.

**Session state 2026-09-11 (second session):** card is in `doing`, checklist derived,
ownership written to `files.json`, files claimed (`f2c79865`). **Steps 1, 2 and 3 are on
disk.** `npm run lint`, `npm run lint:components`, `npm test` (918/918) and the Electron
boot smoke (`tests/desktop/electron-smoke.spec.js`) all pass.

**All four steps are done.** Fabio verified the surface in his own app 2026-09-11 — *"it
works great"* — running a masked `krea2Edit` with a reference image in an image history
group, which is the hole this card exists to close.

**One regression came out of that check and is fixed:** the strip is a full-width band
anchored at `bottom: 100%` of a SHELL-level `#prompt-box-mount`, so its empty run sat over
the history tool rail and swallowed every click on the bottom of it (Composite's three
tools). While history hid the strip that cost nothing. `pointer-events: none` on the band,
`auto` on the chips and the `+` card. **Needs a re-check in the app** — that is the only
thing outstanding on this card.

**Two UI follow-ups from that same check, both landed (Fabio asked in the same turn):** the
chips now start past the tool rail, and the rail is 72px → 88px because its section labels
were clipping. One shared `--history-rail-w` in `styles/01_base.css` is what keeps the
block's grid column and the strip's inset from drifting apart — widen the rail and the
chips move with it. Also needs an eyes-on re-check.

**Not on this card:** dropping a file on the PromptBox stages the chip but never creates a
gallery card, because `media:imported`'s only listener lives inside `MpiGalleryBlock` and
one block is mounted at a time. That is **MPI-723** (`todo`, planned) — it does NOT block
this one, and the fix must not navigate away from the group being edited.

What step 1 added (read this rather than re-deriving it):

- `props.stageMedia` (default off) → class `mpi-prompt-box--stage-media`, the `+` card,
  and the strip made visible in history mode.
- `el.setPinnedMedia({ url, name? } | null)` — replaces in place (keeps strip position),
  unshifts the first time, `null` removes. Mints a FRESH chip id on every re-point,
  deliberately: `_renderStrip`'s reorder fast path keys on the item set, so a reused id
  would skip the repaint and leave the old `<img src>` on screen.
- `item.pinned` → no remove pill; still reorderable, still numbered. Survives
  `_withAssignedRoles` / `stripOrdinalMediaRoles` (both spread) and `_moveMediaItem`.
- `_importMediaFile(file, mediaType)` — the upload half of `_handleMediaDrop`, lifted out
  of the `if (model)` block so the picker's upload card and an OS drop share one path.

What step 2 added:

- `_saveMedia` returns early for `_wsKey === 'history'`, and the mount-time restore is
  replaced (for history) by a ONE-TIME sweep of `state.promptMedia.history` — an older
  build's persisted slot is deleted rather than left looking inert.
- `_tryAddMedia` capacity: `pinnedCount` / `evictable` split. Neither the `maxCount === 1`
  clear nor the at-capacity trailing eviction can touch a pinned item. When `pinnedCount
  >= maxCount` (no bigger op to up-jump to) the add is refused with a toast instead.
- `_showMediaToast(message)` extracted; `_showIncompatibleToast()` delegates to it.

What step 3 added:

- `_setCurrentIdx(idx)` + `_syncEntryChip()` in `MpiGroupHistoryBlock.js`. All TEN bare
  `_currentIdx = …` assignments now go through the setter (the `let` declaration is the
  only remaining direct write). `_syncEntryChip` is a no-op for video.
- The mount passes `stageMedia: !isVideo`, seeds the chip with `_syncEntryChip()`, and the
  MPI-351 `clearMedia()` is gone.
- `_syncBaseCtxFromPromptBox`: image count is plain `img`, no `Math.max(1, img)` floor.
  The initial `_baseCtx = { imageCount: 1 }` STAYS — it is the bootstrap that unlocks the
  op list before any PromptBox exists, and it is what gates `_mountPromptBoxIfNeeded`.
- `_generationFromPromptPayload`: image groups pass `mediaItems` straight through. The
  video branch keeps resolving the current item. `wantsStartFrame` is gone with its branch.
- `el.clearMedia()` (PromptBox) now skips pinned items — see § Plan Drift.

**The hole.** A MASKED edit with a REFERENCE image is unreachable anywhere in the app.
Found by Fabio 2026-09-11 working on projects with a friend: change a woman's hair to a
reference hair — mask the hair, supply the reference image. There is nowhere to do it.

- `krea2Edit` already takes an optional `Input_Mask` (masked edit, restored by MPI-365)
  AND an optional `Input_Image_2` reference — `js/data/commandRegistry.js:444`.
- **Gallery** has reference chips but NO masking: `hasMask: false` is hardcoded at
  `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js:1325`, `:1357`, `:1640`.
- **History** has the full mask rack (brush / points / text / auto / shapes / adjust,
  `js/components/Compounds/MpiHistoryTools/MpiHistoryTools.js:80`) but DISCARDS chips at
  run: `const stagedMedia = isVideo ? … : []` —
  `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js:1504`.

**Why history discards them (MPI-351, archived + completed).** PromptBox chips persist
per workspace and are re-injected on every mount, and the old guard read "rail holds an
image" as "the user supplied the input" — so ONE stale, invisible chip silently owned
`Input_Image` for every later run (upscale_002-007 all ran on a two-hour-old kleinEdit
output while a fresh crop was the active entry). The fix was to clear chips at mount
(`MpiGroupHistoryBlock.js:1240`) and discard them at run. That closed the bug by removing
the feature.

**This card supersedes that workaround without reopening the bug.** Render the ACTIVE
ENTRY as an ordinary numbered chip. Then `mediaItems` handed to the run IS the whole
truth, the strip IS the slot order, and nothing invisible can own a slot again.

**Slot 1 is not always the base.** For `control`, slot 1 is the depth/pose map and slots
2/3 are the SUBJECT (`js/data/commandRegistry.js:317-333`). So the entry chip must be
reorderable, not pinned to position 1 — chip reorder already exists
(`MpiPromptBox.js:921`, `_makeChipReorderable`).

## Scope (settled with the user in this session — do not widen)

1. **History workspace only**, image groups. Video groups keep today's start/end-frame
   chip path UNTOUCHED (`isVideo` branch at `MpiGroupHistoryBlock.js:1043` and `:1504`).
2. Media arrives through a NEW **`+` button on the PromptBox media strip** that opens
   `MpiMediaPicker` — the overlay gallery that already exists. `mediaType: 'image'`,
   `onPick` → `injectMedia`, `onImport` → `uploadMediaFile` then inject. Precedent call
   site: `js/components/Organisms/MpiToolOptionsPlace/MpiToolOptionsPlace.js:145`.
   Prop-gated on MpiPromptBox, **default OFF**; history turns it on.
3. **The workspace-area OS-file drop is UNCHANGED** — still fills the Place slot and arms
   `placeComp` (MPI-454). Do NOT touch `MpiMediaDropOverlay`, do NOT fight z-index, do NOT
   add zone hit-testing. The user chose the `+` button precisely so the drop area keeps
   doing what it does.
4. The active entry is a real chip, numbered with the rest, re-rendered when the user
   changes the active entry, and reorderable.
5. Chips CLEAR when the user leaves the history workspace — no persistence into
   `state.promptMedia` for `workspaceKey: 'history'`.

**Considered and excluded:** masking in the Gallery workspace. History is the mask home.
No separate card unless the user asks.

## Implementation

- [x] **PromptBox — the `+` button and the pinned chip.** Add a prop (default off) that
      renders a `+` control at the head of `.mpi-prompt-box-media-strip` opening
      `MpiMediaPicker`; add a `pinned: true` flag on a media item (no remove pill, still
      reorderable) plus `el.setPinnedMedia({ url, name })` that REPLACES in place and
      PRESERVES the chip's current strip position. Icon `plus` from `js/utils/icons.js`;
      button via `ComponentFactory.create()`, BEM `.mpi-prompt-box-media-strip__add`.
      **Verify:** in `js/pages/components.js` (or the running app) the button opens the
      picker, a picked image lands as a chip, and the pinned chip has no remove pill but
      still drags.
- [ ] **PromptBox — protect the pinned chip from eviction and persistence.**
      `_tryAddMedia`'s capacity paths (`MpiPromptBox.js:468-476`) must never evict a
      `pinned` item: the `maxCount === 1` branch clears every same-type chip, which would
      delete the entry the workspace generates from. The op up-jump (MPI-292) is the
      correct response there instead. `_saveMedia` (`MpiPromptBox.js:~166`) must skip
      persistence entirely for `_wsKey === 'history'`, and the mount-time restore
      (`MpiPromptBox.js:~2207`) must not restore it. **Verify:** with `resize`/`upscale`
      (1 slot) active, add a reference → op up-jumps, entry chip survives; leave history
      and return → strip holds only the entry chip.
- [ ] **History block — feed the entry chip, and make `mediaItems` the whole truth.**
      Inject the active entry as the pinned chip on mount and re-point it on every entry
      change. `_currentIdx` is assigned at ELEVEN sites (`MpiGroupHistoryBlock.js` 361,
      928, 956, 1807, 1857, 1944, 2098, 2292, 2407, 2495, 2510) — funnel them through ONE
      setter in the same pass, or the chip goes stale on the paths you miss. Turn the
      `+` button prop on at the mount (`:1219`), drop the mount-time `clearMedia`
      (`:1240`), and in `_generationFromPromptPayload` (`:1485-1522`) delete the image-group
      `stagedMedia = []` discard AND the `resolvedMedia` prepend block — for image groups
      `mediaItems` is now passed through as-is. `_baseCtx.imageCount` (`:294`) becomes
      plain `img` (the entry is counted as a chip now); without this, 3 chips + entry = 4
      images into a 3-slot op. **Verify:** switch entries with the strip open — the chip
      follows; reorder so the reference is chip 1 and confirm the op strip re-derives.
- [x] **Docs + types.** `js/components/types.js` for the new prop and the two instance-API
      additions; `docs/workspaces.md` for the history-workspace media contract (entry is a
      chip, strip order is slot order, nothing is staged invisibly). **Verify:**
      `npm run lint` and `npm run lint:components` clean.

## Completed

- **Step 1 (2026-09-11).** `MpiPromptBox.js` + `MpiPromptBox.css`: the `stageMedia` prop,
  the `+` card wired to `MpiMediaPicker`, `el.setPinnedMedia()`, the `pinned` chip flag,
  and `_importMediaFile()`.
- **Step 2 (2026-09-11).** `MpiPromptBox.js`: no persistence or restore for `history`
  (plus the one-time sweep of an older build's slot), and the pinned chip exempted from
  every capacity eviction path.
- **Step 3 (2026-09-11).** `MpiGroupHistoryBlock.js`: `_setCurrentIdx` / `_syncEntryChip`,
  `stageMedia: !isVideo` at the mount, the MPI-351 `clearMedia` retired, the image-group
  discard AND prepend deleted, and the `imageCount` floor dropped.

Checks run: `npm run lint`, `npm run lint:components`, `npm test` (918/918),
`npx playwright test --config=playwright.desktop.config.js tests/desktop/electron-smoke.spec.js`
(1 passed — proves the changed modules still boot). NOT yet exercised in a running app.

- **Step 4 (2026-09-11).** `js/components/types.js` — the `stageMedia` prop, `setPinnedMedia`
  and the changed `clearMedia` contract. `docs/workspaces.md` — the image-group media
  contract, the two-drop-zone split, and why video is not it (78 lines, under budget).
- **Strip hit-testing fix (2026-09-11).** `MpiPromptBox.css` — see § Current State.
- **Rail clearance + rail width (2026-09-11).** `styles/01_base.css` (`--history-rail-w:
  88px`), `MpiGroupHistoryBlock.css` (grid column reads the var),
  `MpiHistoryTools.css` (`width: 100%` — the labels were sized off the ICONS, not the
  rail), `MpiPromptBox.css` (strip `padding-left` in history+stageMedia).

## Remaining Work

- One eyes-on pass in the app covering all three fixes: the bottom of the Composite
  section clicks again with the prompt tool open and chips staged; the chips start clear
  of the rail; and TRANSFORM / ENHANCE / COMPOSITE read in full.

## Plan Drift

- **2026-09-11 — the strip is hidden in history mode, which the plan did not account
  for.** `MpiPromptBox.css` carried `.mpi-prompt-box--history-mode
  .mpi-prompt-box-media-strip { display: none }` — the history block passes
  `historyMode: true` for image AND video groups (`MpiGroupHistoryBlock.js:1233`), and
  video's frame thumbs are drawn by `MpiToolOptionsPrompt` instead. So the `+` button and
  every chip would have rendered into a `display:none` container. Fixed inside step 1 by
  narrowing that rule to `:not(.mpi-prompt-box--stage-media)` — same prop, so "this box
  stages its own media" and "this box shows its strip" stay one statement rather than two
  that can drift apart. Video groups are untouched: they never pass `stageMedia`.
- **2026-09-11 — `el.clearMedia()` now skips pinned items.** Not in the plan, but the
  invariant it protects is: the pinned chip is not STAGED media, it is the workspace's own
  image, owned by the block through `setPinnedMedia`. Reuse Prompt clears the rail
  (`MpiGroupHistoryBlock.js` ~1461) and so does `assets:cleaned`; either could otherwise
  orphan the strip from the canvas it generates on. Drop it deliberately with
  `setPinnedMedia(null)` instead.
- **2026-09-11 — the entry's `startFrame` role is now POSITIONAL, not hardwired.** The
  deleted `!isVideo && wantsStartFrame` branch used to stamp `role: 'startFrame'` on an
  image group's entry for an i2v op. `_withAssignedRoles` fills the op's slots by strip
  order, so chip 1 takes `startFrame` on its own — and the existing role pill lets the
  user flip it to the last frame. Better than before, but it does mean the role follows
  the reorder, which is the whole point of the card.
- **2026-09-11 — the `+` card is a chip-shaped button, not a strip affordance.** The
  strip's `:empty { display: none }` rule means a `stageMedia` strip is never empty, which
  is what keeps the affordance on screen with nothing staged. No extra CSS for that case.
- **2026-09-11 — the strip band had to stop hit-testing.** Found by Fabio in the app: the
  bottom of the history tool rail (Composite's three tools) became unclickable. The strip
  is `left: 0; right: 0` at `bottom: 100%` of a SHELL-level `#prompt-box-mount`, so its
  empty run overlays the rail — invisible, because the rail paints above it, which is why
  it read as "the plus button is on top of them" rather than a band. `pointer-events: none`
  on the strip, `auto` on `__chip` and `__add`. Costs one thing worth knowing: wheel-
  scrolling the 2-row overflow (MPI-475, 15 chips) now needs the cursor over a chip rather
  than the gap between them.

## Verification

**Verify mode:** user-ux

Final check is a real generation in the user's own app (no sandbox can do this — the
renderer is served from the tree, so a reload picks up uncommitted edits):

1. Open an image history group, mask a subject's hair with the brush.
2. `+` → pick a reference hair image from the overlay gallery.
3. Confirm the strip reads: chip 1 = the active entry, chip 2 = the reference, both
   numbered; the entry chip has no remove pill.
4. Run `krea2Edit`.
5. Diff the dispatched graph from Comfy `/history` and confirm
   `Input_Image` = the active entry, `Input_Image_2` = the reference,
   `Input_Mask` = the mask.
6. Reorder the chips and re-run a `control` op on a Klein model: chip 1 must become the
   depth/pose source and chip 2 the subject.
7. Regression, video group: start/end-frame drops still behave exactly as before.
8. Regression, image group: dragging an OS file onto the workspace area still fills the
   Place slot, not the prompt box.

Then the user judges the surface — the `+` affordance, the chip numbering, and whether the
entry chip reads as the workspace's own image.

## Preservation Notes

- `.claude/rules/component-events-*.md` and `component-state.md` if the PromptBox API or
  its events change — ASK before editing rule files (CLAUDE.md cardinal rule 5).
- `docs/workspaces.md` owns the workspace contract; `docs/gallery.md` may need a line
  saying the gallery still has no mask and why.
- MPI-351's lesson ("a chip the user cannot see must never own a slot") becomes enforced
  structurally here rather than by a clear-on-mount. Record that in `validation.md` at
  close-out so a future reader does not re-add the workaround.
