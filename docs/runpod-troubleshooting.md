# RunPod — Troubleshooting & Fixed-Bug Traps

Fixed-bug traps and the CPU download-mode reference for the RunPod remote engine.
The stable architecture contract is [runpod-remote-engine.md](runpod-remote-engine.md);
this file holds the "why it broke last time" traps + operational side-modes.
Verify a named file/function/flag still exists before relying on an entry.

<!-- MPI-170 routing target: RunPod troubleshooting gotchas land under this header. -->

## Fixed-bug traps

<!-- routed from gotchas.md by MPI-170 -->

### autoretry live-test bugs (all fixed)

Three bugs that caused the GPU-wait loop to misbehave (all shipped): (1) `_bootWaitContinues` bailed on stale `wasConnected && podId` storage flags from a prior session — bail ONLY on real intent change. (2) Win-path % stuck at 0 because the won-wait routed to `_pollRemoteReady` instead of climbing %. (3) `remoteWaitGpu` must be cleared the moment the GPU frees (before connect, not in `finally`). GPU-switch mid-wait: `remote:wait-start` self-cancels a prior wait.

### image / wrapper pin needs app restart

`POD_IMAGE_VERSION` / `WRAPPER_VERSION` in `routes/remotePodLifecycle.js` (MPI-175 split; was remoteProxy.js) are constants loaded at Express boot — editing on disk does NOT change what a live app sends. A Pod will boot the OLD image tag until the app is fully restarted. Verify via the log line `Pod image for <card>: ...:v<X>-cu124` and `/health` `wrapper_version`. Cost ~20 min during MPI-90 testing.

### remote restart poll — wrong flag (MPI-107)

Fixed 2026-06-17. The per-model node-install restart poll in `comfyController.js` gated on `s.ready` (wrapper health) instead of `s.comfyReady`. A `/proxy/restart-comfy` reloads ONLY ComfyUI — the wrapper stays up — so `s.ready` is meaningless during a comfy restart. Fix: poll `s.ready && (s.comfyReady === undefined || s.comfyReady)`. (`=== undefined` keeps old-image compat.) Any remote readiness wait after a comfy-only restart MUST gate on `comfyReady`, never bare `ready`.

### remote /history reconcile URL — drop the /wrapper segment (MPI-152)

Fixed 2026-06-29. `comfyController._reconcileFromHistory` hit `${httpBase()}/history/{id}`; remote `httpBase()` is `/proxy`, so the correct route is `GET /proxy/history/:id` — which `remoteProxyForward.js` (MPI-175 split; was remoteProxy.js) forwards server-side to `/wrapper/history/{id}`. Client must NOT add `/wrapper` itself → `/proxy/wrapper/history` is a 404, swallowed silently → EVERY remote reconcile broken since MPI-152, so a gen whose terminal WS event was lost (edge proxy reaps the idle preview WS on long samples) hung forever. Fix: client URL is bare `/history/{id}` in both modes. Backstop: 5s `/history` poll (`_startHistoryPoll`, remote-only) catches the lost terminal independent of WS health.

### remote cancel is soft and async (MPI-123)

`remoteCancelInstall(depId)` only POSTs `/wrapper/models/install/cancel` (sets a flag, returns immediately). The `.part` file lingers until the next chunk write. If `awaitReSync()` fires immediately after cancel, `/wrapper/models/status` races the purge. Fix: follow cancel with `await remoteModels.remoteUninstallDep(dep).catch(() => {})` — `/wrapper/models/delete` synchronously removes both `<dest>` and `<dest>.part`. Never hard-fail cancel.

### remote install progress — 80% snap is aria2c preallocation (not a bug)

The ~80% snap on pressing Install is aria2c preallocating across 16 segments — first progress report already shows a large fraction before bytes flush. MPI-95 fixed the real bugs (wrong `totalBytes` denominator + indeterminate bar during hash verify). Do NOT keep "fixing" the app for the 80% snap — it is correct behavior.

