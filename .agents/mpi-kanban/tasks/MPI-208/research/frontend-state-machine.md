# Frontend Cue/Queue/Stop/Status State Machine Investigation
Generated: 2026-07-06

---

## 1. CUE Button + Prompt Footer

File: js/components/Organisms/MpiPromptBox/MpiPromptBox.js

### State Keys Read
- state.generationQueueCount (lines 1067,1098,1123,1190,1233) -- button label
- state.loopArmed (lines 1067-1071,1096,1107,1161,1183-1186,1216) -- Loop vs Cue class+label
- state.remoteEnginePhase (lines 1261-1263,1276-1279) -- disables Cue during engine transition

### State Keys Written
- state.loopArmed -- 700ms hold (line 1170); tap-while-armed (line 1184); Ctrl+L (line 1243)
- state.promptExpanded -- chevron lock (line 727)
- state.promptDraft -- textarea via _saveDraft() (lines 101-104)
- state.promptMedia -- media-change via _saveMedia() (lines 115-121)

### Events Listened
- promptbox:generation-end -> el.setGenerating(false) [line 652]
- state:changed:generationQueueCount -> runBtn label update [line 1252-1254]
- state:changed:loopArmed -> _refreshRunLabel() [line 1256-1258]
- state:changed:remoteEnginePhase -> _applyRemotePhase() [line 1260-1262]
- Hotkeys: generation.run, generation.stop, generation.loop

### CUE Count Label Logic (lines 1067-1072)
  loopArmed=false, count=0  -> Cue
  loopArmed=false, count>0  -> Cue xN
  loopArmed=true,  count<=1 -> Loop
  loopArmed=true,  count>=2 -> Loop xN

### Loop Mode
- 700ms hold -> state.loopArmed=true (line 1170) + _seedLoopIfIdle()
- Tap while armed -> state.loopArmed=false (line 1184)
- Session-only; not persisted
- _emitPromptBoxGenerationEndIfIdle (generationService line 426): if loopArmed -> NO end emit

### Stop Button
- Disabled when isGenerating===false (line 1197-1199)
- Click: emit cancel (line 1201)
- isGenerating is block-local; set true on CUE click (line 1187), cleared by promptbox:generation-end

### Remount Reconciliation (MpiPromptBox.js:1122-1124)
  if (generationQueueCount===0 && !_anyRunning) isGenerating=false;
  else if (_anyRunning) isGenerating=true;
NOTE: only sets true when _anyRunning. If lane stuck inFlight but registry empty -> count=1 but isGenerating=false -> Stop DISABLED.

---

## 2. Status Bar

File: js/shell/statusBar.js

### Module-Level Internal State (persists across ALL navigation)
- _state: idle|active (line 41)
- _currentLabel: string (line 44)
- _queueDepth: number (line 46)
- _activeGenId: gen id currently tracked (line 56) -- CRITICAL for terminal filtering
- _elapsedSec, _activeStartedAt, _timerInterval: timer (lines 47-49)
- _remoteConnected, _remotePhase: scope label (lines 49-50)

### Events Listened (permanent, never torn down)
  tool:running        -> _latch(id), prepare(Starting)          [line 441-445]
  tool:accepted       -> _latch(id), startClock()               [line 448-452]
  tool:loading-model  -> _latch(id), updateLabel(Loading model) [line 454-458]
  tool:sampling-start -> _latch(id), updateLabel(opLabel)       [line 461-465]
  tool:progress       -> _latch(id), update(value)              [line 466-470]
  tool:stage          -> _latch(id), setStage(stage,total)      [line 472-476]
  tool:cancelled      -> guard: if id!=null && _activeGenId!=null && id!=_activeGenId: SKIP
                         else: _activeGenId=null, cancel()->_setIdle() [line 483-491]
  tool:idle           -> same guard; complete() [line 492-497]
  generationQueueCount -> _queueDepth=count [line 498-501]

### _latch(id) -- statusBar.js:130-131
  if (id!==null && id!==undefined) _activeGenId = id;
