# MPI-58 Validation

## Dev Checks

- `.\node_modules\.bin\eslint.cmd js\components\Organisms\MpiVideoViewer\MpiVideoViewer.js --max-warnings=9999` - passed.
- `npm run test:desktop -- tests/desktop/electron-smoke.spec.js` - passed.

## Manual Verification Needed

- On macOS and Linux, open a video history entry and wheel over the viewer.
- Expected: the video visibly zooms in/out, the cursor switches to move only once zoomed, and double-click resets to fit.
- Expected in crop mode: wheel still zooms, crop overlay remains aligned, and drag handles retain crop behavior.

## Manual Verification — PASS (both platforms, 2026-06-10)

- **Linux**: 0.0.7 → 0.0.9 update. Opened a video in the history viewer — wheel-zoom
  in/out and double-click reset confirmed working. Fabio.
- **macOS (M4 rentamac)**: 0.0.8 → 0.0.9 update. Same — video zoom + double-click
  reset confirmed working in the history viewer. Fabio.

Root cause confirmed: transform on the .mpi-video-viewer__player wrapper was
ignored by the hardware-video compositor on macOS/Linux (Windows honoured it).
Fix applies the transform to the video element itself (commit f48f68b). Card → done.