### restart-needed flag is per-engine — never share local + remote (MPI-64)

Fixed 2026-06-29. `comfy:needs-restart` SSE fires for both local and remote installs; `downloadManager.js` broadcasts `{ remote: true }` for the Pod side. Renderer (`downloadService.js`) must route by that tag: `remote:true` → `state.remoteComfyNeedsRestart`, else → `state.comfyNeedsRestart`. They used to be ONE flag — a remote auto-upload flipped it, and the next local gen saw it set, ran `/comfy/stop` + restart, killing a healthy local ComfyUI. RULE: any new restart/needs-rescan signal that can originate remotely MUST carry and honor an engine tag.

### remote download silent-stall belt (MPI-136) — NOT live-verified

**UNVERIFIED** (hard to force: needs a live network stall on a running Pod). A remote download can stall mid-flight with the SSE stream still open — a zombie CDN socket (TCP alive, stops bytes, no RST/FIN). Root trigger was HF/Xet throttle; MPI-129 (weights → R2) largely removed it. Three shipped defenses (wrapper **0.2.21**, app committed): (1) aria2c `--lowest-speed-limit=1M --timeout=30` aborts sub-1MB/s zombies in 30s; (2) httpx fallback: each chunk under `asyncio.wait_for(..., 60s)` → stall raises `RuntimeError`; (3) app watchdog (`downloadManager.js`): 15s poll, if open SSE silent >90s → abort + MPI-97 reconnect path. If a remote install ghost-freezes: confirm Pod runs wrapper ≥0.2.21 (`GET /health`), check `app.log` for `remote install silent for Ns … treating as stalled`.

### Pod-image BUILD 403s on the weight-prebake — HF Xet CDN, use R2 (MPI-148, fixed 2026-07-03)

The pod Dockerfile's weight-prebake `RUN` (bakes rife47 / 4x upscalers / face_yolov8n / sam_vit_b via `aria2c -x16 -s16`) intermittently FAILED the whole `docker build` with `aria2 errorCode=22 … status=403`. Cause: HuggingFace migrated those repos to its **Xet CDN** (`us.aws.cdn.hf.co/xet-bridge-us/…`), whose signed-URL policy 403s ranged/segmented aria2 requests non-deterministically — one GPU profile survived (aria2 retried into a good range), a parallel one didn't. Fix: point the 4 non-RIFE weights at **R2** (`https://models.cubric.studio/vision/models/<type>/<file>`) — the SAME source `dependencies.js` already uses (MPI-129/178) and the SAME bytes (SHAs unchanged). RIFE stays on HF (`marduk191/rife` is a plain non-Xet repo, never 403s). The weights are ALSO on local disk at `G:/CubricModels/` (see docs/builder/01-environments.md) — no re-download needed to re-mirror. RULE: Dockerfile weight-prebake urls MUST mirror `dependencies.js` (both R2); never (re)introduce a `huggingface.co` prebake url — a future HF Xet migration re-breaks the build. If a build 403s on a weight: confirm it exists on R2 (`curl -sI` the url, single call — a looped `curl -o` lies HTTP 000 on this box), and repoint.

### local restart-needed flag must be SERVER-side — node installed mid-boot was lost (FIX 2026-06-29, NOT yet user-verified)

**NOT user-verified** (logic-tested only, 9 assertions pass). Two ways the restart was lost: (1) boot race — user presses Install while ComfyUI is still booting; ComfyUI's one-shot node scan runs BEFORE pip deps finish (proven: `IMPORT FAILED` at 19:35:50, pip success at 19:35:51) → import failure cached for the process life; (2) reload loss — frontend flag dies on any reload. Symptom: loader dropdown empty; `import gguf` works at a shell (looks like a path problem but is NOT). Fix: `downloadManager.js` now sets `processState.comfyNeedsRestart = true` server-side on LOCAL node install; `/comfy/status` echoes `needsRestart`; gen gate restarts when either flag is set; a booting ComfyUI restarts instead of finishing its poisoned scan. If dropdown still empty after Install: grep `app.log` for `IMPORT FAILED` near the install timestamp; full app restart is the manual cure.

