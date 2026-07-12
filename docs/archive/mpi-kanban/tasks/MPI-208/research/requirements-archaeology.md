# Requirements + Bug Archaeology — MPI-208 (2026-07-06)

Investigator: read-only agent (feature inventory, UI surfaces, bug archaeology, requirements). The new queue architecture MUST satisfy every requirement and invariant below and subsume every archaeology fix.

## PART 1: FEATURE INVENTORY

### 1.1 CUE mode — Gallery prompt footer
Entry: `MpiGalleryBlock.js:1211` (`pb.on('run')`). Flow: Cue (or Ctrl+Enter / Q hotkey) → MpiPromptBox `run` + `getRunPayload()` → `enqueueGeneration()` → UUID `queueJobId` → `_cueQueue[]` → `_dispatchNextCue()` fills idle lane.
Multi-cue: every tap = one job; label `Cue xN` (N = `state.generationQueueCount` = running+pending) [MpiPromptBox.js:1063-1071].
Events in order: `generation:started`, `tool:running`, `tool:accepted`, `generation:preview`, `generation-queue:changed`, `generation:complete|cancelled|error`, `tool:idle|cancelled`, `promptbox:generation-end` (queue fully drained).
Cancel: Stop → iterate ALL `activeGenerations.listFor('gallery')` → `cancelRunningCueJob(queueJobId)` each → `/interrupt` + lane freed immediately via `_finishActiveCueDispatch`. Pending: trash → `clearPendingQueue()`; individual → `cancelPendingCueJob`.
UI: gallery spinner tile, status bar (`tool:*`, statusBar.js:437-513), Cue/Stop button states, QueuePanel slide-over.

### 1.2 Loop mode
[MpiPromptBox.js:1145-1173]. Hold Cue ≥700ms → `state.loopArmed=true` → `_seedLoopIfIdle()`. On lane drain in `_finishActiveCueDispatch` [generationService.js:204-227]: `loopArmed && !hasPending && L.lastJobForLoop` → `callbacks.getNextGeneration()` reads LIVE PromptBox state → re-enqueue on same lane. Tap disarms. Per-lane loop, locked to lane's `forceLocal`. Continue/Finish blocked while armed [MpiGalleryBlock.js:450, 636]. Stop during loop: lane freed, loop re-fires one more — must disarm BEFORE Stop to halt.

### 1.3 History workspace (MpiGroupHistoryBlock)
Differences: `opts.existingGroup` (append to group history), `scope:'groupHistory'` + `groupId`, `historyMode:true` forced, PromptBox mounts only if `_hasPromptOps()`, auto-injects viewed item as startFrame/media (1020-1053).
Entry points (all `enqueueGeneration`): PromptBox run → `_runGenerate` (845); video/image tool Apply → `_runVideoTool`/`_runImageTool`/`_handleResizeApply` (1069-1177); Q hotkey → QueuePanel (1387-1391).
Cancel: `pb.on('cancel', {mode})` — `mode==='queue'` targets `active[0]`, else `active.at(-1)` (854-870).
Extend: `extend:true + sourceItemId` → post-complete `/extend-video` concat [generationService.js:849-960].
UI: viewer spinner, mascot peek, `_syncPbGenerating()`.

### 1.4 Remote vs Local — two-lane
Two engine instances (`localEngine` alwaysLocal / `remoteEngine`). `_lanes = { remote:{active,inFlight,lastJobForLoop}, local:{...} }` [generationService.js:43-46]. `_laneOf(job) = forceLocal===true ? 'local' : 'remote'`. Max 1 active per lane; both concurrent.
Run-locally toggle [MpiPromptBox.js:1290-1310]: shown when remote-connected; sets `_runLocal` → `forceLocal` in payload; resets on disconnect.
Remote preflight [commandExecutor.js:885-901]: engine resolved once, arch once, hot-store ensure (≥15GB, MPI-194), LoRA auto-upload.
Transition guard: `_remoteTransition` [comfyController.js:52]; Cue disabled via `state.remoteEnginePhase` → `_applyRemotePhase()` [MpiPromptBox.js:1276-1281].

### 1.5 Multi-stage preview (Preview → Continue/Finish)
`preview:continue` [MpiGalleryBlock.js:443] branch new card; `preview:finish` [:631] replace. Cold fallback re-runs stage-1, chains stage-2 via `gallery:item-updated` sub. Config: `isStage2`, `loadLatentName`, `previewLatentFilePath`, `loadAudioLatentName`, `audioLatentFilePath`, `replaceItemId`, `sourceGroupId`. Per-block Maps `_continuingGroupIds`, `_queuedContinueGroupIds`, `_stage2BranchCounts` recomputed by `_syncPreviewQueueState()`. Scope always 'gallery'.

