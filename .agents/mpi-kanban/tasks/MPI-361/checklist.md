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
- [ ] Docs — click-point masking gets a home routed from `docs/README.md`
