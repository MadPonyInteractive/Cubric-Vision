# MPI-369 validation

Shipped in `a500b335`. Nothing here is user-verified yet.

## Verified during implementation

- `node --check main.js` passes with the handlers in place.
- All three restamped baselines assert clean against the README contract:
  `fromVersion: null`, `artifact.kind: portable-stage`, `toVersion: 1.2.0`,
  file counts 6362 (win32) / 6505 (darwin) / 6325 (linux). A few-hundred-file
  count would have meant the delta bundle was grabbed by mistake.

## NOT verified - do these before or during the 1.3.0 cut

1. **The crash handler has never fired.** Put `throw new Error('boot smoke')`
   at the top of `main.js`, launch the app, and confirm BOTH:
   - an Electron error box appears titled "Cubric Vision failed to start", and
   - a `[FATAL] [main] uncaughtException` line lands in the user-data logs
     folder's `app.log`.
   Then revert the throw. Port 3000 must be free. This is the one fix whose
   entire value is that it works on the day something breaks, so a live firing
   is the only meaningful proof.

2. **The update-only root name only exists in a NEW build.** After the 1.3.0
   artifacts are built, unzip the Windows update bundle and confirm the root
   folder reads `CubricVision-v1.3.0-update-only`.

3. **The archive name must NOT have changed.** Confirm the asset is still
   `CubricVision-windows-x64-update-v1.3.0.zip`. If it drifted, every existing
   install's `update.bat` glob stops matching and in-place updates break.

4. **Delta sanity.** The 1.3.0 update manifest should read `from 1.2.0`, not
   `from 1.0.0`. If it still says 1.0.0 the restamp did not reach CI.

## Follow-up recorded, not done

If the update ASSET name should also say "update-only", that needs a
dual-upload transition (same bytes under both names for two or three releases)
so shipped updaters keep matching. Not attempted here.
