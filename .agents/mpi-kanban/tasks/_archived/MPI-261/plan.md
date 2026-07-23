# Crop tool: Ratio/Free + divisible-by round-up; Resize default divisible=16

## Current State

Investigation-backed (3 parallel read-only agents, notes in `research/`).

**Crop tool** — [MpiToolOptionsCrop.js](../../../../js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.js):
- `family` = `sdxl|flux|social|free` (MpiRadioGroup). Orientation toggle shows for sdxl/flux only. Ratio row shows for non-free. Ratios pulled from `getModelRatios(family, orientation)` + `SOCIAL_RATIOS` (js/utils/ratios.js).
- `family` is read/written ONLY here (`getToolSettings`/`settings:tool:update`, both generic). Removing sdxl/flux/social is SAFE — `coerceSettings` coerces unknown persisted values to the default. No other consumer.
- Persists `family`, `orientation`, `label`. Adding `divisible_by`.

**Crop apply (two paths, both send raw px/norm — no rounding today):**
- IMAGE: [MpiCanvasViewer.js:661](../../../../js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js#L661) `_runCrop` → `canvas.getCropRect()` (absolute px `{x,y,w,h}`) → POST `/project/crop-media` with `x,y,w,h`. Source dims via `canvas.img.naturalWidth/naturalHeight`. Server ([routes/projects.js:2106](../../../../routes/projects.js#L2106)) `Math.round()`s w/h and passes straight to Sharp `.extract` — NO overflow clamp (Sharp throws if rect exceeds source). So client must guarantee `x+w<=srcW`, `y+h<=srcH`.
- VIDEO: [MpiGroupHistoryBlock.js:1268](../../../../js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js#L1268) `_handleCropSaveVideo` → `viewer.el.getCropRect()` returns NORMALIZED 0..1 (from [cropTool.js](../../../../js/utils/cropTool.js) `_normRect`) → POST `/api/video/crop` with `cropRect{x,y,width,height}` fractions. Source dims via `currentItem.pixelDimensions{w,h}` (ffprobe-populated). Server ([routes/videoCrop.js:71](../../../../routes/videoCrop.js#L71)) denormalizes then `snapEven` (floor to even, libx264). **This conflicts with round-up-to-16** — server re-quantizes down. Need a bypass path.

**Ratios** — [ratios.js](../../../../js/utils/ratios.js): union of FLUX/SDXL/SOCIAL = 9 shapes `{1:1,3:4,4:5,5:8,9:16,4:3,5:4,8:5,16:9}`. SOCIAL adds nothing new. Video-tier tables (WAN/LTX/KREA2) add only 1:1/9:16/16:9. New CROP table is pure-aspect (`{label,ratio,icon}`, no px), `{portrait,landscape}` split (portrait ratio<1, landscape>1, 1:1 in both). Existing index-mirror orientation-flip logic reused unchanged.

**Cinema ratios (user: add real SVG icons):** add 4 per orientation — 2:1, 1.85:1, 21:9 (2.333), 2.39:1. Icons ([icons.js](../../../../js/utils/icons.js)) are stroke-based single `<rect rx=2/>` at ratio_* keys; 9 exist, cinema ones must be added.

**Resize default** — TWO objects, both must change 1→16:
- [MpiToolOptionsResize.js:57](../../../../js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js#L57) `DEFAULTS.divisible_by`.
- [resizeInjector.js:23](../../../../js/services/workflowInjectors/resizeInjector.js#L23) `DEFAULTS.divisible_by` — injector falls back to its OWN default when param absent; missing this = silent 1.
- Resize is ONE component for image+video (`toolKey:'resize'` hardcoded), so one default per file covers both. Existing saved projects keep their stored value (no migration; acceptable).

**Round-up rule (decided):** each output dim rounded UP to next multiple of N; if that exceeds the available source span, floor to previous multiple instead (never invent pixels). Shared helper.

**Project mode:** no `project-profile.md` found (default mode). Standard phases below; work is largely sequential (shared files, ordered dependencies) so NO parallel batch — the crop-UI, ratios table, and apply-rounding all touch interlocking state and are best done in order. Resize-default is trivial and folded into phase 4.

## Completed

- [x] Phase 1: CROP_RATIOS pure-aspect table ({portrait,landscape}, 9 entries each, index-mirror, 1:1 featured, deep-frozen) added to ratios.js; 4 cinema icons (ratio_2_1, ratio_185_1, ratio_21_9, ratio_2_39) added to icons.js. Self-check (scratchpad check-crop-ratios.mjs) PASSED: portrait ratios<=1, landscape>=1, 1:1 first both, lengths equal, floats exact, all icons resolve, frozen.
- [x] Phase 2 (USER-VERIFIED): MpiToolOptionsCrop reworked — FAMILY_VALUES {ratio,free}, DEFAULTS.family 'ratio' + divisible_by 16, imports CROP_RATIOS+MpiInput (dropped getModelRatios/SOCIAL_RATIOS), orientation+ratio visible only for family==='ratio', Divisible-by MpiInput above Apply (both modes) + persist, el.getDivisibleBy() exposed, __divisible CSS. Follow-up fix (user caught): portrait cinema icons were reusing landscape wide-rects → added 4 tall portrait icons (ratio_1_2, ratio_1_185, ratio_9_21, ratio_1_239) + repointed portrait CROP_RATIOS entries. Verified in app: RATIO/FREE only, cinema icons correct per orientation, divisible input renders/persists.
- [x] Phase 3 (code done; image in-app-checkable, video user-ux): new js/utils/cropRounding.js roundToDivisible(value,n,max) = up=ceil, down=floor, prefer up unless >max then down, clamp to span when max<n; self-check + test green. IMAGE: MpiCanvasViewer._runCrop reads crop toolSettings divisible_by, srcW/H from canvas.img.naturalWidth/Height, rounds w/h bounded by src-minus-origin, POSTs rounded. VIDEO: MpiGroupHistoryBlock._handleCropSaveVideo converts norm rect→abs px via currentItem.pixelDimensions, rounds, sends absoluteCropPx; routes/videoCrop.js uses absoluteCropPx directly (clamped to source) and SKIPS snapEven when present, else unchanged. ESLint clean.
- [x] Phase 4 (auto-verified): Resize DEFAULTS.divisible_by 1->16 in MpiToolOptionsResize.js AND resizeInjector.js. Assert + test confirm both === 16.
- [x] Tests: tests/crop-ratios-divisible.test.cjs (CROP_RATIOS shape, both-DEFAULTS-agree, roundToDivisible) — 3/3 green; existing ratio-modes-exhaustive + krea2 tests still 11/11 green.

## Remaining Work

## Phase 1: New pure-aspect ratio table + cinema icons

- [ ] Add `CROP_RATIOS` to [ratios.js](../../../../js/utils/ratios.js): `{ portrait:[...], landscape:[...] }`, each entry `{ label, ratio, icon }`, pure aspect (no w/h px). Portrait = 5 existing (1:1,3:4,4:5,5:8,9:16) + 4 cinema (2:1→1:2, 1.85:1→ ~0.541, 21:9→9:21, 2.39:1→ ~0.418). Landscape = transposes (1:1,4:3,5:4,8:5,16:9 + 2:1,1.85:1,21:9,2.39:1). 1:1 first in both (featured). Deep-freeze with the others. **Verify:** `node -e` requiring ratios.js prints CROP_RATIOS; assert every portrait ratio<=1, every landscape>=1, 1:1 in both, list lengths equal (index-mirror works), all floats correct (2.39:1===2.39, 21:9===21/9).
- [ ] Add cinema `ratio_*` icons to [icons.js](../../../../js/utils/icons.js): `ratio_2_1`, `ratio_185_1` (1.85:1), `ratio_21_9`, `ratio_2_39` (2.39:1) — single stroke `<rect rx=2/>` sized to proportion, matching existing ratio-icon style. CROP_RATIOS icon keys use the `rect_*` form (consumer does `.replace('rect_','ratio_')`), so name table entries `rect_2_1` etc. **Verify:** grep icons.js confirms 4 new keys; each CROP_RATIOS icon key, after `rect_`→`ratio_`, resolves to a real ICONS entry (no `info` fallback). Small assert script iterating CROP_RATIOS.

## Phase 2: Crop tool-options → Ratio/Free + divisible input

- [ ] Rework [MpiToolOptionsCrop.js](../../../../js/components/Organisms/MpiToolOptionsCrop/MpiToolOptionsCrop.js): `FAMILY_VALUES`→`{ratio,free}`; `FAMILIES`→`[{RATIO,ratio},{FREE,free}]`; `DEFAULTS.family`→`ratio`, add `DEFAULTS.divisible_by:16`. Import `CROP_RATIOS` (drop `getModelRatios`/`SOCIAL_RATIOS`). Rewrite `_ratioOptionsFor(orientation)` + `_resolveRatio(family,orientation,label)` to read CROP_RATIOS (remove social branch). `_mountOrientation` visible when `family==='ratio'`. Simplify `familyRadio.on('select')` (drop sdxl/flux/social mirror logic → simple label-fallback). Keep the orientation index-mirror flip. **Verify:** app boots (`npm start` bg, poll `/comfy/get-path`), open a project → Crop tool: only RATIO/FREE shown; RATIO shows orientation + ratio row incl cinema with correct icons; FREE hides both; picking a ratio locks the crop box aspect; orientation flip mirrors selection.
- [ ] Add "Divisible by" MpiInput (default 16) directly ABOVE Apply. Add `#divisible-slot` to template between ratios-section and actions-slot (+ `.mpi-tool-options-crop__divisible` CSS wrapper). Copy `clampInt` local + import MpiInput. Wire `on('input')`/`on('change')` → `_divisible_by` + `persist('divisible_by', ...)`. Input visible in BOTH ratio and free modes. **Verify:** input renders above Apply in both modes; default shows 16; edit persists (reopen tool → value retained); non-numeric/blank coerces to prior valid via clampInt.

## Phase 3: Round-up on apply (image + video)

- [ ] Add shared helper `roundToDivisible(value, n, max)` (new [js/utils/cropRounding.js](../../../../js/utils/cropRounding.js)): `up=ceil(v/n)*n; down=floor(v/n)*n; return max(n, up<=max ? up : down)`. **Verify:** self-check script — `roundToDivisible(1020,16,1024)===1024`; `(1024,16,1024)===1024`; `(1030,16,1024)===1024` (up 1040>1024 → down 1024); `(1000,16,1002)===992`; `(10,16,8)===16`? no — max<n edge: doc + assert returns min-multiple only if it fits, else clamp — decide: when `down<n` and `up>max`, return `down` floored but ≥0; assert the documented behavior. Include the edge asserts in the script.
- [ ] IMAGE round-up: in [MpiCanvasViewer.js](../../../../js/components/Organisms/MpiCanvasViewer/MpiCanvasViewer.js) `_runCrop`, after `getCropRect()`, read `srcW=canvas.img?.naturalWidth`, `srcH=canvas.img?.naturalHeight`, pass `_divisible_by` in from the tool via the apply emit (crop apply flows through the Block — thread the value; if not already available, read from persisted crop toolSettings). Compute `w=roundToDivisible(rect.w, n, srcW-rect.x)`, `h=roundToDivisible(rect.h, n, srcH-rect.y)`; POST rounded w/h. **Verify:** crop an image with n=16 → output file dims are multiples of 16 and ≤ source; crop at full-width edge → no Sharp error, dims floored not overflowed. Confirm via the new history item's pixelDimensions + on-disk file.
- [ ] VIDEO round-up: in [MpiGroupHistoryBlock.js](../../../../js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js) `_handleCropSaveVideo`, read `srcW/srcH` from `currentItem.pixelDimensions`, convert norm rect→abs px, `roundToDivisible` W/H (bound `srcW-x`,`srcH-y`), send an explicit `divisibleBy` (or `absoluteCropPx{x,y,w,h}`) field. In [routes/videoCrop.js](../../../../routes/videoCrop.js): when `absoluteCropPx` present, use it directly and SKIP `snapEven` (multiples of 16 are already even); else unchanged. **Verify:** crop a video with n=16 → output frame dims multiples of 16, ≤ source, playable (libx264 accepts even). Server log shows the bypass path. **[Verify mode: user-ux for this step — needs a real video + the running app.]**

## Phase 4: Resize default = 16

- [ ] Change `DEFAULTS.divisible_by` 1→16 in BOTH [MpiToolOptionsResize.js:57](../../../../js/components/Organisms/MpiToolOptionsResize/MpiToolOptionsResize.js#L57) and [resizeInjector.js:23](../../../../js/services/workflowInjectors/resizeInjector.js#L23). **Verify:** fresh project → Resize tool (image AND video mode) shows Divisible by = 16 by default; a resize run with default produces multiple-of-16 dims. Assert both DEFAULTS objects === 16 (small node script requiring both, or grep).

## Parallel Batch

None. Tasks share `ratios.js` / crop component / interlocking apply state and have ordered dependencies (icons+table → UI → apply-rounding). Splitting would create overlapping ownership and forward deps. Sequential phases are correct here.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Final end-to-end (in the running Electron app — this is a visible UI + pixel-output change):
1. Crop tool shows RATIO / FREE only. RATIO = orientation toggle + ratio row (existing 9 + 4 cinema, all with correct icons). FREE = no ratio/orientation.
2. Ratio locks the crop-box aspect; orientation flips selection by mirror.
3. "Divisible by" (default 16) sits above Apply, both modes, persists.
4. Apply IMAGE → output W & H multiples of N, never exceeding source (edge = floored).
5. Apply VIDEO → same, playable output.
6. Resize tool (image + video) defaults Divisible by = 16; resize output honors it.
7. `npm test` (or the relevant ratio/icon test files) green; add a CROP_RATIOS-shape test + a both-DEFAULTS-agree test.

## Preservation Notes

- Investigation notes: `research/` (inv-crop-ui, inv-crop-apply, inv-ratios-resize).
- New util `js/utils/cropRounding.js` + its self-check.
- If cinema icons need design polish, note in [docs/ui-gotchas.md](../../../../docs/ui-gotchas.md).
- Video crop server gained an `absoluteCropPx`/`divisibleBy` param — if it lands, note the contract in the videoCrop route header + docs. Server change = touches mpi-ci? NO — videoCrop.js is in THIS repo (routes/), not the Pod. Confirm during phase 3.
- CLAUDE.md doc-drift rule: crop-tool component wiring changed → ask user at session end whether to update `.claude/rules/` (component-comfy / component-state if crop settings shape shifts).
