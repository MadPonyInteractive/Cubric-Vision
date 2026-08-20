# MPI-585 Checklist

- [x] `MpiCompareView` Compound — labels + canvas wrap + `open(itemA, itemB)` + the `compare.*` hotkey block, with `destroy()`
- [x] Register it: `js/shell/preloadStyles.js` + a props typedef in `js/components/types.js`
- [x] Refactor `MpiCompareOverlay` onto `MpiCompareView` (the swept second consumer — History must not drift from Flow). 197 → 96 lines, overlay chrome only
- [x] `MpiBaseFlow._showResults()` mounts the compare surface when the FlowDef declares it and the before-media exists; plain element otherwise
- [x] The result frame's own wheel/drag/dblclick view handlers stay inert while compare is up — every one already returns early on an empty `_resultMediaEl`, which compare leaves empty, so no disabling code was needed
- [x] Compare surface torn down through `_teardownSlide` (reached by both `_renderSlide` and `el.destroy`), plus on a new result and on a re-run's first latent
- [x] `ltx-upscale` declares `result: { compare: 'inputVideo' }`
- [x] `head-swap` declares `result: { compare: 'image1' }` — the plate KEPT, never the head donor (Fabio's call, 2026-08-20)
- [x] `ltx-extend` / `ltx-foley` deliberately DECLINE one, and a test pins both omissions
- [ ] Character sheet Flow — built in another session; the contract went out as an `mpi-message` to MPI-504 rather than an edit. NOT a blocker for this card: it is MPI-504's to declare
- [x] Document the `result.compare` declaration — `04-overlay-and-shell.md` § The result pane, README checklist, and the ltx-upscale flow doc
- [x] Live on `app:isolated` (:63218, killed after): both consumers proved on Fabio's real pair — see `validation.md`

## Option B — a real video player in the result pane (Fabio's pick, 2026-08-20)

- [x] A single VIDEO result mounts `MpiVideoViewer` + `MpiVideoControlBar` (`showTrim: true`) instead of `<video controls>` — reuse, wired the same two lines as `MpiGroupHistoryBlock`
- [x] The bar mounts on the SLIDE, spanning it — in the ~518px result column its ~740px of fixed chrome left the seek bar at exactly 0px
- [x] Compare stays the first paint for a declaring flow; an `MpiButton` bottom-right toggles the two, one mounted at a time, and the choice survives a slide rebuild
- [x] The toggle appears only when BOTH surfaces exist (declared compare AND a video result); images and multi-output runs keep the plain elements
- [x] `_teardownResultSurfaces` replaces `_teardownCompare` at every call site — slide teardown, a new result, and a re-run's first latent
- [x] ROOT FIX: a control bar the user cannot see no longer answers the keyboard (`MpiVideoControlBar._canDrive()`) — reproduced live as one `space` press playing a hidden History clip under an open Flow
- [x] ROOT FIX: an empty `MpiViewerCorners` strip no longer paints its box
- [x] Document it — `docs/video-player.md` § A bar you cannot see (the gate's home), add-flow `04` § every video result gets the real player, README checklist
- [x] `npm test` **640/640** · eslint 0 errors on all three touched JS files · 4 mutants, 4 killed
- [x] Live on `app:isolated` (:65442, process tree killed, `:3000` verified still up); temp probe removed, `grep -rn "__probe" js/ tests/` clean
- [x] **Fabio's eyes**: verified 2026-08-20 — "yeah, it's fine, verified". Accepted WITHOUT a live GPU run (he was waiting on an agent and declined a driven demo window); the cosmetic calls go through as-is. See `validation.md` § RESOLVED
- [ ] Commit + close — `mpi-end-session` (the only thing left; the code is done)
