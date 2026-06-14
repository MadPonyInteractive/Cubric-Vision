# MPI-75 Brief — Pending Pod-image rebuild changes (wrapper + Dockerfile batch)

Running list of wrapper/Dockerfile changes that are WRITTEN in mpi-ci (cubric-vision-pod/) but NOT in any pushed image yet — they take effect only after a rebuild + redeploy. Batch them so the slow image build runs once. **KEEP UPDATING this card as more rebuild-needing changes accumulate.**

## SHIPPED in v0.4.0 (built 2026-06-14, wrapper 0.2.3)

Image **v0.4.0** built + pushed: `v0.4.0-cu124` (CI) + `v0.4.0-cu128` (local Docker box). App bumped: `POD_IMAGE_VERSION='v0.4.0'`, `WRAPPER_VERSION='0.2.3'` in `routes/remoteProxy.js`. Both images smoke-verified torch (cu124 / `2.7.1+cu128`).

1. ✅ **POST /wrapper/models/delete** — remote model uninstall endpoint (app side already shipped in `routes/downloadManager.js` + `remoteModels.js`; was 404-toasting, now live).
2. ✅ **FAST model download via aria2c** — wrapper `_run_install` uses aria2c (`-x16 -s16`, ~10–40x single-stream httpx on RunPod's NIC) + httpx fallback; Dockerfile apt installs `aria2`. sha256 verify + SSE progress + cancel + watchdog preserved.

**STILL PENDING (USER):** redeploy a fresh Pod off v0.4.0 + live-verify aria2c install speed + remote uninstall. Live Pod ops are USER-only. Confirm both GHCR tags PUBLIC (v0.3.0 package already public → v0.4.0 tags inherit).

Related: MPI-64 (RunPod remote engine), MPI-70 (multi-image build).

## Candidates (DECISION PENDING — do NOT build until decided + tested)

3. **model-cache STACKING fix** — ComfyUI keeps every loaded model in RAM (no `--cache-*` flag set anywhere); switching model-type never evicts → stacks → OOM on RAM-limited Pods (CONFIRMED live: I2V completed at 46GB RAM, then switching to T2V OOM'd at 99%; T2V then worked alone after RAM cleared; RAM stayed ~92% resident after finishing = the cache holding it). TENTATIVE FIX: add ComfyUI `--cache-lru 2` to Pod start.sh (keep 2 most-recent models = Wan high+low pair; `--cache-none` is OUT, breaks 1000+ sampler workflows). Needs a controlled test before building.
4. **wrapper `/wrapper/free` endpoint + remoteProxy `/proxy/free`** so the existing memory-monitor Release-VRAM / Ctrl-click Release-RAM (memoryOps.js → /comfy/unload, currently LOCAL-ONLY) works in remote mode; pairs with an optional app-side auto-free-on-model-switch. See MPI-64 Plan Drift 2026-06-13 'model-cache STACKING OOM' for the full investigation (incl. why deep Release-RAM under-frees even locally).
5. **FUTURE — bump the cu128 Blackwell image profile to cu130** (speed wins on Blackwell). cu128 was the newest PROVEN base+torch+sage combo at MPI-70 build, not a deliberate floor; do this when the cu130 base + torch wheels + sageattention compile are validated. Higher host-driver floor (fine for Blackwell new-driver hosts). No urgency.