### 1.6 Other entry points
| Path | Entry | Queued? |
|---|---|---|
| Image/video tool ops | MpiGroupHistoryBlock.js:1100-1126 | Yes (enqueueGeneration) |
| Auto-mask | `commandExecutor.runAutoMask()` | No — bypasses `_cueQueue` |
| Video crop | POST `/api/video/crop` | No |
| Snapshot | `uploadMediaFile` → `addGroup` | No |
| Combine clips | POST `/combine-videos` | No — `trackConcatJob` |
| Extend post-process | inside `startGeneration` onComplete | No — chained inline |

## PART 2: UI SURFACES BOUND TO GENERATION STATE

| Surface | File:line | Driven by |
|---|---|---|
| Status bar spinner/label | statusBar.js:163-513 | `tool:*`, `_activeGenId` latch |
| Status bar fill | statusBar.js:74-95 | `tool:progress` % |
| Status bar N-queued suffix | statusBar.js:112-144 | `state.generationQueueCount` |
| Cue/Cue xN/Loop/Loop xN | MpiPromptBox.js:1062-1071 | queueCount, loopArmed |
| Cue armed CSS + charge fill | MpiPromptBox.js:1145-1173 | loopArmed |
| Cue disabled (transition) | MpiPromptBox.js:1270-1281 | remoteEnginePhase |
| Stop button | MpiPromptBox.js:1194-1204 | isGenerating |
| Clear button | MpiPromptBox.js:1205-1213 | isGenerating |
| Run-locally toggle | MpiPromptBox.js:1290-1310 | remote connected |
| Gallery spinner tile | MpiGalleryGrid.js:322,515-545,1128 | isGenerating placeholder |
| Gallery placeholder | generationService.js:86-119; MpiGalleryBlock.js:1270-1312 | tempId → group |
| Queued overlay | MpiGalleryBlock.js:733-735; Grid:334 | _queuedContinueGroupIds |
| Generating-final overlay | MpiGalleryBlock.js:760-769 | _continuingGroupIds |
| xN badge | MpiGalleryBlock.js:357-378 | _stage2BranchCounts |
| Preview warning badge | MpiGalleryBlock.js:395-431 | previewAssetsWarning |
| QueuePanel | MpiQueuePanel.js:1-389 | generation-queue:changed |
| QueuePanel status line | MpiQueuePanel.js:325-333 | N running / M queued |
| QueuePanel job cards | MpiQueuePanel.js:253-358 | snapshot + Stop/Cancel |
| History viewer spinner | MpiGroupHistoryBlock.js:488-495 | setGenerating |
| History mascot | MpiGroupHistoryBlock.js:474-487 | generation:started/complete/cancelled |
| History PB setGenerating | MpiGroupHistoryBlock.js:504-509 | _syncPbGenerating() |
| Resize tool disabled | MpiGroupHistoryBlock.js:260-280 | queueCount > 0 |
| No-changes toast | generationService.js:617-630 | exec.cacheHit |
| Preparing-cloud toast | commandExecutor.js:478 | hot-store cold stage |
| MpiErrorDialog | js/shell.js | ui:error |

## PART 3: BUG ARCHAEOLOGY

| # | Symptom | Fix | Root cause | Still fragile? |
|---|---|---|---|---|
| BUG-01 | Empty-media dispatch → ComfyUI validation error | f35a225 (MPI-109) | baked filenames absent on Pod | No — guard in startGeneration |
| BUG-02 | null tempId swallowed generation:cancelled | b0d1e0d (MPI-111) | tempId read from deleted registry entry | No — `_stableTempId` snapshot |
| BUG-03 | Stuck status-bar timer (frozen mm:ss) | b0d1e0d (MPI-111) | `_setIdle()` didn't `_stopTimer()` | No |
| BUG-04 | Stop didn't stop; late real output dropped | 4f2b178 (MPI-195) | `_myGenIds.delete(id)` on Stop | No — `_stoppedPendingComplete` bridge |
| BUG-05 | Remote wedge on missed terminal WS | 4f2b178 (MPI-203) | runWorkflow return discarded | No — reconcile replays synthetic events; `_executedSeenNodes` dedup |
| BUG-06 | Lane double-free; successor unstoppable | 4f2b178 (MPI-195/203) | no identity guard | No — `_lanes[lane].active !== next` guard |
| BUG-07 | Status bar stomped cross-lane | 4f2b178 (MPI-203) | no gen identity on bar | No — `_latch(id)` + id-guarded terminals |
| BUG-08 | Local wedge after disconnect+DELETE | 21b8fdf (MPI-156) | stale `_remoteTransition` | **Partial** — refresh() failure swallowed; 'connecting' guard unconditional |
| BUG-09 | Stop cancels only active[0] | ea3b826 (MPI-157) | index-0 only | No — iterate all |
| BUG-10 | Remote history reconcile 404 (double /wrapper) | 860412e (MPI-156) | URL prefix bug | No |
| BUG-11 | Restart poll on wrong flag (`ready` vs `comfyReady`) | MPI-107 | wrong health flag | No |
| BUG-12 | Cancel stale partial bytes | 9b55766 (MPI-123) | async cancel, no purge | No — synchronous `.part` purge |
| BUG-13 | Loop re-fire storm → UI freeze | genService refactor | re-fire in dispatch pass | No — re-fire only in `_finishActiveCueDispatch` |
| BUG-14 | SSE idle abort froze progress | 21b8fdf (MPI-156) | no keepalive | No — :ping 20s |
| BUG-15 | Stale engine mirror on no-GPU Pod | b9a313a (MPI-179) | `_active` not refreshed | No — refresh on remote:connection |
| BUG-16 | Queue overlays lost on nav | `_syncPreviewQueueState()` | per-block Maps as primary state | No — derived from module truth on remount |
| BUG-17 | History Stop unusable | ea3b826 (MPI-113) | `_syncPbGenerating()` missing | No |
| BUG-18 | Auto-retry flicker 15s | 3d03222/95c8a05 (MPI-134 D5) | nested retry loops | **Partial** — live-unverified |
| BUG-19 | Verifying sweep stuck on reconnect | MPI-164 | sweep not cleared | No |

