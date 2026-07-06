# MPI-208 — Generation queue refactor: cue/loop/stop/dual-engine state machine

## Current State

**Project mode:** scalable-foundation — full guardrails, no prototype shortcuts.

Investigation complete (4 parallel read-only agents, 2026-07-06). Full findings in `research/`:
- `research/frontend-state-machine.md` — frontend state keys/events, statusBar latch mechanics
- `research/backend-pipeline.md` — submission/cancel paths, SSE mechanics, systemic gaps
- `research/dual-engine.md` — engine split, contamination map, patch inventory
- `research/requirements-archaeology.md` — **R01–R31 requirements + INV-1..7 invariants + 19-bug archaeology table. The contract for this refactor.**

### The five root diseases (everything else is symptoms)

1. **Scattered private state, no single truth.** Generation lifecycle lives in ~8 disconnected places: `generationService._lanes`/`_cueQueue`, `activeGenerations._registry`, `statusBar._activeGenId`/`_state`, per-gen closures in commandExecutor (`_modelInitializing`), component-private flags (`MpiPromptBox._runLocal`, `isGenerating`). No reconciliation between them; navigation and races desync them permanently.
2. **Untagged transport events + shared SSE channel.** `comfy:model-initializing/step-progress/...` carry no genId and no engine tag (`routes/comfy.js:69-141`). In remote mode `routes/remoteProxyForward.js:277` REPLACES `/comfy/events/stream` with an unfiltered relay of the Pod's entire wrapper stream — Pod install activity poisons local gens' `_modelInitializing`, and local stdout events starve.
3. **No cancellation token.** `exec.cancel()` fires `interrupt()` but cannot abort the in-flight async pipeline (`commandExecutor.js` IIFE). Stop before prompt-ACK → orphan generation POSTs `/prompt` later with its lane already freed → `tool:idle` never emitted, ghost history.
4. **Status bar is an event-race latch, not derived state.** One-way `_latch(id)` + id-guarded terminals (`statusBar.js:130,488`). Gallery Stop path never emits `tool:cancelled` (`MpiGalleryBlock.js:1221-1247` — History does at `MpiGroupHistoryBlock.js:871`), so the latch strands forever. No self-heal, no navigation/idle safety net.
5. **No engine/server truth to reconcile against.** No generation-status endpoint; after navigation or missed WS terminal the client trusts stale module state.

These five produced today's repro (stuck "LOADING MODEL 50%", stuck "STARTING"/CUE X1 un-stoppable) and the whole archaeology table (MPI-73/74/111/156/157/195/203…).

### Architecture decision (front-loaded, per scalable-foundation)

**One generation store, explicit per-job state machine, everything else derived.**

- **New module `js/services/generationStore.js`** — the single source of truth. One job record per generation:
  `{ jobId, genId, engine: 'local'|'remote', scope, phase, cancel: token, promptId, lane, display, loopSeed, timestamps, error }`.
  Phase enum + legal-transition table enforced in ONE place:
  `queued → preflight → submitting → accepted → loading → sampling → finalizing → done | cancelled | error` (+ `cancelling` overlay flag, since interrupt is advisory). Illegal transitions log + no-op (idempotent by construction — subsumes INV-4/INV-6 and the MPI-195/203 identity guards structurally).
