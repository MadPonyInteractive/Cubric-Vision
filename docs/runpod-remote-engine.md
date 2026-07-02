# RunPod Remote Engine

> Promoted from `.agents/mpi-kanban/tasks/MPI-64/current-architecture.md` at the MPI-64
> epic close (2026-06-15). This is the durable architecture reference. The task workspace
> (`MPI-64/current-architecture.md`, `OPEN-ITEMS.md`) holds the session-by-session
> narrative + open follow-ups; **this doc is the stable contract.** Follow-up cards (MPI-74/75/81/89/90/91/93/94) are all done + archived.

## What it is

A **Secure Cloud-only** RunPod remote generation engine. Cubric deploys a hidden,
Cubric-owned Pod template running a small **Python/FastAPI wrapper** in front of ComfyUI,
exposed through RunPod's HTTP proxy with token auth. The desktop app keeps all of its
existing generation contracts (single-dispatch Cue queue, title-based workflow injection,
app-owned result capture, local project persistence) and swaps only the transport.
Community Cloud is unsupported (unstable/limited for this use case).

## 1. Topology (backend-proxy)

- The renderer speaks **ComfyUI-shaped HTTP** to `/proxy/*` on `127.0.0.1:3000` (the
  Express backend), never directly to the Pod. Express attaches the wrapper token
  **server-side** and forwards to the RunPod HTTP proxy. The token never reaches renderer
  storage.
