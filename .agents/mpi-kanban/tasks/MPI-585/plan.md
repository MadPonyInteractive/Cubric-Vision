# MPI-585 Plan — a shared before/after CompareWidget for Flow results

## Current State

**Built and self-verified; waiting on Fabio's eyes (verify mode is `user-ux`).**
Both consumers run the same shared surface and were proven live on his own upscale
pair. **Nothing is committed yet.** The single next action is his verdict on
`validation.md` § Outstanding, then commit, then MPI-584's graphics.

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

## Remaining Work

Fabio's check only — the four items under `validation.md` § Outstanding: the feel of
the bar in a real run, two cosmetic calls, and whether `MpiCompareView` gets a dev
gallery entry.

## Verification

**Verify mode:** user-ux

A reveal bar is a feel, not an assertion — frame-lock, drag latency and whether
the 2x/1x pair lines up are things only the app shows. Automated checks
(`npm test`, `npm run lint`) gate the shape; the surface itself needs eyes.

## Plan Drift

- 2026-08-20: none yet.