- **Cancellation tokens.** Every job owns an abort token. The commandExecutor pipeline checks it at every await boundary (ensureServerRunning, hot-store, upload, prompt POST). Stop = `store.cancel(jobId)`: abort token + `interrupt()` on the job's FROZEN engine (never re-resolved at cancel time) + immediate lane release via store transition (preserves R05 semantics).
- **Event tagging law (extends the MPI-165 engine-split contract):** every generation-related event and SSE frame carries `{ jobId?, engine }`. Server tags at source; in remote mode the SSE stream MERGES local stdout events (tagged `local`) + Pod relay (tagged `remote`) instead of replacing. Client listeners filter by their job's engine + promptId — foreign events dropped. Kills disease 2.
- **All UI derived.** statusBar, Cue/Loop/Stop buttons, QueuePanel, gallery/history overlays render from store snapshots on `generation-store:changed`; store is module-scope truth, blocks rebuild views on mount (INV-2 by construction). statusBar self-heal rule: store has no live jobs → idle. Existing public events (`generation:*`, `tool:*`, `promptbox:generation-end`) keep firing during migration, emitted BY the store, so consumers migrate incrementally.
- **Per-generation engine override = first-class state (R31).** Replace `MpiPromptBox._runLocal` with `state.engineOverride` (`null | 'local'`). One derivation helper `effectiveEngine()` (override → else `remoteEngineClient.isRemote()`), used by cue routing, model selector list, installed-op gating, arch lookup.
- **Reconcile-on-truth.** On workspace mount, `remote:connection` edges, and a 5s poll while jobs are live, store reconciles against engine truth (local ComfyUI `/queue`+`/history`, Pod wrapper history — extending the existing `_startHistoryPoll` backstop to both engines). Orphans → terminal states. Subsumes disease 5.
- **Two-lane product model KEPT** (max 1 active per engine + FIFO pending, per-lane loop). This is deliberate product semantics (MPI-74), not a limitation; the store's `lane` field enforces it. A future N-worker model would only change the dispatcher, not the store contract — that's the future-proofing.

**What this refactor must NOT change:** ComfyUI injection contract, workflow compile, hot-store, LoRA upload, model install/download pipeline, project.json writes. Interface points only.

## Completed

- [x] Investigation (4 agents) + requirements contract R01–R31 / INV-1..7 (`research/`)
- [x] Card created, board updated

## Remaining Work

> Read BEFORE any phase: `.claude/rules/state.md`, `.claude/rules/events.md`, `.claude/rules/comfy_engine.md` § Engine Split, and `research/requirements-archaeology.md` (the contract). Sub-agents get briefings via `/mpi-brief-rule` per CLAUDE.md map.

## Parallel Batch: Foundation (disjoint, no integration yet)

- [ ] **B1-A generationStore module + state machine + tests.** Create `js/services/generationStore.js`: job record, phase enum, legal-transition table, abort-token per job, lane accounting (`local`/`remote`, max 1 active each), FIFO pending queue, snapshot API (`list()`, `byId()`, `byScope()`, `queueDepth()`), `generation-store:changed` emission via `Events.emit`, cancel API (token abort + engine-frozen interrupt callback injection), loop re-fire hook (once-per-lane-drain callback slot — INV-5). NO integration with existing services yet (existing code untouched). Node unit tests covering: legal/illegal transitions, cancel-before-accept, late-settle after cancel (no lane double-free), double-cancel idempotence, two-lane independence, loop re-fire once per drain, pending clear vs running untouched (R05-R10, INV-4/5/6). Ownership: `js/services/generationStore.js` (new), `tests/generation-store/` (new). Briefings: events, state. **Verify:** `node --test tests/generation-store/` green; no other file in `git diff --stat`.
- [ ] **B1-B server SSE engine tagging + merged stream.** `routes/comfy.js`: every `_broadcastComfyEvent` frame gains `engine:'local'` in payload. `routes/remoteProxyForward.js:277-337`: STOP replacing `/comfy/events/stream` in remote mode — merge instead: local stdout events keep flowing (tagged `local`), Pod wrapper relay frames forwarded tagged `remote`, `models:install-*` frames pass through unchanged (downloadManager path unaffected). Keep 20s keepalive (MPI-156). Backward-compatible: frame names unchanged, only payload gains `engine`. Ownership: `routes/comfy.js`, `routes/remoteProxyForward.js`. Briefings: comfy_engine. **Verify:** app running local-only → `curl -N 127.0.0.1:3000/comfy/events/stream` during a local gen shows frames with `"engine":"local"`; with remote mode active (or `_mode.active` simulated), stream carries BOTH tagged sources; existing untagged consumers still function (smoke: one local gen completes normally).
- [ ] **B1-C engine-override state + model selector derivation (R31 quick win).** Add `engineOverride` key to `js/state.js` (default `null`). `MpiPromptBox.js`: cloud toggle (`:1290-1310`) writes `state.engineOverride = active ? 'local' : null` (keep `_runLocal` mirror for now — payload unchanged); model/installed-op derivation (`:143-148`) + selector list rebuild subscribe to `state:changed` for `engineOverride` and use `effectiveEngine()` = `engineOverride ?? (remoteEngineClient.isRemote() ? 'remote' : 'local')` — add helper to `js/services/remoteEngineClient.js`. Toggle reset on disconnect already exists — keep. Document new state key in `.claude/rules/component-state.md` per rules. Ownership: `js/state.js`, `js/components/Organisms/MpiPromptBox/MpiPromptBox.js`, `js/services/remoteEngineClient.js`, `.claude/rules/component-state.md`. Briefings: components, state, events. **Verify:** desktop test or manual: connect Pod (or mock `isRemote()` in a unit of the derivation fn) → toggle cloud icon ON → selector shows LOCAL installed models + local-gated ops; OFF → remote list restored. `npm run lint:components` clean.

