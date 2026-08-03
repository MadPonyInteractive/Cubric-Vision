# MPI-424 - umbrella checklist

This card holds no implementation of its own. It is done when all five ship.

- [x] **MPI-425** Canvas tool taxonomy - Mask group as brush + the floating
      Detect strip. **SHIPPED 2026-08-02**, verified in the app;
      `tasks/MPI-425/plan.md`. The groups every other card mounts into now exist,
      and a group member may carry `collapse` + `sub[]`.
- [x] **MPI-382** Adjust - grow/shrink + edge band, live preview, Apply/Reset.
      **SHIPPED 2026-08-03**, user-verified end to end including the mirrored Inward
      slider. Step 1, the preview contract
      (see Standing constraints in brief.md), shipped and was verified in the app
      2026-08-02 - Adjust could not be designed against a composite still carrying
      someone else's unapplied preview. Step 2, the tool itself, landed 2026-08-03:
      one dilate/erode primitive read three ways, one pristine snapshot per tool
      entry, Apply as a layer-wide undo entry. It is also the FIRST card to extend
      `discardPreview` rather than the call site - 368 and 373 do the same.
      `tasks/MPI-382/plan.md`.
- [ ] **MPI-368** Shape gizmo - one gizmo, two mounts (mask + paint).
- [ ] **MPI-375** Paint - RGBA layer, brush-engine extraction, alpha brushes.
- [ ] **MPI-373** Composite group - Mask Comp + Paint Comp, pasted slots,
      retires the MPI-362 modal.
- [ ] Re-read the order after MPI-425 ships. It is allowed to change what the
      later cards need.

- [x] **MPI-431** The graph refills the user's mask. **SHIPPED 2026-08-03, both halves.**
      Raised by the user while verifying MPI-382, which is what made the mask shape that
      exposed it. The re-audit found **3 mechanisms / 18 nodes**, not the 1 / 6 first
      recorded: `InpaintCropImproved.mask_fill_holes`, **`MaskDetailerPipe.contour_fill`
      on every detailer** (the largest group, wholly missed at first), and a
      `GrowMaskWithBlur` in klein. User edited `raw/` by hand, agent ran the sync →
      **18 destroying nodes to 0**, verified against the runtime graphs. App half = a
      **Fill** button in the Adjust panel (`MaskManager.fillHoles()`), user-verified.
      `mask_expand_pixels: 6` deliberately kept. **The gate on MPI-368 is now lifted:
      an unusual mask shape survives to the sampler.**

**MPI-421** (auto-mask run cost) is in this family but independent of the order -
it can land at any point.

**MPI-379** is closed `rejected`, not pending. Do not re-open it.
