# MPI-95 Validation

## Status
App half + wrapper half BOTH written. Wrapper half is GATED on the MPI-81
Pod-image rebuild (candidate #5). Full fix only observable AFTER that rebuild.

## Pre-build checks (done)
- `python -m py_compile wrapper/wrapper.py` → OK
- `node -c routes/downloadManager.js` → OK
- eslint (downloadService.js, MpiModelManager.js, MpiInstalledDisplay.js) → clean
- Local download path: no `indeterminate`/`phase` references on the local code
  path (`_startDownload`/`_wireProgress`/`ResumableDownloader`) → local UNCHANGED.

## Pass criteria (LIVE, after MPI-81 rebuild + fresh Pod)
- Remote install, multi-dep model (e.g. a Wan video model = 2×15GB + VAE + CLIP):
  - Bar does NOT snap to ~80%; climbs honestly from a real denominator.
  - At the end, the per-dep hash shows "Verifying…" (animated sweep), NOT a frozen
    99.9% bar.
  - Smooth overall.
- Verified on a small (SDXL ~7GB) and a large (I2V) model.
- Local-mode download path unchanged (regression check).

## Result
- Build gate: ✅ CLEARED — the wrapper half shipped in image v0.4.1+ (MPI-81 candidate #5; all profiles built + public).
- Live verify: ❌ FAILED (2026-06-16, USER on a live Pod). The denominator/aggregation is STILL wrong:
  - After UNINSTALLING a model the card shows `36GB / 36GB installed` — false (should reflect removed bytes / drop to partial-or-not-installed).
  - On INSTALL the bar reaches 100% then sits at 100% for a long time before completing → the aggregate does NOT correctly sum across ALL dependencies (it hits 100% early then waits on an un-counted dep). This is BEYOND the original ~80%-snap (an accepted aria2c -x16 preallocation artifact, see [[project_remote_install_progress_truth]]); the remaining bug is real aggregation math + post-uninstall installed-bytes state, not the prealloc cosmetic.
- NOT done. Reassigned to the MPI-97 session (owns routes/downloadManager.js install/uninstall progress + just fixed the adjacent uninstall-deleteFiles bug — same code family).
