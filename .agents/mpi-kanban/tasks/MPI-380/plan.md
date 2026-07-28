# MPI-380 Plan — SAM3 as the points engine

Compact plan. Read `brief.md` first — six engine traps, all re-confirmed against
`engine/ComfyUI_windows_portable/ComfyUI/comfy_extras/nodes_sam3.py` on 2026-07-29.

## Scope decision (user, 2026-07-29)

The card's full scope was **cut to the points path**. Reason found during orientation:

SAM3 **cannot** replace the SAM 1 refiner by rewiring. SAM 1 sits in
`ImpactSimpleDetectorSEGS.sam_model_opt` (node 1588, the `Input_Box=false` segment
branch) and that slot wants an Impact `SAM_MODEL`. SAM3's box path wants
`BOUNDING_BOX` dicts (`{x,y,width,height}`), and nothing in the graph emits those
from YOLO SEGS — `MpiBboxToMask` takes Impact's `BBOX`, a different type. A refiner
swap therefore needs a new MpiNodes node, an `mpi-ci` release and a `node_lock`
bump before it can even be tested remotely.

**Decided:**

- **Points path only this card.** It is the measured win (1.1s, no radius hack, no
  Scope dial, one less media upload per remote run) and needs no bridge.
- **SAM 1 is KEPT**, not retired — it still serves the segment-branch refine. Both
  weights ship as `engineAsset`. The card's "prove SAM3 at 4K before retiring SAM 1"
  acceptance item relaxes to a points sanity check, because nothing is being retired.
- The refiner swap moves to **MPI-379**, which rebuilds YOLO enumeration and will
  produce boxes natively — the bridge stops being a bridge there.

## Current state

- Weight on disk: `G:\CubricModels\checkpoints\sam3.1_multiplex_fp16.safetensors`,
  **1745546848 bytes**. Not in R2, not in `assetDeps.js`.
- SAM 1 (`sam-vit-b`, `assetDeps.js:299`, `engineAsset: true`, 367MB) has exactly one
  consumer: `SAMLoader` node 1589 in `comfy_workflows/img_auto_mask.json`, feeding
  node 1588 (segment refine, KEPT) and node 1653 (points, REPLACED).
- `SAM3_Detect(model, image, conditioning?, bboxes?, positive_coords?,
  negative_coords?, threshold, refine_iterations, individual_masks) -> (MASK, BOUNDING_BOX)`.
  `positive_coords` / `negative_coords` are `force_input=True` STRING — they must be
  **wired**, not widget values. `MpiString` (field `string`) is the injection target;
  bare-title injection writes that field (precedent: `Input_Mask` in `klein_t2i.json`).
- Point path ignores `threshold` entirely (`nodes_sam3.py:186-191`) — only
  `refine_iterations` applies. That is why the Scope dial is deleted, not remapped.

## Steps

### 1. R2 upload + dependency entry

