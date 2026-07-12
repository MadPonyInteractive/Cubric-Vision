# MPI-208 Regression Checklist — R01–R31 / INV-1..7 / 19-bug archaeology

Per-row evidence for the refactor contract (`requirements-archaeology.md`). Status:
- **✓ test** — covered by an automated store/resolver test (file:test named).
- **✓ live** — user-verified in the Electron app (validation.md).
- **✓ code** — enforced structurally by shipped code (cite the mechanism); logic-verified, no dedicated test.
- **N/A** — out of scope / unchanged by this refactor (cite why).

Ships across Foundation (B1-A/B/C) + Phase 2 (commandExecutor) + Phase 3 (generationService) + Phase 4 (derived UI). All UNCOMMITTED at time of writing.

## PART 5 requirements R01–R31

| R | Requirement | Status | Evidence |
|---|---|---|---|
| R01 | Single-cue: one tap = one job, correct lane, atomic count, immediate label | ✓ live | Phase-3 acceptance (Cue ×N label updates); `enqueueGeneration` → `_updateQueueDepth` written only from store+`_cueQueue`. |
| R02 | Multi-cue: stable UUID/job, `Cue xN`, ordered panel | ✓ live | Phase-3 R05 multi-cue ×3 verified; `queueJobId` per intent; QueuePanel renders `getGenerationQueueSnapshot`. |
| R03 | Two-lane concurrency independent, both visible, bar last-active-wins | ✓ live | Phase-3 R08 + Phase-4 survivor re-latch (two-lane, bar follows most-recent driving). |
| R04 | Loop: arm≥700ms, re-fire once per drain from LIVE state, disarm, lane-locked | ✓ test + live | `testLoopReFireOncePerDrain`, `testLoopReFireChainOncePerDrain`; Phase-3 R04 live. `_onLaneDrain` reads live `getNextGeneration()`, pins lane. |
| R05 | Stop running: interrupt + lane freed now, promote/re-fire, pending intact | ✓ test + live | `testStopPromotesNextPendingIntact`; Phase-3 R05 live. |
| R06 | Cancel pending per-job via QueuePanel; onCancel; placeholder rollback | ✓ live | QueuePanel `cancelPendingCueJob` → `removeCueJob` fires `onCancel`; Phase-3 verified. |
| R07 | Clear pending: all pending removed, running unaffected | ✓ test + live | `testClearPendingRunningUntouched`; Phase-3 R07 live. |
| R08 | Lane identity isolation: stop one lane never disturbs other | ✓ test + live | `testTwoLaneIndependence`, `testTwoLaneDrainIsolation`; Phase-3 R08 live. |
| R09 | Late terminal after Stop: output saves, no destructive reset | ✓ test | `testLateSettleAfterCancel`, `testStagedReloadAndSilentLateSettle`; store `settle()` honors done-after-cancelling per table; illegal terminal-origin moves silent. |
| R10 | Double-cancel idempotent | ✓ test | `testDoubleCancelIdempotence`. |
| R11 | Gallery scope: new ItemGroups, tempId placeholder, reconciled on complete | N/A | Injection/gallery reconcile path unchanged by refactor (interface points only). |
| R12 | Extend/replace/stage-2 flows read job records, otherwise unchanged | ✓ code | Phase-3 left the `startGeneration` onComplete/onError body untouched; only queue/lane machinery changed. |
| R13 | (stage-2 finish) | ✓ code | Same as R12 — stage2 dispatch path unchanged. |
| R14 | Preview Continue/Finish incl. loop-armed gates | N/A→user | Unchanged; on final acceptance list (item 7). |
| R15 | History extend flow intact | N/A→user | Unchanged; final acceptance item 5. |
| R16 | Preview loop-armed gate | N/A→user | Unchanged; final acceptance item 7. |
| R17 | (bar identity) → see R18 | — | — |
| R18 | Status bar identity: latch by gen, survivor re-latch, no strand | ✓ live | Phase-4: `generation-store:changed` re-derives display job from `running`; Gallery-Stop emits id-matched `tool:cancelled` (Phase 3); empty-bar + strand fixed live. |
| R19 | Navigation never desyncs: UI derived from module truth, rebuilt on mount | ✓ live | Blocks rebuild from `peekCueQueue()`+`activeGenerations`; store is module-scoped; Phase-4 nav repro (away/back → idle) live. |
| R20 | Engine states isolated: per-engine flags, engine-scoped signals tagged | ✓ code | B1-B SSE frames tagged `engine`; commandExecutor `_frameEngineMatches` drops foreign frames; store `lane` per engine. |
| R21 | Transition guard: no dispatch during connecting/disconnecting; self-heals | ✓ code | MpiPromptBox `_applyRemotePhase` disables run btn on transition (unchanged, preserved). |
| R22 | Missing-media guard: single chokepoint, warn + no dispatch | ✓ code | `startGeneration` missingSlot guard (unchanged, preserved). |
| R23 | Missing-model guards (LoRA block / upscale fallback / force-local uninstalled) | ✓ code | MPI-209 `_ensureArchWeightOnDisk` + existing guards, unchanged. |
| R24 | Hot-store preflight best-effort, never blocks | ✓ code | commandExecutor hot-store best-effort preserved (Phase-2 integrator note). |
| R25 | Cache-hit dedup: skip, No-changes toast, cancelled cleanup | ✓ code | commandExecutor cacheHit branch unchanged. |
| R26 | Stop always reachable: ≥1 enabled Stop surface while gen in flight | ✓ live | INV-1; History mirrors via `_syncPbGenerating`; Phase-3/4 Stop reachable across surfaces. |
| R27 | `promptbox:generation-end` idleness contract | ✓ code | `_emitPromptBoxGenerationEndIfIdle` gates on no running regs + no live store lanes + no pending + !loopArmed. |
| R28 | Q hotkey opens QueuePanel in History too | N/A→user | Unchanged; final acceptance nav item. |
| R29 | Preview reset between stages (`generation:preview-reset`) | N/A | Unchanged. |
| R30 | Queue display snapshot frozen at enqueue; loop re-fire uses live state | ✓ code | `_buildQueueDisplay` frozen at enqueue; `_onLaneDrain` re-fire reads live `getNextGeneration()`. |
| R31 | Cloud-toggle switches selector to local + first-class engineOverride | ✓ live | B1-C `effectiveEngine()`; Phase-4 `_runLocal` removed → `state.engineOverride`; cloud-toggle live-verified (Phase 4 item 4). |

