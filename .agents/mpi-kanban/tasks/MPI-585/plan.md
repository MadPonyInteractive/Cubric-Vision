# MPI-585 Plan — a shared before/after CompareWidget for Flow results

## Current State

**DONE and verified by Fabio (2026-08-20). The single next action is `mpi-end-session`
— nothing is left to build.**

Option B's 8 files are **UNCOMMITTED**; that is the only reason the card is not in
`done` yet. Fabio verified without a live GPU run (he was waiting on an agent and
declined a driven demo window) — see `validation.md` § RESOLVED.

The COMPARE half is already committed (inside peer commit `b35a3fe6`, wrong subject,
pointer commit `34043e14`; do NOT rewrite that history). Option B's 8 files are
UNCOMMITTED.

Three things found while building Option B that the plan could not have predicted:

1. **The bar cannot live in the result column.** MpiVideoControlBar carries ~740px of
   fixed chrome (transport + time + volume + fullscreen); the result column is ~518px,
   so the flexible part — the seek bar — was squeezed to **exactly 0px**. It now mounts
   as a sibling of `__split`, spanning the slide, which is the placement MpiVideoViewer's
   own header says the bar exists for. Seek bar measures 300px.
2. **A hidden control bar was answering the keyboard.** `hotkeyManager` buckets handlers
   by KEY, not by registry id, and `MpiOverlay` stashes into a `display:none` node instead
   of destroying — so a Group History video bar stays attached under an open Flow.
   Reproduced live: one space press played the Flow result AND a hidden clip, audibly.
   Fixed at the root in `MpiVideoControlBar._canDrive()`. This bug predates Option B
   (`compare.playPause` shares the same `space` bucket).
3. **An empty `MpiViewerCorners` strip painted its box** — a 26x14 grey tab over the
   picture. Invisible in History, which always sets chips. `:empty { display: none }`.

Card picked up 2026-08-20 from handoff `0ec5f9fe`. The card description is the
spec; this plan records only what the description could not know because it had
not read the code yet.

**The claim collision in the description is CLEARED.** `MpiBaseFlow.js` was
claimed by MPI-504 session `8322d5de`, but that session record says
`"status": "closed"` (03:06:13Z) with the claim left open — an orphan, not a live
peer. Released, and re-claimed by this session. The still-live MPI-504 session
(`5a261c2b`) holds `flow_character_sheet.json` + `mpi-nodes.md` only: no overlap.

Two of the description's four traps are answered from source, not assumed:

- **Trap 1 (different resolutions) — ANSWERED.** `MpiCanvas._drawComparisonLayer`
  computes `relScale = Math.max(baseW/afterW, baseH/afterH)` and centres, i.e. the
  AFTER is **cover-fit into the BEFORE's frame**. A 2x upscale scales down into
  the source frame correctly. Still proven live on Fabio's own pair.
- **Trap 3 (hotkeys) — HALF ANSWERED.** `hotkeyManager` already refuses keydown
  inside text inputs (`TEXT_INPUT_TYPES` + `isContentEditable`), so `space` cannot
  fight the Flow's prompt box. The `compare.*` registry ids exist and are reused —
  no new ids, no raw listener.

**A fifth trap the card does not list, and it is the real one.** The Flow result
pane is a transform-based view: `_bindResultView` binds wheel-zoom, drag-pan and
dblclick-fit on `.mpi-base-flow__result-frame`, and `_applyResultTransform` writes
a CSS transform onto `.mpi-base-flow__result-media`. `MpiCanvas` has its OWN
`ViewManager` doing the same job, and the reveal bar is dragged with the same
pointer gestures the frame pans with. Mounting the canvas inside the media layer
double-transforms and the two drags fight. So the compare surface mounts as a
SIBLING of the media layer, filling the frame, and the frame's own view handlers
no-op while it is up.

## Approach

**One new Compound, both consumers swept.** `MpiCompareView`
(`js/components/Compounds/MpiCompareView/`) owns exactly what is duplicated-in-
waiting: the labels, the canvas wrap, `open(itemA, itemB)` (url resolve, video /
fps detection, load the pair, loop on) and the `compare.*` hotkey bind/unbind.

