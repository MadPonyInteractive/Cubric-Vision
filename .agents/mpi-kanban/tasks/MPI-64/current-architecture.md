# MPI-64 RunPod Remote Engine — Current Architecture Snapshot

> **THIS IS THE LATEST TRUTH, NOT A HISTORICAL LOG.** When implementation changes
> the design, UPDATE THIS FILE IMMEDIATELY and leave only a brief note in
> `plan.md` `## Plan Drift` + `events.jsonl`. Do not let design knowledge strand
> in handoffs again. Historical "why we changed X" belongs in Plan Drift; the
> living "what it is now" belongs here.
>
> Last updated: 2026-06-13 (session 2: B4 part 1+3 + backend stream-pipe crash
> guard + B0 execution_error + gallery empty-picker fallback + Disconnect now
> resets `_mode.active` [fixes local `_ms` "wrapper upload 404" after Disconnect]
> — all live-verified except B0 [code-verified]. Also verified: B1 local
> auto-restart, B1 remote gate, remote Stop (single gen), video/I2V input-asset
> TRANSPORT (full-res image → Start/End frame, correct injection+wiring).
> ✅ RESOLVED + LIVE-VERIFIED: the "remote I2V ignores the subject" bug was a
> `dependencies.js` url↔filename CROSS — the i2v-named UNet files downloaded T2V
> weights (proven: i2v file = 36-channel patch_embedding, t2v = 16; HF files
> correctly named, app url/sha were swapped). FIXED app-side (swap url+sha+size
> per filename); NOT transport, NOT the MPI-68 split (split just triggered the
> remote reinstall). Also explains B3 horrible-T2V + some OOMs (wrong model
> loaded). VERIFIED 2026-06-13 on an RTX 4000 Ada Pod: after deleting the wrong
> volume files + reinstalling, remote I2V RESPECTS the input subject. SESSION 3
> (2026-06-13): RAM in GPU picker SHIPPED (lowestPrice.minMemory + ⚠ video <64GB);
> Step 5.2 DROPPED (superseded by cu124-default); remote preview-LATENT
> materialization FIXED + live-verified (Create-from worked); remote uninstall
> GUARDED (no local trash) + live-verified toast; "Restarting ComfyUI" → info
> toast; cu128 multi-stage verified on RTX PRO 6000. mpi-ci has /wrapper/models/delete
> + aria2 fast-download WRITTEN (await rebuild). SESSION 4 (2026-06-14, all
> renderer-only + user-verified + committed): Reuse-prompt FIXED (op made
> authoritative before media inject; `_isI2V` → op-driven `_opAcceptsImageInput`;
> commit 5c6beac). Bug 2 FIXED (in-place "Complete this preview" left the GALLERY
> card stale — poster swapped but hover `<video>` never promoted because the grid
> IntersectionObserver doesn't re-fire for an in-view card; `refreshGroup` now
> calls `_promoteVideo()`; commit e8b6a7b. Plus a separate GroupHistory-viewer
> bridge on `gallery:item-updated`). NOTE: a PARALLEL MPI-76 agent shared
> MpiGalleryGrid.js/MpiGalleryBlock.js — a lint-staged stash race + concurrent
> writes caused commits 92be6da/dea0a4c to cross-attribute some MPI-76 work; net
> code is correct + nothing lost (verified). SESSION 5 (2026-06-14, renderer-only,
> user-verified, committed): MPI-73 DONE — remote connect-readiness gate (preview
> WS must be open before "Connected"/generation; `ensureWsConnected` refresh+retry
> killed the false "almost ready"), cancel-a-never-started CUE job (no queue
> re-hang), connect/disconnect feedback (hero `connecting·offline` /
> `disconnecting·online` no card + status bar `IDLE · Connecting/Disconnecting`),
> Cue button disabled during transitions via new `state.remoteEnginePhase`, local
> GPU line no longer lingers at boot, models hero stat re-syncs on connect edge.
> MPI-73 moved to its own card (now `done`). See §10 "MPI-73".
> SESSION 6 (2026-06-14, RunPod=v1.1.0 shared trunk): A1 engine-drop recovery
> SHIPPED + COMMITTED (0c243f5) + LIVE-VERIFIED end-to-end — `remote:engine-dropped`
> now drives a sticky `remote · disconnected` hero + `IDLE · Disconnected` status +
> `ui:warning` toast (NOT a false `local · offline`); manual reconnect (Settings →
> Connect) by design, re-hydrates the model panel on the connect edge; renderer-only
> (shell.js `_initEngineDropRecovery`, heroStats.js, statusBar.js). Live fresh-volume
> session on the new MPI-75 v0.4.0 image (wrapper 0.2.3): B-T2V PASS (RAM peaked
> 92%=53.68/57.74GiB at VAE decode, no OOM — RAM is the wall), aria2c download PASS
> (G4), volume-delete PASS (G5), delete-on-quit PASS (F8), cu124/cu128 arch routing
> confirmed, Step 4.3 self-heal confirmed, D1 cache-stacking re-confirmed live (~35GiB
> held after a completed gen). FOUND: remote UNINSTALL not yet working (L6/G3 — stale
> "endpoint doesn't exist" fallback + 2-step-confirm question, handed to MPI-75 agent);
> Blackwell PRO 4500 create 400 (L1, Blackwell-specific); + L2-L5 minor (error-body
> dropped, ETA msg [downgraded], no remote dl-speed, status-poll false-negative flicker).
> H3 slide-over-closes → promoted to card MPI-79 (parallel session).
> SESSION 7 (2026-06-14, live RTX 5090 Blackwell Pod + local; RunPod=v1.1.0 trunk):
> LIVE-VERIFIED on the 5090: remote model UNINSTALL works end-to-end (L6/G3 CLOSED —
> the prior "did nothing" was the unconfirmed two-step confirm dialog, NOT a code bug;
> `removed 4 kept 3`, volume dirs emptied); remote I2V DIFFUSES on Blackwell (latents,
> RAM peaked ~94%=52.76/55.88GiB at VAE, no OOM) but the FINAL VHS_VideoCombine encode
> FAILED `h264_nvenc … No capable devices found` (B3). DIAGNOSED: every video workflow's
> output node used `format: video/nvenc_h264-mp4` (GPU HW encode) → fails on the Blackwell
> container; CPU `video/h264-mp4` works (proven via a temp edit, reverted). L1 reclassified
> RunPod-side PRO-4500-host constraint (5090 got HTTP 201 same DC/vol/cu128); L2 CLOSED
> (createPod reject-reason shipped 2c2fb1a). B4 FOUND: interpolate 503 = RIFE model WEIGHTS
> not baked in the Pod image (node code IS baked at /opt/ComfyUI/custom_nodes) → image
> rebuild item (MPI-81); upscale models same.
> **B3 FIX SHIPPED + LIVE-VERIFIED (local, committed 497fb89):** the single VHS_VideoCombine
> "Output" node is replaced by the portable native pipeline — `CreateVideo` → `SaveVideo`
> (title `Output_Video`, `output/video/` subfolder) + optional `SaveAudioMP3` (title
> `Output_Audio`, `output/audio/`), audio gated by `MpiHasAudio` (MpiNodes v1.1.0 — ffmpeg
> stream-probe on the input path) → `MpiIfElse` (empty audio is NEVER saved; SaveVideo/
> SaveAudio both throw on empty audio). The app CAPTURES both nodes (SaveVideo `videos[]`,
> SaveAudio `audio[]`; `Output_Video` treated as an output node alongside `Output`) and
> MUXES them server-side in `/project/save-generation` via `services/ffmpegMux.js`
> (video master: `-map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -shortest` — stream-copy video,
> no re-encode, no nvenc, encoder/GPU-agnostic). `audioViewUrl` threads
> commandExecutor.`onComplete({audioUrl})` → generationService → projectService.saveGeneration
> → the route. Audio absent → silent video, no mux, no crash; temps GC'd. FILENAME COUNTERS
> for the two save nodes increment INDEPENDENTLY (video `_00002_` ↔ audio `_00001_`) — pairing
> is by the SAME prompt's `executed` payloads, NEVER by counter. The `Input_Video`/`Input_Audio`
> media-path resolution is now FORCED by title (comfyController) because the injected path now
> feeds an `MpiString` fan-out node (one path → VHS loader AND MpiHasAudio) instead of the
> loader's `video` field — without it the raw `/project-file?path=` URL reached VHS ("video is
> not a valid path"). interpolate is the PROVEN template (both with-audio→muxed-synced and
> no-audio→silent paths verified live); `latestVersion` bumped 1.0→1.1 (operationRegistry.js +
> operation_registry.json). REMAINING: convert the other video workflows (t2v/t2v_ms/i2v/i2v_ms/
> extend/videoUpscale/resizeVideo) to the same node setup + bump each `latestVersion`; app side
> is DONE + workflow-agnostic. Two import bugs deferred → card MPI-83 (no prompt box on model-less
> imports; only first of N imports gets fps/duration — separate subsystem, log clean). MpiNodes
> downloads always-latest-main (local auto-gets v1.1.0; Pod needs MPI-81 rebuild for MpiHasAudio).
> **ALL OPEN ITEMS now live in `OPEN-ITEMS.md` (this task folder) — the consolidated
> register (built 2026-06-14). Read it FIRST for what's left; this doc + plan.md Plan
> Drift hold the detailed root-cause narrative.** Headline open: remote UNINSTALL
> (L6/G3, MPI-75 agent), remote VIDEO I2V (B1 input-asset transfer, unwritten),
> model-cache OOM (D1 --cache-lru 2, REBUILD), L1-L5 minor. A1 + B-T2V now DONE.
> See `OPEN-ITEMS.md` for the full categorized list.
> Prior: Step 5.1 wired: `podImageForCard` multi-image v0.3.0
> selection + sage-compile warmup + 1200s readiness timeout; TEMP-DEBUG removed.
> Prior: first remote-video session — ffmpeg-missing root cause, MPI-70 multi-image
> build, 5 UI/lifecycle bugs logged. Live-verify of v0.3.0 still pending tags).
> Verification status per area is marked inline. Branch: `RunPod` (uncommitted).

