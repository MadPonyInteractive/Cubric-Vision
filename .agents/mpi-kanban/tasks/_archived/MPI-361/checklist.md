# MPI-361 Checklist

Derived from [brief.md](brief.md) § Recommendation (Phase A). Phase B is a separate card.

- [x] Graph branch — `comfy_workflows/raw/img_auto_mask.json` gains the mask-points
      chain beside the intact YOLO path, re-synced to `comfy_workflows/img_auto_mask.json`
      via `scripts/workflow-to-api.mjs` (0 dangling, 0 missing-required). Both modes
      live-run on the engine — see [validation.md](validation.md)
- [x] MaskManager points mode — positive/negative dots, rendered on the overlay,
      individually removable *(code complete, lint clean — needs the user's eyes)*
- [x] MpiToolOptionsMask UI — points mode beside the YOLO detector dropdown,
      threshold control, info box (sweep-don't-nudge, one part per run)
- [x] commandExecutor payload — points mask + threshold + mode into the
      `autoMaskImg` params, injected by node title
- [x] Add / Subtract — returned mask drawn into `manualCanvas` / `subtractCanvas`
- [x] Regression — YOLO Face and Person shortcuts still work after the graph edit
      *(graph half proven live; the app half needs the user's run)*
- [x] Detection colour — the auto-pick layer renders green over the white painted
      mask via a DISPLAY-only split (`MaskManager.autoCanvas` +
      `MpiCanvas._recolorMaskLayer`); export still emits one unioned B/W mask.
      Add / Subtract un-gated so the YOLO detector gets the same treatment.
      **USER-VERIFIED 2026-07-28** — see [validation.md](validation.md) § Step 6
- [x] Docs — [docs/masking.md](../../../../docs/masking.md) created (163 lines) and routed
      from `docs/README.md` § Core app. Owns the layer model, the display-vs-export
      split, click-point masking (polarity-by-radius, the graph branch, the
      snap-not-glide threshold, the do-not-"fix" list), Add/Subtract, and the roadmap.
      No catch-all file created