null id is NO-OP. MpiGroupHistoryBlock emits tool:cancelled with null id (no id field).
Guard at line 488: if (id!==null && _activeGenId!==null && id!==_activeGenId) return;
With null id: first condition (id!==null) is FALSE -> guard does NOT skip -> cancel() called.
MpiGalleryBlock does NOT emit tool:cancelled at all in its cancel handler.

### Navigation Behaviour
StatusBar is shell-level singleton. Listeners never torn down.
All internal state is module-level -- survives all workspace navigation.
Only terminal events (tool:cancelled/tool:idle with matching or null id) reset it.
No listener for: navigation events, generationQueueCount=0, project:changed.

---

## 3. Stop Button Full Cancel Path (Frontend Only)

### MpiGalleryBlock cancel handler (MpiGalleryBlock.js:1221-1248)
pb.on(cancel) wired in _wirePromptBox():
  1. activeGenerations.listFor(gallery,null).filter(running)
  2. for each: cancelRunningCueJob(entry.queueJobId) or activeGenerations.cancel(entry.id)
  3. grid.el.setGroups(currentGroups) -- removes placeholder cards
  4. if noRunning && queueIdle && !continueBusy && !loopArmed: emit promptbox:generation-end
  5. refreshQueueDepth()
  *** tool:cancelled NOT emitted -- CRITICAL GAP ***

### cancelRunningCueJob(queueJobId) -- generationService.js:346-384
  1. Find entry in activeGenerations with matching queueJobId and status=running
  2. activeGenerations.cancel(entry.id):
       a. entry.exec.cancel() -> closeComfyEventSource() + getEngine().interrupt()
       b. entry.status = cancelled
       c. activeGenerations.end(id) -> removes from _registry, revokes preview blob
       d. Events.emit(generation:cancelled, { id, tempId, extraTempIds })
       *** does NOT emit tool:cancelled ***
  3. Lane detection: _lanes.remote.active?.queueJobId===queueJobId ? remote : local : null
  4. if lane found: _finishActiveCueDispatch(lane, {skipNext:false})
       a. L.inFlight=false, L.active=null
       b. _updateQueueDepth() -> state.generationQueueCount = cueQueue.length + runningCount
       c. loop re-fire check (lines 210-226)
  5. _emitQueueChanged()

tool:cancelled emitters: exec.onError (generationService:1054), exec.onComplete empty-output (604),
exec.onComplete cacheHit (626), MpiGroupHistoryBlock cancel (871),
MpiGroupHistoryBlock replaceItemId-not-found (984), latestGroup-not-found (1002).
MpiGalleryBlock cancel is NOT in this list.

### MpiGroupHistoryBlock cancel handler (MpiGroupHistoryBlock.js:854-872) -- contrast
  ... [same cancel sequence] ...
  Events.emit(tool:cancelled, { tool: groupHistory })  <- ALWAYS emitted, id=null
  state.generationQueueCount = 0 directly (line 867) -- bypasses service math

---

## 4. Global State Keys in Generation Lifecycle

### state.generationQueueCount
WRITERS:
  generationService._updateQueueDepth() (lines 173-178):
    depth = _cueQueue.length + _runningCount()
    Called from: enqueueGeneration, _finishActiveCueDispatch, _dispatchNextCue,
                 refreshQueueDepth, cancelRunningCueJob, clearCueQueue, removeCueJob
  MpiGroupHistoryBlock cancel (line 867): state.generationQueueCount=0 directly
    *** Bypasses service math -- inconsistency if lane still inFlight ***

READERS:
  MpiPromptBox._renderRunCluster (line 1123): mount reconcile
  MpiPromptBox._runLabel() (line 1067): button label
  MpiPromptBox._seedLoopIfIdle() (line 1098): loop gate
  StatusBar via Events.onState (line 498): queue depth display
  MpiGroupHistoryBlock._syncQueueBlockedTools() (line 261)
  MpiGroupHistoryBlock cancel (line 865): queueIdle check
  MpiGalleryBlock cancel (line 1242): queueIdle check
  MpiCanvasViewer._isCueBusy() (line 277)