### stale engine mirror on a No-GPU Pod — install shipped without the GGUF (MPI-179)

Fixed 2026-07-02, live-verified. `remoteEngineClient._active` was refreshed only by the ComfyUIController connect/generation flows; a No-GPU download Pod never runs those (no ComfyUI), so `isRemote()` read false all session and EVERY engine-scoped resolve (check universe, footprint, install set) used the LOCAL universe — LTX installed without its GGUF transformer yet read INSTALLED. Fixes: `remoteEngineClient` self-refreshes on every `remote:connection` edge; `MpiModelManager.awaitReSync()` refreshes the mirror before resolving; server-side `_withEngineExtraDeps()` (`downloadManager.js`) unions `engines[engine].extraDeps` back in after the MPI-163 intersect (subtract-only cannot heal a wrong-engine request). RULE: any new engine-scoped consumer must not read `isRemote()` before a refresh path has run.

### remote "Verifying…" sweep — model-level, gated on weight bytes only (MPI-164)

Fixed 2026-07-02. Two traps in `downloadManager.js` `_onRemoteInstallEvent`: (1) `_depDenominator` used `max(realTotal, registrySeed)` — an over-declared registry `size:` capped the bar at ~95-98%; real total must WIN once known (same rule as local `_wireProgress`). (2) A per-dep `models:install-verifying` mid-install flipped the WHOLE model bar to the indeterminate sweep; now the sweep waits until every dep is byte-complete and pins the bar to 100% first (MPI-140 contract). custom_nodes deps are excluded from that byte gate — a requirements-only node re-install sits at 0 bytes through its whole pip run and would hold the gate shut. Residual: an install where ONLY node pip runs never gets a verifying event → full determinate bar until INSTALLED.

### CPU image baked a rotting wrapper — /health lied (MPI-181)

Fixed 2026-07-02 (`v0.10.4-cpu`), live-verified (Settings volume bar on a fresh CPU Pod). Pre-v0.10.4, `Dockerfile.cpu` had NO R2 bootstrap — it baked wrapper.py at build, so every wrapper fix after the image build silently never reached CPU Pods, while the baked `CUBRIC_WRAPPER_VERSION` stamp made `/health` claim a version it didn't run (v0.10.2-cpu: 0.2.22 code labeled 0.2.23, no `/wrapper/disk` → no volume bar). Now the CPU image runs the same `bootstrap.sh` (start script env-selectable via `CUBRIC_START_SCRIPT=start-cpu.sh`) and `publish-runtime.sh` also publishes `start-cpu.sh`. RULE: wrapper edits reach BOTH pod flavors via `publish-runtime.sh` — an image rebuild is only for base/dep changes; trust `/health` `wrapper_version` only on bootstrap-era images (≥v0.10.2 GPU, ≥v0.10.4 CPU).

## CPU "download mode" Pod (MPI-88)

Provision a CPU-only Pod purely to install models onto the volume with **no GPU billing**,
then switch to a GPU Pod to generate (volume + models persist — Design A). Live-verified
end-to-end 2026-06-15 (CPU Pod → download → switch to RTX 2000 Ada, models present, no re-download).

- **Trigger:** the Settings GPU dropdown's first option, "No GPU — download only", sets
  `runpodConfig.gpuType` to the sentinel `'__cpu__'`. It rides the existing gpuType field,
  Connect guard, persistence, and GPU-switch delete-and-recreate logic untouched.
- **Create spec** (`_createPodInternal`, `routes/remotePodLifecycle.js`): sentinel → `computeType:'CPU'`
  + `cpuFlavorIds:['cpu3c']` (no `gpuTypeIds`/`gpuCount`), `containerDiskInGb:20` (CPU Pods cap
  at 20), env `CUBRIC_DOWNLOAD_MODE=1`, and the **slim `:v<ver>-cpu` image** — NOT a GPU image.
  The full cu124/cu128 image will NOT run on a CPU Pod (its entrypoint inits CUDA → container
  starts with 0 processes → app hangs "connecting"), so the slim image is mandatory.