## PART 4: IN-FLIGHT / UNRESOLVED
- 21b8fdf wedge fix: in place; residual — swallowed refresh() failure.
- Stale-pod reconnect toast: NO card; MPI-203 invisible recovery lacks "gen recovered" toast.
- MPI-123: fixed, closed.
- MPI-134 D5: committed, live-unverified, card in doing.

## PART 5: REQUIREMENTS (new architecture MUST satisfy)

R01 Single-cue enqueue: one tap = one job on correct lane; count atomic; label updates immediately.
R02 Multi-cue: stable UUID per job; `Cue xN` = running+pending; QueuePanel ordered.
R03 Two-lane concurrency: remote+local independent; both visible; bar last-active-wins.
R04 Loop: hold ≥700ms arm; re-fire once per lane drain from LIVE PromptBox state; tap disarm; per-lane, lane-locked.
R05 Stop running: `/interrupt` + lane freed immediately; promotes next or re-fires loop; does NOT clear pending.
R06 Cancel pending: per-job via QueuePanel; `onCancel` fires; placeholder rolls back.
R07 Clear pending: all pending removed; running unaffected.
R08 Lane identity isolation: stop on one lane never disturbs other lane.
R09 Late-settle safety: advisory interrupt + late real output → output SAVES; no double-complete; identity guard.
R10 Lane ownership guard: late settle never frees successor's lane.
R11 Gallery scope: new ItemGroups, tempId placeholder, reconciled on complete.
R12 GroupHistory scope: append to group history; group deleted mid-gen → discard + cleanup.
R13 Replace: `replaceItemId` → replaceHistoryItemById + `gallery:item-updated`; no new group.
R14 Multi-stage preview: Preview sidecar+latent; Continue/Finish stage-2 config; loop-armed gates; cold fallback chain.
R15 Extend post-process: `/extend-video` concat, intermediate deleted.
R16 Loop-armed blocks Continue/Finish (warning toast).
R17 QueuePanel: running=Stop, pending=Cancel, Clear-all-pending; signature diff render; Q hotkey both workspaces.
R18 Status bar identity: latch by id; terminal clears only on id match; null id honored; surviving lane re-latches.
R19 Navigation never desyncs: block state DERIVED from module truth; rebuilt on mount.
R20 Engine states isolated: separate restart/transition flags per engine; all engine-scoped signals tagged.
R21 Transition guard: no dispatch during connecting/disconnecting; self-heals when stale.
R22 Missing-media guard: single chokepoint, warn + no dispatch.
R23 Missing-model guards: LoRA hard block; upscale fallback SIAX; force-local uninstalled → warn + abort.
R24 Hot-store preflight: dryRun then ensure; best-effort; never blocks gen.
R25 Cache-hit dedup: skip result, No-changes toast, generation:cancelled cleanup.
R26 Stop always reachable: ≥1 enabled Stop surface whenever gen in flight; history mirrors via `_syncPbGenerating()`.
R27 `promptbox:generation-end` idleness contract: only when no running regs + no in-flight lanes + no pending + !loopArmed.
R28 Q hotkey opens QueuePanel in History too.
R29 Preview reset between stages (`generation:preview-reset`).
R30 Queue display snapshot frozen at enqueue; loop re-fire uses live state.

USER-ADDED R31 (2026-07-06): with Pod connected, cloud-toggle (run-locally) ON must switch prompt-box model selector (and dependent installed-op gating) to LOCAL models; toggle OFF restores remote list. Per-generation engine override = first-class state, not component-private `_runLocal`.

## Cross-Cutting Invariants

INV-1 Stop always reachable.
INV-2 Navigation never desyncs status (module truth → derived UI).
INV-3 Engine states isolated (remote never corrupts local).
INV-4 Late-terminal events never destructive (no lane free, no bar reset, no card drop, no dup cancelled).
INV-5 Loop re-fire once-per-completion, never in dispatch pass.
INV-6 Dispatch idempotent (inFlight/active guards; identity checks).
INV-7 QueuePanel signature diff (no hover flicker).
