# MPI-234 — Generation queue/store/lane + status-bar progress architecture map

Two agent maps from the MPI-226 session (2026-07-08). Read BEFORE touching the gallery placeholder or status-bar progress code. Verify file:line still current before relying.

## 1. Queue / store / lane model

- `_lanes = { remote:{active,lastJobForLoop}, local:{...} }` (generationService.js ~58). `active` = the dispatched cue INTENT (not the store job); covers the async gap between `startGeneration()` returning and commandExecutor registering the store job. Set ONLY in `_dispatchNextCue` (~346). Cleared ONLY in `_onLaneDrain` (~295).
- Store↔service bridge: `generationStore.setLoopCallback(lane, () => _onLaneDrain(lane))` registered per-dispatch in `_dispatchNextCue` (~354). Store fires it in `_onTerminal` when the lane DRAINS (no successor promoted). Consumed once (`_loopCallbacks[lane]=null`).
- `_onTerminal` order (generationStore.js ~225): `_releaseLane` (clears store activeJobId) → `_promoteNext` (returns null if no pending → does NOT fire loop cb) → read `_loopCallbacks[lane]` → null it → `_broadcast()` → `cb(lane)` = `_onLaneDrain`.
- CANCEL path (the crux): `cancelRunningCueJob` (generationService.js ~449) → `activeGenerations.cancel(id)` (activeGenerations.js 117) → `entry.exec.cancel()` (line 122) → commandExecutor exec.cancel → `generationStore.cancel(jobId)` → `_onTerminal` → loop cb → `_onLaneDrain` → (loop armed) re-fire → `enqueueGeneration` → `_dispatchNextCue` (SYNCHRONOUS) → new intent set as `_lanes[lane].active`, new `setLoopCallback`, `startGeneration`. THEN back in activeGenerations.cancel: `entry.status='cancelled'` (123), `end(id)` (124), `emit generation:cancelled` (125).
  - **ALL of the re-fire runs synchronously inside `activeGenerations.cancel()`, BEFORE it returns and BEFORE the OLD entry is marked cancelled/removed.**
- DOUBLE-FIRE (FIXED in MPI-226): after cancel returns, `_lanes[lane].active` = the NEW re-fired intent (loop on). The explicit belt-drain `_onLaneDrain(lane)` at the end of `cancelRunningCueJob` (~488) then drained THAT new job → a 2nd re-fire. One Stop → 2-3 gens. FIX: capture `_cancelledIntent = _lanes[lane].active` before cancel; only run belt-drain `if (_lanes[lane].active === _cancelledIntent)` (genuine stuck-lane where store never drained — exec.jobId never set → bare interrupt). Verified: exactly 1 re-fire per Stop.

## 2. Status-bar N/M progress (the "5/5 for a 2-step SDXL" twin)

- `statusBar.js`: `_stageText` is a SINGLE module var (~46), written by `setStage(stage,total)` (~403) on every `tool:stage` for `groupHistory` (~540). The `tool:stage` handler `_latch(id)`s the bar to that gen but does NOT filter `setStage` by id — any gen's stage event overwrites `_stageText`.
- Origin of N/M: commandExecutor.js `runCommand` creates a CLOSURE-LOCAL `stageProgress = createStageProgress({stages: stagesFor(workflowFile,mode)})` (~1187). Per-gen, NOT shared. SDXL `t2i_*` → `progressStages.js` `{single:2}` → total starts 2.
- phaseProgress.js `step(value,max)` (~52): new tqdm bar detected when `max!==_lastMax || value<_lastVal` → `_stage++`; SELF-CORRECT `if(_total && _stage>_total) _total=_stage` (climbs, never drops).
- **The leak:** SSE `/comfy/events/stream` `comfy:step-progress` frames are filtered by ENGINE only, NO prompt_id/gen_id (commandExecutor.js ~1346). A doomed gen's tqdm bars keep draining server-side after an advisory interrupt; the re-fired gen's fresh `stageProgress` consumes them + its own → bar count exceeds 2 → self-correct bumps total → "5/5".
- Only manifests when TWO gens overlap. The MPI-226 double-fire fix removes most overlap. If 5/5 persists: add gen-id/prompt-id filter to the SSE step consumer, or reset tracker on new-prompt boundary.

## 3. Gallery placeholder ownership (the parked display bug)

- `_firstRunningEntry()` = first status:'running' gallery entry in registry insertion order (MpiGalleryBlock.js ~1345). `_placeholdersForFirst()` returns ITS placeholderGroup+extraPlaceholders (~1348).
- `generation:started` (~1354) mounts `_placeholdersForFirst()` (ignores payload's own placeholder). `generation:preview` (~1363) paints only if `_firstRunningEntry().id===event.id`. `_rebuildAfterEnd` (~1387) removes ended tempIds + re-mounts `_placeholdersForFirst()`.
- Grid: `setGroups`→`_rerenderJustified` DEBOUNCED 16ms (MpiGalleryGrid.js ~1377). `updatePreview(tempId,url)`→`_cardMap.get(tempId)?.card.el.updatePreview` — silent no-op if tempId not in `_cardMap`. Card paints only if its `_generating` flag true (~1148). `_getCardEntry` reuses card by group.id (~1329).
- BUG: Stop-refire window has old+new both running, old first. The started/rebuild ordering drops the NEW placeholder from `_cardMap` (proven: `inCardMap=false` for the whole refired run). Every point-fix exposed another permutation. Fix direction = idempotent reconcile from activeGenerations, no ordering/first-owner reliance.
