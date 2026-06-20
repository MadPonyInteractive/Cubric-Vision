# MPI-118 Brief

## Goal

Bump the **app** ComfyUI from the current pinned **v0.19.3** up to **0.25.0**, so
the shipped app matches the Builder image and the local test rig
(`G:\ComfyUi\ComfyUI`). This is the "app catches up to the Builder" step in the
Builder-leads / app-follows model.

## Sequencing

- **Depends on MPI-117.** Do this AFTER the node version-lock system lands. The
  bump must set core + frontend + node commits through that lock, not by
  re-floating. If MPI-118 is done without the lock, the drift problem returns.
- **RunPod branch ONLY — not master** (same constraint as MPI-117; RunPod branch
  = v1.1.0 shared trunk, memory `project_runpod_branch_v110`).

## Exact target versions — a NAMED RELEASE, not a scraped machine (decided 2026-06-19)

Source of truth = the named ComfyUI release **`v0.25.1`** (latest stable,
~2026-06-18). Do NOT pin to whatever a local machine reports — the local rig was
mid-fix after a broken update script and is being reinstalled fresh from this
same release. Verified anchors:

- Release tag: **`v0.25.1`**
- Core SHA (tag points here): **`eca4757d653654deb5744edf16a862f352800fdc`**
- Frontend: **`comfyui-frontend-package==1.45.15`** — already PINNED in ComfyUI's
  own `requirements.txt` at this tag, so pinning core pins the frontend for free
  (no separate frontend lock needed; just don't override it).
- (Note: `comfyui_version.py` still reads `0.25.0` at the v0.25.1 tag — the
  version file lags the tag. The TAG `v0.25.1` is the identity, use it.)

All four converge on `v0.25.1`: the fresh local rig, the Builder
(`COMFYUI_REF=eca4757…`, rebuilt as `v0.1.3-cu128`), the product Pod (MPI-117),
and the app (this card).

## Scope (app side)

1. `dev_configs/system_dependencies.json` → `engine.version` from `0.19.3` to
   **`0.25.1`** (the app pulls the Comfy-Org portable release by this tag:
   `releases/download/v0.25.1/ComfyUI_windows_portable_nvidia.7z`). Confirm the
   portable asset exists for v0.25.1 and that its bundled core == tag `v0.25.1`
   (SHA `eca4757`). The app's portable-tag == core-tag here, so no SHA/tag
   reconciliation needed for v0.25.1.
2. Frontend: ensure the new portable ships / installs `comfyui-frontend-package
   1.45.15` (or pin it).
3. Custom-node commits: bump via the MPI-117 lock to whatever the validated set is.
4. Run the app's full version machinery (`/mpi-version-bump` may apply — APP_VERSION
   vs COMFY_VERSION are separate axes; this card moves COMFY_VERSION).
5. Regression-test the app's existing shipped workflows against 0.25.0 — a 6-minor
   core jump can change node behaviour for the app's own operations, not just LTX.

## Why separate from MPI-117

MPI-117 = build the lock + fix the Pod's floating drift (mechanism). MPI-118 =
use that mechanism to move the version forward (policy). Keeping them apart lets
MPI-117 ship the reproducibility fix without coupling it to a risky core bump.

## CUDA build — keep images cu128 (coverage), NOT a driver-age wall

The v0.25.1 portable on a modern local rig ships **torch 2.12+cu130** (CUDA 13).
This bump locks **ComfyUI v0.25.1 (core + frontend + nodes)** only — NOT
torch/CUDA. CUDA build stays per-environment: local = cu130 (portable default),
images = cu128.

**Reason to stay cu128 (corrected — earlier "data-center driver lag" was stale):**
USER reports live Pods now show `nvidia-smi` CUDA 13.0 = host driver ≥580, so a
cu130 image WOULD boot. But cu128 runs on any host ≥570 (NVIDIA mins: cu130 ≥580,
cu128 ≥570) — strictly wider coverage — and cu128 already has Blackwell sm_120, so
cu130 buys no functional gain. Stay cu128 for coverage, not because hosts are old.
**TODO before finalizing:** confirm with a live `nvidia-smi` on a Pod (USER-only
live op) — capture driver + CUDA across a few GPU types. See memory
`project_comfyui_portable_ships_cu130`.

## ⚠ IMAGE REBUILD REQUIRED AFTER THIS CARD (do not forget)

This card's app bump + the MPI-117 lock changes BOTH need a Pod image rebuild to
take effect (core/nodes are baked at build time — see MPI-117). The rebuild was
DEFERRED from MPI-117 and BATCHED here: do ONE combined rebuild after MPI-118's
edits land.

After MPI-118 ships:
1. Edit `dev_configs/node_lock.json` to the v0.25.1 targets (core tag `v0.25.1` /
   SHA `eca4757d653654deb5744edf16a862f352800fdc`, frontend `1.45.15`, validated
   node commits) — that single edit drives both app + Pod.
2. Run `/build-pod-image` (product Pod): cu124+cpu CI + cu128 local. It syncs the
   lock into the mpi-ci build context automatically.
3. Image version = **v0.5.0** (ComfyUI engine change = minor bump).
4. Make GHCR public; bump RunPod template + app `POD_IMAGE`/`POD_IMAGE_VERSION`
   (`routes/remoteProxy.js`, needs app restart); parity-test app vs Pod.

MPI-117 stays parked in `doing` until THIS combined rebuild ships, then both close.