## Phase 2: commandExecutor on store + tokens + filtered SSE

- [ ] Rework `js/services/commandExecutor.js` generation path (`runCommand` `:866`+): job registered in store at entry; engine + arch resolved once and FROZEN on job record (existing `:886-901` logic moves in); abort-token checks at each await boundary (ensureServerRunning, hot-store ensure, remote upload, prompt POST) — aborted = transition `cancelled`, NO prompt POST, no orphan listener; `_modelInitializing` closure replaced by job `phase:'loading'` driven ONLY by SSE frames matching `frame.engine === job.engine` (and promptId when present); `emitSamplingStart` gate reads job phase; cache-hit path (R25) transitions via store. `exec.cancel()` delegates to `store.cancel(jobId)`. Preserve `_needsPathHeal` (MPI-141/198), hot-store best-effort (R24), `_reconcileFromHistory` replay (MPI-203) — reconcile now ALSO settles the store job. **Verify:** unit: token abort before ACK → no `/prompt` POST (mock fetch, assert). Live: local gen Stop during "LOADING MODEL" → `logs/app.log` shows interrupt, NO later prompt POST for that job, store job terminal `cancelled`, next cue runs clean.

## Phase 3: generationService rewritten on store

- [ ] `js/services/generationService.js`: `_cueQueue`/`_lanes`/identity-guard wrappers replaced by store queue + lane accounting; `enqueueGeneration/cancelRunningCueJob/cancelPendingCueJob/clearPendingQueue/peekCueQueue/getGenerationQueueSnapshot` become store facades (public signatures UNCHANGED — callers in MpiGalleryBlock/MpiGroupHistoryBlock/MpiQueuePanel untouched this phase); dispatch/promotion on store lane-drain; loop re-fire via store hook reading LIVE `getNextGeneration()` (R04, INV-5); `generationQueueCount` written ONLY by store subscription (kill direct write `MpiGroupHistoryBlock.js:867` — replace with service call); `promptbox:generation-end` from store idleness predicate (R27); `tool:*` + `generation:*` events emitted from store transitions with `{id, jobId, engine}` — INCLUDING `tool:cancelled` on every cancel regardless of scope (fixes Gallery-Stop-never-clears-bar at the source); late-settle bridge (`_stoppedPendingComplete`, R09) becomes store transition rule `cancelling + real output → done(saved)`. Extend/replace/stage-2 flows (R12–R15) unchanged except reading job records. **Verify:** repro script of archaeology bugs 04/05/06/07/09/13 as store-level integration tests green; live smoke: multi-cue x3 → Stop running → next promotes, pending intact (R05), trash clears pending only (R07); loop arm → 2 drains → disarm → stops.

## Phase 4: UI derived from store