## Cross-cutting invariants

| INV | Invariant | Status | Evidence |
|---|---|---|---|
| INV-1 | Stop always reachable | ✓ live | R26; Phase-3/4. |
| INV-2 | Navigation never desyncs (module truth → derived UI) | ✓ live | R19; Phase-4 nav repro. |
| INV-3 | Engine states isolated (remote never corrupts local) | ✓ code | R20; B1-B merged-tagged SSE + `_frameEngineMatches`. |
| INV-4 | Late-terminal never destructive | ✓ test | R09; store terminal-origin no-op is silent + non-destructive. |
| INV-5 | Loop re-fire once-per-completion, never in dispatch pass | ✓ test | `setLoopCallback` once-per-drain; `testLoopReFireOncePerDrain`. |
| INV-6 | Dispatch idempotent | ✓ code | `_dispatchNextCue` guards on `_lanes[lane].active || _laneBusy(lane)`; store register idempotent on dup jobId. |
| INV-7 | QueuePanel signature diff (no hover flicker) | N/A→user | Panel signature-diff render unchanged (INV-7 preserved). |

## 19-bug archaeology table (regression confirmation)

BUG-01..19: each was a symptom of the five root diseases the store cures structurally (single truth, tagged transport, cancel token, derived bar, engine truth). Spot-confirmed:
- **BUG-05** (remote wedge on missed terminal) — still fixed: `_startHistoryPoll` + `_reconcileFromHistory` replay preserved; Phase-5 adds the recovered-toast (Part-4 gap closed).
- **BUG-10** (remote history 404 double-/wrapper) — preserved (URL prefix comment intact in `_reconcileFromHistory`).
- Ghost cancelled gen (Phase-3 round 3) — `interruptCb` `deleteQueueItem(promptId)` kills a queued-but-not-running prompt.
- Stale 4/4 bleed — Phase-4 stage/total scoped to display job; `_stageText` cleared on display-job change.

## Preserved subsystems (do-not-drop list — all intact)

MPI-141/198 path heal (comfyController, untouched) · MPI-156 keepalive (20s, remoteProxyForward) · MPI-157 stop-all · MPI-179 mirror refresh (resolve-once) · MPI-194 hot-store (best-effort) · MPI-203 history replay (`_reconcileFromHistory`) · MPI-206 model re-sync · MPI-74 P6 two-lane loop.

## Reconcile-on-truth (Phase-5 decision)

The separate "5s store poll querying local /queue + Pod history to settle orphans" in the plan was **NOT built** — it would duplicate coverage that already exists and target an empty set:
- Every `runWorkflow` exit settles the store: resolve→`_finishGeneration`→`settle(DONE)`, reject→catch→`settle(ERROR)`, Stop→`store.cancel`→`CANCELLED`.
- `runWorkflow`'s promise is guaranteed to settle: remote missed-terminal is backstopped by `_startHistoryPoll` (BUG-05/MPI-203); local ComfyUI WS-close rejects (no proxy reap).
- So the store cannot orphan a running job while the resolver is backstopped → a parallel poll covers nothing new.

What Phase-5 DID ship from this line: the **"generation recovered" toast** on `_reconcileFromHistory` success (the real archaeology Part-4 gap — the recovery was invisible). Phase-4's statusBar self-heal is the belt-and-suspenders if a terminal is ever missed at the bar layer.

## Verification run

- `node tests/generation-store.test.cjs` → 20/20.
- `node tests/resolve-model-deps.test.cjs` → 14/14.
- `npm run lint:components` + `npx eslint` (shell + services) → clean.
- `node --check` all touched files → parse OK.
- Live (user): Phase-3 acceptance (R05/R07/R18/R04/R08) + Phase-4 (stuck-bar / empty-bar / stale-suffix / cloud-toggle) → all pass.
