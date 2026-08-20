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
- [ ] Character sheet Flow — built in another session; the contract went out as an `mpi-message` to MPI-504 rather than an edit
- [x] Document the `result.compare` declaration — `04-overlay-and-shell.md` § The result pane, README checklist, and the ltx-upscale flow doc
- [x] `npm test` 634/634 · eslint 0 errors on every touched file
- [x] Live on `app:isolated` (:63218, killed after): both consumers proved on Fabio's real pair — see `validation.md`
- [ ] **Fabio's eyes**: the feel of the reveal bar in a real run, and two cosmetic calls listed in `validation.md`
