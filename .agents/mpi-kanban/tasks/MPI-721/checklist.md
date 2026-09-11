# MPI-721 — checklist

Derived from `tasks/MPI-721/plan.md` § Implementation (four steps, sequential).

- [x] Step 1 — PromptBox: the `+` button (prop-gated, default off) opening `MpiMediaPicker`, and the `pinned` chip flag (no remove pill, still reorderable) plus `el.setPinnedMedia({ url, name })` that replaces in place and preserves strip position
- [x] Step 2 — PromptBox: pinned chip is never evicted by the capacity paths (`_tryAddMedia` `maxCount === 1`), and no `state.promptMedia` persistence or mount-restore for `_wsKey === 'history'`
- [x] Step 3 — History block: feed the entry chip through ONE `_currentIdx` setter (eleven assignment sites), turn the `+` prop on at the mount, drop the mount-time `clearMedia`, delete the image-group `stagedMedia = []` discard and the `resolvedMedia` prepend, fix `_baseCtx.imageCount`
- [x] Step 4 — `js/components/types.js` (new prop + two instance-API additions) and `docs/workspaces.md` (history media contract), then `npm run lint` + `npm run lint:components`
- [x] Verify (user-ux): Fabio ran a masked `krea2Edit` with a reference in his own app 2026-09-11 — "it works great"
- [ ] Re-check the three UI fixes in the app: (a) the bottom of the Composite rail clicks again with the prompt tool open, (b) the chips start clear of the rail, (c) TRANSFORM / ENHANCE / COMPOSITE read in full at the new 88px rail width
