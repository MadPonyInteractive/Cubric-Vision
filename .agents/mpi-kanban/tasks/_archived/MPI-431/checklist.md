# MPI-431 — checklist

## Workflow half — USER-OWNED, ✅ COMPLETE 2026-08-03

- [x] Audit every node downstream of `Input_Mask` (not a class-name grep) — found **18
      destroying nodes / 3 mechanisms**, where the original brief named 6 / 1.
- [x] User edited all 10 raw LiteGraph nodes by hand.
- [x] Agent ran `scripts/sync-raw-workflows.mjs` — raw committed `ae49f385`, 19 generated
      files staged for `/mpi-end`.
- [x] Verified against the **runtime** graphs: **18 destroying → 0**.
- [ ] `mask_expand_pixels: 6` — deliberately left at 6 on all six `InpaintCropImproved`.
      Still open; revisit only if an Adjust shrink reads as swallowed.

## App half — AGENT-OWNED

- [x] `MaskManager.fillHoles()` + iterative flood fill
- [x] `fillMaskHoles` registered in `MpiCanvas._methods` (allowlist)
- [x] `MpiCanvasViewer` passthrough (`el.fillMaskHoles`)
- [x] Fill button in `MpiToolOptionsMaskAdjust` + `mask_fill_holes_stroke` icon
- [x] `tests/mask-adjust.test.cjs` +5 tests, 5 negative controls all fired; 323/0
- [x] User verifies in the app — **"awesome!"** 2026-08-03, after the rim fix killed the
      visible seam. The U-shaped stroke in his screenshot also confirms the open-to-border
      case stays unfilled.
