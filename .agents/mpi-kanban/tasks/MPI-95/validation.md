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
(pending — needs the MPI-81 rebuild)
