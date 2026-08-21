# MPI-441 Plan — replace `_morph`'s blur+threshold with an exact distance transform

## Current State

`MaskManager._morph(src, r)` (`js/components/Primitives/MpiCanvas/managers/MaskManager.js:800`)
blurs by `|r|` then cuts alpha at `ADJUST_DILATE_T` (r>0) or `ADJUST_ERODE_T` (r<0). A blur is an
average; a dilation is a maximum. On a thin limb the blurred peak alpha falls below the cut, so the
limb thins or vanishes while the torso grows, and neighbouring mass bleeds across concave gaps and
fills them.

Blast radius, swept 2026-08-04: `_morph` has exactly **three** call sites, all inside
`previewAdjust()` (lines 614, 617, 624). No server twin, no second copy of the primitive.
`MpiToolOptionsMaskAdjust.js:12` references it in a comment only.

## Approach

**Not** the N-stamp Minkowski disc floated on the card. An exact Euclidean distance transform
instead:

- The pristine mask does not change during a drag, so the distance field is computed **once** in
  `beginAdjust()` and every slider frame is a threshold over it. Radius becomes free.
- `dilate(r)` = pixels whose distance to the mask is `<= r`. `erode(r)` = mask pixels whose distance
  to the background is `> r`. Both read the same signed field.
- Exact at any radius: no chord error (the stamp approach), no chamfered corners (a separable
  van Herk max over a square SE), no `N × drawImage` per frame.
- `ADJUST_DILATE_T` and `ADJUST_ERODE_T` are deleted with the blur that needed them, as the card
  requires — one averaging pass cannot be both a max and a min filter.
- The EDT core is a **pure** function (typed array in, typed array out), which is what finally makes
  the geometry testable in node with no canvas.

Algorithm: Felzenszwalb & Huttenlocher separable squared-EDT — two 1-D lower-envelope passes
(columns, then rows), O(n) per pass, exact Euclidean.

## Phases

### Phase 1: Pure distance-field module

New `js/components/Primitives/MpiCanvas/managers/distanceField.js`:
`signedDistanceField(alpha, w, h)` → the two squared-distance arrays, plus a `threshold()` that
writes a binary result. No DOM, no canvas.

**Verify:** the module loads under node and a hand-checked 5×5 case returns exact distances.

### Phase 2: Wire it into MaskManager

- `beginAdjust()` builds the field from the pristine mask.
- `previewAdjust()` thresholds it for grow / shrink / edge band (the band reads both directions in
  one pass rather than dilate-then-`destination-out`-erode).
- `_morph()` and both `ADJUST_*` constants go.
- Field buffers freed in the same place `_morphBuf` was (`discardPreview`, line ~777).

**Verify:** `npm run lint`, and `node --test "tests/*.test.cjs"` — the existing three
`mask-adjust.test.cjs` source-text invariants (undo one-shot, subtract cleared, pristine-derived)
must still pass.

### Phase 3: The test that fails on the old primitive

New `tests/mask-distance-field.test.cjs`: a thin bar and a concave (U-shaped) mask.
Assert grown geometry the blur-and-threshold cannot produce — the bar survives a grow wider than
itself, the concave gap stays open, and the edge lands exactly `r` px out and in.

**Verify:** the new case is run against a reimplementation of the OLD blur+threshold behaviour and
confirmed to FAIL there, before the old code is deleted. A test that passes both ways guards
nothing.

### Phase 4: Measure at the working size, then correct the doc

Real-pixel probe via playwright-cli at 1536²: `performance.now()` for the field build and for a
per-frame threshold; edge displacement checked in every direction on a thin+concave shape.

`docs/masking-adjust.md`: re-measure the radius table on that shape, delete the "beyond r=12
CURVATURE costs a little (r=20 → 19/21, r=50 → 47/54)" claim, and rewrite the "Blur once, threshold
the alpha once" paragraph. Cap is 200 lines; the file is at 95, and the replacement should not be
longer than what it replaces.

**Verify:** measured numbers written down, not estimated. If the field build stalls tool entry,
preview-on-release is adopted deliberately and the cost recorded — not left as a silent stutter.

## Verification

**Verify mode:** user-ux

Automated: `node --test "tests/*.test.cjs"` + `npm run lint`.
Real-pixel: playwright-cli probe for geometry and timing at 1536².
User: the screenshot case in the app — person mask, Grow +50. Arms track, gaps stay open, the
outline moves outward by 50 px everywhere. Then Shrink, then the edge band both directions.

## Remaining Work

None.

## Completed

All four phases, 2026-08-04, user-validated in the app. Evidence and the measured table are in
`validation.md`; do not duplicate them here.

Two things worth carrying forward:

- **The candidate fix on the card was not the one built.** Stamping a disc at N offsets (twice, for
  the Minkowski sum) would have cost N `drawImage` calls *per frame* and still only approximated
  the disc. The distance field is exact and radius-independent, so the whole cost moved to tool
  entry and the frame got cheaper than the blur it replaced.
- **The primitive is now testable.** It was pure JS from the start, which is why the geometry could
  be asserted in node with no canvas — the reason this bug survived two years is that
  `mask-adjust.test.cjs` could only read source text, so nothing in CI could see a *shape*.
