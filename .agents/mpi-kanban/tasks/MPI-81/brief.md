# MPI-81 Brief — Next Pod-image rebuild batch

Carries over the **decision-pending** rebuild candidates from MPI-75 (closed 2026-06-14 after the v0.4.0 / wrapper-0.2.3 image shipped). Same rule as MPI-75: batch these so the slow image build runs once. **KEEP UPDATING this card as more rebuild-needing changes accumulate.** Each candidate needs a DECISION + a controlled test BEFORE building.

Reminder: never autonomous live Pod builds/ops — USER runs them; commit+push mpi-ci main BEFORE `gh workflow run` (dispatch builds the pushed ref). cu124 builds in CI; cu128 builds locally on the Windows Docker box (runner disk ceiling). Rebuild steps live in mpi-ci `cubric-vision-pod/README.md`.

## Candidates (DECISION PENDING — do NOT build until decided + tested)

1. **model-cache STACKING fix** — ComfyUI keeps every loaded model in RAM (no `--cache-*` flag set anywhere); switching model-type never evicts → stacks → OOM on RAM-limited Pods (CONFIRMED live: I2V completed at 46GB RAM, then switching to T2V OOM'd at 99%; T2V worked alone after RAM cleared; RAM stayed ~92% resident after finishing = the cache holding it. RE-CONFIRMED 2026-06-14: after a T2V gen COMPLETED and GPU/CPU dropped to ~0, container RAM stayed pinned ~60% / ~35GiB = the loaded T2V UNet pair held resident). TENTATIVE FIX: add ComfyUI `--cache-lru 2` to Pod start.sh (keep 2 most-recent models = Wan high+low pair; `--cache-none` is OUT, breaks 1000+ sampler workflows). Needs a controlled test before building (does it evict the old pair on switch? keep the Wan high+low pair within one multi-stage gen? hurt the 1k-sampler case?).
2. **wrapper `/wrapper/free` endpoint + remoteProxy `/proxy/free`** so the existing memory-monitor Release-VRAM / Ctrl-click Release-RAM (memoryOps.js → /comfy/unload, currently LOCAL-ONLY) works in remote mode; pairs with an optional app-side auto-free-on-model-switch. Also investigate why deep Release-RAM under-frees even locally (cache flag may fix it). See MPI-64 Plan Drift 2026-06-13 'model-cache STACKING OOM' + OPEN-ITEMS D1/D2.
3. **FUTURE — bump the cu128 Blackwell image profile to cu130** (speed wins on Blackwell). cu128 was the newest PROVEN base+torch+sage combo at MPI-70 build, not a deliberate floor; do this when the cu130 base + torch wheels + sageattention compile are validated. Higher host-driver floor (fine for Blackwell new-driver hosts). No urgency. Most Blackwell cards run new drivers.

## At rebuild

Bump `wrapper_version` (next after 0.2.3) — mpi-ci build arg AND `WRAPPER_VERSION` in Cubric-Vision `routes/remoteProxy.js` — only if the wrapper changed; bump the image tag (next after v0.4.0). Then build + push both profiles (cu124 CI / cu128 local) + ensure GHCR public + USER redeploys a fresh Pod.

Related: MPI-64 (RunPod remote engine), MPI-70 (multi-image build), MPI-75 (closed v0.4.0 rebuild).
