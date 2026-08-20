# MPI-585 Validation

## Automated

- `npm test` — **634/634 pass**, 0 fail (2026-08-20). Includes the 3 new cases in
  `tests/flow-result-compare.test.cjs`.
  - Mid-session there was 1 failure (`text-op-completion.test.cjs`, `promptEnhance`). It was the
    live MPI-504 session's in-flight op registration in `js/data/commandRegistry.js`, not this
    card — my diff touches no op registry — and it cleared when they finished.
- `npx eslint` on every touched file — **0 errors**. 4 warnings remain in `MpiBaseFlow.js`
  (bare `<button>` at 170/415/488), all pre-existing and untouched by this diff.
  `npm run lint` is red repo-wide on 33 pre-existing `mpi/no-bare-form-control` warnings under
  `--max-warnings=0`; this card adds none.
- **Mutation-tested**, so the new test is not decorative: changing `compare: 'inputVideo'` to
  `'inputVideoTYPO'` failed 2 of the 3 cases with the intended message; reverted.

## Live — my own instance (`npm run app:isolated`, :63218, process tree killed after)

Driven with playwright-cli against Fabio's own pair:
`ref2v_ms_005.mp4` (source, **864x480**) and `ltxVideoUpscale_002.mp4` (upscaled, **1728x960**).
The user's :3000 was never touched and was verified still listening afterwards.

**The shared surface (`MpiCompareView`)**
- Pair loaded, `activeMode: 'compare'`, `isCompareVideoPair(): true`, labels `SOURCE` / `UPSCALED`.
- **Trap 1 (different resolutions) closed live.** Base canvas 864x480, after video 1728x960 —
  exactly 2x — cover-fit into the before's frame by `_drawComparisonLayer`'s
  `relScale = max(baseW/afterW, baseH/afterH)`. One picture across the split, not two.
- Transport: play advanced 0 → 0.165s; `pauseCompare()` paused; `frameStepCompare(1)` advanced
  **+0.042s = exactly 1/24**; loop on.
- **Reveal bar proven at the pixel level.** Overlay-canvas alpha sampled across a slider sweep:
  pos 0.10 → boundary ≈ x86, pos 0.50 → ≈ x432, pos 0.90 → ≈ x778. Monotonic, matching
  `clipX = (sliderPos·containerW − offsetX) / scale`.
- **Real drag**, not just a property write: synthetic mousedown at 50% → mousemove to 25% →
  `sliderPos` 0.25 **and the overlay redrew itself** (transparent at x100/x200, opaque at
  x400/x700). Setting `sliderPos` programmatically does *not* request a render — that is a probe
  artifact, not a defect; the drag path calls `onDraw`.
- `destroy()` → 0 canvases, 0 videos left.

**Consumer 2 — `MpiCompareOverlay` (History)**
- Opens through the shared view: root 1216x560, the view fills it exactly, mode `compare`,
  after 1728x960, reveal correct. Screenshot confirms labels, pink reveal bar and handle.
- First attempt read 0x0 and looked like a CSS regression. It was not: on the **landing page**
  `#tool-container` is `display:none`, so every descendant reads 0. Re-run inside a real tool
  container (the dev components gallery) and it renders correctly. Worth remembering before
  chasing the same false symptom again.

**Consumer 1 — the Flow result pane (`MpiBaseFlow`)**
- `ltx-upscale` mounted with the source seeded into `s_flowInputs`, then a result painted.
- Frame gained `mpi-base-flow__result-frame--compare`, the compare host mounted, the media layer
  stayed **empty (0 children)** — which is what leaves every `_bindResultView` handler inert —
  the empty-state copy hid, and the frame cursor dropped from `grab` to `default`.
- Pair loaded, mode `compare`, after 1728x960, reveal correct. Screenshot confirms.
- Driven through a **temporary** one-line hook (`el.__probeShowResults`) because a result
  otherwise only arrives from a real generation. **Removed; `grep -rn "__probe" js/` is clean.**

## Second pass — the image branch and the second flow (2026-08-20, after Fabio's call)

Fabio's scope: **upscale video, head swap and the character sheet** get a comparison;
extend and foley do not.

- `head-swap` declares `result: { compare: 'image1' }`. The BEFORE is the plate being KEPT —
  `image2` only donates a head and shares no framing with the output, so a bar between them
  would show two unrelated pictures. Two more test cases pin that choice and the two
  deliberate omissions, so a later "every flow should have one" sweep has to argue with a test.
- **Image branch proven live** (second isolated instance, :56390, killed): an 896x1120 /
  896x1088 pair loads, `activeMode: 'compare'`, `isCompareVideoPair(): false` — so **no hotkeys
  are bound for images**, and nothing a flow owns can be shadowed — reveal transparent left of
  the bar, opaque right. Screenshot taken.
- Together with the flow-pane wiring already proven on `ltx-upscale` (the lookup is
  role-agnostic), that covers Head Swap without a second GPU run.
- `npm test` **636/636**. One run mid-session read 635/1; it was a file the live MPI-504
  session was writing at that moment, and three subsequent runs are clean.
- **Character sheet: NOT edited here.** It is being built in another session, so the contract
  went out as an `mpi-message` to MPI-504 (`6ce69667-…`), including the warning that
  `flowsRegistry.js` is claimed and uncommitted, and the caution that a sheet generated from
  scratch may deserve NO comparison at all.

## Outstanding — needs Fabio

1. **The feel in a real run.** A reveal bar is a judgement, not an assertion.
2. **Cosmetic call A:** the overlay chrome behind the History compare was a hardcoded
   `oklch(0.20 0.020 350)`; it is now `var(--surface-canvas)` (0.28) per the no-hardcoded-colour
   rule. Slightly lighter backdrop. Say the word and it goes back to a one-off token.
3. **Cosmetic call B:** in the Flow pane the video letterboxes inside the 60vh frame, so the
   reveal bar and labels span dead space above and below it. The bar is deliberately
   container-space (it stays fixed while the image pans/zooms), so clipping it to the media box
   would change shared canvas behaviour and hit History too — his call, not a silent fix.
4. **Gallery demo:** `.claude/rules/components.md` § 4 requires asking whether `MpiCompareView`
   should get an entry in `js/pages/components.js`. Not added.
