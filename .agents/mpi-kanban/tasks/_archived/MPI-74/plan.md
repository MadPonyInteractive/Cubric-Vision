# MPI-74 Plan — Per-generation "Run locally" override toggle

> **Scope change from brief.** The original brief (`brief.md`) describes a
> *two-engine-live* hybrid resolver (image→local, video→cloud, same project,
> auto handoff). That remains the long-term vision but is a large refactor of the
> singleton `ComfyUIController` and is blocked on MPI-64 maturity.
>
> **This plan implements a smaller, viable subset the user actually asked for:**
> a per-generation **"Run locally"** toggle in the PromptBox, shown only while
> connected to the remote engine. When ON, that single Cue/Q dispatch runs on the
> **local** ComfyUI instead of the Pod. The rest of the UI keeps showing remote
> mode unchanged. One engine is live at a time; we flip the target for one job.
> Multi-stage (`_ms`) gens are IN scope (decision 2026-06-17).

## Why this is viable (investigation-backed, 2026-06-17)

Four parallel read-only investigations confirmed:

1. **Single chokepoint.** Whole-run engine choice is one line —
   `comfyController.js:187` `if (remoteEngineClient.isRemote()) return this._ensureRemoteReady(opts)`.
   The local branch already boots local ComfyUI if it is cold. A per-run
   `forceLocal` short-circuits it: `if (!opts.forceLocal && remoteEngineClient.isRemote())`.
2. **`opts` is snapshotted per-job** at enqueue (`generationService.js:248`), so a
   `forceLocal` captured at toggle-time is frozen into the queued job — correct
   per-job capture, free. BUT `opts` is currently **dropped at 3 hops** before the
   chokepoint; those hops must thread it.
3. **Input assets are already local.** All media (generated outputs + user media)
   live on local disk in `<project>/Media/` regardless of engine. Image/mask/
   video/audio/latent all resolve to local paths in the local branch — zero extra
   work for the asset payload itself.
4. **Local model-presence check reuses existing machinery.** `POST /comfy/models/check`
   (routes/comfy.js:449) already has a self-contained local-fs branch
   (`isCompleteOnDisk` + `getDefaultModelsRoot`). We add a tiny local-only variant
   so we can check local presence WHILE remote mode is active.

**The one seam the brief missed:** three backend staging routes fork on the
**global** `isRemoteActive()` flag, not per-run opts. A force-local multi-stage
gen would mis-stage its latent to the Pod. Each route already has a ready
local-copy branch — we just let them honor a per-request `forceLocal`.

## Success criteria

- [x] Toggle visible in PromptBox ONLY when remote-connected (`remoteEngineClient.isRemote()` at mount + `remote:connection` event). — CODE DONE, user-verify pending
- [x] Toggle ON + press Q/Cue → that gen runs on LOCAL ComfyUI; app stays in remote mode for everything else. — CODE DONE (chokepoint + httpBase + WS + uploads all forceLocal-aware), live-verify pending
- [x] Toggle ON + selected model NOT installed locally → warning toast, gen aborts (`_findModelNotLocal` + `/comfy/models/check-local`). — CODE DONE, verify pending
- [x] Cue panel shows a "Local" chip per force-local job. — CODE DONE, verify pending
- [x] Multi-stage (`_ms`) preview + Continue works force-local (staging routes honor per-request forceLocal → local input/). — CODE DONE, live-verify pending
- [x] Toggle resets / hides cleanly on remote disconnect. — CODE DONE, verify pending
- [x] No change to behavior when not connected to remote (toggle absent; flag defaults false everywhere). — CODE DONE

## Implementation status (2026-06-17)

ALL CODE COMPLETE + lint-clean. Built on MPI-82 spine **d8925a1** (their model-upload
skip already reads `opts.forceLocal`; engine routing was left to me per their contract).
Pending: USER live-verification on a connected Pod (UI look + force-local image gen +
force-local `_ms` gen + missing-local-model abort).

