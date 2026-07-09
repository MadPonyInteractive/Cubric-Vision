# Dual-Engine Coordination Investigation — MPI-208 (2026-07-06)

Investigator: read-only agent (dual-engine local+remote coordination).

## 1. Engine Split Contract

- Model declares `engines: { local: {...}, remote: {...} }`; sole resolver `js/data/modelConstants/resolveModelDeps.js` (`resolveDeps`, `resolveWorkflowFile`, `resolve`). Suffix order base → variant → `_stage2` → engine.
- Engine resolved ONCE per gen [commandExecutor.js:886-901]: `payload.forceLocal === true ? 'local' : (remoteEngineClient.isRemote() ? 'remote' : 'local')`. No consumer re-reads after.
- `getEngine(forceLocal)` [comfyController.js:1507]: `true` → `localEngine` (`_alwaysLocal`), `false` → `remoteEngine` (resolves remote-or-local live).
- `exec.cancel()` [commandExecutor.js:1190]: `getEngine(workingPayload.forceLocal === true).interrupt()`.

## 2. Two Engine Instances

`createEngine()` → two independent instances (remote/local): own `clientId`, own WS, own `_isRunning`, `_activePromptId`, `_promptListeners`; `_historyPollTimers` remote-only. Lifecycle events engine-tagged via `_emitLifecycle()` [comfyController.js:358]: `comfy:starting`, `comfy:ready`, `comfy:error`.

Two-lane dispatch [generationService.js:43]: `_lanes = { remote: {active,inFlight,lastJobForLoop}, local: {...} }` — one remote + one local gen concurrently.

## 3. Remote vs Local Status/Cancel Flow

- WS routing by `prompt_id`, per-engine sockets (Pod proxy WSS vs 127.0.0.1:8188).
- `comfy:step-progress`: LOCAL only (parsed from local ComfyUI stdout). Remote has no stdout → `_stdoutDriving` false → WS aggregator drives remote.
- Interrupt per-engine via `httpBase()`: remote → `POST /proxy/interrupt`; local → `POST http://127.0.0.1:8188/interrupt`.
- `_startHistoryPoll` 5s backstop is remote-only.

## 4. Shared Status Bar

Single bar, last-latch-wins `_activeGenId` [statusBar.js:130-132]. Driving events (`tool:running/accepted/loading-model/sampling-start/progress/stage/indeterminate`) latch genId. Terminals (`tool:cancelled`, `tool:idle`) ignored on id mismatch (MPI-203 guard [statusBar.js:486-491]). Works ONLY if driving events are genId-correct — but SSE-driven ones are fired with whatever genId the listening closure has, from UNTAGGED transport events.

## 5. UNTAGGED Events — Contamination Map

`_broadcastComfyEvent()` [routes/comfy.js:69-74, 95-141] events with NO genId and NO engine tag:
`comfy:model-initializing`, `comfy:model-init-complete`, `comfy:step-progress`, `comfy:tile-progress`, `comfy:segment-total`, `comfy:needs-restart` (partial `remote` bool only).

**Critical: `/comfy/events/stream` is a SHARED channel.**
- Local mode: relays local ComfyUI stdout events to ALL SSE clients.
- Remote mode: `remoteProxyForward.js:277-337` INTERCEPTS the route and pipes the Pod's ENTIRE `/wrapper/events/stream` through — NO FILTER. Renderer sees Pod install events AND Pod ComfyUI activity regardless of what the listening generation is.
- Install path is filtered (`remoteModels.js:576` keeps only `models:install-*`), but the generation relay is raw.

## 6. Concurrent Dual Generation — What Breaks (repro mechanics)

Pod installing model + user CUEs local gen:
1. Local gen opens `EventSource('/comfy/events/stream')`.
2. Remote mode active → route intercepted → Pod full stream relayed.
3. Pod install side-effect model load → `comfy:model-initializing` reaches LOCAL gen listener [commandExecutor.js:1194-1253] → `_modelInitializing = true` + `tool:loading-model {id: localGenId}`.
4. `emitSamplingStart()` gate [commandExecutor.js:1154] permanently blocked → bar stuck "LOADING MODEL x%" even if local ComfyUI is sampling.
5. After Stop + navigate + return + re-CUE: Pod install still streaming → new gen instantly re-poisoned.

**Stop routing ambiguity:** `forceLocal=false` gen that fell back to local still cancels via `remoteEngine.interrupt()` → hits Pod, not local ComfyUI.