---

## 1. Topology (backend-proxy)

- The renderer talks **ComfyUI-shaped HTTP** to `/proxy/*` on `127.0.0.1:3000`
  (the Express backend), NOT directly to the Pod. Express attaches the wrapper
  token **server-side** and forwards to the RunPod HTTP proxy. The token never
  reaches renderer storage.
- One renderer-direct exception: `GET /remote/ws-token` returns the WSS base +
  token over loopback so the renderer opens the **binary-preview WebSocket**
  straight against the RunPod proxy.
- `routes/remoteProxy.js` MUST stay mounted **before** `routes/comfy.js` in
  `server.js` — the `/comfy/events/stream` SSE intercept falls through with
  `next()` when remote mode is inactive (local mode then byte-identical).
- The Pod runs a **Cubric Python/FastAPI wrapper** (`cubric-remote-wrapper/`,
  permanent home synced into private `mpi-ci/cubric-vision-pod/wrapper/`) that
  fronts ComfyUI, enforces token auth (HTTP + WS upgrade), and exposes
  Cubric-specific endpoints. ComfyUI is never publicly exposed.

### App-side route surface (`routes/remoteProxy.js`)
- Mode/status: `GET|POST /remote/mode`, `GET /remote/ws-token`,
  `GET /remote/comfy/status`.
- Lifecycle: `POST /remote/pod/create`, `/reconnect`, `/stop-active`,
  `/delete-active`, `/teardown`, `/cleanup-orphans`; `GET /remote/pod/specs`.
- ComfyUI forwarding: `POST /proxy/prompt`, `/interrupt`, `/queue`,
  `/upload/image`; `GET /proxy/view`, `/queue`.
- Companion routers: `routes/remoteEngine.js` (key resolver, wrapper-token
  gen/store/clear, `waitForWrapperReady`, `proxyUrl`), `routes/runpodRemote.js`
  (RunPod REST+GraphQL `client`), `routes/remoteModels.js` (model status/install
  forwarding), `routes/downloadManager.js` (remote download SSE bridge).

---

## 2. Pod lifecycle (CURRENT = create-on-Connect + STOP-on-quit, with delete-fallback)

The model evolved (Step 4.2 create/delete → **Step 4.3 stop-not-delete** →
Step 4.5 delete-on-quit option). Current behavior:

- **Connect** (Settings or boot): if a saved `podId` exists →
  `POST /remote/pod/reconnect` (warm resume); else `POST /remote/pod/create`
  (fresh on the picked GPU). Connect is gated on **both a GPU and a network
  volume** being selected.
