# Backend Pipeline Investigation — MPI-208 (2026-07-06)

Investigator: read-only agent (backend generation pipeline, queue, cancel). Repro context: RunPod connected + Pod model install in flight; CUE → Stop → navigate → stuck "LOADING MODEL · 50%"; CUE+Stop again → stuck "STARTING" / CUE X1 un-stoppable.

## 1. Generation Submission Path

There is **no server-side generation route**. Generation is 100% client-initiated:

- **Client queue**: `generationService.js` owns `_cueQueue` (array) and `_lanes` (`{ remote, local }` objects with `{ active, inFlight, lastJobForLoop }`). No server-side equivalent exists.
- **Dispatch chain**: `enqueueGeneration()` → `_dispatchNextCue()` → `startGeneration()` → `runCommand()` [commandExecutor.js:866] → `getEngine(forceLocal).runWorkflow()` [comfyController.js:930] → `POST http://127.0.0.1:8188/prompt` (local) or `POST /proxy/prompt` → wrapper → ComfyUI (remote).
- **Server's only role pre-prompt**: `GET /comfy/status`, `POST /comfy/start`, `POST /comfy/prepare-workflow-inputs`, `POST /comfy/stage-preview-latent`.
- **Cue count**: `state.generationQueueCount` is client-only = `_cueQueue.length + running lanes`. Server has no awareness.
- **ComfyUI native queue**: always 0 or 1 pending. Only one prompt per engine is ever submitted.

## 2. Progress/Status Event Flow: Server → Client

Two channels run in parallel for every generation:

**SSE channel** (`GET /comfy/events/stream`):
- Local: `routes/comfy.js:184` — server parses ComfyUI **stdout** and broadcasts to ALL connected SSE clients via `_broadcastComfyEvent()` [comfy.js:69]. No per-generation or per-client filtering.
- Remote: `remoteProxyForward.js:277` intercepts the route when `_mode.active`, relays from `${podUrl}/wrapper/events/stream` with 20s keepalive ping.

| Stdout pattern | SSE event | Status bar result |
|---|---|---|
| `"Model Initializing"` | `comfy:model-initializing` | label → "LOADING MODEL" |
| `"Model Initialization complete!"` | `comfy:model-init-complete` | label stays "LOADING MODEL" (timer running) |
| tqdm `N/M [` (max>1) | `comfy:step-progress` | label → operation name ("SAMPLING" etc.) |

**WebSocket channel** (per-engine instance in `comfyController.js`):
- `executing` with loader class_type → `tool:loading-model`
- `executing node===null` or `execution_success` → `_finishGeneration()` → `exec.onComplete`
- `execution_error` → `exec.onError`

**"LOADING MODEL · 50%"** = `comfy:model-initializing` arrived (or WS loader node executing), setting `_modelInitializing = true`; no tqdm bar with `max>1` yet. `emitSamplingStart()` returns early while `_modelInitializing` is true [commandExecutor.js:1155-1157].

**"STARTING"** = `tool:running` fired in `startGeneration`, status bar in "Starting" `prepare()` state [statusBar.js:444], neither `tool:accepted` nor `tool:loading-model` arrived yet.

## 3. Cancel / Interrupt Path

`cancelRunningCueJob(queueJobId)` [generationService.js:346]:
1. `activeGenerations.cancel(entry.id)` → `exec.cancel()` → `closeComfyEventSource()` + `getEngine(forceLocal).interrupt()`
2. `interrupt()` [comfyController.js:521]: `POST ${httpBase()}/interrupt` then `this._isRunning = false` (always, even on error)
3. Lane freed **unconditionally** via `_finishActiveCueDispatch(lane)` regardless of whether `prompt_id` was ever set.

**Critical failure: interrupt before prompt ACK.** If Stop arrives before `POST /prompt` was sent (gen still awaiting `ensureServerRunning()`), `interrupt()` fires against ComfyUI with no active prompt — no-op or cancels an unrelated execution. The `commandExecutor` async IIFE **keeps running** with no cancellation token; it eventually POSTs `/prompt` and registers `internalListener`. Lane already freed → orphaned execution completes into `exec.onComplete()`; ghost history items possible.