- **One renderer-direct exception:** `GET /remote/ws-token` returns the WSS base + token
  over loopback so the renderer opens the **binary-preview WebSocket** straight against the
  RunPod proxy (binary latent frames can't tunnel cleanly through Express).
- `routes/remoteProxy.js` MUST stay mounted **before** `routes/comfy.js` in `server.js` —
  the `/comfy/events/stream` SSE intercept falls through with `next()` when remote mode is
  inactive, so local mode stays byte-identical.

### App-side route surface (`routes/remoteProxy.js`)
- Mode/status: `GET|POST /remote/mode`, `GET /remote/ws-token`, `GET /remote/comfy/status`.
- Lifecycle: `POST /remote/pod/create`, `/reconnect`, `/stop-active`, `/delete-active`,
  `/teardown`, `/cleanup-orphans`; `GET /remote/pod/specs`.
  - `create`/`reconnect` accept an optional **`minMemoryInGb`** system-RAM FLOOR (MPI-160).
    RunPod honors it as a hard placement filter (live-proven: 200GB → SUPPLY_CONSTRAINT,
    90/none → create), so a high-RAM-only host is deterministic. High-RAM creates route
    through the **GraphQL** `podFindAndDeployOnDemand` path (proven; the REST enum path was
    NOT proven to accept the field). A no-matching-host refusal returns `ramFloorMissed` so
    the UI shows an honest "no ≥N GB host" message + respects the auto-retry/wait toggle.
- Telemetry: `GET /remote/pod/stats` (RAM+VRAM, wrapper-first), `GET /remote/pod/disk`
  (volume USED bytes via wrapper `du`, wrapper-first, NO REST fallback — see §5; MPI-169).
- ComfyUI forwarding: `POST /proxy/prompt`, `/interrupt`, `/queue`, `/upload/image`;
  `GET /proxy/view`, `/queue`.
- Companion routers: `routes/remoteEngine.js` (key resolver, wrapper-token gen/store/clear,
  `waitForWrapperReady`, `proxyUrl`), `routes/runpodRemote.js` (RunPod REST+GraphQL
  `client`), `routes/remoteModels.js` (model status/install forwarding),
  `routes/downloadManager.js` (remote download SSE bridge).

## 2. Pod lifecycle (create-on-Connect + STOP-on-quit, delete-fallback)

- **Connect** (Settings or boot): saved `podId` → `POST /remote/pod/reconnect` (warm
  resume); else `POST /remote/pod/create` (fresh on the picked GPU). Connect is gated on
  **both a GPU and a network volume** being selected.
- **Reconnect:** availability pre-check on the saved GPU → if gone, DELETE the stuck Pod +
  return `{unavailable}`. Else `startPod`; on host-pinned failure ("not enough free GPUs on
  the host machine" / any non-already-running error) → DELETE + `createPod` fresh on the
  same GPU. A STOPPED Pod is **host-pinned** — it can only resume where its GPU is free; the
  delete+recreate fallback is the self-heal for that wall.
- **Quit teardown** (`POST /remote/pod/teardown`, called by `main.js`): branches on the
  **delete-on-quit** pref. OFF (default) = `stopPod` (EXITED, warm-resumable, no GPU bill);
  ON = delete every `cubric-vision` Pod. `main.js` teardown timeout is **30s** (a slow
  RunPod delete aborted at 8s once and left a Pod running).
- **Disconnect** (Settings): 3-button popup — **Terminate** (stop warm), **Delete Pod**,
  **Cancel**. Both stop/delete flip backend `_mode.active = false` (podId preserved) so
  `isRemoteActive()` returns false and local generation resumes.
- **Boot auto-reconnect:** persisted `wasConnected && podId && gpuType` → background
  reconnect with toasts. **Skipped when delete-on-quit is set** (the deleted Pod can't
  resume; a stale podId is cleared so manual Connect uses the create path).
- **Crash backstop:** the wrapper's **idle watchdog** self-stops the Pod after ~15 min
  without authenticated traffic (enabled when `RUNPOD_API_KEY` is in the Pod env). This is
  the net for app crash/kill where `main.js` teardown can't run.
- **`_starting` flag (connect race):** `_connecting` covers only the synchronous route
  window; `_starting` spans the **whole background boot/resume**. `GET /remote/comfy/status`
  reports `connecting = _connecting || _starting`, so Connect stays disabled for the entire
  boot → no pressable-mid-connect window → no duplicate create.

### Billing semantics
- **RUNNING** bills GPU per-second → never leave running across quit.
- **STOPPED (EXITED)** bills only volume + reserved container disk.
- **DELETED** bills only volume.
- **Single-Pod invariant** (§4) prevents two RUNNING Pods billing at once.

## 3. "Delete Pod on quit" pref

Non-secret pref `deleteOnQuit` in `state.runpodConfig` (default OFF; normalizer in
`js/core/storage.js`, localStorage-mirrored via the state Proxy). Full config:
`{ enabled, podId, datacenter, gpuType, volumeId, wasConnected, deleteOnQuit, autoRetry,
containerDiskGb, minRamGb }` (minRamGb = optional system-RAM floor, MPI-160; 0 = none). Pushed to
backend `_mode` via `POST /remote/mode` on boot (`shell.js _initRemoteBoot`) and on checkbox
toggle (`MpiSettings.js`). `main.js` stays pref-agnostic — it calls `/remote/pod/teardown`
and the backend branches. Backend `_mode = { active, podId, deleteOnQuit }` is server-owned.

## 4. Billing / race guardrails

- **Single-Pod invariant:** `_sweepOrphanPods(key, keepPodId)` deletes ANY non-keeper
  `cubric-vision` Pod regardless of status (EXITED or RUNNING). `_createPodInternal` sweeps
  **before and after** `createPod`. Cubric is one-Pod-per-RunPod-account.
- **Teardown delete-nothing fix:** the sweep always spares the tracked ids, so delete-on-quit
  deletes the **tracked Pod FIRST** (`_deleteTrackedPod` clears the ids) THEN sweeps with an
  empty keep-set.

## 5. Volume / data center rules

- Persistent state lives on a RunPod **network volume mounted at `/workspace`** (models +
  per-model custom nodes). One volume per data center; a volume is **locked to its DC**.
  Switching DC ⇒ delete + re-download.
- **Delete a volume only after deleting its attached Pod** — RunPod refuses to delete an
  attached volume even when the Pod is EXITED. Settings deletes the tracked Pod first.
- **No volume USED-bytes from RunPod (MPI-169).** REST `/networkvolumes` returns only
  `{id,name,size,dataCenterId}` (size = the configured quota); GraphQL `NetworkVolume`
  rejects `used`/`usedBytes`/`consumedBytes`/`currentPerGBUsage`. The ONLY truthful used
  figure comes from inside a running Pod: wrapper `GET /wrapper/disk` runs `du -sb
  /workspace` (0.2.23+). So the Settings volume disk bar is **connected-Pod-only** (works
  on a GPU pod OR a CPU download pod — both mount `/workspace`); an idle/unconnected DC
  shows the total-only badge. `statvfs` is the wrong tool (reads the multi-PB container
  overlay, not the quota) — that was the reverted MPI-100 mistake; do NOT re-add it.
- **Design A (locked):** PyTorch + ComfyUI live in the **Docker image**, NOT the volume → the
  volume has **zero GPU-arch binding** and is portable across every card the image can run.
  Users never reinitialize the volume to switch cards.
- **Real compatibility axis:** `image-CUDA-floor ≤ host-driver-provided-CUDA`, NOT card arch.
  The image's `NVIDIA_REQUIRE_CUDA` label is checked by the `nvidia-container-cli` hook against
  the **host driver** before the container starts; a host below the floor refuses it. Decoupling
  torch does NOT fix it — the rejection is the image label, not pip torch. See §6 for per-card
  image floors. (The old GPU-picker auto-filter idea, **MPI-91**, was archived: `cu124` as the
  non-Blackwell default removed the broad refusal class, and the Blackwell tail isn't
  pre-filterable from the picker data Cubric can read.)

## 6. Pod image + custom-node split (Design B+)

- App selects the image tag **per card** in `routes/remoteProxy.js` via
  `podImageForCard(gpuTypeId)`: `POD_IMAGE_BASE =
  ghcr.io/madponyinteractive/cubric-vision-pod`, Blackwell (sm_120 substring match on the
  gpuTypeId: `5090`/`rtx pro 6000`/`b200`/`blackwell`) → `-cu128`, everything else (and
  unknown) → `-cu124`. `WRAPPER_VERSION` + `POD_IMAGE_VERSION` are separate consts. A
  POD_IMAGE bump needs an **app restart** (the running process holds the consts in memory).
  Ground-truth live image check = RunPod console → Pod → Logs → Container tab `create
  container …:vX`.
- **Image CUDA floors:** `-cu128` = `runpod/pytorch:2.8.0-cuda12.8.1` (torch pinned stable
  2.7.1+cu128 — the base nightly broke flash-attn), Blackwell sm_120, floor `cuda>=12.8`.
  `-cu124` = `pytorch/pytorch:2.6.0-cuda12.4` (torch 2.6.0+cu124), Ampere/Ada/Hopper (no
  Blackwell), floor `cuda>=12.4`. Both bake **ffmpeg + git**; **flash-attn dropped** (ABI-
  fragile, ~7% slower than SDPA for diffusion, bypassed when sage is on). Accelerator =
  **sageattention compiled to the volume on first boot per GPU arch**
  (`/workspace/cubric/pylibs`, ~5-15 min one-time, arch-stamped sentinel → recompiles only on
  arch switch) **+ PyTorch SDPA always-present fallback**. Readiness gates on ComfyUI-up only,
  never on sage. App readiness-poll timeout is **1200s** so the one-time compile can't abort
  readiness.
- **Custom-node lifecycle split:** the 7 **universal** `installOnEngine` node packs (MpiNodes,
  VideoHelperSuite, Impact-Pack, KJNodes, UltimateSDUpscale, Frame-Interpolation,
  Impact-Subpack) **bake into the image**. **Per-model** nodes (PainterI2V + future) install
  onto the **volume** via the wrapper at model-install time — a new model NEVER forces an
  image rebuild. ComfyUI loads both via `--extra-model-paths-config` (`start.sh` writes
  `/workspace/cubric/extra_model_paths.yaml`, mapping each model type → `mpi_models/<type>`
  plus the volume `custom_nodes:` key). Per-model node install reports `needs_comfy_restart`
  (ComfyUI scans `custom_nodes` only at boot) → the app warm-cycles the Pod.
- **Lazy-download weights are the remote trap.** Several baked node packs fetch model weights
  on first use, not at build (RIFE `rife47.pth`; Impact-Pack `bbox/face_yolov8n.pt` +
  `sam_vit_b_01ec64.pth`; upscale `4x-NMKD-Siax`/`4x-AnimeSharp`). On a Pod that runtime fetch
  doesn't happen → the node 503s at execution (`POST /proxy/prompt 503`). FIX = pre-bake those
  weights into the image at build (**MPI-81**). Until then interpolate/upscale/auto-mask 503
  remotely; that is expected, not a bug.
- Image builds run via private **mpi-ci**: `gh workflow run cubric-vision-pod-image.yml -f
  manifest_version=X -f wrapper_version=X -f comfyui_ref=master -f push_latest=false`. A
  wrapper/start.sh/Dockerfile change ⇒ rebuild + POD_IMAGE bump + app restart + a fresh Pod.

## 7. Secret handling

- **No secret-bearing localStorage.** API key + wrapper token never touch project files,
  localStorage, logs, or bug reports.
- RunPod API key: `main/secretsStore.js` (Electron `safeStorage`, OS-keychain-backed, AES-GCM
  file fallback + one-time `weakEncryption` warning when no OS keyring). Renderer access is
  **write-only** through `js/core/secretsClient.js` (`secrets:*` IPC).
- Wrapper token: generated server-side per Pod (`generateWrapperToken`), stored keyed to
  `podId`, attached as a Bearer header in-process by `/proxy/*`. A warm `startPod` keeps the
  same podId (token still matches); a delete+create regenerates + re-stores the token.
- `routes/runpodRemote.js` `redactSecret` + `_safeFetch` scrub the key from any thrown
  error/URL before it can reach a log.
- **Never read/grep `cubric-remote-wrapper/.secrets/runpod.env`** (gitignored). **Never run
  autonomous Pod create/delete** — the classifier blocks both; the USER runs all live Pod ops.

## 8. Video output: SaveVideo split (NVENC-free, portable)

Every video workflow ends in the portable native pipeline `CreateVideo → SaveVideo`, NOT
`VHS_VideoCombine`/`nvenc_h264` (NVIDIA hardware encode is fragile per-card and FAILS on
Blackwell containers: `OpenEncodeSessionEx failed: unsupported device`). Contract:

- **Final-output node:** title `Output_Video` (+ optional `Output_Audio`, gated by
  `MpiHasAudio` → `MpiIfElseInverted` where the op has a video input).
- **Preview node:** title `Preview` (no audio — throwaway preview clip on `_ms` two-pass
  workflows).
- The app captures by title — `_collectComfyOutputUrls` reads `videos[]` for both final and
  preview, and muxes audio server-side. **No app change is needed per video workflow** because
  capture is workflow-agnostic.
- Per-op `latestVersion` was bumped 1.0→1.1 in BOTH `js/core/operationRegistry.js` AND
  `operation_registry.json` for the 6 converted video ops (interpolate, videoUpscale,
  resizeVideo, t2v, t2v_ms/i2v, i2v_ms). `extend` left at 1.0 (no workflow file).
- **Agents NEVER edit `comfy_workflows/*.json`** — they are the user's external ComfyUI
  template. Document the injection-title contract; ask the user to author/re-export.

See `.claude/rules/comfy_injection.md` (Preview row + `Output_Video`/`Output_Audio`) for the
injection-side contract.

## 9. Engine-drop / OOM recovery

A container OOM (`exit 137`, ComfyUI RAM hog killed) is **NOT a Pod death** — the container's
`start.sh`/supervisor restarts ComfyUI **in-place** (same Pod, same proxy URL, models reload
from the volume); the Pod stays alive (Uptime never resets). The wrapper never OOMs, so
`/health` + `/remote/comfy/status` stay reachable. The app loses only the **preview WS** and
re-arms it opportunistically on the **next gen's** `connect()` (not a background auto-reconnect).

- **Detection (live-verified):** on a WS drop / status-flip-to-not-ready mid-gen, the app ends
  the stuck gen with an OOM-aware "Generation failed" modal + an orange disconnect toast, sets
  the status bar to `IDLE · DISCONNECTED` (NOT `local · offline`), caps the WS reconnect loop
  (`_WS_MAX_RECONNECTS` → `_onWsDropped`), and backs off the status polls (no request flood).
- **Transient-503 classification:** a gen submitted during the ComfyUI re-init window gets a
  503. `comfyController` classifies it: `comfy_not_ready` → a soft "engine restarting, retry"
  toast (`commandExecutor`), `engine_error` → surface `detail.comfy_body` (names the missing
  weight — the L2-class diagnostic for lazy-weight 503s). `shell.js` gates the status-bar
  `connected` repaint on `comfyReady` so it auto-flips ONLINE on recovery without a manual
  toggle.
- **Pod-DEATH** (RunPod terminates the whole Pod) is a separate, harder-to-force mode — NOT
  tracked as a validation item, handled reactively if it recurs.

The OOM-toast live-verify is on **MPI-93** (the test GPU was reclaimed before verify; the code
is committed).

## 10. Operational side-modes + troubleshooting

- **CPU "download mode" Pod (MPI-88)** — provision a CPU-only Pod to install models
  onto the volume with no GPU billing, then switch to a GPU Pod to generate. Full
  contract (sentinel `'__cpu__'`, slim image, connect-gate branches) →
  [runpod-troubleshooting.md](runpod-troubleshooting.md) § "CPU download mode".
- **Fixed-bug traps** (restart-poll flag, /history reconcile URL, remote-cancel
  async, aria2c 80% snap, image-pin-needs-restart, etc.) →
  [runpod-troubleshooting.md](runpod-troubleshooting.md) § "Fixed-bug traps".
- **Verification snapshot** at MPI-64 close (2026-06-15) is archived in
  troubleshooting; live checklist is owned by MPI-93.

## 11. Arch quick-reference (compressed from gotchas.md MPI-170)

**Auto-retry GPU wait** (`js/shell.js` `_startGpuWait`/`_stopGpuWait`): opt-in "Auto-retry" picks an out-of-stock GPU and polls availability (15s) entirely in the shell — survives navigation. `state.remoteWaitGpu` (transient) mirrors the GPU being waited on. During wait: `phase:null`, `active:false`, NO Pod created. `autoRetry` must be in `normalizeRunpodConfig` whitelist or it strips on persist.

**DC-steer + bad-host maintenance detect (MPI-135)** — logic-verified, NOT live-verified (needs scarce card + maintenance host). Any-region ephemeral retries now call `_bestStockDcForGpu` (ranks `dataCenters[].gpuAvailability`) and pin `body.datacenter` to the best-stock DC instead of re-sending `dc=null`. Maintenance hosts: `getPod` machine object carries `maintenanceStart`/`maintenanceEnd`/`maintenanceNote`; both readiness polls early-return `'maintenance'` past the 30s grace → delete doomed Pod + dialog "Connect again for a fresh host". NO signal for stuck-pull-at-0 (no REST pull-progress field).

**GraphQL↔REST GPU-id fallback (MPI-159)** — LIVE-VALIDATED 2026-06-29. REST `POST /pods` has a separate enum from the GraphQL catalogue; newer cards (RTX PRO 4500/4000 Blackwell) are in the catalogue but not the enum → 400 `gpuTypeIds/items/enum`. Fix: `_createPodInternal` falls back to `client.createPodGraphql` (`podFindAndDeployOnDemand`) whose `gpuTypeId` is a free string. REST stays primary; GraphQL-created Pods are managed by REST (shared id namespace). `_createRejectReason` now unwraps the top-level array body and classifies `gpuUnsupported:true` → honest copy + retry-loop break.

**Volume persists through Reset** — RunPod console "Reset" wipes container/ephemeral disk only; Uptime keeps climbing, volume usage stays full, models survive. Confirmed 2026-06-17. Clear volume via manual `rm` (wrapper/SSH) or destroy the network volume itself.

**REST Pod shape — no `uptimeInSeconds`** — `GET /pods/{id}` has NO `runtime` object; `p.runtime?.uptimeInSeconds` is always null. Use `lastStartedAt` (UTC ISO) to compute uptime. Live fields: `costPerHr`/`adjustedCostPerHr`, `desiredStatus`, `machine` (dataCenterId, location, gpuAvailable, maintenanceStart/End/Note). NO image-pull progress field exists anywhere.

**Watchdog is a crash backstop, NOT an idle timer** — the Pod-side watchdog (`wrapper.py Watchdog`) resets on ANY authenticated traffic; `MpiMemoryMonitor` polls `/wrapper/stats` every 2s so the deadline never expires while the app is alive. It fires only when the app dies. Never add "stop Pod after N min idle while connected" — architecturally impossible without stopping the stats poll. Fixed 10-min backstop (`CUBRIC_IDLE_TIMEOUT_S=600`, not user-configurable). MPI-103 live-verified: Pod stayed up 57 min idle-with-app.

**Remote route branch audit** — in remote mode (`isRemoteActive()`), model files live on the Pod VOLUME, not local disk. Any `routes/` path that reads/writes/deletes local model files MUST have an `isRemoteActive()` branch. Grep `routes/` for `fs.`, `_trash`, `managedModelsRoot`, `getDefaultModelsRoot`, `resolveComfyPath` and confirm each short-circuits. Uninstall lacked this (found 2026-06-13) and trashed local files while leaving the Pod volume untouched.

**Wrapper fetch 502 retry** — `wrapperFetch` retries transient 404/502/503/504 (Pod warming); original 8s budget caused failures on mid-resume; raised to ~30s (`retries=15, retryDelayMs=2000`). Genuine 4xx/501 (bad body, missing endpoint) not in the retry set. Remote-uninstall safe-abort surfaces as `ui:warning`, NEVER `ui:error` (which shows the GitHub-report dialog).

**On-demand model auto-upload (MPI-82)** — live-verified 2026-06-17 (L4). A LoRA/upscale present locally but absent on the Pod is auto-uploaded at generate-time (`comfyController._uploadRemoteModels`) before `/prompt`. Wrapper endpoint: `POST /wrapper/models/upload` (image v0.4.9+). `forceLocal:true` skips upload. Presence check is a live `os.path.exists` on the volume every gen (no app cache).

**Manifest compat gate (MPI-90)** — wrapper writes `/workspace/cubric/manifest.json` at first boot; app reads it in `_evaluatePodHealth()` before first remote gen. Blocks (409) only when `manifest_schema_version > MANIFEST_SCHEMA_MAX` (=1); 404 = fresh volume = OK. Gate currently dormant (all real Pods report schema 1). Tests: `tests/runpod-remote-hardening.test.cjs` + `wrapper/test_manifest_stamp.py`.

**Pod wrapper owns + supervises ComfyUI (v0.4.2)** — `POST /wrapper/restart-comfy` restarts ONLY ComfyUI without a Pod reboot. RunPod console op truth table: "Restart Pod" = NO-OP (uptime unchanged, processes NOT restarted); "Reset Pod" = WIPES container; "Stop → Start" = ONLY console op that reloads ComfyUI. `start.sh` `exec`s the wrapper as main process; unexpected ComfyUI death → `os._exit(1)` (safety preserved); intentional restart sets `_restarting` so supervisor relaunches.

## Related docs / rules

- `docs/comfy.md` — ComfyUI integration, controller, capture, download manager.
- `.claude/rules/comfy_injection.md` — workflow injection + the `Output_Video`/`Output_Audio`/
  `Preview` capture contract.
- `.claude/rules/comfy_engine.md` — engine/backend, model registry, downloads.
- `.agents/mpi-kanban/tasks/_archived/MPI-64/` — the source workspace (current-architecture.md narrative,
  OPEN-ITEMS.md, research/).