- **Reconnect flow:** availability pre-check on the saved GPU → if gone, DELETE
  the stuck Pod + return `{unavailable}` ("pick another GPU"). Else `startPod`;
  on success warm-resume; on failure (host-pinned "not enough free GPUs on the
  host machine" / any non-already-running error) → DELETE + `createPod` fresh on
  the same GPU. A STOPPED Pod is **host-pinned** — it can only resume where its
  GPU is free; the delete+recreate fallback is the self-heal for that wall.
- **Quit teardown** (`POST /remote/pod/teardown`, called by `main.js`): branches
  on the user's **delete-on-quit** pref (see §3). OFF (default) = `stopPod`
  (EXITED, warm-resumable, no GPU bill); ON = delete every `cubric-vision` Pod.
- **Disconnect** (Settings): 3-button popup — **Terminate** (stop warm),
  **Delete Pod** (delete), **Cancel**. Independent of the quit checkbox.
  **Both `stop-active` and `delete-active` flip the backend `_mode.active = false`**
  (via `setRemoteMode({active:false})`, podId preserved) so `isRemoteActive()`
  returns false and local generation resumes correctly. WITHOUT this, a local
  `_ms` gen after Disconnect routed input-prep (`/comfy/prepare-workflow-inputs`,
  `/comfy/stage-preview-latent`) to the gone wrapper → "wrapper upload 404"
  (fixed + live-verified 2026-06-13).
- **Boot auto-reconnect:** persisted `wasConnected && podId && gpuType` →
  background reconnect with toasts, no Settings trip. **Skipped when
  delete-on-quit is set** (the deleted Pod can't resume; a stale podId is cleared
  so a manual Connect uses the create path with correct "creating…" copy).
- **Crash backstop:** the wrapper's **idle watchdog** self-stops the Pod after
  ~15 min without authenticated traffic. Enabled only when `RUNPOD_API_KEY` is
  in the Pod env (it is, per the v0.2.0+ create spec). This is the safety net for
  app crash/kill where `main.js` teardown can't run.

### Billing semantics (drives every lifecycle decision)
- **RUNNING** bills GPU per-second → never leave running across quit.
- **STOPPED (EXITED)** bills only volume + reserved container disk.
- **DELETED** bills only volume.
- Single-Pod invariant (see §4) prevents two RUNNING Pods billing at once.

---

## 3. "Delete Pod on quit" pref + state plumbing (Step 4.5)

- Non-secret pref `deleteOnQuit` lives in `state.runpodConfig` (default OFF;
  default + normalizer in `js/core/storage.js`, localStorage-mirrored via the
  state Proxy in `js/state.js`). Full config:
  `{ enabled, podId, datacenter, gpuType, volumeId, wasConnected, deleteOnQuit }`.
- Pushed to backend `_mode` via `POST /remote/mode` on **boot** (`js/shell.js
  _initRemoteBoot`) and on **checkbox toggle** (`MpiSettings.js`). `main.js`
  stays pref-agnostic — it just calls `/remote/pod/teardown` and the backend
  branches.
- Backend `_mode = { active, podId, deleteOnQuit }` is server-owned; the
  Settings/boot gate flips it.

---

## 4. Billing/race guardrails (Step 4.5, all live-verified)

- **Single-Pod invariant:** `_sweepOrphanPods(key, keepPodId)` deletes ANY
  non-keeper `cubric-vision` Pod **regardless of status** (EXITED *or* RUNNING).
  `_createPodInternal` sweeps **before and after** `createPod`. This prevents the
  double-billing leak (a Connect that created a Pod then failed its ready-poll
  left a RUNNING orphan; the next Connect created a second). Cubric is
  one-Pod-per-RunPod-account. `keepPodId=null` reaps everything; the tracked ids
  `_startedPodId`/`_mode.podId` are also spared unless explicitly cleared first.
- **Teardown delete-nothing fix:** `_sweepOrphanPods` always spares the tracked
  ids, so delete-on-quit must delete the **tracked Pod FIRST** (`_deleteTrackedPod`
  clears the ids) THEN sweep with an empty keep-set. (`main.js` teardown timeout
  is **30s** — a slow RunPod delete aborted at 8s and left the Pod running.)
- **`_starting` flag (connect race):** `_connecting` only covers the synchronous
  route window. `_starting` spans the **whole background boot/resume** — set when
  create/reconnect returns `{starting:true}`, cleared when `/health` reports ready
  or on any terminal stop/delete/teardown. `GET /remote/comfy/status` reports
  `connecting = _connecting || _starting`, so the Settings panel shows
  "connecting…" + **Connect disabled for the entire boot** (no
  pressable-mid-connect window → no duplicate-create).

---

## 5. Volume / data center rules

- Persistent state lives on a RunPod **network volume mounted at `/workspace`**
  (models + per-model custom nodes; see §6). One volume per data center; a volume
  is **locked to its DC**. Switching DC ⇒ delete + re-download.
- Connect attaches the selected volume to the new Pod. Volume create/list/delete
  is in Settings (`POST/DELETE /runpod/volumes`, `GET /runpod/volumes`).
- **Delete a volume only after deleting its attached Pod** — RunPod refuses to
  delete an attached volume even when the Pod is EXITED. Settings handles this:
  delete the tracked Pod first, then the volume.
- **Design A (locked):** PyTorch + ComfyUI live in the **Docker image**, NOT the
  volume → the volume has **zero GPU-arch binding** and is portable across every
  card the booted image can run. The user **never** reinitializes the volume to
  switch cards.
- **REAL compatibility axis (corrected 2026-06-12, live finding):** it is
  **image-CUDA-floor ≤ host-driver-provided-CUDA**, NOT card arch. The current
  image (`runpod/pytorch:2.8.0-cuda12.8.1`) bakes an `NVIDIA_REQUIRE_CUDA`
  label = `cuda>=12.8`; the `nvidia-container-cli` runtime hook checks it against
  the **HOST machine's driver** BEFORE the container (so before ComfyUI/torch).
  A host whose driver maxes below 12.8 refuses the container with
  `unsatisfied condition: cuda>=12.8, please update your driver`. Hit live on an
  **RTX 4090** in EUR-IS-1 (a 4090 runs 12.8 fine — the HOST driver was the
  blocker); an **L4** in the same DC worked. So the wall is host-driver baseline
  (DC-correlated), not card arch. **Decoupling torch does NOT fix it** — the
  rejection is the image's CUDA label, not the pip-installed torch. Levers
  (Step 5.1): a lower CUDA-floor image (cu124, broad host compat, no Blackwell),
  or `NVIDIA_DISABLE_REQUIRE=true` in the Pod env (starts on old-driver hosts +
  leans on forward-compat; may crash torch ops at execution), or two image
  profiles (cu124 default + cu128 Blackwell where new-driver hosts exist). The
  GPU picker must auto-filter cards whose host/DC can't meet the image CUDA floor
  (Step 5.2). Verified-running on the current cu128 image: **L4** (image ✅).

---

## 6. Pod image + custom-node split (Design B+)

- App selects the image tag **per card** in `routes/remoteProxy.js` via
  `podImageForCard(gpuTypeId)` (Step 5.1, wired 2026-06-12): `POD_IMAGE_BASE =
  ghcr.io/madponyinteractive/cubric-vision-pod`, `POD_IMAGE_VERSION = 'v0.3.0'`,
  Blackwell (sm_120: substring `5090`/`rtx pro 6000`/`b200`/`blackwell` on the
  gpuTypeId) → `-cu128`, everything else → `-cu124` (broad-compat default; unknown
  card also lands here). `WRAPPER_VERSION = '0.2.2'` (separate const, unchanged —
  wrapper.py untouched this build), `CONTAINER_DISK_GB = 50`. A POD_IMAGE bump
  still needs an **app restart** (the running process holds the consts in memory).
  Ground-truth live image check = RunPod console → Pod → Logs → **Container** tab
  `create container …:vX`.
- **Image CUDA floors (MPI-70 multi-image, v0.3.0):** `-cu128` base =
  `runpod/pytorch:2.8.0-cuda12.8.1` but torch **PINNED to stable 2.7.1+cu128**
  (base ships a nightly that broke flash-attn); Blackwell sm_120; host-driver
  floor `cuda>=12.8`. `-cu124` base = `pytorch/pytorch:2.6.0-cuda12.4`, torch
  pinned 2.6.0+cu124; Ampere/Ada/Hopper (NO Blackwell); host-driver floor
  `cuda>=12.4` — **lowers the floor, killing the 4090-on-old-driver refusal**
  (see §5). Both bake **ffmpeg + git**; **flash-attn DROPPED** (ABI-fragile +
  ~7% slower than SDPA for diffusion + ComfyUI bypasses it when sage is on).
  Accelerator stack = **sageattention compiled to the volume on first boot per
  GPU arch** (`/workspace/cubric/pylibs`, ~5-15 min one-time, arch-stamped
  sentinel → recompiles only on arch switch) **+ PyTorch SDPA always-present
  fallback**. Readiness gates on ComfyUI-up only, NEVER on sage (sage failure →
  SDPA, Pod still fine). App readiness-poll timeout raised **600s → 1200s** (both
  `_pollRemoteReady` in shell.js + `_pollEngineReady` in MpiSettings.js) so the
  one-time sage compile can't abort readiness; slow-message copy now names the
  one-time GPU-optimise step.
- **Custom-node lifecycle split:** the 7 **universal** `installOnEngine` node
  packs (MpiNodes, VideoHelperSuite, Impact-Pack, KJNodes, UltimateSDUpscale,
  Frame-Interpolation, Impact-Subpack) **bake into the image**. **Per-model**
  nodes (PainterI2V + future) install onto the **volume** via the wrapper at
  model-install time — so a new model NEVER forces an image rebuild (images only
  rebuild for ComfyUI/PyTorch/CUDA changes). ComfyUI loads both via
  `--extra-model-paths-config` (`start.sh` writes
  `/workspace/cubric/extra_model_paths.yaml`).
- `extra_model_paths.yaml` maps every model type (checkpoints/loras/vae/…) →
  `mpi_models/<type>`, mirroring the wrapper's `MODEL_SUBDIRS`, AND the volume
  `custom_nodes:` key. Without the model-dir mapping, a checkpoint the wrapper
  reports `installed:true` is invisible to ComfyUI's loader.
- Per-model node install reports `needs_comfy_restart` (ComfyUI scans
  `custom_nodes` only at boot) → the app warm-cycles the Pod.
- Image builds run via private **mpi-ci**: `gh workflow run
  cubric-vision-pod-image.yml -f manifest_version=X -f wrapper_version=X -f
  comfyui_ref=master -f push_latest=false`. A wrapper/start.sh/Dockerfile change
  ⇒ rebuild + POD_IMAGE bump + app restart + a fresh Pod.

---

## 7. Secret handling

- **No secret-bearing localStorage.** API key + wrapper token never touch
  project files, localStorage, logs, or bug reports.
- RunPod API key: stored via `main/secretsStore.js` (Electron `safeStorage`,
  OS-keychain-backed, with an AES-GCM file fallback + a one-time
  `weakEncryption` warning when no OS keyring). Renderer access is **write-only**
  through `js/core/secretsClient.js` (`secrets:*` IPC).
- Wrapper token: generated server-side per Pod (`generateWrapperToken`), stored
  keyed to `podId` (`setWrapperToken`/`getWrapperToken`/`clearWrapperToken`),
  attached as a Bearer header in-process by `/proxy/*`. A warm `startPod` keeps
  the same podId so the stored token still matches; a delete+create regenerates +
  re-stores the token keyed to the new podId.
- `routes/runpodRemote.js` `redactSecret` + `_safeFetch` scrub the key from any
  thrown error/URL before it can reach a log.
- **Never read/grep `cubric-remote-wrapper/.secrets/runpod.env`** (gitignored;
  holds CUBRIC_TOKEN, template id, volume id). **Never run autonomous Pod
  create/delete** — the classifier blocks both; the USER runs live Pod ops.

---

## 8. Billing / user responsibility

- RunPod billing, API key, and storage are **the user's**. GPU + storage charges
  land on their RunPod account. Community Cloud is **unsupported** (Secure Cloud
  only). Stopped Pods still bill storage; the app surfaces this in Settings copy.

---

## 9. Verification status

| Area | Status |
|---|---|
| Pod create-on-Connect / warm-resume / delete-fallback | ✅ live-verified |
| Stop-not-delete on quit (box OFF) | ✅ live-verified |
| Delete-on-quit (box ON) | ✅ live-verified |
| Single-Pod invariant (stray reaped live) | ✅ live-verified |
| Connect-disabled-through-boot (`_starting`) | ✅ live-verified |
| Remote IMAGE generation + project save | ✅ live-verified (v0.2.2 A4000 + L4) |
| Remote model install onto volume | ✅ live-verified (Wan 2.2 78GB onto L4 volume) |
| Orphan sweep / Disconnect 3-button / volume UX | ✅ live-verified |
| Manifest compatibility gate (Step 5) | ❌ not built |
| Remote INPUT-ASSET transfer (video/audio/.latent) | ⚠️ CODE SHIPPED (uncommitted), NOT live-verified — gated behind the ffmpeg fix (all video workflows end in VHS_VideoCombine → crash before a clean run) |
| Remote VIDEO generation (T2V/I2V/upscale/interpolate) | ❌ BLOCKED — image has no ffmpeg; VHS_VideoCombine ProcessLookupError on every video output. Pipeline otherwise PROVEN live (render, WS events, preview, progress). Fix = MPI-70 ffmpeg in v0.3.0 image |
| Image CUDA floor vs host driver | ⚠️ live wall (4090 refused on old-driver host, L4 ok). FIX: MPI-70 multi-image (cu124 default lowers floor + cu128 Blackwell). App wiring (Step 5.1) = `podImageForCard` DONE 2026-06-12 (uncommitted); ⚠️ NOT live-verified — gated on MPI-70 tags green + GHCR public |
| Remote model install: video model (Wan 2.2 78GB) | ✅ live-verified (installed to EU-RO-1 volume, survives Pod recreate) |
| Crash watchdog backstop (simulated kill) | ⚠️ designed, not explicitly verified |

---

## 10. Unresolved follow-ups

- **MPI-73 — remote connect-readiness gate + cancel a never-started queued job +
  connect/disconnect feedback + Cue-disable — ✅ DONE + USER-VERIFIED 2026-06-14
  (renderer-only, no rebuild; spun out to its own card, now `done`):**
  - **Bug 1 (premature "Connected" → STARTING hang):** wrapper-health `ready`
    only means ComfyUI is up, NOT that the binary-preview WS is open. Added a
    `_wsReady` flag + `isWsReady()` + `ensureWsConnected()` in `comfyController`;
    `onopen` sets ready, `onclose`/`_onWsDropped` clear it. `_ensureRemoteReady`
    refuses generation until the WS is open. Boot (`shell.js`) + Settings Connect
    gate "ready" on the real handshake. `ensureWsConnected` RETRIES across its
    window AND `await remoteEngineClient.refresh()` FIRST (boot bypasses
    `ensureServerRunning`, so without the refresh `wsUrl()` is null and `connect()`
    falls back to the LOCAL `ws://127.0.0.1:8188` → never opens remote → false
    "almost ready" + hero stuck offline).
  - **Bug 2 (Stop can't clear a STARTING/never-started CUE job):** a job that
    never got a `prompt_id` has an exec promise that never settles → interrupt is
    a no-op → the dispatcher's wrapped onCancel never frees the slot → queue
    stuck. `cancelRunningCueJob` now detects `!entry.promptId`, settles the CUE
    dispatch via extracted `_finishActiveCueDispatch({skipNext})`, and clears the
    pending queue (no re-promote into another hang). PromptBox Stop in
    gallery/groupHistory routes queue-managed targets through `cancelRunningCueJob`.
  - **Connect/disconnect feedback:** `remote:connection` gained a `phase`
    (`connecting`|`disconnecting`|null). Hero (`heroStats.js`) shows
    `connecting · offline` / `disconnecting · online` with NO GPU card mid-
    transition; status bar (`statusBar.js`) shows `IDLE · Connecting` /
    `IDLE · Disconnecting`. shell.js centralizes emits via `_emitRemoteConnection`
    + `_setRemotePhase` (folds phase into feed ticks so the feed never strips it;
    mirrors into `state.remoteEnginePhase`). `_renderGpu` skips painting the local
    GPU line while a phase is active (the late `/system/gpu-info` fetch was
    re-painting over the cleared card at boot).
  - **Cue-disable during transition:** `state.remoteEnginePhase` (new state key)
    is read by MpiPromptBox at mount (race-free for a PromptBox mounted mid-
    transition) + on `state:changed` → disables the Cue button, the hold-to-loop
    gesture, and the run hotkey. `comfyController.ensureServerRunning` has a
    backstop refusal (plain `ui:info` toast, NOT the bug-reporter modal).
  - **Models hero stat re-sync:** boot's `syncModelInstalled()` ran pre-connect →
    stale `N / N`; now re-runs on the `remote:connection` connected edge.
  - RESIDUAL (accepted, own follow-up if it bites): ~30s between the Pod actually
    being ready and the app showing connected (wrapper-health poll cadence + WS
    handshake stacking). Bug 2's no-promptId Stop verified by trace, not a live
    repro (the Cue-disable now largely prevents reaching that UI state).
  - Files: `comfyController.js`, `shell.js`, `state.js`, `heroStats.js`,
    `statusBar.js`, `MpiSettings.js`, `MpiPromptBox.js`, `generationService.js`,
    `MpiGalleryBlock.js`, `MpiGroupHistoryBlock.js`.
- **Bug 2 — in-place Finish leaves the GALLERY card stale (poster swaps but
  hover `<video>` won't play) — ✅ FIXED + USER-VERIFIED 2026-06-14 (app-side, no
  rebuild):** the gallery card's hover `<video>` is promoted lazily by the grid
  IntersectionObserver only on scroll-into-view (`_promoteVideo`); an in-place
  "Complete this preview" replaces the entry on an already-in-view card → the
  observer never re-fires → `refreshGroup→_render` swaps the poster but never
  promotes the video. FIX: `cardEl.refreshGroup` now calls `_promoteVideo()`
  after `_render()` (idempotent self-guard). ALSO bridged the open GroupHistory
  VIEWER (separate latent gap, NOT the user's bug): it now reloads on
  `gallery:item-updated` for the viewed group, since an in-place finish is
  scope:'gallery' and its `generation:complete` isn't in the viewer's `_myGenIds`.
  Files: `MpiGalleryGrid.js`, `MpiGroupHistoryBlock.js`. Committed.
- **Remote preview-latent materialization — ✅ FIXED + LIVE-VERIFIED 2026-06-13
  (app-side, no rebuild):** multi-stage "Create-from / Continue" failed remotely
  (`preview latent materialization failed`) because `routes/projects.js
  materializePreviewAssets` resolved the stage1 SaveLatent via a LOCAL engine
  path + `fs.move` — the latent lives on the Pod in remote mode. Now: new
  `buildViewUrlFromBase()` derives a `/view` URL from the comfyViewUrl base (the
  authed local proxy in remote mode) and `streamDownload`s the latent when the
  local source is absent; local path unchanged. Verified live on an RTX 4000 Ada
  + RTX PRO 6000 — remote Create-From produces a clean new card. Committed.
- **Bug B — INTERMITTENT Create-From double-card / preview-consumed (OPEN, could
  not repro 2026-06-13):** a fresh Generate (preview toggle ON) SOMETIMES saved a
  finished card duplicating the prior result + cleared the preview card's
  badge/buttons, instead of one clean new card. Gen-config is CORRECT (debug:
  isStage2=true, previewOnly=false, replaceItemId=null, urls=1) → it is a GALLERY
  RENDER/PLACEHOLDER RACE, NOT deterministic. Many clean Create-From runs
  captured this session (healthy baseline: createFrom-dispatch → gen-started(692)
  replaceItemId=null → gen-started(1160) placeholders=1 → ms-run isStage2=true
  latents=0 urls=1 → rebuildAfterEnd groups+1, preview card intact). REPRO
  HYPOTHESES (unconfirmed): clean first-action after restart; OR a SLOW (high
  quality) gen opening a timing window (all fast/low-q runs passed). TEMP-DEBUG
  instrumentation LEFT IN, gated OFF behind `localStorage.MPI_DEBUG_BUGB='1'`
  (generationService.js exec.onComplete + 5 points in MpiGalleryBlock.js) — flip
  on when hunting; remove when fixed. Diff a broken sequence vs the healthy
  baseline to pin (watch for a 2nd rebuildAfterEnd, an item-updated on the PREVIEW
  group, or a non-null replaceItemId on gen-started(692)).
- **Reuse-prompt broken — ✅ FIXED + USER-VERIFIED 2026-06-14 (app-side, no
  rebuild):** on a VIDEO item, Reuse Prompt restored wrong settings + fired a
  false "Media type not supported" toast even when reuse carried NO images. ROOT
  CAUSE (not a stale flag): the handler derived the operation from transient
  PromptBox media-state (`setModel`→`_pickOpForModel` reads current
  imageCount/videoCount) instead of `payload.operation`, and in the wrong order
  (model→images→settings) — so `_acceptsMediaType` (pure per-op
  requiresImages/requiresVideo) was checked against the WRONG op → false toast +
  dropped frames + wrong-op controls. The saved `generationSettings` and the
  `applyPromptReuseSettings` write-key were always correct (data was never the
  bug). FIX (general, future-proof): made `payload.operation` AUTHORITATIVE —
  `setOperation(targetOperation)` BEFORE media inject + settings in BOTH handlers
  (`MpiGalleryBlock`, `MpiGroupHistoryBlock`); replaced the hardcoded `_isI2V` in
  `promptReuse.js` with op-driven `_opAcceptsImageInput` (`getCommandMediaInputs`)
  gating all preview-asset resurfacing — works for any current/future no-image op
  (t2v/t2i/…) with no model-type assumption. Files: `js/utils/promptReuse.js`,
  `MpiGalleryBlock.js`, `MpiGroupHistoryBlock.js`. NOT committed. See plan.md
  Plan Drift 2026-06-14.
- **Multi-stage video on Blackwell (RTX PRO 6000, cu128) — WORKS:** cu128 image
  connected on a CUDA-13.0 host (driver 580.159.04); stage1 preview + Create-from
  stage2 + T2V/I2V all generated. Confirms the cu128 Blackwell path end-to-end.
- **Remote UNINSTALL — GUARDED app-side 2026-06-13, real delete DEFERRED to a
  wrapper rebuild:** `routes/downloadManager.js` `/comfy/models/uninstall` had no
  `isRemoteActive()` branch (install does) → in remote mode it TRASHED the user's
  LOCAL `D:\CubricModels\*` files and never touched the Pod volume → UI desynced
  (volume re-check still installed → Refresh useless, project still generatable).
  FIX: uninstall now branches on `isRemoteActive()` BEFORE the local trash path,
  routes deletion to NEW `remoteModels.remoteUninstallDep` →
  `POST /wrapper/models/delete`; the wrapper has no such endpoint yet (only
  status/install/cancel) → 404/501 returns `{success:false,
  remoteUnsupported:'uninstall'}`, the route trashes NOTHING and emits no false
  `download:uninstalled`; `downloadService.uninstall()` toasts "Remote Uninstall
  Unavailable" (LIVE-VERIFIED 2026-06-13: modal showed, NO local files trashed).
  **WRAPPER ENDPOINT NOW WRITTEN, AWAITING REBUILD:** `POST /wrapper/models/delete`
  is implemented in `mpi-ci/cubric-vision-pod/wrapper/wrapper.py` (deletes a dep's
  file/`.part`, or custom_nodes folder, by type+filename; same `_model_dest`/
  `_node_dest` path guards as install; manifest bookkeeping) but is NOT in any
  pushed image yet — it takes effect only after a rebuild + redeploy. Live-patch
  test was REJECTED (start.sh `wait -n` trap: killing uvicorn tears the whole Pod
  down, not worth the risk on a billed Pod). **At the next rebuild: bump
  `wrapper_version` 0.2.2 → 0.2.3 (mpi-ci build arg) AND `WRAPPER_VERSION` in
  `routes/remoteProxy.js` to match.** Documented in the mpi-ci Pod README
  "⚠ Pending for the NEXT image rebuild" section. Until the rebuild ships, remote
  uninstall stays a clear no-op toast (not a local-data-loss footgun).
- **Wan UNet dep url↔filename CROSS — FIXED app-side 2026-06-13 (no rebuild,
  AWAITING user re-download + re-test):** `js/data/modelConstants/dependencies.js`
  had the 4 Wan UNet deps' `url`+`sha256` crossed against their `filename`.
  `wan-22-i2v-high/low` wrote files named `Wan_22_i2v_*.safetensors` (what the i2v
  workflow hardcodes at nodes 95/96) but fetched from the `Wan_22_t2v_*` URLs →
  the i2v files held **T2V weights** (16-channel patch_embedding, no image-cond
  channels) → remote I2V ignored the input subject. Proof: range-fetched
  safetensors headers — i2v file = `patch_embedding [5120,36,…]` (36ch I2V), t2v =
  `[5120,16,…]` (16ch T2V); HF files are correctly named, only the app's url/sha
  were swapped. Local worked because its volume held correctly-downloaded i2v
  files from earlier; remote was freshly pulled this session via the crossed URL.
  Also explains B3 horrible-T2V + some L4 OOMs (t2v workflow loaded the heavier
  36ch i2v weights). FIX: swapped url+sha+size so each filename pairs its own real
  HF file (sha = HF `X-Linked-ETag`, per-file verified). **Verify (USER): delete
  the 4 `Wan_22_*` files on the remote volume (or uninstall) → reinstall Wan 2.2
  I2V + T2V → remote I2V respects the subject + T2V quality improves.** NOT
  committed.
- **Step 5 — manifest compatibility gate:** read `GET /wrapper/manifest` at
  readiness; gate an incompatible profile with a modal. **Real axis = image
  CUDA floor vs host-driver-provided CUDA** (NOT card arch — see §5). Step 5.1
  (CUDA-floor image strategy = cu124 default + cu128 Blackwell) is SHIPPED.
- **Step 5.2 — GPU-picker CUDA filter: DROPPED 2026-06-13 (superseded, no code).**
  Original intent: auto-filter/warn cards whose host can't meet the image CUDA
  floor. Now moot: (a) cu124-default (floor 12.4) eliminated the broad refusal
  class — every non-Blackwell card runs it; (b) the only residual refusal is a
  Blackwell card → cu128 (floor 12.8) on a host with driver <12.8, which is rare
  (Blackwell hosts ship new drivers) AND not pre-filterable (host-driver CUDA is
  NOT in the RunPod GPU catalog — only `gpuTypes`/`lowestPrice` fields, no host
  driver); (c) if it ever refuses, it surfaces at connect as the
  `nvidia-container-cli` error → the reconnect/recreate flow + message handle it.
  An advisory "needs CUDA 12.8 host" badge was considered and REJECTED (user):
  it would scare users for a near-zero risk. Prevention is already done by
  cu124-default; connect-time handling covers the tail. NO picker filter/badge.
- **cu130 Blackwell profile (FUTURE, rebuild — MPI-75 candidate):** cu128 was the
  newest PROVEN base+torch+sage combo at MPI-70 build time (cu130 base/torch
  wheels/sage compile were unvalidated then), NOT a deliberate floor. cu130 is
  the speed-win direction for Blackwell (logged in the strategic notes: images
  are a LIVING set, track the cu130 migration). Trades broader-host-compat for
  speed (higher host-driver floor) — fine for Blackwell (new-driver hosts), bad
  as a default. Bump the cu128 profile to cu130 when the stack is proven.
- **GPU picker: show CONTAINER/SYSTEM RAM — ✅ SHIPPED 2026-06-13 (app-side, no
  rebuild):** `runpodRemote.js` gpuTypes query adds `lowestPrice { minMemory
  minVcpu }` (RAM is NOT a GpuType field — it rides the cheapest offering; this
  is the conservative FLOOR), flattened to top-level `minMemory`. MpiSettings GPU
  meta is now `STOCK · NNGB VRAM · NNGB RAM[⚠ video if <64] · $X/hr`. No hard
  block (image gen fine on low RAM). Live-verified in the picker. ORIGINAL NOTE +
  REQUIREMENT (kept): the picker shows VRAM + $/hr +
  stock but NOT container/system RAM, which is the REAL wall for Wan video
  (B2/B3: video gen is container-RAM-bound, not VRAM-bound). CONFIRMED LIVE
  2026-06-13: a Pod with **16GB VRAM but only 31GB RAM** OOM'd a Wan I2V mid-gen
  (B4 fired cleanly: `_onWsDropped` → OOM modal, no backend crash, RAM hit the
  cap). So VRAM headroom does NOT save a low-RAM Pod. The requirement for Wan
  video is **≥64GB system RAM AND ≥12GB VRAM** (not VRAM alone). Add RAM to the
  GPU option meta (RunPod GraphQL `gpuTypes` exposes a RAM field — verify exact
  name live, like `securePrice` was) and warn/sort when a card's RAM is below the
  Wan threshold. The model card UI should ALSO state "64GB RAM" alongside the
  existing "12GB VRAM" for Wan models. Pairs with the Step 5.2 picker work (same
  meta surface). **Verify:** each GPU option shows container RAM next to VRAM; a
  low-RAM card is visibly flagged for video; Wan model cards list the RAM need.
- **Remote input-asset transfer — CODE SHIPPED 2026-06-12 (uncommitted, NOT yet
  live-verified):** video/audio renderer seam = `comfyController._uploadRemoteMedia`
  → `POST /remote/upload/media` (remoteProxy) → `remoteModels.remoteUploadInput`
  → `/wrapper/upload/media`; latent staging + prepare-workflow-inputs =
  remote branch in `routes/comfy.js` → `remoteUploadInput` → `/wrapper/upload/latent`;
  trimmed-video trims locally (unchanged) then flows through the media seam.
  All land in `/workspace/comfyui/input/` (= ComfyUI `--input-directory`), bare
  basename injected. Awaiting a live video-input run to verify.
- **ffmpeg in the Pod image (MPI-70, in flight):** the v0.2.2 image has NO ffmpeg
  → every video output crashes at `VHS_VideoCombine` (`ProcessLookupError: ffmpeg
  is required`). Caught live 2026-06-12. Fix is in the v0.3.0 multi-image build
  (`apt-get install ffmpeg`). ALL video gen is blocked until v0.3.0 ships + the app
  is pointed at it (Step 5.1). Build #2 running at handoff time.
- **`execution_error` WS event — HANDLED 2026-06-13 (B0, app-side, no rebuild,
  NOT yet live-verified):** an in-process node failure (missing node, a node
  raising, a torch-caught CUDA OOM) sends `execution_error` over the WS, then an
  `executing node===null`. Previously unhandled → resolved with empty outputs →
  generic "no output returned". FIX: `comfyController.runWorkflow`'s
  `internalListener` now handles `execution_error` → cleans listeners/rejectors
  and `reject`s with `"<node_type> failed: <exception_type>: <exception_message>"`
  → commandExecutor's existing catch surfaces a `ui:error` toast + ends the gen
  (no empty `onComplete`). Mode-agnostic (helps local). LIMIT: a container
  OOM-kill (exit 137) kills the process before this event sends — that is the
  B4 WS-drop path, not B0.
- **Remote stream pipes MUST guard `'error'` (crash fix, LIVE-VERIFIED
  2026-06-13):** `routes/remoteProxy.js` `_streamthrough` (`/view`) and the SSE
  relay (`/comfy/events/stream`) pipe a `Readable.fromWeb(upstream.body)` to the
  response. When the Pod OOMs/restarts mid-gen the upstream RunPod-proxy socket
  drops; the Readable emits `'error'`. Without a handler this is an UNCAUGHT
  exception that kills the whole Express backend (exit 1) — observed live taking
  the backend down, freezing the in-flight gen, and dropping the app to
  `LOCAL · OFFLINE`. BOTH pipe sites now have `nodeStream.on('error')` (log + end
  the response, never rethrow) + `res.on('error')` (destroy the stream). Any new
  streaming proxy added here MUST do the same. (The manual-reader SSE in
  `remoteModels.js` is already try/catch-guarded.)
- **B4 part 1+3 — out-of-band engine-drop recovery LIVE-VERIFIED 2026-06-13
  (app-side, no rebuild):** A remote container OOM-kill (exit 137) drops
  the WS before any `execution_error` event and the process is gone, so neither
  the existing reconnect loop nor a B0 fix catch it. Two protections shipped:
  (1) `comfyController` WS `onclose` now caps reconnect retries
  (`_WS_MAX_RECONNECTS=6`, ~6s) — a sustained drop trips `_onWsDropped()`, which
  rejects every pending generation via a new `_promptRejectors` map (mirrors
  `_promptListeners`). The rejection flows through the existing
  `commandExecutor` catch → `ui:error` toast + `generationService` onError →
  `activeGenerations.end()`, so the stuck "running" generation ends cleanly with
  an OOM-aware message instead of hanging forever. `onopen` resets the retry
  counter. Also emits `remote:engine-dropped` (no subscriber yet — reserved for
  B4 part 2/4 re-hydrate). LIVE-VERIFIED: an I2V→T2V OOM tripped the
  WS-reconnect cap → `_onWsDropped` (console stack confirmed) → "Generation
  failed" modal with the OOM-aware message; status stayed `IDLE · REMOTE` (no
  fall to LOCAL); backend survived (the crash fix above held — a clean 502 on
  the SSE relay, no exit-1). (2) `shell.js _initRemoteConnectionFeed` replaced the
  fixed `setInterval(tick,5000)` with a self-scheduling loop + abortable status
  fetch (4s timeout) + exponential backoff (5s→30s while down, snap to 5s on
  recovery) — kills the 6000+ runaway-request pile-up that came from slow status
  fetches overlapping a fixed interval against a dead proxy. **STILL DEFERRED
  (B4 part 2/4):** re-hydrate the project/model panels + connection feed on
  reconnect WITHOUT an app restart, and stop painting the LOCAL hero/empty
  panels on an out-of-band drop. **Verify:** force a container OOM on a heavy
  video gen → the app shows an "engine disconnected / out of memory" toast,
  the spinner ends, and request volume stays flat (no pile-up), instead of a
  silent dead WS + runaway polling.
- **MPI-70 multi-image (v0.3.0) — APP WIRING DONE 2026-06-12 (Step 5.1,
  uncommitted, NOT live-verified):** two tags `:v0.3.0-cu124` (base
  `pytorch/pytorch:2.6.0-cuda12.4`, torch 2.6.0+cu124, broad host compat, no
  Blackwell) + `:v0.3.0-cu128` (base `runpod/pytorch:2.8.0-cuda12.8.1` but torch
  PINNED to stable **2.7.1+cu128** — base ships a nightly that broke flash-attn;
  still Blackwell sm_120). Both add ffmpeg + git; **flash-attn DROPPED** (D2
  revised: ABI-fragile + ~7% slower than SDPA for diffusion + bypassed when sage
  active) → accelerator = **sageattention (runtime-to-volume first boot per arch,
  ~5-15min one-time) + SDPA fallback**. App side DONE: `podImageForCard(gpuTypeId)`
  replaces the old `POD_IMAGE` const (remoteProxy.js, the ONLY app image
  reference; Blackwell→-cu128, else→-cu124); `WRAPPER_VERSION` stays 0.2.2;
  readiness-poll timeout raised 600s→1200s + warmup copy names the one-time
  GPU-optimise step (both poll seams). **REMAINING: live-verify on a fresh
  v0.3.0 Pod (gated on MPI-70 tags green + GHCR public — build #3 was in flight
  at wiring time).** TEMP-DEBUG logging removed from commandExecutor.js (done).
- **Remote video generation** (multi-stage) — first exercises the UNTESTED
  per-model PainterI2V node install-to-volume path (needs a Pod warm-cycle).
- **Fresh-volume init + bundle versioning** — Pod-side wrapper init script writes
  `/workspace` layout + first manifest; refuse a stale bundle.
- First-Connect-on-a-fresh-image-tag is slow (~3-5 min/~3GB cold image pull,
  one-time per host per tag) — handled by `{starting}` + renderer polling +
  "downloading engine" messaging; the original 504 is killed.
- `docs/releases/UNRELEASED.md` (`mpi_comfy_url` removal) folds at the next
  `/mpi-version-bump`.

---

## 11. Maintenance contract (per Codex 2026-06-12)

- Every MPI-64 session **updates this snapshot** when the design changes —
  immediately, in the same session. Plan Drift gets only a one-line pointer.
- At the FINAL `mpi-end-session` (when MPI-64 is complete + validated), promote
  the validated architecture from here into durable **docs** (`docs/PROJECT.md`,
  a RunPod subsystem doc, `docs/comfy.md` touchpoints), **rules**
  (`.claude/rules/` — likely a `comfy_engine.md`/new `remote_engine.md` section),
  and **project memory**. Do NOT promote piecemeal mid-feature; this file is the
  staging ground until then.