- Phase 1 (spine): chokepoint 187 guard; `httpBase(forceLocal)`; per-call local target at
  `/prompt`, `/upload/image`, output-collection, media upload; LOCAL WS via
  `connect(forceLocal)`/`ensureWsConnected({forceLocal})` + `_wsForceLocal` wrong-engine
  reconnect; `forceLocal` threaded startGeneration→runCommand→runWorkflow→ensureServerRunning. ✓
- Phase 2 (local guard): `POST /comfy/models/check-local` (refactored shared `_localModelsCheck`);
  `_findModelNotLocal` pre-dispatch abort + toast. ✓
- Phase 3 (multi-stage): `/comfy/prepare-workflow-inputs` + `/comfy/stage-preview-latent`
  honor `req.body.forceLocal` → local-copy branch. ✓
- Phase 4 (UI): PromptBox toggle (cloud↔laptop, remote-only, sticky/reset-on-disconnect). ✓
- Phase 5 (badge): generationService `engine` field + MpiQueuePanel "Local" chip + signature. ✓

## Implementation

### Phase 1 — Thread `forceLocal` through the dispatch spine (the hard part)

- [ ] **comfyController.js:187** — chokepoint guard: `if (!opts.forceLocal && remoteEngineClient.isRemote()) return await this._ensureRemoteReady(opts);` → verify: force-local dispatch takes the local branch with the Pod connected.
- [ ] **comfyController.js:678** — `runWorkflow` passes `{ forceLocal: opts.forceLocal }` into `ensureServerRunning()`.
- [ ] **comfyController.js (`httpBase`, `_uploadImage`, video/audio upload @ ~732)** — these read `remoteEngineClient.isRemote()` / `httpBase()` globally. For a force-local run they must resolve to the LOCAL address. Thread `forceLocal` so the upload + workflow-submit target the local ComfyUI, not `/proxy`. (Investigation: image/mask/video/audio already resolve to local paths; this is about the upload TARGET, not the asset source.)
- [ ] **commandExecutor.js:1051** — `runCommand` forwards `forceLocal` into the `runWorkflow(... , opts)` arg.
- [ ] **commandExecutor.js (runCommand entry ~711)** — accept `forceLocal` from the payload `startGeneration` passes.
- [ ] **generationService.js:446** — `startGeneration` passes `forceLocal` (from its `opts`) into `runCommand({ ... })`. (Currently opts is dropped here.)
- [ ] Verify spine end-to-end: temporary hardcode `forceLocal:true` at enqueue, confirm a single gen lands on local ComfyUI while remote connected; then remove the hardcode.

### Phase 2 — Local model-presence guard (abort + toast)

- [ ] **routes/comfy.js** — add `POST /comfy/models/check-local`: the local-fs branch of `/comfy/models/check` (lines ~465–518), run unconditionally (ignore `isRemoteActive()`). Reuses `isCompleteOnDisk`, `getDefaultModelsRoot`, `getCustomRoot`, `getComfyPath(ENGINE_ROOT,'custom_nodes')`. Zero risk: no existing caller changes.
- [ ] **generationService.js (`startGeneration` / `enqueueGeneration`)** — when `forceLocal && remoteEngineClient.isRemote()`: build the dep payload from `config.model` (`model.dependencies.map(id => DEPS[id])`, same shape as `syncModelInstalled`), POST `/comfy/models/check-local`, read `results[model.id].installed`. If false → `Events.emit('ui:warning', { message: 'This model is not installed locally — install it or turn off Run locally.' })` and abort (do NOT enqueue / call `runCommand`). Mirror the `_findMissingModel` abort pattern (commandExecutor.js:754).
- [ ] Verify: toggle ON with a video model that lives only on the Pod → warning toast, no dispatch. Toggle ON with a locally-installed model → dispatches local.

### Phase 3 — Multi-stage staging routes honor per-run forceLocal

