# Pod disk-usage bar in Model Library (volume + ephemeral pods)

## Current State

- The disk-usage bar exists ONLY in RunPod Settings (MPI-169:
  `js/components/Compounds/LandingPages/MpiRunpodSettings/MpiRunpodSettings.js`
  ~L1371-1433). It mounts an `MpiProgressBar`, polls `GET /remote/pod/disk`
  every 10s, shows `NNgb / MMgb`, and recolours near-full (`--danger` ≥ 90%).
- It mounts only when a **network volume** exists (`if (vol && vol.size > 0)`);
  total (denominator) = `vol.size` (GB). Ephemeral "Any region" pods have no
  volume → no bar today.
- `GET /remote/pod/disk` (`routes/remotePodLifecycle.js` ~L1233) returns only
  `{ success, used }`. `used` comes from `_remoteVolumeUsedBytes()` → wrapper
  `GET /wrapper/disk` (`du -sb $CUBRIC_VOLUME_MOUNT`, default `/workspace`).
  `remoteVolumeFreeBytes()` (same file ~L1205) already resolves volume size →
  total bytes; reuse that logic server-side.
- **Ephemeral telemetry gap (root cause of "no bar for ephemeral"):**
  `mpi-ci/cubric-vision-pod/start.sh` sets `CUBRIC_ROOT=/cubric-data` for
  ephemeral (`CUBRIC_EPHEMERAL=1`) but NEVER exports `CUBRIC_VOLUME_MOUNT`.
  So the wrapper `du`s `/workspace` — RunPod's unused ~20GB default mount — not
  `/cubric-data` where ephemeral models actually land. One-line fix in
  `start.sh`. This file is **R2-floated, NOT baked** — ship via
  `publish-runtime.sh stable` + Pod restart, NO image rebuild.
- Model Library = `js/components/Compounds/LandingPages/MpiModelManager/MpiModelManager.js`.
  Sub-line el `#lib-sub` (~L51, text set ~L1066); filters wrap
  `.mpi-model-library__filters` (~L52). Bar goes between them.
- Decisions (user, this session): do BOTH volume + ephemeral now; extract a
  **shared helper**; total resolved **server-side**; BOTH surfaces gain the
  ephemeral case.

## Implementation

