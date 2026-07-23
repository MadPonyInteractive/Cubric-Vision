# MPI-110 Validation

## Status: code-complete, awaiting live verification on a real RunPod account.

## What shipped (files)
- `js/core/storage.js` — `autoRetry` added to `DEFAULT_RUNPOD_CONFIG` + `normalizeRunpodConfig` (the normalizer whitelists keys; without this the flag would be stripped on save/load).
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`:
  - "Auto-retry connection" checkbox markup + wiring (shows/hides with body, persists to `runpodConfig`, re-renders pickers on toggle).
  - `_buildGpuOptions` — when `autoRetry` on, also lists out-of-stock GPUs tagged `Unavailable — will wait`, ranked below in-stock cards (`_rank: -1`).
  - `_isPickedGpuInStock(cfg)` helper + `_waitForGpu(root)` background poll (15s, `phase` stays `null`, Cancel via existing button flip).
  - `_connectEngine(root, opts)` — entry gate diverts to wait loop when autoRetry+out-of-stock+no saved Pod; race-swallow on `data.unavailable` / out-of-stock refusal re-enters wait via `_handoffToWait` flag handled in `finally`.
  - `_cancelConnect` — branches: waiting → just stop loop (no Pod created, no delete-active); connecting → today's teardown.
- `js/shell.js` — boot path: `_isGpuInStockBoot` + `_waitForGpuBoot` helpers; fresh-create boot waits in background when both `autoConnectOnStart` AND `autoRetry` on and GPU out of stock; inner create loop re-waits on mid-create snipe.

## Automated checks done
- `node --check` on all 3 files — pass.
- `npx eslint` on all 3 files — clean (no raw addEventListener/querySelector/etc).
- Pure-logic self-check of the stock-shape parser (`/tmp/mpi110-check.mjs`) — 9 assertions pass (real DC / any-region / CPU sentinel / missing DC / empty snapshot / unknown GPU).

## Live verification still required (needs real RunPod key + an out-of-stock GPU)
See plan.md § Verification. Key cases:
1. **Regression (off):** picker shows only available GPUs; Connect one-shot as before.
2. **Non-blocking wait (on):** pick a 0-stock GPU (now visible, tagged), Connect → button=Cancel, hint "Waiting… every 15s", hero/status stay **local·offline (NOT connecting)**, a local Cue still runs unblocked.
3. **Win:** GPU frees → transitions to normal connecting flow, "Creating a Pod…" → ready.
4. **Cancel during wait:** stops loop, no Pod created, back to local.
5. **Boot resume:** both checkboxes on + saved out-of-stock GPU → relaunch → background wait, local usable; autoRetry-alone → no resume.
6. `logs/app.log` clean; no orphan Pods.

## Post-live-test fixes (2026-06-17, round 1)
Three bugs found during the first live L4 test:

1. **`ReferenceError: res is not defined` in shell.js boot path (regression I introduced).** The MPI-110 boot retry `while` loop block-scoped `const res`, but the post-loop ready check still read `res.ok`. Broke ALL boot auto-reconnects (log line 2109). Fix: hoisted `resOk` out of the loop. **This is why the 4090 boot reconnect crashed.**

2. **Connect state was panel-local → navigating away mid-connect dropped the signal.** The "connecting" phase was emitted only by MpiSettings `_connectEngine` (dies on panel `destroy()`) and the boot path. The app-wide feed (`_initRemoteConnectionFeed`) only ever emitted connected:true/false and ignored the backend's `connecting` flag, so closing Settings mid-boot painted local·offline while the Pod was still booting ("it's all gone"). Fix: feed now reads `status.connecting` and emits `phase:'connecting'` app-wide; clears a stale 'connecting' when the connect aborts/fails. Decouples connecting-truth from the Settings panel.

3. **Late "Setting up the engine…" toast ~1 min after Cancel.** Boot `_pollRemoteReady` fired `onSlow` on elapsed time at the top of the loop, BEFORE confirming the connect was still alive (the abort shape is only detected past the 30s grace). A Settings Cancel flips backend mode off but the elapsed timer still fired. Fix: gate `onSlow` on `stillConnecting` (status shows connecting/running/podStatus, or a transient null fetch) and moved it after the status fetch.

Verified: `node --check` + `eslint` clean on all touched files; feed phase-machine self-check (7 assertions incl. abort-clears-stale-phase, OOM gate, download-mode gate) pass. **Still needs a fresh live run** to confirm in the real app.

## Post-live-test fixes (2026-06-17, round 2) — wait survives navigation
Live test showed the wait loop was panel-owned: navigating away from Settings orphaned the loop (it kept running and even won, but a re-mounted panel showed "stopped"+Connect, desynced from the live wait). User decision: wait must survive navigation (set-and-forget).

**Refactor — wait loop moved from MpiSettings → shell (app-wide):**
- `js/state.js` — new transient `remoteWaitGpu` (NOT persisted); mirrors the GPU being waited for so any (re)mounted panel reflects it.
- `js/shell.js` — `_startGpuWait({gpuType,datacenter,onFree,shouldContinue})` + `_stopGpuWait()` own the loop (module-level `_gpuWaitActive`/`_gpuWaitAbort`, single-wait guard); `_kickRemoteCreate(cfg)` POSTs create on free and lets the connection feed drive connecting→connected app-wide; `_initGpuWaitBridge()` listens for `remote:wait-start`/`remote:wait-cancel` (Settings → shell), re-arms on a mid-create snipe. Boot path now reuses `_startGpuWait` (removed the boot-only `_waitForGpuBoot`).
- `js/components/.../MpiSettings.js` — panel wait loop deleted. `_startWait(root)` emits `remote:wait-start` + paints local "waiting…"/Cancel; `_applyWaitState`; Cancel emits `remote:wait-cancel`; `_applyEngineStatus` shows waiting…/Cancel when `state.remoteWaitGpu` set (handles panel re-mount mid-wait); `onState('remoteWaitGpu')` repaints when the wait ends elsewhere. Removed panel `_waiting`/`_waitAbort`/`_RETRY_INTERVAL_MS`/`fromWait`.

Hero/status bar unchanged — they stay local·offline during the WAIT (correct: no Pod yet, generation unblocked). Connecting phase (and its app-wide surfacing from round 1) begins only once a Pod create kicks off.

Verified: `node --check` + `eslint` clean on all 4 files; shell-wait bridge self-check (single-wait guard, free→onFree, cancel→abandon, flag lifecycle) pass.

### Still OPEN (flagged by user, deferred this round)
- **Disabled-Connect-on-open delay.** Connect is briefly disabled each time Settings opens — `_loadRunpodAvailability` reloads volumes async and `_renderRunpodVolume` transiently nulls `volumeId` (derived from DC + reloaded volumes), so the `!cfg.gpuType||!cfg.volumeId` gate disables Connect until volumes finish loading (~1-2s, self-heals). User OK'd fixing it (the protective disable is moot now Cancel exists). NOT YET FIXED — touches pre-existing volume-derivation logic; do as a focused follow-up.

## Post-live-test fixes (2026-06-17, round 3) — win path + boot give-up
Live test (boot auto-connect waiting for RTX 4090, high-demand card):

1. **0%-stuck on the won wait (cosmetic).** The won-wait path was a thin create-only (`_kickRemoteCreate`) that emitted `connecting` but never ran `_pollRemoteReady` (which drives the elapsed % climb). Hero froze at "connecting 0%". Fix: deleted `_kickRemoteCreate`; the Settings won-wait now calls `_initRemoteBoot(cfg)` — the full proven create→`_pollRemoteReady`→connected→WS flow (GPU in stock at that point, so its own wait is skipped). % now climbs.

2. **GPU-switch mid-wait did nothing (then fixed).** Dropdown `change` handler ignored a live wait. Fix: switching GPU mid-wait stops the old wait, adopts the new card, and starts a fresh wait for it (or readies Connect if in stock). Shell `wait-start` self-cancels a prior wait (rapid re-switch safe). Verified live: 4000 Ada → A4500 → 4090 all switched cleanly with correct toasts.

3. **Boot wait GAVE UP (the real bug).** `_bootWaitContinues` bailed on `c.wasConnected && c.podId` — but those are STALE prior-session storage flags (a successful connect last session leaves them set). On a fresh boot waiting for an out-of-stock GPU, the guard tripped immediately → wait abandoned → UI left "stopped"+Connect with a stale "Waiting…" hint. **The wait should never give up while the GPU is still wanted.** Fix: `_bootWaitContinues` now bails ONLY on real intent change (flags off / GPU switched), never on stale saved flags. A live connection is detected by the create path / feed, not saved flags.

4. **Stale-hint desync (companion to #3).** When a wait ended, `_applyEngineStatus` repainted button/status to "stopped"+Connect but left the "Waiting for…" hint, so the two disagreed. Fix: the stopped branch clears a stale wait/connect hint (regex-matched, never a warning).

Verified: `node --check` + `eslint` clean on shell.js + MpiSettings.js. **Needs a fresh live run** — boot with auto-connect+auto-retry on an out-of-stock GPU, confirm the wait persists (never gives up) and the won path climbs 0→100.

## LIVE-VERIFIED COMPLETE (2026-06-17)
Full end-to-end on real RunPod hardware:
- Out-of-stock L4 picked (visible in picker, tagged) → Connect → "waiting…" + Cancel, hero/status stay local·offline, local gen unblocked.
- Wait PERSISTED ~15 min, never gave up (round-3 give-up fix).
- L4 freed → Pod `bdhreszr6uwx25` created (201, no snipe) → % climbed 0→100 (round-3 0%-fix) → "First-time setup" slow-toast at ~150s (correct) → backend `ready:true comfyReady:true` → "Remote engine: ready" + Disconnect + hero session badge ($0.04, 5min).
- GPU-switch mid-wait verified across 4000 Ada → A4500 → 4090 → L4 (round-3 switch fix).
- Final round-4 fix (waiting→connecting label flip in Settings) is code-only, lands next restart — does not affect functional behavior.

All rounds' fixes verified working. Card ready to close on user approval.

## Doc drift to confirm with user (CLAUDE.md cardinal rule 3)
- `.claude/rules/component-state.md` — MpiSettings now reads/writes `runpodConfig.autoRetry`. (No new event; reuses `remote:connection`. No new ComfyUI injection. No mount change.)
