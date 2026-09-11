# History workspace: stage reference images from a + button, with the active entry as a visible numbered chip

## Current State

Project mode: scalable-foundation.

**Session state 2026-09-11:** planning only. Nothing implemented, no code touched. Card is
in `todo` — the fresh session must run `mpi-continue` to move it `todo → doing` and derive
the checklist before any edit.

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

- [ ] **PromptBox — the `+` button and the pinned chip.** Add a prop (default off) that
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
- [ ] **Docs + types.** `js/components/types.js` for the new prop and the two instance-API
      additions; `docs/workspaces.md` for the history-workspace media contract (entry is a
      chip, strip order is slot order, nothing is staged invisibly). **Verify:**
      `npm run lint` and `npm run lint:components` clean.

## Completed

- [ ] Nothing yet.

## Remaining Work

- All four implementation steps.

## Plan Drift

- None yet.

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