- [ ] **routes/comfy.js:140 (`/comfy/prepare-workflow-inputs`)** — accept `req.body.forceLocal`; compute `const remoteActive = remoteModels.isRemoteActive() && !req.body.forceLocal;`. Existing local-copy branch (`fs.copy` into local `input/`) already correct.
- [ ] **routes/comfy.js:194 (`/comfy/stage-preview-latent`)** — same: gate the `isRemoteActive()` upload branch behind `&& !req.body.forceLocal`. Local-copy branch already exists.
- [ ] **Callers of these two routes** (comfyController/commandExecutor `_ms` flow) — pass `forceLocal` in the POST body for a force-local run. (Local latent already exists at `<project>/Media/.latents/<uuid>.latent` — no new produce logic.)
- [ ] Verify: force-local `_ms` preview → Continue completes, latent staged into LOCAL ComfyUI `input/` (not uploaded to Pod). Confirm remote-Continue (MPI-108 path) untouched.

### Phase 4 — PromptBox toggle UI

- [ ] Add a toggle control to MpiPromptBox, rendered ONLY when `remoteEngineClient.isRemote()`. Subscribe to `remote:connection` (shell.js emits it) to show/hide + reset on disconnect.
- [ ] Wire toggle value into `el.getRunPayload()` (MpiPromptBox.js:868) as `forceLocal`.
- [ ] BEM class + CSS var color + icon from `js/utils/icons.js` (register a laptop/local icon if none fits — no raw SVG). Label e.g. "Run locally".
- [ ] **MpiGalleryBlock.js:1153** (`_galleryGenerationFromPayload`) + **MpiGroupHistoryBlock.js:956** (`_generationFromPromptPayload`) — extract `forceLocal` from payload, put it in `opts` (not `config`).

### Phase 5 — Cue panel LOCAL/REMOTE badge

- [ ] **generationService.js (`_buildQueueDisplay` ~78)** — add `engine: opts.forceLocal ? 'local' : 'remote'`.
- [ ] **generationService.js (`_queueSnapshotItem` ~109)** — forward `engine: job.display?.engine || ''`.
- [ ] **MpiQueuePanel.js:302** — append `|${j.engine || ''}` to `_signature` (else badge won't re-render — render-diff gate).
- [ ] **MpiQueuePanel.js (`_renderJob` ~279)** — render a `mpi-queue-panel__meta-line--engine` span (text "LOCAL"/"REMOTE"; mirror existing `__thumb-badge` / `__meta-line`).
- [ ] **MpiQueuePanel.css** — `--engine` modifier using `var(--accent-ok)` (local) / `var(--accent-frost)` (remote). No new CSS file.

### Phase 6 — Edge cases + verify

- [ ] Disconnect remote mid-queue with a force-local job pending: job should still run local (opts frozen) — confirm no crash, badge stays LOCAL.
- [ ] Toggle persistence: should NOT persist across remote disconnect/reconnect (reset to OFF). Decide if it persists within a session — default OFF each gen vs sticky. (Lean: sticky within a remote session, reset on disconnect.)
- [ ] Desktop verify (Electron) per CLAUDE.md: force-local image gen + force-local `_ms` video gen on a live Pod.
- [ ] Update `.claude/rules/` (component-comfy / component-events) ONLY with explicit permission per CARDINAL RULE 3.

## Key files (entry points)

| File | Role |
|---|---|
| `js/services/comfyController.js` | chokepoint (187), runWorkflow (678), httpBase/upload targets |
| `js/services/generationService.js` | startGeneration (418/446), enqueue+snapshot (243/248), display (78/109) |
| `js/services/commandExecutor.js` | runCommand (711/1051), `_findMissingModel` toast pattern (754) |
| `routes/comfy.js` | `/comfy/models/check` local branch (449), staging routes (140/194) |
| `js/data/modelRegistry.js` | `syncModelInstalled` dep-payload shape (80) |
| `js/components/...MpiPromptBox/MpiPromptBox.js` | toggle UI, getRunPayload (868) |
| `js/components/Blocks/MpiGalleryBlock/MpiGalleryBlock.js` | payload→opts (1153) |
| `js/components/Blocks/MpiGroupHistoryBlock/MpiGroupHistoryBlock.js` | payload→opts (956) |
| `js/components/Compounds/MpiQueuePanel/MpiQueuePanel.js` | badge + signature (279/302) |
| `js/services/remoteEngineClient.js` | the local/remote seam (isRemote 71, httpBase 90) |

## Out of scope (explicit)

- Per-model persistent engine override / `mediaType`-driven auto-routing — deferred.
- Reverse direction (force-REMOTE while local) — not requested.

> NOTE 2026-06-17: "two-engine-live concurrent dispatch" was originally listed
> here as out-of-scope, but the USER confirmed it IS the real requirement
> ("what would be the point if they couldn't run in parallel?"). It is now
> **Phase 6 below** — the next session's work. Phases 1–5 (single-engine
> force-local) are COMMITTED + live-verified (commit 2c3e68f).

