# MPI-276 — Download/install/uninstall refactor: installStore SOT + engine adapters + reconciler

Project mode: **scalable-foundation** — full guardrails, no prototype shortcuts.

## Current State

The download/install/uninstall subsystem has shipped 20+ bugs that reduce to 5 recurring diseases (see `research/04-bug-history-invariants.md` — that file is the regression matrix). Live evidence 2026-07-13 (`research/00-live-evidence.md`): phantom "Verifying…"/"100%"/"36%" cards with zero backend jobs, installs silently swallowed with no log line.

**The 5 diseases:**
1. Six sources of truth, no reconciliation (`state.downloadJobs`, `_modelJobs`/`_depJobs`, disk+`.cubricdl`, `MODELS[].installed`, `_modelDepStatusCache`, `s_installedModelIds`).
2. Local/remote twin-path duplication → "fix one engine, forget the twin" (4+ shipped bugs).
3. `refCount` never decremented on success → lies; still gates `_depJobs.delete` and the enqueue filter (silent-swallow suspect C in `research/01-local-backend.md` §3).
4. Correctness rides on SSE delivery; missed terminal = wedged job; belts bolted on ad-hoc, remote-only.
5. Progress math patched 5+ times, never unified; plus live `totalBytes +=` accumulation bug.

**Precedent:** MPI-208 cured the generation queue of the same disease with one `generationStore.js` SOT + illegal-transition guards. Same medicine here.

**Key files (current):** `routes/downloadManager.js` (2223 lines — everything), `routes/downloadCompletion.js`, `routes/remoteModels.js`, `routes/comfy.js` (`localModelsCheck`), `routes/shared.js`, `js/services/downloadService.js`, `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`, `js/data/modelRegistry.js`, pod-side `c:\AI\Mpi\mpi-ci\cubric-vision-pod\wrapper.py` (separate repo, `git -C`).

**Branch:** 1.2.0 (current dev). Research dossiers: `research/00`–`04`. **Line numbers in dossiers are anchors from 2026-07-13 — concurrent sessions edit these files; re-locate by content anchor before every edit, never trust raw line numbers.**

## Socratic Gate — ALL decisions resolved. Implementing agents MUST NOT re-ask these.

