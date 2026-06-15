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

Bump `wrapper_version` (next after 0.2.3) — mpi-ci build arg AND `WRAPPER_VERSION` in Cubric-Vision `routes/remoteProxy.js` — only if the wrapper changed; bump the image tag (next after v0.4.0). Then build + push both profiles (cu124 CI / cu128 local) + ensure GHCR public + USER redeploys a fresh Pod.

Related: MPI-64 (RunPod remote engine), MPI-70 (multi-image build), MPI-75 (closed v0.4.0 rebuild).