---

# Phase 6 — TRUE CONCURRENCY (cloud + local at the same time)

> **Status: CODE COMPLETE (Steps 1–4), lint+syntax clean, NOT yet live-verified.**
> Phases 1–5 ship a SEQUENTIAL force-local (one engine at a time, verified).
> Phase 6 makes a cloud gen and a local gen run SIMULTANEOUSLY. Confirmed required
> by user. Pending: USER live-verify on a connected Pod (enqueue cloud + local →
> both run at once; Stop one keeps the other; previews don't cross; local cold-boot
> doesn't freeze a running cloud gen).

## What shipped (2026-06-17, Steps 1–4)

- **Step 1 — per-engine controller** (`comfyController.js`). Object literal →
  `createEngine({engine, alwaysLocal})` factory. TWO instances exported:
  `remoteEngine` (alwaysLocal:false, resolves remote-or-local via remoteEngineClient
  = old singleton behavior) + `localEngine` (alwaysLocal:true, pinned local). Each
  owns its own `_ws`, `clientId`, `_promptListeners`, `_activePromptId`, etc. →
  resolves A1/A2/A3/A4 (no socket thrash, no preview cross-talk). Added
  `getEngine(forceLocal)` resolver + `ComfyUIController` default export aliases
  `remoteEngine` (back-compat: shell.js/MpiSettings boot gates unchanged).
  **Dropped the `_wsForceLocal` single-socket hack** + the per-call `forceLocal`
  param on httpBase/ensureWsConnected/_uploadImage/connect (engine selection now
  happens at the call site via getEngine; `_alwaysLocal` drives in-instance routing).
- **Step 4 — per-engine clientId**: each instance gets its own `crypto.randomUUID()`
  (free from Step 1; lets ComfyUI demux the two concurrent sockets).
- **commandExecutor.js**: `getEngine(forceLocal).runWorkflow/.interrupt(...)` at the
  3 runWorkflow + 3 cancel/interrupt sites; `_buildComfyViewUrl` →
  `getEngine(forceLocal).httpBase()`. Stop now routes per-engine (Stop cloud leaves
  local running, and vice versa).
- **Step 2 — two queue lanes** (`generationService.js`). `_activeCueJob`/
  `_cueDispatchInFlight` → `_lanes = {remote, local}` each with {active, inFlight,
  lastJobForLoop}. `_laneOf(job)` routes by opts.forceLocal. `_dispatchNextCue`
  fills any idle lane with that lane's next pending job (findIndex by lane) →
  concurrent drain. `_finishActiveCueDispatch(lane, …)` frees ONE lane.
  `cancelRunningCueJob` settles only the stuck job's lane (other lane untouched).
  Snapshot returns up to 2 running (`runningItems` + back-compat `running`/`runningCount`).
  Loop re-fire is per-lane. MpiQueuePanel "Next up" index = runningCount+1.
- **Step 3 — engine-tagged non-blocking boot overlay**. `comfy:starting/ready/error`
  now carry `{engine}` (via `_emitLifecycle`). shell.js: blocking MpiStartingComfy
  modal is SUPPRESSED when the OTHER engine is mid-gen (`_otherEngineRunning` via
  `engine._isRunning`) → a local cold-boot can't freeze a running cloud gen (the
  live-test freeze). Modal owner tracked (`_comfyModalEngine`) so a side-engine
  ready/error never dismisses the other's modal. `loadAssets()` on ready gated to
  the engine matching current app mode (`remoteEngineClient.isRemote()`) so a local
  side-gen ready doesn't reload the remote model list mid-cloud-gen.