- **Slim image** (mpi-ci `cubric-vision-pod/Dockerfile.cpu` + `start-cpu.sh`): wrapper + aria2c
  only, no torch/ComfyUI. `/wrapper/models/install` (aria2c) is pure HTTP+disk. The wrapper's
  `/health` returns `ready:true, comfy_ready:false, download_mode:true` when `CUBRIC_DOWNLOAD_MODE`
  is set (no ComfyUI to probe). See MPI-81 for the image's place in the rebuild batch.
- **State:** `_mode.noGpu` plumbed through `/remote/mode` + `/remote/comfy/status`; the renderer
  mirrors it via `remoteEngineClient.isDownloadOnly()`.
- **Download mode has no ComfyUI / no preview WS**, so three "connected" gates branch on it:
  the hero connection feed ORs `noGpu` into its `comfy_ready` gate (`js/shell.js`); both connect
  paths (Settings + boot reconnect) skip the WS handshake. Without these the hero painted
  `LOCAL · OFFLINE` and Connect hung at "Almost ready" even though the volume was live.
- **Generation blocked:** `_ensureRemoteReady` throws `code:'pod_no_gpu'` + a `ui:info` toast; and
  `js/shell/projectUI.js` blocks entering the gallery (project open) in download mode via
  `isDownloadOnly()` → toast, no navigation.
- **Watchdog** unchanged (the CPU Pod inherits the `RUNPOD_API_KEY` env self-stop backstop).

## Verification snapshot (historical — MPI-64 close, 2026-06-15)

Point-in-time status at the MPI-64 epic close. Kept for provenance; the live
verification checklist is owned by MPI-93. Do not treat ⚠️/❌ rows as current —
several have since shipped (remote video, cancel, manifest gate, etc.).

| Area | Status |
|---|---|
| Pod create-on-Connect / warm-resume / delete-fallback | ✅ live-verified |
| Stop-not-delete on quit (OFF) / delete-on-quit (ON) | ✅ live-verified |
| Single-Pod invariant (stray reaped live) | ✅ live-verified |
| Connect-disabled-through-boot (`_starting`) | ✅ live-verified |
| Remote IMAGE generation + project save | ✅ live-verified |
| Remote model install onto volume (Wan 2.2 78GB) | ✅ live-verified |
| Remote VIDEO generation (I2V, SaveVideo, no NVENC) | ✅ live-verified (L4, 2026-06-15) |
| Remote model UNINSTALL (`/wrapper/models/delete`) | ✅ live-verified (v0.4.0) |
| OOM detection (exit-137 container OOM) | ✅ live-verified (forced twice, RTX 2000 Ada) |
| OOM container self-heal mechanism | ✅ confirmed via Telemetry |
| OOM transient-503 soft toast + status auto-repaint | ⚠️ code committed, deferred → MPI-93 |
| Remote VIDEO: T2V / upscale / interpolate / with-audio | ⚠️ untested remotely → weights MPI-81 |
| Remote INPUT-ASSET transfer (video/audio/.latent) | ⚠️ code shipped, not verified → MPI-89 |
| Cancel / interrupt a remote gen mid-run | ⚠️ not exercised remotely → MPI-93 |
| Higher-res / longer T2V on a 64GB+ Pod | ⚠️ not run → MPI-93 |
| Crash-watchdog backstop (simulated kill) | ⚠️ designed, not verified → MPI-93 |
| Manifest compatibility gate (Step 5) | ❌ not built → MPI-90 |
| Image CUDA floor vs host driver | ✅ axis understood; cu124 default live |
| Fresh-volume init + bundle versioning | ❌ not built → MPI-94 |
