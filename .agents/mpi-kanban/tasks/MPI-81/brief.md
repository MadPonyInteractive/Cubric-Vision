# MPI-81 Brief — Next Pod-image rebuild batch

Carries over the **decision-pending** rebuild candidates from MPI-75 (closed 2026-06-14 after the v0.4.0 / wrapper-0.2.3 image shipped). Same rule as MPI-75: batch these so the slow image build runs once. **KEEP UPDATING this card as more rebuild-needing changes accumulate.** Each candidate needs a DECISION + a controlled test BEFORE building.

Reminder: never autonomous live Pod builds/ops — USER runs them; commit+push mpi-ci main BEFORE `gh workflow run` (dispatch builds the pushed ref). cu124 builds in CI; cu128 builds locally on the Windows Docker box (runner disk ceiling). Rebuild steps live in mpi-ci `cubric-vision-pod/README.md`.

## Candidates (DECISION PENDING — do NOT build until decided + tested)

1. **model-cache STACKING fix** — ComfyUI keeps every loaded model in RAM (no `--cache-*` flag set anywhere); switching model-type never evicts → stacks → OOM on RAM-limited Pods (CONFIRMED live: I2V completed at 46GB RAM, then switching to T2V OOM'd at 99%; T2V worked alone after RAM cleared; RAM stayed ~92% resident after finishing = the cache holding it. RE-CONFIRMED 2026-06-14: after a T2V gen COMPLETED and GPU/CPU dropped to ~0, container RAM stayed pinned ~60% / ~35GiB = the loaded T2V UNet pair held resident). TENTATIVE FIX: add ComfyUI `--cache-lru 2` to Pod start.sh (keep 2 most-recent models = Wan high+low pair; `--cache-none` is OUT, breaks 1000+ sampler workflows). Needs a controlled test before building (does it evict the old pair on switch? keep the Wan high+low pair within one multi-stage gen? hurt the 1k-sampler case?).
2. **wrapper `/wrapper/free` endpoint + remoteProxy `/proxy/free`** so the existing memory-monitor Release-VRAM / Ctrl-click Release-RAM (memoryOps.js → /comfy/unload, currently LOCAL-ONLY) works in remote mode; pairs with an optional app-side auto-free-on-model-switch. Also investigate why deep Release-RAM under-frees even locally (cache flag may fix it). See MPI-64 Plan Drift 2026-06-13 'model-cache STACKING OOM' + OPEN-ITEMS D1/D2.
3. **FUTURE — bump the cu128 Blackwell image profile to cu130** (speed wins on Blackwell). cu128 was the newest PROVEN base+torch+sage combo at MPI-70 build, not a deliberate floor; do this when the cu130 base + torch wheels + sageattention compile are validated. Higher host-driver floor (fine for Blackwell new-driver hosts). No urgency. Most Blackwell cards run new drivers.

4. **🔴 PRE-BAKE UNBAKED MODEL WEIGHTS into the image (HIGHEST PRIORITY — blocks remote feature parity).** Confirmed live on Pods 2026-06-14/15 (MPI-64 B4 + M1): the Dockerfile bakes the node CODE (clones the custom_nodes + runs `install.py` for python deps) but several nodes download their model WEIGHTS LAZILY at first execution from HuggingFace — which never happens on the Pod → the node fails at execution → `POST /proxy/prompt 503`. Until baked, these remote features are BROKEN (hard 503): interpolate, upscale, auto-mask + any masked image op. The build flow is correct; the gap is purely the runtime weight fetch. FIX: add a Dockerfile BUILD-time pre-download step for each weight into its ComfyUI models dir (no runtime HF fetch). EXACT FILES + TARGET DIRS (all confirmed from the workflow JSON + live 503s):
   - **RIFE (interpolate)** — `rife47.pth` → `/opt/ComfyUI/custom_nodes/comfyui-frame-interpolation/ckpts/` (RIFE VFI node, `video_interpolate.json`).
   - **Auto-mask detector** — `bbox/face_yolov8n.pt` → `/opt/ComfyUI/models/ultralytics/bbox/` (UltralyticsDetectorProvider, `img_auto_mask.json`).
   - **Auto-mask SAM** — `sam_vit_b_01ec64.pth` → `/opt/ComfyUI/models/sams/` (SAMLoader, `img_auto_mask.json`).
   - **Upscale models** (`installOnEngine`, also not in the image's `upscale_models` dir) — `4x-NMKD-Siax` + `4x-AnimeSharp` `.pth` → `/opt/ComfyUI/models/upscale_models/` (video_upscale / image_upscale).
   - **AUDIT the other baked node packs for the same lazy pattern** before building: Impact-Pack/Subpack (more yolo/SAM variants), KJNodes, UltimateSDUpscale — bake any weight a node fetches on first use.
   Source of truth for the static list: the workflow JSON in `comfy_workflows/` + `dependencies.js` `installOnEngine` entries (the app already KNOWS every weight that must ship with the engine — no live-503 discovery needed). MPI-64 OPEN-ITEMS §B4 has the full narrative.
   COMPANION app-side fix (separate, already partly shipped in MPI-64): surface the `/proxy/prompt` 503 BODY (`detail.comfy_body`) in log+UI so any FUTURE unbaked weight self-diagnoses — shipped in comfyController.js this session (commit 31eb419), so a missing weight now names itself.

5. **Model-install progress honesty (MPI-95) — ✅ WRAPPER CODE ALREADY WRITTEN, awaiting THIS rebuild.** Remote install bar jumped to ~80% then crawled, and HUNG at 99.9% at the end. Both causes are wrapper-side; the fix is ALREADY committed to `wrapper/wrapper.py` (`_run_install`) — this batch just needs to BUILD it. The matching APP half is also already written + committed on RunPod, so build alone lands it (no extra app work, no second rebuild). **The wrapper↔app contract is FROZEN — do not change event names/shapes at build time:**
   - **`models:install-verifying` SSE** — emitted right before `_sha256_file`. Shape: `{"type":"models:install-verifying","data":{"id","filename","bytes","total"}}` with `bytes==total`. App `_onRemoteInstallEvent` maps it → `download:progress {indeterminate:true, phase:'verifying'}` → card shows "Verifying…". Kills the 99.9% hang. A client that ignores it still sees 100% (no regression).
   - **`_resolve_total(url)` HEAD pre-seed** — new helper; `_run_install` seeds `rec["total"]` from it when the app sends no `size_bytes` (it never does — exact-size mismatch guard). Reads HF `x-linked-size` (302) or content-length (200). So every dep reports a REAL total from its FIRST `models:install-progress` tick → the aggregate bar stops overshooting to ~80%. Runs Pod-side (fat NIC), faster than the old app-side HEAD which was REMOVED.
   - **APP side (committed on RunPod, backward-compatible):** on the OLD image (no verifying event, total still 0) the app behaves as today; on the NEW image both fixes light up. So shipping the app early is safe.
   Verified pre-build: `python -m py_compile wrapper/wrapper.py` OK; app `node -c` + eslint clean; local download path provably untouched (no `indeterminate`/`phase` on the local code path). At rebuild: bump `WRAPPER_VERSION` (next after 0.2.3) in BOTH mpi-ci build arg and Cubric-Vision `routes/remoteProxy.js`. See MPI-95 brief for the full trace.

---

## v0.4.1 SHIPPED 2026-06-15 — candidates #1, #4, #5 + MPI-88 are LIVE (do not re-build).
Built + pushed + public: `v0.4.1-cu124` (CI), `v0.4.1-cpu` (CI), `v0.4.1-cu128` (local). wrapper `0.2.4`, app refs bumped (`routes/remoteProxy.js`). #1 `--cache-lru 2` confirmed in live cmdline. #4 weights all sha-OK + present in image. #5 MPI-95 progress: app aggregation was buggy too → fixed app-side post-build (commit `dc27f33`, NO rebuild) — user-accepted ("fine as it is"; the residual ~80% snap on press is an aria2c `-x16` preallocation artifact, NOT app math, see [[project_remote_install_progress_truth]]). #2 `/wrapper/free` + #3 cu130 still deferred (#3 cu130 re-flagged worth-doing after live CUDA-13 host driver seen on L4 — speed wins, but needs cu130 base+torch+sage validated; no urgency).

## NEXT BUILD CANDIDATES (post-v0.4.1)

> **STATUS: candidate #6 CODE WRITTEN + LOCALLY VALIDATED 2026-06-15 — awaiting the v0.4.2 build.**
> All code committed (mpi-ci `wrapper.py`+`start.sh`+README; app `routes/remoteProxy.js`+`js/services/comfyController.js`). Local validation: `py_compile` OK, `bash -n` OK, `node -c`+eslint clean, wrapper smoke-boot OK (`/health` up; `/wrapper/restart-comfy` token-guarded + 409 in download mode; ComfyManager builds the byte-identical ComfyUI arg list incl. `--cache-lru 2`, sage gate correct, inert in download mode). Bump to **`v0.4.2` / wrapper `0.2.5`** (app refs done). Build all 3 (cu124+cpu CI, cu128 local) then USER live-verifies: install I2V → gen → engine auto-restarts (toast, NO error/GitHub dialog, NO Settings trip) → gen runs. UNTESTABLE locally: the real subprocess spawn/supervise/restart on a live Pod (needs GPU+ComfyUI).

6. **🔴 `/wrapper/restart-comfy` endpoint — restart ONLY the ComfyUI subprocess on the Pod (no Pod reboot).** Confirmed live 2026-06-15 (L4 Pod): installing a per-model custom_node (e.g. Wan I2V's `PainterI2VAdvanced`) lands it on the volume + sets `state.comfyNeedsRestart`, but ComfyUI only scans `custom_nodes` at PROCESS START, so the running ComfyUI never loads it. Today the REMOTE branch (`js/services/comfyController.js:300`) PUNTS to the user with a **"Generation failed" error dialog + "Report on GitHub" button** telling them to Settings → Disconnect → Connect. WRONG UX (invites bogus GitHub issues for a non-bug; makes the user leave the gallery). The LOCAL branch already auto stop/starts ComfyUI (comfyController.js:194-228) — only remote lacks the mechanism. **Tested live which RunPod op reloads ComfyUI:** RunPod console "Restart Pod" = NO-OP (uptime unchanged, node still not loaded). "Reset Pod" = wipes container (too heavy). **"Stop → Start" = the ONLY thing that works** (uptime→0, container re-execs start.sh, ComfyUI relaunches + rescans → node loads; volume persists) — BUT it's a full GPU reboot (tens of seconds + cold-start re-bill) AND the manual cycle dropped the app to LOCAL·OFFLINE while the Pod kept billing (see the desync bug below). **DECISION (user, 2026-06-15): rebuild with a proper wrapper restart-ComfyUI endpoint** (~15s, no GPU reboot, no local detour, no desync). **ARCHITECTURE (REQUIRED — naive kill = container death):** today `start.sh` launches ComfyUI as ITS OWN child (`$COMFY_PID`) and line ~132 `wait -n "$COMFY_PID" "$WRAPPER_PID"` brings the WHOLE container down if ComfyUI dies (half-up-Pod guard). So `/wrapper/restart-comfy` cannot just kill ComfyUI. **DECISION (user): WRAPPER OWNS + SUPERVISES ComfyUI** — move the ComfyUI launch OUT of `start.sh` INTO `wrapper.py` as a managed `subprocess` (the wrapper already imports `subprocess` + manages installs); `start.sh` then only launches the wrapper; `/wrapper/restart-comfy` kills + relaunches the wrapper's own child cleanly (re-using the existing ComfyUI arg list incl. `--cache-lru 2` + sage gate). Wrapper must preserve: token guard, the COMFY_PID death→container-down semantics (now: wrapper exit if ComfyUI won't come back), `--preview-method taesd`, `--input-directory`, `--output-directory`, `--extra-model-paths-config`, sage `--use-sage-attention` gate. **APP side (pairs, no rebuild blocker):** `comfyController.js:300` remote branch — replace the error+GitHub dialog with: call `/proxy/restart-comfy` → toast "Loading new nodes — restarting engine…" (downgrade per MPI-94 G1) → wait `/health` ready + WS → auto-retry the queued gen → clear `comfyNeedsRestart`. Bump `WRAPPER_VERSION` (next after 0.2.4) + image tag (next after v0.4.1). This is a wrapper+image change = MPI-81 domain; **fold into the NEXT image build (not a separate one).**

## New image — `-cpu` (no-GPU download mode, MPI-88) — SELF-CONTAINED, do NOT touch here

MPI-88 added a THIRD image profile: **`ghcr.io/madponyinteractive/cubric-vision-pod:v<ver>-cpu`** — a SLIM
wrapper-only image (no torch, no ComfyUI) for the no-GPU "download mode" Pod (install models to the volume
with no GPU bill). It has its own `cubric-vision-pod/Dockerfile.cpu` + `start-cpu.sh` entrypoint, and a new
`cpu` row in the CI matrix (`cubric-vision-pod-image.yml`). It is NOT a rebuild candidate for this batch and
needs NO decision/test here — it's owned by MPI-88. Listed only so the batch doesn't accidentally "fix" or
remove it. It builds in CI (tiny) alongside cu124.

⚠️ **Cross-impact on the GPU images:** MPI-88 also edited the SHARED `wrapper/wrapper.py` (`/health` now
branches on `CUBRIC_DOWNLOAD_MODE`; on a GPU Pod the flag is unset → behaviour unchanged, plus a new
`download_mode:false` field in the payload). So whenever the cu124/cu128 GPU images next rebuild from this
batch, they pick up the updated wrapper.py automatically — no action needed, just be aware the wrapper source
moved since v0.4.0/0.2.3.

## At rebuild

Bump `wrapper_version` — mpi-ci build arg AND `WRAPPER_VERSION` in Cubric-Vision `routes/remoteProxy.js` — only if the wrapper changed; bump the image tag. Then build + push all three profiles (cu124 + `-cpu` via CI / cu128 local) + ensure GHCR public + USER redeploys a fresh Pod.

> ~~The v0.4.1 BUILD-READY PREFLIGHT (candidates #1/#4/#5 + MPI-88) lived here — that build SHIPPED 2026-06-15. See the "v0.4.1 SHIPPED" section above. Superseded by the candidate #6 preflight below.~~

### 🔧 BUILD-READY PREFLIGHT — candidate #6 `/wrapper/restart-comfy` (post-v0.4.1, the NEXT build)

The next image rebuild ships **candidate #6** (the restart-ComfyUI endpoint, see §"NEXT BUILD CANDIDATES"). Wrapper DID change → version bump required.

**Current values (post-v0.4.1, verified 2026-06-15):**
- App: `Cubric-Vision/routes/remoteProxy.js` → `WRAPPER_VERSION = '0.2.4'` (bumped at v0.4.1).
- Image tag: current shipped = `v0.4.1`. Wrapper lives in mpi-ci `cubric-vision-pod/wrapper/wrapper.py`.

**Bump to (recommended — wrapper+start.sh change, no torch/CUDA shift → patch tags):**
- `wrapper_version`: **0.2.4 → 0.2.5**
- image tag: **v0.4.1 → v0.4.2**
- App: set `routes/remoteProxy.js` `WRAPPER_VERSION = '0.2.5'` + tag refs to `v0.4.2` — must MATCH the build, commit on RunPod. (Search the app for `0.2.4` and `v0.4.1` to catch every ref.)

**What this build must contain (candidate #6, mpi-ci side):**
1. 🔴 Move the ComfyUI launch OUT of `start.sh` INTO `wrapper.py` as a managed `subprocess` (wrapper OWNS + supervises ComfyUI). `start.sh` then launches only the wrapper. Preserve ALL existing ComfyUI args: `--cache-lru 2`, `--preview-method taesd`, `--input-directory`, `--output-directory`, `--extra-model-paths-config`, the `--use-sage-attention` gate; and the COMFY_PID-death→container-down semantics (now: wrapper exits if ComfyUI won't relaunch). Keep the token guard.
2. 🔴 Add `/wrapper/restart-comfy` — kills + relaunches the wrapper's ComfyUI child cleanly, reusing the arg list. + `remoteProxy.js` `/proxy/restart-comfy` passthrough (app side, may already be in flight — see below).
3. Carry forward everything already shipped in v0.4.1 (pre-baked weights, `--cache-lru 2`, MPI-95 wrapper, MPI-88 `/health`) — it's already in `wrapper.py`/Dockerfile, just rebuild.

**⚠️ APP-SIDE #6 IS ALREADY IN FLIGHT (2026-06-15):** another session is editing `js/services/comfyController.js` (the `:300` remote restart branch — `/proxy/restart-comfy` call + `comfyNeedsRestart` clear + toast) and `routes/remoteProxy.js` (passthrough), UNCOMMITTED. The app half is NOT a rebuild blocker and is being handled there — do NOT duplicate it in the build session. The build session does the mpi-ci wrapper+start.sh+image only.

**Order / mechanics (USER runs live ops):**
- mpi-ci is a SEPARATE repo; commit + push mpi-ci `main` BEFORE `gh workflow run` (dispatch builds the pushed ref).
- cu124 + `-cpu` via CI; cu128 local on the Windows Docker box.
- After build: GHCR public; USER redeploys a fresh Pod; live-verify #6 (install a per-model custom_node → auto restart-comfy → node loads → gen proceeds, NO error dialog, NO Pod reboot, NO local·offline detour).

### NOT a build input from the parallel sessions (2026-06-15)
- **MPI-94** (UX polish) — all shipped items app-side; **zero rebuild impact**. Unbuilt F4/L3 are app-side, NOT build inputs.
- **MPI-80** (session-cost badge), **MPI-86** (cancel-connect) — app-side, zero rebuild impact.

Related: MPI-64 (RunPod remote engine), MPI-70 (multi-image build), MPI-75 (v0.4.0), v0.4.1 ship (above), MPI-95 (#5).