**Critical failure: interrupt during model load.** ComfyUI model-load runs synchronously in Python; finishes loading into VRAM before checking interrupt flag. After load, sends terminal WS event (`execution_success`) with empty output → `_finishGeneration()` → `exec.onComplete([])` → `tool:cancelled` — but only honored if statusBar `_activeGenId` still matches. If a new gen latched the bar (lane was freed immediately), `tool:cancelled { id: oldGenId }` is swallowed by guard at `statusBar.js:488`.

**Cancel while model install in flight**: generation Stop and the download pipeline (`downloadManager.js`) are completely independent. `interrupt()` does not touch downloads. If ComfyUI not yet started, `interrupt()` POSTs to non-existent server, catch sets `_isRunning=false`, pipeline continues. The gen's `ensureServerRunning()` eventually succeeds and the "cancelled" gen POSTs a real prompt.

## 4. Model Loading vs Generation Overlap

- ComfyUI keeps loading a model after interrupt (no cooperative cancellation in loader). Load finishes, terminal fires, stdout events keep broadcasting.
- SSE stream is broadcast-global [comfy.js:69]. A new gen's `comfyEventSource` [commandExecutor.js:1195] receives events from the OLD gen's model load completing post-interrupt.
- Cache-hit case: model already in VRAM → ComfyUI never emits `"Model Initializing"`. `_modelInitializing` starts `true` for any gen with a sampler node [commandExecutor.js:1140]; only reset by multi-step tqdm (`max>1`) or `comfy:model-init-complete`. If gen interrupted before sampling, `_modelInitializing` stays `true` forever in its closure.

## 5. Server-side State & Reconnect/Navigation

- Server generation state ≈ none beyond `processState.activeComfyProcess` / `comfyNeedsRestart`. **No endpoint reports current generation status.**
- Client module-scope state survives navigation: `_cueQueue`, `_lanes`, `_registry` (activeGenerations Map), `statusBar._activeGenId`, `statusBar._state`, `comfyController._isRunning`, `_promptListeners`.
- On navigation, blocks destroyed/mounted; new block re-subscribes via `peekCueQueue()` but never queries server for running-generation truth. If events stopped arriving (old gen's SSE closed by `exec.cancel()`), bar stays stuck at whatever state it had.

## 6. Loop Mode / Multi-Cue

Purely client-side. `state.loopArmed` re-enqueues in `_finishActiveCueDispatch` when a lane drains. Two-lane dispatch (MPI-74 P6) allows one remote + one local simultaneously; each lane polls `_cueQueue` for its lane's jobs.

## Candidate Root Causes (this repro)

**Bug A (LOADING MODEL stuck):** gen1 interrupted mid-model-load → load completes anyway → terminal `tool:cancelled {gen1}` swallowed because gen2 already latched bar; gen2's "LOADING MODEL" was set by gen1's leaked SSE events; `_modelInitializing` true, no sampler → stuck.

**Bug B (STARTING stuck):** gen2's Stop hit while still inside `ensureServerRunning()` (no prompt_id, no listener). Lane freed; IIFE continues, later POSTs prompt; `_lanes[lane].active !== next` → early return in finish path → `tool:idle` never emitted → bar stuck "STARTING".

**Bug C (CUE X1 un-stoppable):** dangling `internalListener` + registry/lane mismatch; Stop looks up `activeGenerations.list().find(e => e.queueJobId === X && e.status === 'running')` — entry missing/premature-removed → Stop returns false, no-op.

## Systemic Gaps

1. No abort/cancellation token through commandExecutor async pipeline. `exec.cancel()` cannot abort `await ensureServerRunning()` / `runWorkflow()`.
2. SSE broadcast not scoped per generation/engine — stale-gen and cross-engine leakage.
3. No server-side generation-status endpoint — no reconciliation after navigation.
4. `_modelInitializing` starts `true` with no guaranteed reset (VRAM cache-hit case).
5. `tool:cancelled`/`tool:idle` id-guard prevents stomp but strands the bar when old gen's terminal is swallowed and new gen never terminals.
