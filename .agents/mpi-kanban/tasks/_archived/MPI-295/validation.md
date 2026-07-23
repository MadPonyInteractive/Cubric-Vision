# MPI-295 Validation

## Status: validating — code done + core UX verified live; Wan i2v end-to-end pending workflow sync

## Verified (user, live app, 2026-07-17)
- **Round-trip (the original bug):** 2-image krea2Edit → project page → return → **both chips survive**. Was: only chip #2. ✅
- **Reuse:** 2-image edit card → Reuse Prompt → **both chips load**, op = Edit. ✅
- **New save roles:** fresh 2-image edit sidecar tags `inputImage`/`inputImage2`, NOT `startFrame`/`endFrame`. ✅ (verified via `buildPromptReusePayload` on live sidecar + save simulation)
- **i2v frame injection (step 4):** 2 chips → switch to Wan i2v_ms → console proof both frames route correctly:
  - `[MPI295-RUN]` roles: `[startFrame, endFrame]` (remapped from inputImage/inputImage2 by `_withAssignedRoles`)
  - `[MPI295-BUILD]`: `Input_Start_Frame` ← chip 1, `Input_End_Frame` ← chip 2 (both URLs assigned)
  - **Role remap + injection = correct.** ✅

## Root causes fixed
1. `routes/projects.js` `_snapshotRoleForMediaItem` forced `startFrame`/`endFrame` by index → destroyed krea2Edit's real slot roles. Now persists `item.role`; positional frame-role only as legacy role-less fallback.
2. `_pickFallbackOp` (MpiPromptBox) picked the FIRST image op (i2i cap 1) ignoring chip count → snapped op to i2i mid-restore → evicted chip 1. Now count-aware (2 images → krea2Edit).
3. Restore op-fit guard compared saved count vs the model-wide MAX cap (`_maxMediaForCurrentOperation`, reports krea2Edit's 2 even under t2i) → guard never fired. Now compares vs the active op's OWN cap (`_maxMediaForOperation(activeOperation,…)`).
4. `promptReuse.js` + `generationService.js` snapshot/resurface filters made role-agnostic (all image inputs, not just frame roles).

## Migration
Not needed. Restore fits op by count (survives any role string); reuse tolerates old tags; old cards self-heal to correct roles on next save. Verified old mis-tagged sidecar still reuses 2 chips.

## NOT MPI-295 (separate — deferred to workflow-sync agent)
Wan i2v_ms 400 `Prompt outputs failed validation: Required input is missing: block_if_empty` on nodes `MpiLoadImageFromPath` (875/876). Cause: **no wan workflow JSON contains the `block_if_empty` widget** (grep-confirmed) — the node made it a required input after those workflows were authored. Both frame URLs ARE injected correctly (proven above), so this is pure workflow staleness, not a role/injection defect. Works in browser. Another agent is syncing the workflows; user will re-test Wan i2v end-to-end after sync.

## Remaining to close
- [ ] User re-tests Wan start/end-frame i2v after the other agent finishes workflow sync (`block_if_empty` added to loader nodes). Expect a clean run.
- Then → done.

## Files
- `routes/projects.js`, `js/utils/promptReuse.js`, `js/services/generationService.js`, `js/components/Organisms/MpiPromptBox/MpiPromptBox.js`
- (commandExecutor.js / comfyController.js touched for debug only — reverted, clean)
