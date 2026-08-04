# MPI-445 — validation

Built 2026-08-04. **Option 1 from the brief (bound the field to the content), taken as the card
demanded — the 1536 resolution cap was NOT spent, so MPI-441's exactness is intact.** Awaiting the
user's in-app pass on the 8K image that produced the report.

## What changed

- `distanceField.js` gains `fieldOverContent()` — the shape's bounding box padded by the largest
  radius the frame will ask for, then `signedSquaredDistanceField()` over that crop. The box bounds
  every **non-transparent** pixel while the field still cuts the shape at alpha ≥128; the two differ
  on purpose (below).
- `PaintManager._ensureAdjustField(maxR)` builds through it and remembers the box and the pad,
  rebuilding only if a later frame asks for a radius the current pad does not cover.
- `previewAdjust()` **clips every op to that box.** This is the half the card did not predict: once
  the field was cheap, the fills were the cost — a full-canvas `fillRect` + `drawImage` at 4096
  measured **46 ms a frame**, seven times the range test they were composited with. Nothing outside
  the box can be part of any of the three results, because the box holds all the ink.
- `MaskManager` is untouched. It runs at 1536, has no problem to fix, and `distanceField.js` only
  gained a function — the existing exports it calls are byte-identical.

## Measured — Chromium, the same probe MPI-436 used

First slider move, then each later frame, at a 4096 paint layer:

| Case | Field box | First move | Per frame |
|---|---|---|---|
| 8192 src, normal scribble | 0.6% of the layer | **70 ms** (was 1563) | **0.4 ms** (was 64) |
| 8192 src, scribble spanning most of it | 4.1% | 100 ms | 2.9 ms |
| 4096 src, normal scribble | 1.8% | 84 ms | 1.2 ms |
| paint flooding the WHOLE 4096 layer | 100% | 1623 ms | 65 ms |

Both acceptance numbers are met on every real case (<300 ms first, <15 ms frames) — **and both
fell**, which is the trap the card was written around: this is not a deferral of the 1563 ms, the
work is gone. ~70 ms of the first move is now the floor: one `getImageData` of the full layer plus
the bounding-box scan.

**The last row is the honest remainder.** A layer painted wall-to-wall genuinely is 16.7M px and is
unchanged. Only the resolution cap moves it, at ~2.7 layer px of radius quantisation — the decision
the card says must be taken deliberately. Not taken. It is marked `ponytail:` in
`_ensureAdjustField()` and in `docs/masking-adjust.md`.

## Proven, not assumed

- **Byte-for-byte equivalence** with the pre-MPI-445 path, in Chromium, on the same pixels: the
  boxed+clipped preview vs a forced full-canvas field and full-canvas fills. `diffBytes: 0` for
  grow 20, shrink 8, and a 10/6 band over 4.2M bytes each. Exactness is measured, not argued.
- `tests/mask-distance-field.test.cjs` gains four cases: the boxed field is identical to the
  full-canvas one on grow/shrink/band over a concave shape; the box is padded rather than clamped
  (an unpadded box erodes from a false border); content running off the frame still erodes from the
  canvas border; and the box holds sub-threshold ink the clipped fills would otherwise drop. The
  first two were proven able to FAIL by dropping the pad and reverting.
- `tests/paint-adjust.test.cjs` gains the clip/offset contract and now bans a full-canvas fill.
- `npm test` green: **423/423**. `eslint` clean on both changed files.

## Still to confirm in the app

Drag Grow / Shrink / Edge on the 8K source that produced the report — the first move should be
under a tenth of a second and the drag should feel continuous. Nothing about the RESULT should have
changed; if an outline looks different from the MPI-436 pass, that is a bug, not a trade.
