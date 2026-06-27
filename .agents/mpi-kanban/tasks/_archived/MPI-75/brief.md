# MPI-75 Brief — Pending Pod-image rebuild changes (wrapper + Dockerfile batch)

Running list of wrapper/Dockerfile changes that are WRITTEN in mpi-ci (cubric-vision-pod/) but NOT in any pushed image yet — they take effect only after a rebuild + redeploy. Batch them so the slow image build runs once. **KEEP UPDATING this card as more rebuild-needing changes accumulate.**

## SHIPPED in v0.4.0 (built 2026-06-14, wrapper 0.2.3)

Image **v0.4.0** built + pushed: `v0.4.0-cu124` (CI) + `v0.4.0-cu128` (local Docker box). App bumped: `POD_IMAGE_VERSION='v0.4.0'`, `WRAPPER_VERSION='0.2.3'` in `routes/remoteProxy.js`. Both images smoke-verified torch (cu124 / `2.7.1+cu128`).

1. ✅ **POST /wrapper/models/delete** — remote model uninstall endpoint (app side already shipped in `routes/downloadManager.js` + `remoteModels.js`; was 404-toasting, now live).
2. ✅ **FAST model download via aria2c** — wrapper `_run_install` uses aria2c (`-x16 -s16`, ~10–40x single-stream httpx on RunPod's NIC) + httpx fallback; Dockerfile apt installs `aria2`. sha256 verify + SSE progress + cancel + watchdog preserved.

**STILL PENDING (USER):** redeploy a fresh Pod off v0.4.0 + live-verify aria2c install speed + remote uninstall. Live Pod ops are USER-only. Confirm both GHCR tags PUBLIC (v0.3.0 package already public → v0.4.0 tags inherit).

Related: MPI-64 (RunPod remote engine), MPI-70 (multi-image build).

## Candidates moved → MPI-81

The decision-pending rebuild candidates (`--cache-lru 2` model-cache OOM fix, `/wrapper/free` remote memory release, future cu130 Blackwell profile) were spun into **MPI-81** when this card closed (v0.4.0 shipped). They are NOT part of MPI-75 — see MPI-81 brief.