- **Backend: NO changes** (verified concurrency-safe in design).

Files touched: `js/services/comfyController.js`, `js/services/commandExecutor.js`,
`js/services/generationService.js`, `js/shell.js`,
`js/components/Compounds/MpiQueuePanel/MpiQueuePanel.js`.

## The problem (verified by investigation 2026-06-17)

`ComfyUIController` is a **singleton** with global mutable state; the Cue queue
dispatches **one job at a time**. Two concurrent runs (one remote, one local)
collide on shared engine state. Full collision map below — each row is a real
blocker found in code, not speculation.

### Collision map (file:line + verdict)

| # | Shared state | Location | Collision | Blocker? | Difficulty |
|---|---|---|---|---|---|
| A1 | `_activePromptId` (binary-preview routing) | `comfyController.js` ~104/519/527 | binary previews have NO prompt_id → routed via the single `_activePromptId`; the other engine's `executing` overwrites it → previews delivered to wrong run | **HARD** | moderate |
| A1b | `_promptListeners`/`_promptRejectors` | ~98/106 | keyed by prompt_id → ALREADY safe for 2 runs | no | trivial |
| A2 | `_wsForceLocal` + single `_ws` | ~89/91/549-630 | `connect(true)` vs `connect(false)` close+reopen each other's socket → **thrash** | **HARD** | hard |
| A2b | `_isRunning` | ~95 | `interrupt()` sets false unconditionally (not engine-scoped) | soft | trivial |
| A3 | `ensureWsConnected()` poll loop | ~131-164 | two loops fight over single `_ws`, reconnecting every ~1.5s | **HARD** | hard (same fix as A2) |
| A4 | `clientId` (one UUID) | ~86 | fine with 1 socket; with 2 sockets ComfyUI can't demux which socket gets a client's msg | moderate | trivial |
| A4b | `httpBase(forceLocal)` | ~77 | pure fn, no shared write → safe | no | none |
| B5 | `_cueDispatchInFlight`/`_activeCueJob` | `generationService.js` ~41-42 | single-lane gate (`if (_cueDispatchInFlight) return`) blocks any 2nd dispatch | **KEY SEAM** | moderate |
| B6 | `activeGenerations._registry` | `activeGenerations.js` ~32 | UUID-keyed Map, explicitly multi-entry → ALREADY safe | no | none |
| C7 | `comfy:starting/ready/error` + `MpiStartingComfy` | `comfyController.js` 248/259/266 → `shell.js` 254-258 → `MpiStartingComfy.js` 54-67 | events carry NO engine tag; local cold-boot shows a GLOBAL body-level blocking modal OVER a running cloud gen (this is what froze the UI in the live test) | **UX BLOCKER** | moderate |
| C8 | `state.remoteEnginePhase` / `_mode.active` | `state.js` 19 / `remoteProxy.js` 127 | single-engine-mode assumption; NOT a runtime collision for 2 running gens (only matters for connect/disconnect-while-running) | design debt | trivial (no change to unblock) |
| D9 | `/proxy/*` (remote) vs `/comfy/*` (local) backend | `remoteProxy.js` 1146 / `comfy.js` | SEPARATE route trees; `save-generation` is URL-driven + already engine-aware; `project.json` writes per-path-queued | no | none |

**Bottom line:** the backend is already concurrency-safe. ALL real blockers are
frontend, and ALL of A1/A2/A3/A4 collapse into ONE root fix: stop sharing one
controller instance between two engines.

## Design — minimal change set (implementation order)

