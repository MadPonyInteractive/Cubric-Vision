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
- [x] **MPI-375** Paint - RGBA layer, brush-engine extraction, alpha brushes.
      **SHIPPED 2026-08-03**, user-verified in the app across three rounds
      (`7303d60e`, `7e0ee5aa`). `PaintManager` = ONE RGBA layer at image-native size
      capped at 4096, on the SHARED `UndoStack`; `brushDab.js` = the extracted
      `stampDab` + `strokeDabs` both brushes now stamp; `MpiToolOptionsPaint` + the
      Paint rail group, with `MpiMaskStrip` made destination-driven; per-entry
      `paint.png` in the mask TEMP dir; Apply flattens server-side through
      `POST /project/apply-paint` at the opacity slider. **The alpha brush pack was
      split OUT to MPI-435** at planning (no source textures exist) - it is now
      unblocked and parameterises `stampDab` alone. Docs: **`docs/painting.md`**.
      `tasks/MPI-375/plan.md`.
- [ ] **MPI-368** Shape gizmo - one gizmo, two mounts (mask + paint).
      **NOW FOURTH, and NOW UNBLOCKED** - the paint layer it needs exists as of
      2026-08-03. Its rasterise target and the exact recording shape are written down
      in `docs/painting.md` § Seams the next cards land on; do not rediscover them.
      Rationale for the swap is on `brief.md` under the Order table.
- [ ] **MPI-373** Composite group - Mask Comp + Paint Comp, pasted slots,
      retires the MPI-362 modal.
- [x] Re-read the order after MPI-425 ships. It is allowed to change what the
      later cards need. **Done 2026-08-03 - and it DID change: 3 and 4 swapped.**

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
      **OUTPUT-verified 2026-08-03** by the user: detailing was run against a mask WITH
      a hole and a mask WITHOUT one, and both behaved. That closes the one thing the
      shipping evidence did not cover - until then MPI-431 was only proven at the
      GRAPH level (18 destroying nodes to 0), and nobody had looked at whether a
      surviving hole actually produced a better edit. It does.

**MPI-421** (auto-mask run cost) is in this family but independent of the order -
it can land at any point.

**MPI-379** is closed `rejected`, not pending. Do not re-open it.
