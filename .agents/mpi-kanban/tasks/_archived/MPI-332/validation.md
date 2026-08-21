# MPI-332 Validation

The work shipped in an earlier session; the card sat in `doing` only because nobody moved it.
Re-verified on disk 2026-08-17 rather than closed on the handoff's word:

- `grep -c "image-regen\|sdxl-4k\|video-stitch" js/data/flowsRegistry.js` → **0**
- `grep -rn "image-regen\|sdxl-4k\|video-stitch" js/ comfy_workflows/` → **no hits**
- All six files the card lists for deletion are gone:
  `MpiFlowImageRegen.js`, `MpiFlowImageRegen.css`, `comfy_workflows/app_sdxl_regen.json`,
  `comfy_workflows/app_sdxl_4k.json`, `comfy_workflows/raw/app_sdxl_4k.json`,
  `comfy_workflows/app_video_test.json`, `comfy_workflows/raw/app_video_test.json`
- Head Swap **kept**, as the card requires: `js/components/Organisms/MpiFlowHeadSwap/` present,
  4 references still in `flowsRegistry.js`.
- `npm test` 606/606 green on the same tree (run for MPI-570, same session).

Parked by Fabio 2026-08-17.
