# MPI-118 Brief

## Goal

Bump the **app** ComfyUI from the current pinned **v0.19.3** up to **v0.25.1**, so
the shipped app matches the Builder image and the local test rig
(`G:\ComfyUi\ComfyUI`). This is the "app catches up to the Builder" step in the
Builder-leads / app-follows model.

## Sequencing

- **MPI-117 lock mechanism already exists on disk** (`dev_configs/node_lock.json`,
  schema `cubric/node-lock/v1`). MPI-117 stays parked in `doing` until the combined
  image rebuild (see last section) — it will NOT close before 118. So 117 and 118
  **interleave**: 118 reuses the lock mechanism and bumps its *values*; it does not
  wait for 117 to be marked done.
- The bump must set core + frontend through the lock, not by re-floating. Node
  commits stay as-is for this card (see Scope #3). If 118 bumped versions outside
  the lock, the drift problem returns.
- **RunPod branch ONLY — not master** (same constraint as MPI-117; RunPod branch
  = v1.1.0 shared trunk, memory `project_runpod_branch_v110`).

## Exact target versions — a NAMED RELEASE, not a scraped machine (decided 2026-06-19)

Source of truth = the named ComfyUI release **`v0.25.1`** (latest stable,
~2026-06-18). Do NOT pin to whatever a local machine reports — the local rig was
mid-fix after a broken update script and is being reinstalled fresh from this
same release. Verified anchors — ALL CONFIRMED 2026-06-20 by extracting the
actual `ComfyUI_windows_portable_nvidia.7z` (1.92GB, exact size match) and reading
its bundled `.git` / `comfyui_version.py` / `requirements.txt`:

- Release tag: **`v0.25.1`** — `git describe --tags` in the portable returns `v0.25.1`. ✓
- Core SHA: **`eca4757d653654deb5744edf16a862f352800fdc`** — `git rev-parse HEAD`
  in the portable's `.git` returns exactly this. (Portable ships a REAL git
  checkout, not detached — SHA is directly verifiable.) ✓