**Step 1 — Make `ComfyUIController` per-engine (the root fix).**
Convert the singleton object into TWO instances: `localEngine` + `remoteEngine`
(factory or class). Per-instance: `_ws`, `_wsReady`, `_wsReconnectAttempts`,
`_activePromptId`, `_promptListeners`, `_promptRejectors`, `_pendingPromptMessages`,
`_isRunning`, `clientId`, and the engine target (local always-local; remote
always via `remoteEngineClient`). This single change resolves A1, A2, A3, A4 at
once — each engine owns its socket + preview routing, so no thrash, no
preview cross-talk. **Drop the `_wsForceLocal` reconnect hack** (Phase 1's
single-socket workaround) — it becomes unnecessary once sockets are per-engine.
- RISK: this is the big one. `ComfyUIController` is imported widely as a singleton.
  Decide: (a) keep a default export that = remoteEngine-or-active for back-comat,
  + add explicit `getEngine(forceLocal)` for the dispatch path, OR (b) full
  per-call engine resolution. Investigate import sites before choosing.
- Per-call seam: `runWorkflow`/`ensureServerRunning` already receive `forceLocal`;
  route them to `getEngine(forceLocal)` instead of `this`.

**Step 2 — Two queue lanes in `generationService.js`.**
Split `_cueDispatchInFlight`/`_activeCueJob` into `_localLane`/`_remoteLane`.
`enqueueGeneration` routes by `opts.forceLocal`. Each lane dispatches its next job
independently (a local job no longer waits behind a running cloud job). `_cueQueue`
stays unified with a per-entry lane tag (or split into two arrays). `_updateQueueDepth`
counts both lanes. The Cue PANEL already shows the LOCAL chip per job (Phase 5), so
a mixed queue renders correctly today — only the DISPATCH gate needs splitting.

**Step 3 — Engine-tag the comfy lifecycle events.**
Add `{ engine: 'local'|'remote' }` to every `comfy:starting`/`ready`/`error` emit.
`shell.js`: only show the blocking `MpiStartingComfy` modal for `engine:'local'`
boot WHEN no other engine is mid-gen — better, replace the global modal with a
NON-BLOCKING per-engine status pill so a local cold-boot never freezes the cloud
lane. (This is the "Starting ComfyUI Engine…" overlay that hijacked the UI in the
live test.) `comfy:ready` currently also calls `loadAssets()` — make that
engine-aware so a local-ready doesn't reload the remote asset list mid-cloud-gen.

**Step 4 — Per-engine `clientId`.** Each engine instance gets its own UUID
(resolved free by Step 1).

**Step 5 — Backend: NO CHANGES.** Verified concurrency-safe.

## Open questions for next session (decide before coding Step 1)

1. **Singleton import blast radius.** How many files import `ComfyUIController` as
   a singleton + call instance methods (`.runWorkflow`, `.connect`, `.interrupt`,
   `.isWsReady`, `.httpBase`)? This sizes Step 1. (grep `ComfyUIController\.` first.)
2. **VRAM/RAM contention.** Local engine + cloud are separate machines, so no GPU
   contention — but the LOCAL gen competes with whatever else is on the user's box.
   Acceptable (user opted in). No gating needed, but confirm.
3. **`interrupt()`/Stop semantics with two lanes.** Stop must target the RIGHT
   engine's run. Today `interrupt()` is global. Needs per-engine routing (the Cue
   Stop button already knows the job → thread engine through).
4. **Concurrency cap.** Two lanes = up to 1 local + 1 remote at once. Do we allow
   the user to QUEUE multiple per lane (lane drains serially within itself, lanes
   parallel to each other)? Default yes — that's the natural lane model.
5. **The dropped `_wsForceLocal` hack.** Phase 1 added it for the single-socket
   case. Step 1 makes it dead. Confirm removal doesn't regress the (now legacy)
   single-engine path — or keep both engines instantiated always and route, so the
   "single-engine" path is just "remote lane only, local lane idle".

## Verify (next session, connected Pod)
- Enqueue a cloud gen AND a local gen → BOTH run AT THE SAME TIME (watch both
  progress concurrently, not sequentially). Both save + land in gallery.
- Local cold-boot during a running cloud gen → cloud gen keeps its previews + UI;
  no global blocking overlay.
- Stop the cloud job → local keeps running (and vice versa).
- Previews don't cross (cloud previews on the cloud card, local on the local card).