| # | Decision | Ruling |
|---|---|---|
| G1 | Scope | FULL cure: backend store + adapters + reconciler + snapshot protocol + frontend mirror + uninstall unification + Pod-side wrapper fixes. User: "kill this disease once and for all." |
| G2 | Click UX | Optimistic **`pending`** state on click ("Starting…" label, indeterminate); if no backend ack within **10s**, revert card to Install + `ui:warning` toast ("Install didn't start — try again"). Toast not dialog (feedback rule: error dialog only for `ui:error`). |
| G3 | Pod wrapper changes | IN SCOPE (user chose). Hot-store eviction on delete + `pipPins` parity. Ship via `publish-runtime.sh stable` + Pod restart — NOT an image rebuild (R2-float contract, CLAUDE.md § Product Pod runtime). Bump wrapper version (0.2.36 → 0.2.37). |
| G4 | Rewrite vs refactor | REFACTOR. Keep: NDH local transport (cancel-only — NEVER reintroduce pause/resume, MPI-258 B2), aria2 wrapper transport, `.cubricdl` contract, `resolveModelDeps.js` resolver + `engines:{}` contract, all wrapper endpoint signatures, all existing SSE event NAMES. Replace: the state model around them. |
| G5 | refCount | DELETE the field entirely. Liveness = job status. Any "is dep needed" question answers from store status + disk/volume truth. |
| G6 | New module layout | `routes/install/installStore.js` (state machine + snapshot, pure, no express/fs), `routes/install/computeProgress.js` (pure), `routes/install/localAdapter.js`, `routes/install/remoteAdapter.js`, `routes/install/reconciler.js`. `routes/downloadManager.js` shrinks to the express router + wiring; its public exports (`cancelAllDownloads`, `registerEngineDownload`, `clearEngineDownload`, `startUniversalWorkflowInstall`, `finishCustomNodeInstall`, `runCustomNodeInstall`) keep name + signature so `routes/engine.js` and shutdown hooks don't change. |
| G7 | State machines | ModelJob: `queued → downloading → verifying → installing → done \| failed \| cancelled`. DepJob: `queued → downloading → verifying → complete \| failed \| cancelled`. Transitions via one `transition(job, to, reason)` that REJECTS + logs illegal moves (MPI-208 pattern; e.g. `cancelled→done` illegal). `pending` is a CLIENT-ONLY state (G2), never in the backend store. |
| G8 | Register-before-respond | `POST /download/start` registers the full model job in the store BEFORE returning. Response body includes the job snapshot. Kills the MPI-241 race class structurally; the FE merge heuristic + `_recentlyCancelled` guard are then deleted. |
| G9 | Snapshot protocol | Store keeps a monotonically increasing `version`. New SSE event `download:snapshot {version, jobs[]}` broadcast on every SSE client connect and after every reconcile pass. All existing delta events gain a `version` field (names unchanged — consumers like `MpiEngineInstall` keep working). FE: snapshot REPLACES `state.downloadJobs` wholesale; deltas apply only if `version` ≥ last seen. |
| G10 | Terminal-job cleanup | `done` jobs stay in the store (and on the card as busy) until the post-complete resync confirms install (`models:checked` after `download:complete`), then store prunes them (belt: 120s TTL). Preserves the MPI-241 no-Install-flash contract WITHOUT the immortal-complete-job disease. `failed`/`cancelled` prune on broadcast + 30s TTL. |
| G11 | Reconciler | One pass, both engines: sources = local disk (`isCompleteOnDisk`/`localModelsCheck`) or wrapper `/models/status`. Runs: (a) on SSE client connect (before snapshot), (b) every 15s while any job is non-terminal (generalizes the existing remote-only poll + `_reconcileOutstandingRemoteDeps`), (c) after uninstall. Actions: settle wedged jobs (all bytes done + truth says installed → force terminal via legal transitions), fail orphans (job active, no adapter activity, nothing on disk/volume, >60s since last tick), never resurrect terminal jobs. The 90s stall watchdog logic ports INTO the reconciler unchanged. |
| G12 | computeProgress rules | real-total-wins (`totalBytes \|\| seedBytes` per dep); `custom_nodes` excluded from BOTH sides of the byte ratio (indeterminate `phase:'preparing'`); already-installed deps credited at full size; model `totalBytes` = SET (recomputed from deps), never `+=`; `verifying` phase only when allBytesDone across non-node deps. The 5 historical progress bugs (MPI-95/140/164/231/258-B3) become named unit tests. |
| G13 | Uninstall pipeline | ONE pipeline, engine-parameterized: resolve full universe (`resolveFullUniverse`) → server-side engine filter on the dep array (uninstall currently trusts the wire — fix) → shared-dep guard = whole-model-installed rule + in-flight store-status protection (BOTH engines — remote currently lacks in-flight protection) → delete via adapter → store cleanup → broadcast. Local adapter fixes the custom-node bug: uninstall targets the node FOLDER (`custom_nodes/<name>/`), not the long-gone zip; keeps universal/pip-keep rules; keeps trash→`fs.remove` fallback. |
| G14 | Frontend mirror | `downloadService.js` becomes a mirror: pending (client-only) → POST → replace with response job → SSE snapshot/deltas drive everything. `MpiModelManager._modelState`: busy = status ∈ {pending, queued, downloading, verifying, installing, done-awaiting-resync}. The dual installed-state sources stay as-is (out of scope) EXCEPT: document that `MpiModelManager` reads `MODELS[].installed` and others read `s_installedModelIds` — do not "fix" this here. |
| G15 | Out of scope | Engine-archive download path (`engine:*` events, `_activeEngineDownloader`) — untouched. `js/data/modelRegistry.js` dual-source consolidation — untouched. Blob death-loop — MPI-277. LTX/aria2 transport tuning — untouched. |
| G16 | `_parseSizeToBytes` | Deduplicate to ONE export in `routes/install/computeProgress.js` for backend; frontend keeps its copy in `downloadService.js` (renderer can't import routes/) but `MpiModelManager` imports from `downloadService` — 4 copies → 2. |
| G17 | UW install polling | `startUniversalWorkflowInstall`'s 500ms/30min poll loop replaced by store completion events (promise resolves on model-job terminal transition). |
| G18 | Tests | Node-runnable `.test.cjs` (repo pattern, e.g. `tests/resolve-model-deps.test.cjs`). New: `install-store`, `install-progress`, `install-reconciler`, `uninstall-guards`. Existing MUST keep passing: `model-footer-settling` (update for new mirror semantics — its contract intent survives), `node-install-batch-resilience`, `node-drift`, `resolve-model-deps`. |
| G19 | Verification | Small-download live tests use the smallest real model pack (ILL Anime, ~6.9GB base — or the 65MB shared upscaler dep-level path); DON'T pull 25GB LTX for smoke. Final phase is user-ux (user judges cards live). Port :3000 is user-owned — never kill their app; coordinate restarts with the user. |
| G20 | Commits | Per-phase commits by explicit content-anchored staging (shared-tree hygiene — NEVER `git add .`/`-A`; see memory `feedback_shared_tree_commit_hygiene`). Kanban card moves todo→doing before first edit; doing→done only after user validates final phase. |

## Completed

- [x] Investigation (4-agent sweep, dossiers in `research/`).
- [x] Socratic Gate resolved with user (G1–G20).

## Remaining Work

### Phase 1: Pure core — installStore + computeProgress (no wiring)

- [x] Create `routes/install/installStore.js`: job maps, `transition()` with legal-move table (G7), monotonic `version`, `snapshot()`, `registerModelJob()`, `pruneTerminal()` (G10 TTLs), injected `broadcast` + `now` fns (testable). No fs, no express, no NDH. **Verify:** `node tests/install-store.test.cjs` passes (23) — every legal transition, rejects `cancelled→done` + illegal moves, version bumps on mutation, prune honors done-awaiting-resync + TTL belts. DONE `0d4f0301`.
- [x] Create `routes/install/computeProgress.js`: `computeProgress(modelJob)` + shared `parseSizeToBytes` export, rules per G12. **Verify:** `node tests/install-progress.test.cjs` passes (11) — 5 named regression cases + `totalBytes_is_set_not_accumulated`. DONE `0d4f0301`.

### Phase 2: Adapters + backend rewiring (the big cut)

- [ ] Extract `routes/install/localAdapter.js` from `downloadManager.js`: NDH wrapper (rename `ResumableDownloader` → `FileDownloader`, still cancel-only, keep 30s socket timeout + scrub-before-start + `.cubricdl` + sha256 verify), disk status (`isCompleteOnDisk`, `localModelsCheck` bridge), path resolution (ONE function used by install AND uninstall AND UW — kills the 3-way divergence), custom-node install (keep `pipPins`, `_nodeFolderHasFiles` MPI-243 guard, commit markers, batch resilience), trash→remove fallback. **Verify:** `node tests/node-install-batch-resilience.test.cjs` + `node tests/node-drift.test.cjs` still pass; grep proves no `refCount` reads remain in adapter code.
- [ ] Extract `routes/install/remoteAdapter.js`: wraps `remoteModels.js` calls (signatures untouched), maps wrapper SSE events → store transitions, ports the stall watchdog + `_reconcileOutstandingRemoteDeps` semantics into reconciler hooks (Phase 3 consumes), keeps `installCustomNodes=false` wall, keeps volume disk pre-flight. **Verify:** unit test with a mocked wrapper-event sequence from MPI-255's scenario (terminal event before stream attach) reaches `complete` via reconcile hook, not hang.
- [ ] Rewire `routes/downloadManager.js` to router+wiring: endpoints keep paths + response shapes (PLUS job snapshot in `/download/start` response per G8, register-before-respond); delete `refCount` everywhere (G5); delete the zombie-guard cluster (`_depHasActiveDownloadConsumer` replaced by store-status queries); keep public exports per G6; keep cancel idempotent-200; UW install goes event-driven (G17). **Verify:** `npm run lint` clean; `node tests/install-store.test.cjs` + all existing tests pass; `grep -rn "refCount" routes/` returns ZERO hits; server boots (`npm run server`) and `GET /comfy/downloads/status` returns `{version, jobs:[]}`.

### Phase 3: Reconciler + snapshot protocol

- [ ] Create `routes/install/reconciler.js` per G11 (SSE-connect pass, 15s active poll both engines, post-uninstall pass, wedge-settle, orphan-fail, stall-watchdog port). Broadcast `download:snapshot` after every pass + on SSE client connect. All delta broadcasts gain `version`. **Verify:** `node tests/install-reconciler.test.cjs` passes — cases: missed-terminal heal (MPI-254/255 shape), orphan queued dep with no consumer (live-evidence shape, `research/01` §3-C) transitions to `failed` not silence, terminal jobs never resurrected, snapshot version strictly increases.

### Phase 4 + 5 run as a parallel batch after Phase 3.

## Parallel Batch: frontend mirror + uninstall unification

- [ ] **Frontend mirror + pending UX.** Rewrite `js/services/downloadService.js` per G9/G10/G14: pending client state + 10s revert + `ui:warning` toast (G2), snapshot-replace + version-gated deltas, DELETE the MPI-241 merge heuristic + `_recentlyCancelled`, prune terminal jobs on `models:checked`. Update `MpiModelManager.js` `_modelState`/`_tileState`: busy set per G14, `complete` no longer immortal-busy. Keep all Events-bus event names. Ownership: `js/services/downloadService.js`, `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`, `tests/model-footer-settling.test.cjs`. Briefings: downloads, components, events, state (`/mpi-brief-rule` each) + Critical Rules Snapshot. **Verify:** `node tests/model-footer-settling.test.cjs` passes with updated semantics (no-Install-flash contract intent preserved: busy holds until resync lands, `anyInstalled` beats busy); `npm run lint:components` clean.
- [ ] **Uninstall unification + backend bug kills.** Implement G13 single pipeline in `routes/downloadManager.js` + adapters: server-side engine filter on uninstall dep array, in-flight protection from store status on BOTH engines, custom-node FOLDER deletion fix (log honestly — a kept/missing path never lands in `removed[]`), post-uninstall reconcile pass. Ownership: `routes/downloadManager.js` (uninstall section), `routes/install/localAdapter.js`, `routes/install/remoteAdapter.js`, `tests/uninstall-guards.test.cjs` (new). Briefings: downloads, comfy_engine (`/mpi-brief-rule` each) + Critical Rules Snapshot. **Verify:** `node tests/uninstall-guards.test.cjs` passes — cases: whole-model-installed rule, tier-family circularity (MPI-258 B1 shape), universal keep, pip-keep, in-flight protection both engines, engine-filter rejects cross-engine dep arrays, custom-node folder actually removed in a temp-dir fixture.

### Phase 6: Pod-side wrapper fixes (separate repo: `c:\AI\Mpi\mpi-ci\cubric-vision-pod\`)

- [ ] `wrapper.py`: (a) `/wrapper/models/delete` also evicts the hot-store NVMe copy + `_hot_state` entry for the deleted file; (b) `_run_node_install` honors `pipPins` after requirements (parity with local — pass pins in the install body from `remoteAdapter.js`); bump `WRAPPER_VERSION` to 0.2.37. Use `git -C c:\AI\Mpi\mpi-ci` for all git ops in that repo. **Verify:** python syntax check (`python -m py_compile wrapper.py`); app-side `remoteAdapter` sends `pipPins` field; grep confirms delete path calls the hot-store evict.
- [ ] Ship: `./publish-runtime.sh stable` (R2 push — remember agent CAN upload R2, rclone config local; procedure in `c:\AI\Mpi\mpi-ci\cubric-vision-pod\README.md` § Runtime externalize) — get user approval for the R2 push, then restart Pod or `POST /wrapper/restart-comfy`. **Verify:** Pod boot log shows wrapper 0.2.37; `GET /wrapper/health` (or version field in status) reports 0.2.37.

### Phase 7: Docs + rules rewrite

- [ ] Rewrite `docs/download-manager.md` for the new architecture (store/adapters/reconciler/snapshot; delete pause-resume ghosts; keep scar-tissue traps that still apply, drop ones the refactor kills — refCount section becomes "refCount was deleted in MPI-276, never reintroduce"). ≤200-line rule. Update `.claude/rules/downloads.md` Sub-Agent Briefing (remove pause/resume from the API sample, add snapshot protocol + pending UX + store contract). Update `docs/runpod-troubleshooting.md` where MPI-254/255 belts moved into the reconciler. **Verify:** grep for `pause`/`resume`/`refCount` in both docs returns only historical-note hits; every named file/function in the rewritten docs exists in code (spot-check 5).

### Phase 8: Verification (final gate)

**Verify mode:** user-ux (this phase only; all prior phases auto).

Full matrix, in order — agent runs what it can, user judges the UI feel:

- [ ] Automated rail: `npm run lint` + ALL `tests/*.test.cjs` pass (list each in validation.md with output). **Verify:** zero failures.
- [ ] Cold-boot phantom check: start app (coordinate with user — port 3000 is theirs), open Model Library. **Verify:** zero progress bars/Verifying labels on cards with no active backend job; `GET /comfy/downloads/status` shows `jobs:[]`.
- [ ] Local install (small pack per G19): click Install. **Verify:** card shows pending → real progress within 10s; backend logs `Starting download`; ONE `download:started`; bar reaches Verifying… only after all bytes; card flips Installed with no Install-flash; job pruned from `/downloads/status` after resync.
- [ ] Swallowed-request drill: stop the server mid-session (with user), click Install. **Verify:** card reverts to Install after ~10s + warning toast — NO permanent phantom.
- [ ] Cancel mid-download: **Verify:** partial + `.cubricdl` scrubbed; card back to Install; partial-bytes display correct after resync (closes OPEN-2/MPI-123-local); second cancel press idempotent (no 404 toast).
- [ ] Uninstall matrix: uninstall a model sharing deps with an installed sibling → shared deps survive; uninstall BOTH tiers of a tier family → all tier deps actually deleted (MPI-258 B1 regression); uninstall a model with a custom-node-only dep → node folder handling per rules; uninstall log counts truthful. **Verify:** disk state matches expectations on `G:/CubricModels` + `engine/.../custom_nodes`.
- [ ] Reload mid-download: F5/restart renderer during an active download. **Verify:** snapshot restores the live bar (no MPI-241 revert, no rehydrated phantoms from old jobs).
- [ ] Remote pass (user connects Pod): remote install small dep + uninstall it. **Verify:** progress streams; uninstall evicts hot-store copy (wrapper log); `pipPins` visible in wrapper install log for a pinned node; no local-engine state mutated by remote events (dual-engine rule).
- [ ] User verdict on feel: phantom-free library through an install/uninstall/reinstall churn session mimicking `research/00-live-evidence.md`. **Verify:** user says it holds.

## Plan Drift

- 2026-07-13: Phase 1 shipped (`0d4f0301`, 34 tests green). Session budget ran short before the Phase 2 carve; handoff written at `handoffs/phase2-carve.md`. Phase 2 recommended split into **2a (disease cure: store-wire + register-before-respond + refCount deletion, commit-safe)** then **2b (physical adapter file split, G6 layout)** — same end state, avoids a mid-carve uncommittable `downloadManager.js`. Next session owns Phase 2 with fresh budget. All carve anchors verified + captured in the handoff.
- 2026-07-13: **Phase 2a SHIPPED `5bbf08f2`.** refCount DELETED everywhere (field + 5 bumps + all decrements + 2 rollback loops + status serialization + dead `engine.js` field); `_startPendingDeps` gates on `_depHasActiveDownloadConsumer` alone; uninstall-delete drops depJob unconditionally (shared-guard upstream). `totalBytes += → SET` both engines (G12). Register-before-respond (G8) via new `_serializeModelJob()` — all 3 `/download/start` responses carry `job` snapshot. **Store instantiation DEFERRED to 2b** (user call: avoid two live SOTs mid-refactor); `version` field lands with the store in 2b. Verify green: `grep refCount routes/`→comments only, node-install-batch-resilience + node-drift + install-store(23) + install-progress(11), eslint clean, `GET /downloads/status`→`{success,jobs:[]}`. **RESUME AT 2b:** instantiate `createInstallStore` as the SOT (replacing `_modelJobs`/`_depJobs`), physical adapter file split (G6: `localAdapter.js`/`remoteAdapter.js`), `ResumableDownloader→FileDownloader` rename (sweep `engine.js:17`+`:140`), snapshot `version` into status + responses. Carve anchors: `handoffs/phase2-carve.md`.
- 2026-07-13: **Phase 2b.1 SHIPPED `0ae5fa07`** (safe-slice-first, user call). `ResumableDownloader→FileDownloader` rename done: class def + all 6 use sites (`downloadManager.js`) + export + `engine.js:17` import + `:139` use + `shared.js` pointer comment + `download-completion.test.cjs` (4 refs). Pure rename, zero behavior change; historical comment at `downloadManager.js:333` keeps the old name as provenance. Verify: eslint clean (4 files), `install-store`(23)+`install-progress`(11) green, both modules `require()` cleanly with `FileDownloader` exported + `ResumableDownloader===undefined`, `grep ResumableDownloader routes/`→comment only. **DEFERRED (2b.3):** G9 `version` field NOT added — the store owns the monotonic `_version`; a hand-rolled counter would need every mutation site and lie about monotonicity (user call: defer with the store). Store-as-SOT swap + physical adapter split remain 2b.3/2b.4. **Pre-existing failure noted:** `download-completion.test.cjs` fails its `resumeFromFile` assertion (dead against the cancel-only transport) on pristine `cae5e6bd` too — left untouched, flag for cleanup when the resume-dead tests are pruned.

## Verification

**Verify mode:** user-ux (Phase 8; Phases 1–7 auto).

End-to-end criteria: all new + existing node tests green; zero `refCount` in codebase; the live-evidence scenario (uninstall churn → multi-install) reproduces NO phantom cards; every card state traceable to a store snapshot version; both engines pass the uninstall matrix; wrapper 0.2.37 live with hot-store eviction + pipPins; docs match code.

## Preservation Notes

- Dossiers `research/00`–`04` are the regression matrix — keep with the card.
- Memory updates at close: `feedback_refcount_leaks_never_gate_on_zero` → append "refCount DELETED in MPI-276"; drop MPI-276 from in-flight; note MPI-123-local closure if the cancel display check passes.
- `docs/gotchas.md` cross-cutting entries referencing download refCount/pause: sweep after Phase 7.
- Wrapper repo commit is SEPARATE (`git -C c:\AI\Mpi\mpi-ci`); don't mix with app commits.
- MPI-277 (blob loop) intentionally untouched by this card.
- Concurrent-session hazard: `js/shell.js`, kanban files, and `downloadManager.js` may be edited by peers mid-task — content-anchor edits, re-read on stale-Edit errors (memory `feedback_concurrent_sessions_same_file`).
