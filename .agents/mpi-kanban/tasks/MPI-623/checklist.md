# MPI-623 checklist

Phase list and rationale live in [plan.md](plan.md). This file tracks only what is
ticked. Phases 1-4 are expanded when their phase starts.

## Phase 0 - prove the pipeline (bench only, NO product code)

- [ ] SplatKit + ComfyUI-Mickmumpitz-Nodes installed on the standalone bench
      (`G:\ComfyUi`, port 8188 - NOT the app engine on 48188). Commit SHAs recorded.
- [ ] `3DGS-Dataset-Creator` run end to end from a Poly Haven JPG equirect ->
      COLMAP dataset with `images/` and `sparse/0/{cameras,images,points3D}`.
- [ ] SplatKit runtime downloads landed and verified: MoGe checkpoint,
      `colmap_sphere` binary. `bin/BUILD_INFO.txt` BSD-3-Clause notice saved to
      `research/`.
- [ ] Brush v0.3.0 win-x64 downloaded, `.sha256` verified, trained against a
      KNOWN-GOOD public COLMAP dataset -> `.ply` that opens in a viewer.
- [ ] **THE GATE:** Brush trains on the SplatKit output -> `.ply` recognisably the
      panorama's room. Failure re-opens decision 3 in plan.md; do not work around.
- [ ] Measurements recorded in `research/measurements.md`: dataset-pass wall clock,
      Brush 30k-iter wall clock, peak VRAM each, dataset size vs `.ply` size.
- [ ] Brush raw stdout captured; ANSI-stripped `N/M Steps` parses monotonically.
- [ ] ComfyUI core `RenderSplat` loads and renders the Brush `.ply`.
- [ ] Iteration tiers (fast/standard at minimum) decided from the measurements.
