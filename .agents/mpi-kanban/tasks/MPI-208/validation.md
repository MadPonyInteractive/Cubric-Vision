# MPI-208 Validation

## Phase 3 — generationService on store (Option A) — LIVE-VERIFIED 2026-07-06

**Verify mode:** user-ux (status bar / Cue-Loop-Stop feel need the user's hands).

**Auto (green):**
- `node tests/generation-store.test.cjs` → 18/18 (14 prior + T15–T18 Phase-3 integration contracts: Stop-promotes-next / loop-refire-chain / two-lane-drain-isolation / stop-before-ack-drain).
- `node tests/resolve-model-deps.test.cjs` → 14/14.
- Adjacent suites (comfy-needs-restart, download-completion) green.
- `node --check` on both edited files → parse OK.
- `eslint` on both edited files → clean (app-lifetime store subscription carries the established `mpi/require-destroy-on-events` disable + rationale).

**Live (user, in Electron app) — all 5 acceptance scenarios PASSED:**
1. **R05 multi-cue:** Cue ×3 → Stop running → next promotes, pending intact; repeated Stop drains one at a time.
2. **R07 trash:** clears pending only; running untouched.
3. **R18 Gallery Stop:** single Cue → Stop → status bar returns to IDLE (the strand-fix — bar used to hang forever).
4. **R04 loop:** hold-arm → 2 drains → tap-disarm mid-run → stops; no re-fire storm.
5. **R08 two-lane:** remote + local concurrent → Stop each independently → other lane unaffected.

**Uncommitted.** Phases 4 (UI derived from store) + 5 (reconcile + regression sweep + docs) remain.

## Phase 4 — UI derived from store — LIVE-VERIFIED by user 2026-07-07

**Verify mode:** user-ux (status bar / Cue-Loop-Stop feel + navigation need the user's hands).

**Delivered (scope narrowed — see Plan Drift 2026-07-07):**
1. **genId bridge** — `startGeneration` generates `_regId` up front → `payload.genId` → `runCommand` → `store.register({genId})`, and the same id → `activeGenerations.start({id})` (new optional `id` param, default fresh uuid). Store record's `genId` is no longer null, so the derived bar can correlate a store job to its id-tagged `tool:*` events. Files: `generationService.js`, `commandExecutor.js`, `generationStore.js`, `activeGenerations.js`.
2. **statusBar store-derived latch/idle** — `generation-store:changed` subscription owns ownership + idleness (survivor re-latch on owner-drain, self-heal to idle on missed terminal, `_stageText` cleared on display-job change); `tool:*` still paint visual detail. `job.genId !== null` guard excludes suppressed tool-panel previews. File: `statusBar.js`.
3. **`_runLocal` removed** — `forceLocal` derives from `state.engineOverride === 'local'` (B1-C complete). File: `MpiPromptBox.js`.

**Blocks/QueuePanel — NO edits (already correct):** cancel routes through Phase-3 store-backed facades; overlays rebuild on mount from module-scoped `peekCueQueue()`+`activeGenerations`.

**Auto (green):**
- `node tests/generation-store.test.cjs` → 20/20 (+ genId-threads assertion in testSnapshotApi).
- `npm run lint:components` clean; `npx eslint` on `statusBar.js` + all touched services clean.
- `node --check` on all 6 touched files → parse OK.

**Live (user, in Electron app) — PASSED:**
1. Exact 2026-07-06 repro: Pod installing + local CUE → Stop → navigate away/back → bar idle, no ghost "LOADING MODEL"; CUE+Stop again → bar idle every time. ✓
2. Two-lane concurrent (remote + local): when one lane's gen ends, a still-running/just-started gen on the other lane RE-OCCUPIES the bar (no empty bar). ✓
3. Stale-suffix: upscale (4/4) then a non-upscale → the second shows its own N/M, never a leftover "4/4". ✓
4. Cloud toggle → gen routes local (forceLocal from engineOverride); toggle back → remote. ✓

**Uncommitted.** Phase 5 (reconcile-on-truth + regression sweep + docs) remains.

## Phase 5 — reconcile + regression sweep + docs — COMPLETE 2026-07-07

**Delivered:**
- **Reconcile-on-truth:** the 5s dual-engine store poll was NOT built (duplicate coverage / empty set — every `runWorkflow` exit settles the store, and the promise is guaranteed to settle: remote via `_startHistoryPoll`/`_reconcileFromHistory`, local via WS-close reject). Shipped the "generation recovered" `ui:info` toast on `_reconcileFromHistory` success (`comfyController.js`) — the archaeology Part-4 gap.
- **Regression sweep:** `research/regression-checklist.md` — per-row R01–R31 / INV-1..7 / 19-bug evidence. No dead code to delete (Phase-3 already removed it).
- **Docs (user-approved):** `docs/events.md`, `component-state.md`, `comfy_engine.md` § 2.5a, `docs/ui-gotchas.md`.

**Auto (green):**
- `npm run test:desktop` → **10/10** (Electron launches + loads shell + all IPC/mask/model-op/runpod-settings specs pass with MPI-208 on disk).
- `node tests/generation-store.test.cjs` → 20/20; `node tests/resolve-model-deps.test.cjs` → 14/14.
- `node --check` comfyController + all touched → OK; `npm run lint:components` + eslint clean.

**Live (user): the reconcile-toast** (missed remote terminal → history recovery) needs a live Pod + dropped WS to fire — deferred to opportunistic use (one `Events.emit`, logic-verified).

## Status: ALL PHASES CODE-COMPLETE — awaiting final end-to-end user acceptance

Foundation + Phase 2 + Phase 3 (live-verified) + Phase 4 (live-verified) + Phase 5 (auto-verified) all shipped, UNCOMMITTED. Remaining before `done`: the final 7-point end-to-end acceptance in plan.md § Verification (user, Electron app), then commit via `mpi-end`.