**CUE X1 un-stoppable:** first Stop freed lane (MPI-195 identity guard [generationService.js:259]); successor promoted; `promptbox:generation-end` gated on `activeGenerations` idle [generationService.js:423-428]; stale registry entry ↔ lane mismatch → Stop's `queueJobId` lookup finds nothing → no-op.

## 7. Patch Inventory — Refactor Must Subsume

| Commit | MPI | Mechanism | Verdict |
|---|---|---|---|
| 21b8fdf | MPI-156 | stale 'disconnecting' `_remoteTransition` guard + SSE keepalive 20s | keep behavior; root = shared transition flag |
| 4f2b178 | MPI-195/203 | identity guard in `_dispatchNextCue`; `_reconcileFromHistory` replay via listener; `_executedSeenNodes` dedup | preserve semantics |
| 60e7819 | — | remote history-poll backstop 5s; fixed dead history URL | preserve for remote |
| 6d17da0 | MPI-73 | `_wsReady` gate; `_remoteTransition` guard during connect/disconnect | preserve |
| 47d2cdb | MPI-74 P6 | dual engine instances + two-lane dispatch | architecture foundation |
| b9a313a | MPI-179 | refresh engine mirror on `remote:connection` | preserve |
| 144e6fa | MPI-206 | re-sync installed models on Pod connect | preserve |
| ea3b826 | MPI-157 | Stop cancels ALL running gens | preserve |
| b4d928a | MPI-141 | `_needsPathHeal()` separator heal | preserve |
| 38de0dc | — | server `comfyNeedsRestart` flag | preserve |

## 8. Candidate Causes — Summary

- **LOADING MODEL stuck (primary):** unfiltered Pod stream relay + untagged `comfy:model-initializing` poisons any listening gen's `_modelInitializing`; `comfy:model-init-complete` may never come.
- **STARTING / CUE X1 (primary):** Stop-vs-late-terminal race around `_finishActiveCueDispatch` + identity guard; successor occupies lane but `generation-end` never fires; registry/lane mismatch makes Stop a no-op.
- Secondary: wrong-engine interrupt on fallback; `_modelInitializing` re-poisoned instantly on re-CUE; Pod INSTALLING is not a `_remoteTransition` state (no guard covers it).

## Key File:Line Map

| Area | File | Lines |
|---|---|---|
| Engine split | .claude/rules/comfy_engine.md | §2.5 |
| Resolver | js/data/modelConstants/resolveModelDeps.js | full |
| Engine instances | js/services/comfyController.js | 96–1516 |
| `_emitLifecycle` | comfyController.js | 358 |
| stale transition guard | comfyController.js | 244–250 |
| `ensureServerRunning` | comfyController.js | 213–505 |
| `interrupt()` | comfyController.js | 521–536 |
| `_routeMessage` | comfyController.js | 607–638 |
| `_reconcileFromHistory` | comfyController.js | 790–869 |
| `_startHistoryPoll` | comfyController.js | 885–898 |
| engine resolved once | js/services/commandExecutor.js | 886–901 |
| SSE contamination site | commandExecutor.js | 1194–1253 |
| `_modelInitializing` | commandExecutor.js | 1140 |
| `emitSamplingStart` gate | commandExecutor.js | 1154–1163 |
| `exec.cancel()` | commandExecutor.js | 1190–1193 |
| `_lanes` | js/services/generationService.js | 43–46 |
| `cancelRunningCueJob` | generationService.js | 346–385 |
| `_finishActiveCueDispatch` | generationService.js | 194–228 |
| identity guard | generationService.js | 259–261 |
| generation-end gate | generationService.js | 423–428 |
| status bar latch | js/shell/statusBar.js | 130–132 |
| MPI-203 guard | statusBar.js | 486–491 |
| `_broadcastComfyEvent` | routes/comfy.js | 69–74, 95–141 |
| SSE local route | routes/comfy.js | 184–196 |
| SSE remote relay (unfiltered) | routes/remoteProxyForward.js | 277–337 |
| install stream (filtered) | routes/remoteModels.js | 526–591 |
| `_onRemoteInstallEvent` | routes/downloadManager.js | 1000–1110 |
| engine mirror self-heal | js/services/remoteEngineClient.js | 173 |

## Cloud-toggle side-bug (user-reported, fold into refactor)

[MpiPromptBox.js:1290-1309] cloud icon sets component-private `_runLocal`; model/installed-op derivation [MpiPromptBox.js:143-148] uses `remoteEngineClient.isRemote()` only → selector shows REMOTE models while gen targets LOCAL. Per-generation engine override must be first-class state driving dependent UI.