- `MpiCompareOverlay` is refactored to `MpiOverlay + MpiCompareView` — the History
  surface and the Flow surface then run the same code and cannot drift.
- `MpiBaseFlow._showResults()` mounts `MpiCompareView` into the result FRAME when
  the FlowDef declares `result.compare`, the named before-media is present, and
  there is exactly one result; otherwise the plain `<img>`/`<video>` as today.
- The flow side stays DATA: `result: { compare: 'inputVideo' }` on `ltx-upscale`.
  One declaration covers video and image because the canvas mode already does.

## Completed (2026-08-20)

1. `MpiCompareView` Compound (+ CSS, `preloadStyles`, `types.js`).
2. `MpiCompareOverlay` refactored onto it — 197 → 96 lines, overlay chrome only.
3. `MpiBaseFlow`: `result.compare` honoured in `_showResults`, `_paintPlainResults`
   split out as the fallback, teardown wired through `_teardownSlide`.
4. `ltx-upscale` declares `result: { compare: 'inputVideo' }`.
5. Docs: `04-overlay-and-shell.md` § The result pane, the README checklist, and the
   ltx-upscale flow doc.
6. `tests/flow-result-compare.test.cjs` (3 cases, mutation-tested).
7. Verified — 634/634, eslint clean on every touched file, and BOTH consumers proven
   live on Fabio's real 864x480 / 1728x960 pair. Full evidence in `validation.md`.

## Completed — Option B (2026-08-20)

8. `MpiBaseFlow`: a single VIDEO result mounts `MpiVideoViewer` + `MpiVideoControlBar`
   (`showTrim: true`) instead of `<video controls>`. `_showSingleResult` /
   `_defaultResultMode` / `_mountPlayer` / `_mountSurfaceToggle` / `_teardownPlayer`;
   `_teardownResultSurfaces` replaces `_teardownCompare` at every call site.
9. Compare stays the first paint for a declaring flow; an `MpiButton` bottom-right in
   the frame toggles the two, ONE mounted at a time. Toggle appears only when both
   exist (declared compare AND a video result). The choice is remembered across slide
   rebuilds and never applied to a result it cannot serve.
10. `MpiVideoControlBar._canDrive()` — the hidden-bar hotkey gate (see Current State §2).
11. `MpiViewerCorners.css` — `:empty` strips do not paint.
12. Layout: bar hosted on the SLIDE, `.mpi-base-flow__result-bar` matching the split's
    max-width + side padding; `--player` joins `--compare` on the frame's cursor rule.
13. Docs: `docs/video-player.md` § A bar you cannot see (the gate's home) + add-flow
    `04` § every video result gets the real player + the README checklist line.
14. `tests/flow-result-compare.test.cjs` +2 cases, both mutation-tested (4 mutants, 4
    killed). They pin WIRING, not behaviour — the surfaces are DOM-only.

## Remaining Work

None. `mpi-end-session` to commit and close.

## Verification

**Verify mode:** user-ux

A reveal bar is a feel, not an assertion — frame-lock, drag latency and whether
the 2x/1x pair lines up are things only the app shows. Automated checks
(`npm test`, `npm run lint`) gate the shape; the surface itself needs eyes.

## Plan Drift

- 2026-08-20: **scope widened by Fabio after the compare half landed** — the result pane
  also needed a real video player, not a bare `<video controls>`. He chose OPTION B (every
  video result on MpiVideoViewer + MpiVideoControlBar, compare as a toggle on top) over
  A (player only when there is no compare) and C (an adapter so the bar also drives the
  compare pair). **C is still a live follow-up**: it needs a shim from the bar's surface
  contract (`_play`/`seek`/`frameStep`/`getVideoElement`) onto MpiCanvas's
  `playCompare`/`frameStepCompare`, and it touches a shared Compound.
- 2026-08-20: the plan assumed the bar would sit under the frame inside the result
  column. It cannot — see Current State §1. Corrected to a slide-level mount.
- 2026-08-20: two defects found that are NOT Option B's, fixed at the root because Option
  B is the first surface that exposes them (Current State §2 and §3). `MpiVideoControlBar`
  and `MpiViewerCorners.css` were added to this card's claim.