- `comfyui_version.py` reads **`0.25.1`** (NOT 0.25.0 — earlier "version file lags
  the tag" note was wrong; the portable's version file matches the tag). ✓
- Frontend: **`comfyui-frontend-package==1.45.15`** — pinned in the portable's
  `requirements.txt`. Pinning core pins the frontend for free (don't override). ✓
- Templates: **`comfyui-workflow-templates==0.10.0`** — pinned in the same
  `requirements.txt` (this was the one unknown for the lock; now resolved). ✓
- Portable download URL returns 302→200, `Content-Length 2061184695`. ✓

All four converge on `v0.25.1`: the fresh local rig, the Builder
(`COMFYUI_REF=eca4757…`, rebuilt as `v0.1.3-cu128`), the product Pod (MPI-117),
and the app (this card).

## Scope (app side)

> **TWO version sources must both move — verified 2026-06-20.** The app reads the
> engine version from `system_dependencies.json` (portable download URL) and reads
> node download URLs from `node_lock.json`'s `nodes` block. The lock ALSO carries
> `comfyui.core` + `frontend` blocks that the app does not currently consume (Pod
> image build reads them). Decision: bump BOTH so app + Pod stay coherent off one
> lock edit. Leaving the lock at v0.19.3 while system_deps moves to v0.25.1 would
> desync the two install paths.

1. **`dev_configs/system_dependencies.json`** → `engine.version` from `0.19.3` to
   **`0.25.1`**. This is `COMFY_VERSION` (`routes/platformEngine.js:19` reads
   `deps.engine.version`), which builds the portable URL
   `releases/download/v0.25.1/ComfyUI_windows_portable_nvidia.7z`. CONFIRMED
   2026-06-20: asset exists (1.92GB), bundled core == tag `v0.25.1`
   (SHA `eca4757`), version.py reads 0.25.1. Portable-tag == core-tag — no
   SHA/tag reconciliation needed.
2. **`dev_configs/node_lock.json`** → bump the engine-version blocks (these are
   STALE at v0.19.3 today):
   - `comfyui.core.tag` `v0.19.3` → **`v0.25.1`**;
     `comfyui.core.commit` `3086026…` → **`eca4757d653654deb5744edf16a862f352800fdc`**.
   - `comfyui.frontend.comfyui-frontend-package` `1.42.11` → **`1.45.15`**.
   - `comfyui.frontend.comfyui-workflow-templates` `0.9.57` → **`0.10.0`**
     (confirmed from the portable's `requirements.txt`, 2026-06-20).
   - This single lock edit is also what drives the Pod image rebuild (last
     section) — same edit, consumed by both.
3. **Custom-node commits: KEEP AS-IS for v0.25.1** (decided 2026-06-20). Do NOT
   move any `nodes.*.commit` in this card. Validate the existing pinned node set
   against v0.25.1 during regression (#5); bump an individual node only if a
   concrete regression shows. No speculative node bumps.
4. Run the app's version machinery. `COMFY_VERSION` lives in
   `system_dependencies.json` (not `appVersion.js` anymore — `appVersion.js:8`
   says so). APP_VERSION vs COMFY_VERSION are separate axes; this card moves
   COMFY_VERSION only. `/mpi-version-bump` applies only if APP_VERSION also moves.
5. Regression-test the app's existing shipped workflows against **v0.25.1** — a
   6-minor core jump can change node behaviour for the app's own operations, not
   just LTX.

## Upgrade-prompt path — ALREADY CODED, this is the dev acceptance test (verified 2026-06-20)

No new UI work. The local-engine upgrade flow already exists and triggers off the
version bump automatically:

- `GET /engine/version-check` (`routes/engine.js:499`) compares the installed
  `.mpi_engine_version` stamp against `config.engine.version`. After this card,
  required = `0.25.1`, stamp on a dev machine = `0.19.3` → `needsUpgrade: true`.
- `js/shell.js:203` reads `needsUpgrade` and calls
  `_engineInstall.el.show('upgrading')` — BLOCKS the app and shows the upgrade UI
  on next open.
- `POST /engine/upgrade` (`routes/engine.js:563`) moves models to safety → removes
  the old engine → reinstalls v0.25.1, streaming `engine:upgrade-status`.

**Dev acceptance test (do this to validate the card):** with the bump landed, open
the app → upgrade prompt appears automatically → accept → engine reinstalls to
v0.25.1 → run a generation. That round-trip IS the card's pass condition.

**User-facing framing:** this prompt is what end-users see when **Cubric Vision
1.1.0** ships — they're told the new ComfyUI install will replace the old engine,
models preserved. Same code path; nothing extra to build for the 1.1.0 release.

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
**DECIDED 2026-06-20 (USER):** cu128 locked for safety — wider coverage, no
functional loss. cu130 NOT used. No live `nvidia-smi` check needed; this is final.
See memory `project_comfyui_portable_ships_cu130`.

## ⚠ IMAGE REBUILD REQUIRED AFTER THIS CARD (do not forget)

This card's app bump + the MPI-117 lock changes BOTH need a Pod image rebuild to
take effect (core/nodes are baked at build time — see MPI-117). The rebuild was
DEFERRED from MPI-117 and BATCHED here: do ONE combined rebuild after MPI-118's
edits land.

After MPI-118 ships:
1. The `node_lock.json` core+frontend bump is ALREADY done as Scope #2 above (that
   single edit drives both app + Pod; nodes unchanged). Nothing more to edit here —
   confirm the lock holds the v0.25.1 targets, then proceed to the build.
2. Run `/build-pod-image` (product Pod): cu124+cpu CI + cu128 local. It syncs the
   lock into the mpi-ci build context automatically.
3. Image version = **v0.5.0** (ComfyUI engine change = minor bump).
4. Make GHCR public; bump RunPod template + app `POD_IMAGE`/`POD_IMAGE_VERSION`
   (`routes/remoteProxy.js`, needs app restart); parity-test app vs Pod.

MPI-117 stays parked in `doing` until THIS combined rebuild ships, then both close.