- [ ] **statusBar** (`js/shell/statusBar.js`): rewrite as pure derivation — subscribe `generation-store:changed`, pick display job (most-recent driving, surviving lane re-latches — R18), render phase→label map (STARTING/LOADING MODEL/op label/%), terminals from job phase not event races; self-heal: no live jobs → `_setIdle()` (kills stuck-bar class of bugs permanently); keep `tool:*` listeners as thin compat shims during transition. **Verify:** exact user repro 2026-07-06 (Pod installing + local CUE → Stop → navigate → return; CUE+Stop again) → bar returns to idle every time; two-lane concurrent gens → bar follows most-recent driving, survivor re-latches after one lane stops.
- [ ] **MpiPromptBox + MpiQueuePanel + blocks**: `isGenerating`/Cue label/Stop-Clear enable derived from store snapshot on mount + change events (INV-1: Stop enabled whenever store has a live job of the block's scope); QueuePanel renders store snapshot (signature diff kept, INV-7); MpiGalleryBlock/MpiGroupHistoryBlock cancel handlers → `store.cancel` per job (R05/R06 semantics), placeholder/overlay Maps rebuilt from store on mount (R19); `_syncPreviewQueueState` reads store. Remove `_runLocal` mirror — payload `forceLocal` derived from `state.engineOverride` (completes B1-C). **Verify:** navigate Gallery↔Landing↔History mid-gen: all surfaces (bar, Cue xN, spinner tile, QueuePanel, history Stop) reconstruct correct state on every return; Q hotkey opens panel in both workspaces (R28).

## Phase 5: Reconciliation + regression sweep + docs

- [ ] **Reconcile-on-truth:** store reconciler on workspace mount + `remote:connection` edges + 5s poll while live jobs exist (generalize `_startHistoryPoll` `comfyController.js:885` to both engines): query engine queue/history, settle orphans (missed terminals → done-with-output via MPI-203 replay, vanished → error/cancelled). Toast on invisible recovery ("generation recovered") — closes the archaeology Part-4 gap. **Verify:** kill local ComfyUI mid-gen → job settles `error`, UI idle, toast; simulate missed WS terminal (existing MPI-203 repro path) → output saved + store settled.
- [ ] **Regression sweep + cleanup:** walk the 19-bug archaeology table + R01–R31 checklist (`research/requirements-archaeology.md`) — each row: covered-by-test, manually verified, or explicitly N/A with reason; delete dead code (old lane wrappers, `_stoppedPendingComplete` shim, statusBar compat shims if all emitters migrated); `npm run lint` + full `npm run test:desktop`. **Verify:** checklist file `research/regression-checklist.md` completed with per-row evidence; lint + desktop tests green.
- [ ] **Docs (ASK USER FIRST per CLAUDE.md):** update `.claude/rules/events.md` (tagging law), `component-events.md`, `component-state.md` (`engineOverride`, store events), `comfy_engine.md` § Engine Split (store + SSE merge), `docs/ui-gotchas.md` (statusBar derivation). **Verify:** user approved; docs match shipped code; ≤200-line rule respected.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

Phases B1 (all three) + Phase 2: `auto`. Phases 3–5: `user-ux` — status bar, Cue/Loop/Stop feel, navigation behavior need the user's hands in the running app.

Final end-to-end acceptance (user, in Electron app):
1. Exact 2026-07-06 repro: Pod connected + model installing → CUE local gen → Stop → navigate away/back → bar idle, no ghost "LOADING MODEL"; CUE+Stop again → bar idle, Stop always worked.
2. Dual-lane: remote gen + local gen concurrently; Stop each independently; other lane unaffected (R03/R08).
3. Loop: arm → several drains → disarm mid-run → Stop; no re-fire storm, no stragglers (R04).
4. Multi-cue: Cue x3, stop running (promotes), cancel one pending, clear rest (R05–R07).
5. History workspace: gen + Stop from history PromptBox; extend flow intact (R12/R15/R26).
6. Cloud toggle: Pod connected → toggle local → selector shows local models; gen runs locally; toggle back → remote list (R31).
7. Preview Continue/Finish still works incl. loop-armed gates (R14/R16).

## Preservation Notes

- Rule-file updates (events/state/component-*/comfy_engine) are staged in Phase 5 and REQUIRE explicit user permission (CLAUDE.md cardinal rule 3).
- Memory updates at close: mark superseded in-flight items (local-gen wedge 21b8fdf note, stale-pod reconnect toast) as subsumed by MPI-208; keep `feedback_remote_state_no_local_mutation` and add pointer to the tagging law.
- `research/requirements-archaeology.md` is the durable contract — after ship, fold its invariants into `docs/` (subsystem home, likely a new `docs/generation-queue.md`; respects ≤200-line rule) rather than gotchas.
- Subsumed-but-preserve list (do NOT silently drop): MPI-141 path heal, MPI-156 keepalive + transition self-heal, MPI-157 stop-all, MPI-179 mirror refresh, MPI-194 hot-store, MPI-203 history replay, MPI-206 model re-sync.
- `mpi-execute-parallel` is appropriate ONLY for the Foundation batch (B1-A/B/C, disjoint ownership). Phases 2–5 are sequential by dependency — do not parallelize them.