### state.loopArmed
WRITERS:
  MpiPromptBox: 700ms hold (line 1170), tap-while-armed (line 1184), Ctrl+L (line 1243)

READERS:
  MpiPromptBox._runLabel() (line 1068)
  MpiPromptBox._seedLoopIfIdle() (line 1097)
  generationService._emitPromptBoxGenerationEndIfIdle() (line 426)
  generationService._finishActiveCueDispatch() (line 211): loop re-fire gate
  MpiGalleryBlock cancel (line 1244): gate for promptbox:generation-end

### state.remoteEnginePhase
WRITERS: shell.js (remote connection handlers)
READERS: MpiPromptBox._applyRemotePhase() (line 1276), StatusBar._idleScopeLabel() (lines 113-121)

### Module-Level Singletons (survive navigation)
  generationService._cueQueue, _lanes: { remote:{active,inFlight,lastJobForLoop}, local:... }
  activeGenerations._registry: Map<id, GenerationEntry>
  StatusBar._state, _currentLabel, _activeGenId, _queueDepth: all module-level

---

## 5. Workspace Navigation Lifecycle

### MpiGalleryBlock destroy() (lines 1511-1525)
- Unsubscribes all _unsubs listeners
- Destroys sub-components including _pb (PromptBox) -- unsubscribes PB own listeners
- _myGenIds Set, _stoppedPendingComplete Set, _continuingGroupIds Set: all LOST
- Does NOT cancel running generations
- Does NOT emit tool:cancelled or promptbox:generation-end
- Does NOT clear state.generationQueueCount

### What Survives Navigation
- activeGenerations._registry
- generationService._cueQueue, _lanes (inFlight flags, lastJobForLoop)
- state.generationQueueCount, state.loopArmed
- StatusBar everything (_state, _currentLabel, _activeGenId, _queueDepth, timer)

### MpiGalleryBlock Remount
1. _myGenIds = new Set() -- empty, no memory of prior gens
2. _runningGallery = activeGenerations.listFor(gallery,null).filter(running)
3. If running entries: placeholder cards shown, _myGenIds seeded
4. After PB mount: _refreshPbGenerating() -> _pb.el.setGenerating(busy)
5. PromptBox _renderRunCluster(): if count>0 but _anyRunning=false -> isGenerating=FALSE -> Stop DISABLED

---

## 6. Root Causes

### Bug (a): Stale LOADING MODEL 50% After Stop + Navigation

Chain:
1. Gen dispatched on remote RunPod.
   tool:running -> StatusBar._latch(A_id), prepare(Starting) -> _state=active.
   tool:loading-model -> _latch(A_id), updateLabel(Loading model).
   tool:progress(0.5) -> _latch(A_id), update(0.5) -> LOADING MODEL 50%.

2. User presses Stop (MpiGalleryBlock cancel, line 1221).
   cancelRunningCueJob -> activeGenerations.cancel(A_id)
     -> exec.cancel() [SSE closed, interrupt POST]
     -> registry entry removed
     -> generation:cancelled emitted
   _finishActiveCueDispatch(remote) -> inFlight=false, active=null, count=0.
   promptbox:generation-end -> isGenerating=false.
   tool:cancelled NOT emitted.

3. ComfyUI on Pod receives interrupt mid-install; no WS terminal event arrives.
   SSE closed; exec promise never settles via normal path.
   No tool:cancelled emitted.

4. StatusBar: _state=active, _currentLabel=LOADING MODEL, _activeGenId=A_id. STUCK.

5. Navigate away -> back to Gallery.
   MpiGalleryBlock.destroy() [listeners unsubscribed].
   StatusBar: unchanged (module-level).
   MpiGalleryBlock remounts: registry empty -> PromptBox: isGenerating=false.
   StatusBar STILL shows LOADING MODEL 50%.

