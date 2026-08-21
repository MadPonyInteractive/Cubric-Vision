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

## Third pass — OPTION B, the real video player in the result pane (2026-08-20)

Isolated instance `:65442` (own profile + port; killed by process tree afterwards, and
`:3000` verified still listening). A temporary `__probeShowResults` / `__probeResultState`
hook drove the pane because a result otherwise only arrives from a real generation —
**removed; `grep -rn "__probe" js/ tests/` is clean.**

**The player, on Fabio's own upscaled clip (1728x960, 3.042s, readyState 4)**
- Toggle from compare mounts `MpiVideoViewer` + `MpiVideoControlBar`; frame gains
  `--player`; the media layer stays **empty (0 children)**, which is what leaves every
  `_bindResultView` handler inert, exactly as compare does.
- Transport driven by CLICKING the real buttons, not by calling the surface: play
  advanced 0 → 0.628s; play again paused it; **frame-back moved exactly -0.0417s = 1/24**.
  (Frame-FORWARD reads +0.0486 because the decode path falls back to the native seek with
  the documented `+0.25·fs` bias — `docs/video-player.md` — the same behaviour History has.)
- **Seek bar real:** clicking the trim track at 50% seeked to 1.542s (half = 1.521, snapped
  to frame 37) and the time display followed. Track measures **300px**.
- Loop button → `is-active` + native `video.loop` true. Mute → `video.muted` true.
  Frames/time toggle flips `0037` ⇄ `00:01.54`. Fullscreen + volume slider present.

**Every branch, not just the happy one**
- `ltx-extend` (declares NO compare) + a video result → **player, no toggle**. This is the
  headline: a video result gets the real player whether or not a comparison exists.
- `head-swap` (declares compare) + an IMAGE result → compare, **no toggle, no player**.
- TWO video results → plain elements, 0 control bars, 2 `<video>` in the media layer.
- Slide navigation away and back → 0 bars, 0 surface videos, 0 bar hosts; the result
  replays. `el.close()` → 0 bars, 0 videos, 0 flows.

**The hidden-bar hotkey bug — reproduced, then fixed, then re-proved**
- BEFORE: a second attached `MpiVideoControlBar` + one `space` keydown → **both** videos
  playing (`flowPlaying: true, bgPlaying: true`), 2 handlers in the `down:space` bucket.
- AFTER `_canDrive()`: same setup with the peer bar inside a `display:none` stash →
  `flowPlaying: true, bgPlaying: false`, `bgRects: 0`, still 2 handlers bound. The gate
  discriminates, it does not unbind.

**Layout**
- The bar in the result column left the seek bar at **exactly 0px** (measured
  `__trim: 0`, ends needing 736px in a 518px column). Moved to the slide → 300px.
- No layout jump: `.mpi-base-flow__col-left` measures **236px in compare and 236px in
  player**, frame 518px in both.
- `MpiViewerCorners` empty strip: was a 26x14 box at (1121,144); now `display: none`,
  `childNodes: 0`.

**Automated**
- `npm test` — **640/640**, 0 fail (was 638 before the 2 new cases).
- `npx eslint` on all three touched JS files — **0 errors**; the same 4 pre-existing
  `no-bare-form-control` warnings in `MpiBaseFlow.js` (lines 172/445/518), none added.
- **4 mutants, 4 killed:** removing the `MpiVideoViewer` import; flipping `showTrim` to
  `false`; dropping the `_canDrive()` guard from the bind wrapper; renaming `_canDrive`.
  All restored and re-verified green. (One mutation run died on the known cp1252 trap
  mid-case and left the file mutated — caught and restored by hand, then re-run with a
  `finally` restore and byte-decoding fixed.)

## RESOLVED — Fabio verified, 2026-08-20

**"yeah, it's fine, verified."** Accepted WITHOUT a live GPU run, deliberately: he was waiting
on an agent for the GPU and declined the offer of a driven demo window on an isolated instance.
So the user-ux gate is closed on his say-so plus the evidence above, **not** on him having
watched a real upscale land in the pane. Worth knowing if the feel turns out wrong later.

Carried to closed with it:

1. **The feel in a real run** — accepted unseen, as above.
2. **Cosmetic call A** (History compare backdrop moved from a hardcoded `oklch(0.20 0.020 350)`
   to `var(--surface-canvas)`, slightly lighter) — accepted as-is.
3. **Cosmetic call B** (in the Flow pane the video letterboxes inside the 60vh frame, so the
   reveal bar and labels span dead space above and below it) — accepted as-is. Clipping the bar
   to the media box would change shared canvas behaviour and hit History too, so it stays a
   deliberate non-fix, not an oversight.
4. **Gallery demo entry for `MpiCompareView`** — already waived by Fabio earlier in the card
   (`.claude/rules/components.md` § 4 ask). This line was stale; not an open question.

## Still open, but NOT this card

- **MPI-584's graphics** (`flow-ltx-upscale.webp` + `.mp4`) — deferred to its own session. Their
  absence is the 404 storm in the Flow Library console, nothing else.
- **Option C** (an adapter so `MpiVideoControlBar` also drives the COMPARE pair, via a shim onto
  MpiCanvas's `playCompare`/`frameStepCompare`) — a live follow-up, recorded in `plan.md`
  § Plan Drift. Not needed for Option B.
- **A finished result does not survive reopening the flow.** `_lastResults` is component-scoped
  and shell destroys the instance on close, so Upscale Video comes back with an empty pane after
  a completed run (the result is in the gallery). Pre-existing, predates Option B, uncarded.
