# MPI-380 Checklist

Derived from `plan.md` (compact, 6 steps). Scope is the POINTS PATH ONLY —
SAM 1 is kept for the segment-branch refine; the refiner swap moved to MPI-379.

- [x] R2 upload + dependency entry (`sam3-multiplex`, engineAsset)
- [x] Workflow — swap the points branch onto SAM3
- [x] App side — delete the radius hack and the Scope dial
- [ ] Local live test — **user**
- [ ] Remote Pod leg — **user**
- [x] Docs — `docs/masking.md` (back to exactly 200 lines) + Roadmap line

Extra, not in the plan: `tests/auto-mask-inject-titles.test.cjs` (3 tests, 5 negative
controls). The auto-mask params are built inline in `commandExecutor`, so the existing
title guard never covered them — and this card renamed three of those keys at once.
