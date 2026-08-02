# MPI-379 - validation

**Not applicable.** Closed `done` / `rejected` on 2026-08-01. The card was not
built and was not merged - the user rejected the whole feature in the MPI-424
brainstorm, including Part 1 (hover-to-select), which needed no download.

Reason: what ships today is fine, and moving selection onto the canvas is a layer
of complexity that does not need to exist. The thumb strip and the Detect button
stay.

## What IS validated here, and must not be re-tested

The live measurements taken while this card was open are real results and remain
the record. Read them before anyone re-proposes canvas-side selection:

- The enumerator is `yolov8n-seg` in the **segm/** folder, not `bbox/` - Impact
  Pack decides by folder, and the same file in `bbox/` raises NO_SEGM_DETECTOR.
  It returns native masks in ~0.5s, flat regardless of object count.
- Hover CAN name a region: `ImpactDecomposeSEGS` -> `ImpactFrom_SEG_ELT` slot 7
  returns the per-region class string.
- Class filtering is the `labels` string ONLY. `ImpactSEGSLabelFilter.preset`
  does nothing server-side (verified: preset=person + empty labels filters to
  zero).
- Native segm output is blobby - a face profile collapses, a hand becomes a
  mitten. Usable as a transient hover highlight, never as a committed mask. This
  is what made the hover affordance read as poor output quality.
- SAM3 costs ~3.6s per category against YOLO's 0.5s for all 80, so category
  buckets do not rescue a text-driven enumerator.