- [ ] Wire the Pod disk-usage bar into the Model Library and make it work for
      both volume and ephemeral pods, via a shared helper and server-resolved
      total. Concretely:
  1. **Pod runtime** (`c:\AI\Mpi\mpi-ci\cubric-vision-pod\start.sh`): export
     `CUBRIC_VOLUME_MOUNT="$CUBRIC_ROOT"` so `du` measures the correct root on
     both pod types. Edit via `git -C`. Ship = `./publish-runtime.sh stable` +
     Pod restart — **no image rebuild** ([[project_pod_wrapper_runtime_from_r2]]).
  2. **Server** (`routes/remotePodLifecycle.js`): `GET /remote/pod/disk`
     returns `{ success, used, total, ephemeral }`. Resolve `total` server-side
     — volume pod → configured volume size in bytes (reuse the size-resolve in
     `remoteVolumeFreeBytes`); ephemeral pod → the created container-disk size
     in bytes. Detect ephemeral from the tracked create-spec (no
     `networkVolumeId`). Keep returning `used` as today. `total: null` when
     unknown (caller hides the bar) — never block.
  3. **Shared helper** (new small module, e.g. `js/services/podDiskBar.js`):
     `mount(hostEl) → { destroy }` that creates the `MpiProgressBar` + inline
     text, polls `GET /remote/pod/disk` (10s), sets value from `used`, max from
     `total`, formats `NNgb / MMgb`, swaps `--danger`/`--primary` at ≥90%, and
     hides when the response lacks `success`/`total`. One function, not a
     component (ponytail). Total now comes from the server, so the helper needs
     no per-caller total wiring.
  4. **Settings** (`MpiRunpodSettings.js`): replace its inline bar+poll
     (~L1371-1433) with a call to the shared helper. It gains the ephemeral
     case for free (helper + server handle it). Preserve the existing
     mount-point (in the volume slot) and teardown.
  5. **Model Library** (`MpiModelManager.js`): mount the helper into a new
     element between `#lib-sub` and `.mpi-model-library__filters`. Show/hide is
     the helper's job (hidden until a pod reports). Tear down in `el.destroy()`
     (collect the helper's `destroy` in `_unsubs` or call it explicitly).
     No new empty-state when local/disconnected — the bar simply stays hidden.
  6. **Guard**: a small node test asserting the server's total-resolution +
     ephemeral detection (used/total math, ephemeral flag), mirroring the
     existing `tests/*.test.cjs` style.
  **Verify:** node test passes; app boots; connect to a **volume** pod → bar
  appears in BOTH Settings and Model Library with correct `used/total` and
  recolour near full; connect to an **ephemeral** pod → bar appears in both
  with total = container-disk size and `used` reflecting `/cubric-data` (not
  stuck at the 20GB default mount). Local/disconnected → no bar, no errors.

## Completed

- [x] (1) `start.sh` exports `CUBRIC_VOLUME_MOUNT="$CUBRIC_ROOT"` (mpi-ci) —
      NOT yet published to R2 / Pod-restarted (see Remaining Work).
- [x] (2) `/remote/pod/disk` returns `{ used, total, ephemeral }`; total via new
      pure `resolveDiskTotalBytes(pod, volumeList)` (exported, unit-tested).
- [x] (3) Shared helper `js/services/podDiskBar.js` + `podDiskBar.css` (registered
      in preloadStyles). `mountPodDiskBar(host) → { destroy }`, 10s poll, remount
      on total change, colour-swap, self-hides.
- [x] (4) Settings repointed at the helper; ephemeral branch now mounts it too;
      orphaned `MpiProgressBar` import + `.mpi-settings__volume-disk*` CSS removed.
- [x] (5) Model Library mounts the helper between `#lib-sub` and the filters;
      torn down in `el.destroy()`.
- [x] (6) Guard `tests/pod-disk-total.test.cjs` (6 cases) — PASS.
- [x] Auto-verify: ESLint clean, all touched JS parses, node route `-c` OK.

## Remaining Work

- **Ship the Pod-runtime edit:** `cd c:\AI\Mpi\mpi-ci\cubric-vision-pod` →
  `./publish-runtime.sh stable` → restart the Pod (or `POST /wrapper/restart-comfy`).
  Until then the ephemeral `used` value is still measured against `/workspace`
  (the old default) — the ephemeral leg cannot be trusted before this.
- **User-UX verify** (bar rendering) in the running app — see `## Verification`.

## Plan Drift

- None yet.

## Verification

**Verify mode:** user-ux

The bar is a visual surface the user must judge in the running app on real
pods. Auto-checks (node test for the total/ephemeral math, boot smoke) run
first; then the user confirms the bar renders correctly in Settings AND Model
Library for a volume pod and an ephemeral pod. Ephemeral's `used` value in
particular can only be trusted against a live ephemeral Pod after the R2
runtime republish + Pod restart (`start.sh` change does nothing until then).

## Preservation Notes

- `start.sh` edit lives in the **mpi-ci** repo, not this one, and only takes
  effect after `publish-runtime.sh stable` + Pod restart — note this at
  handoff so the runtime republish isn't forgotten (a common miss —
  [[project_pod_wrapper_runtime_from_r2]]).
- Shared helper serves both surfaces → fixes must not regress into two copies
  ([[feedback_check_both_engine_paths]]).
- If the disk-bar behaviour/shape changes materially, consider a one-line note
  in `docs/download-manager.md` (where MPI-169/221 disk telemetry is
  documented) and `docs/runpod-remote-engine.md` § 5 (runtime externalize).
- Update `.claude/rules/component-mounts.md` only if a new component is
  introduced (the helper is a service, not a component — likely no rule
  change), and only with user permission per CLAUDE.md documentation-drift rule.