- Upload the weight to R2 `vision/models/checkpoints/`. Use `--s3-no-check-bucket`
  (scoped token 403s on CreateBucket without it); probe with a tiny file first; never
  pipe `rclone` to `tail` (`$?` becomes tail's).
- Compute sha256 locally, add `sam3-multiplex` to `js/data/modelConstants/assetDeps.js`
  beside `sam-vit-b`: `filename: 'checkpoints/sam3.1_multiplex_fp16.safetensors'`,
  `engineAsset: true`, size, sha256.
- **Verify:** remote listing reports exactly `1745546848` bytes; local sha256 matches
  the declared value; and confirm an EXISTING install picks the new engineAsset up
  (repair/heal path, not only a fresh install) — if it does not, that is a finding to
  card, not to patch here.

### 2. Workflow — swap the points branch

Edit `comfy_workflows/raw/img_auto_mask.json`, then convert.

- **Delete:** 1650 `MpiLoadImageFromPath` (`Input_Points_Mask`), 1651 `ImageToMask`,
  1652 `MaskToSEGS`, 1653 `SAMDetectorCombined`.
- **Add:** `CheckpointLoaderSimple` (`sam3.1_multiplex_fp16.safetensors`), `MpiString`
  titled `Input_Points_Positive`, `MpiString` titled `Input_Points_Negative`,
  `SAM3_Detect` (MODEL from the loader, `image` from 1630, `refine_iterations: 2`,
  `individual_masks: false`, no `conditioning`, no `bboxes`).
- **Keep:** 1654/1655 erode/dilate cleanup pair (equal and opposite, proven), 1656
  `MaskToSEGS(combined=true)`, 1657 `MpiIfElse`, and the whole picker chain below it.
- **The self-gate is gone.** `MpiLoadImageFromPath(block_if_empty)` used to block the
  branch on empty points; `MpiString` cannot. `MpiIfElse` laziness covers
  `pointsMode=false`, but confirm in `MpiCanvasViewer` that Detect cannot fire with
  `pointsMode=true` and zero points. If it can, gate it app-side — do not add a node.
- **Verify:** `node scripts/workflow-to-api.mjs comfy_workflows/raw/img_auto_mask.json`
  — ALWAYS pass the explicit path; with no arguments it re-emits all 31 workflows and
  writes 15 stray template files. Expect 0 missing-required and 0 dangling links.

### 3. App side — delete the radius hack and the Scope dial

- `MaskManager.js`: delete `getPointsMaskDataURL()` and the `r=8` / `r=4` polarity
  constants; add a JSON getter returning positive and negative arrays as
  `[{"x":int,"y":int}]` strings in **source-image px** (unchanged coordinate space).
- `MpiCanvasViewer.js`: delete `_pointsThreshold` and `setMaskPointsThreshold`; the
  payload carries the two JSON strings instead of `pointsMask` / `pointsThreshold`.
- `commandExecutor.js`: params become `Input_Points_Positive` / `Input_Points_Negative`;
  drop `Input_Points_Mask` and `'Input_Points.threshold'`; update the `AutoMaskPayload`
  typedef.
- `MpiToolOptionsMaskPoints.js`: remove the Scope dial and `DEFAULTS.pointsThreshold`,
  and clear the now-orphaned persisted tool setting.
- **Verify:** `grep -rn "pointsThreshold\|pointsMask\|Input_Points_Mask" js/` returns
  nothing; `npm run lint` clean; the 9 known pre-existing test failures are unchanged
  (check the failure LIST, not the count — the suite is 219/228, green is not baseline).

### 4. Local live test

Run a points mask in-app on `Man_talking_to_woman_park_202606241940.jpeg`.

- **Verify:** mask at least as good as today at roughly 1.1s; right-click still adds a
  negative point; leaving the tool still restores the right-click menu
  (`setMaskPointsMode(false)`); Add / Subtract still bakes; a second run still
  accumulates. Sanity-check one large image — no retirement claim rides on it.

### 5. Remote Pod leg (user-run)

- **Verify:** points mask completes on a Pod, and the points PNG upload is GONE from
  the staging path — that is the remote win this card buys.

### 6. Docs

- `docs/masking.md` is at EXACTLY 200 lines, its cap. The Click-point rewrite is
  net-negative (the radius-hack and threshold prose both die), so it should fit; if it
  does not, something else comes out first.
- Fix the Roadmap MPI-380 line: it currently promises the refiner swap. It is points-only.
- **Verify:** line count ≤ 200.

## Verification

**Verify mode:** user-ux — the payoff is a mask the user has to look at.

Automated: workflow converter clean, grep sweep empty, lint clean, test-failure list
unchanged. User: steps 4 and 5.

## Risks

- SAM3 loads through `CheckpointLoaderSimple`, so it also builds its own CLIP. Watch
  VRAM on the first run alongside a resident generation model.
- New engineAsset on an existing install — step 1's second verify is the real unknown.
- `nodes_sam3.py` is core ComfyUI 0.28, not a custom node, so no `node_lock` work and
  no ComfyUI bump. Confirmed by file location.
