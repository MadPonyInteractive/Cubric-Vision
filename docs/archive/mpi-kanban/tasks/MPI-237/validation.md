# MPI-237 Validation

**Verify mode:** user-ux

## Automated (agent self-verify) — DONE 2026-07-08
- [x] Node test `tests/pod-disk-total.test.cjs` (6 cases: volume/ephemeral/sole-fallback/unknown→null): PASS.
- [x] ESLint on podDiskBar.js + MpiModelManager.js + MpiRunpodSettings.js: clean.
- [x] Parse/syntax check on all touched JS + `node -c` on the route: OK.
- [x] Full suite 90/94; the 4 failing `runpod-remote-hardening` cases are
      PRE-EXISTING (reproduce on the stashed original route) — not this change.

## User-UX (in running app, on real pods) — VERIFIED 2026-07-08
- [x] Volume pod (EU-RO-1, 150GB): bar in Settings + Model Library, `100.2GB / 150GB`.
      Live `/remote/pod/disk` → `{used:100172635100, total:150000000000, ephemeral:false}`.
- [x] Volume pod: same bar in Model Library, under sub-line, over filters.
- [x] Ephemeral "Any region" pod (A40, 100GB container disk): bar in BOTH surfaces;
      `{used:2030, total:100000000000, ephemeral:true}` on a fresh disk, then climbs
      to `7.1GB / 100GB` during install — proving `used` reads `/cubric-data`, NOT the
      old ~20GB `/workspace` mount. RunPod console telemetry cross-confirms 7GB/100GB (7%).
- [x] Disconnected → no bar, no errors (server returns success:false → helper hides).
- [x] Model Library bar width capped to ~33% (user-requested; full-bleed read poorly).

## Runtime shipped
- `start.sh` (mpi-ci) published via `publish-runtime.sh stable` (wrapper 0.2.33);
  live URL confirmed carrying `export CUBRIC_VOLUME_MOUNT="$CUBRIC_ROOT"`. No image
  rebuild. Fresh ephemeral Pod boot picks it up.
