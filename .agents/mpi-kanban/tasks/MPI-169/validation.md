# MPI-169 — validation (volume disk-usage bar)

## Built 2026-07-01 (branch RunPod + mpi-ci). Files:
- **mpi-ci** `cubric-vision-pod/wrapper/wrapper.py` — `GET /wrapper/disk` (du -sb of
  `$CUBRIC_VOLUME_MOUNT` default /workspace) → `{success,used}`. Version 0.2.22→0.2.23.
- `routes/remoteProxy.js` — `GET /remote/pod/disk` (wrapper-first, NO REST fallback —
  RunPod has no used-bytes); `WRAPPER_VERSION` pin 0.2.20→0.2.23.
- `js/components/.../MpiSettings/MpiSettings.js` — `MpiProgressBar` in
  `_renderRunpodVolume` (max=vol.size, hidden until a pod reports usage), 10s poll,
  danger colour ≥90% full, teardown in destroy + on re-render.
- `js/components/.../MpiSettings/MpiSettings.css` — `.mpi-settings__volume-disk`.

## Verified pre-test
- wrapper.py `python -c ast.parse` OK; du-parse logic unit-checked (bytes→GB).
- app node --check + ESLint clean; `/remote/pod/disk` route live (returns
  `remote_inactive` with no pod — correct); app boots clean.

## PUBLISH DONE 2026-07-01 — wrapper 0.2.23 live on R2 stable (verified). Bar ready.

## (was) BLOCKER before the bar can SHOW live
The bar's numerator comes from wrapper **0.2.23**. Current deployable pods ship 0.2.22.
Two coupled steps (both done in code, R2 push pending):
1. **Publish wrapper 0.2.23 to R2** — `mpi-ci/cubric-vision-pod/publish-runtime.sh`
   (no image rebuild; writes to the `stable` channel). **LIVE R2 OP — user-gated.**
2. App pin already bumped to 0.2.23 (so a fresh pod fetches it).
Until (1), the route/UI are wired but the bar stays hidden (graceful — old wrapper 404s
/wrapper/disk → success:false → hidden). No breakage.

## USER TEST (one-go, AFTER publishing 0.2.23)
1. Connect a pod that has a network volume — works on a **GPU pod** OR a **CPU download
   pod** (both mount /workspace).
2. Settings → RunPod → the volume badge shows; below it a progress bar appears once the
   first /wrapper/disk poll returns, reading "X / <size> GB used".
3. Download a model (or upload files) → watch the bar climb on the 10s poll.
4. Disconnect → bar hides (route returns remote_inactive).
5. Confirm on BOTH pod types (user requirement: not CPU-only).

## Notes
- Connected-pod-only by design (RunPod exposes no used-bytes — proven dead). Idle/
  unconnected DC keeps the total-only badge. Accepted by user.