ROOT CAUSE: Gallery cancel handler does NOT emit tool:cancelled (unlike MpiGroupHistoryBlock.js:871).
StatusBar._activeGenId=A_id, _state=active forever until matching terminal event arrives.


### Bug (b): Un-stoppable STARTING + CUE X1

Chain:
1. First CUE: gen A dispatched. StatusBar STARTING, _activeGenId=A_id, count=1.

2. First Stop: cancelRunningCueJob
   -> cancel, free lane, count=0, isGenerating=false.
   -> tool:cancelled NOT emitted [gallery gap].
   StatusBar: STILL STARTING, not cleared.

3. User navigates -> back -> CUE again.
   Gen B dispatched. tool:running -> _latch(B_id) overwrites _activeGenId=B_id. count=1 -> CUE X1.

4. Second Stop: cancelRunningCueJob(B)
   -> cancel, free, count=0, isGenerating=false -> Stop DISABLED.
   -> tool:cancelled NOT emitted [gallery gap again].
   StatusBar: STILL STARTING.
   User sees: STARTING in bar, Stop disabled -> appears un-stoppable.

5. User presses CUE again (isGenerating=false -> Cue available). Cycle repeats.

ROOT CAUSE: Same -- gallery cancel does not emit tool:cancelled.
SECONDARY: After Stop, isGenerating=false -> Stop button disabled. User clicks Stop again -> no-op.

EDGE CASE -- stuck inFlight lane:
If cancelRunningCueJob lane detection returns null (race), _finishActiveCueDispatch not called.
_lanes.remote.inFlight stays true. count = 0 + 1 = 1. Registry empty -> _anyRunning=false.
PromptBox: count=1 but isGenerating=false (line 1123 only sets true when _anyRunning). Stop DISABLED + CUE X1 permanent.
Only app restart clears stuck lane.

---

## Definitive Root Causes Table

| # | Cause | File:Line |
|---|---|---|
| 1 (Primary) | Gallery cancel handler never emits tool:cancelled | MpiGalleryBlock.js:1221-1247 |
| 2 | StatusBar _activeGenId latch: future tool:cancelled with non-matching id filtered | statusBar.js:56,130-131,488 |
| 3 | No StatusBar safety-net on count=0 + registry empty | statusBar.js (absent) |
| 4 | History block direct generationQueueCount=0 write bypasses service math | MpiGroupHistoryBlock.js:867 |

---

## Key Cross-Reference Table

| Claim | File:Line |
|---|---|
| Cue label logic | MpiPromptBox.js:1067-1072 |
| Hold-to-arm 700ms | MpiPromptBox.js:1157-1173 |
| PromptBox mount isGenerating reconcile | MpiPromptBox.js:1122-1124 |
| promptbox:generation-end clears isGenerating | MpiPromptBox.js:652 |
| StatusBar tool:running handler | statusBar.js:441-445 |
| StatusBar tool:loading-model handler | statusBar.js:454-458 |
| StatusBar _latch() | statusBar.js:130-131 |
| StatusBar _activeGenId variable | statusBar.js:56 |
| StatusBar tool:cancelled id guard | statusBar.js:488 |
| Gallery cancel: no tool:cancelled | MpiGalleryBlock.js:1221-1247 |
| History cancel: emits tool:cancelled null | MpiGroupHistoryBlock.js:871 |
| cancelRunningCueJob lane detection | generationService.js:367-370 |
| _finishActiveCueDispatch idempotent guard | generationService.js:196 |
| Supersession guard in _dispatchNextCue | generationService.js:259-262 |
| Loop re-fire check | generationService.js:210-226 |
| _emitPromptBoxGenerationEndIfIdle loopArmed check | generationService.js:423-428 |
| activeGenerations.cancel() emits generation:cancelled not tool:cancelled | activeGenerations.js:121 |
| History direct generationQueueCount=0 write | MpiGroupHistoryBlock.js:867 |
| _updateQueueDepth formula | generationService.js:173-178 |
