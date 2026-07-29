# MPI-369 validation

Shipped in `a500b335`. Nothing here is user-verified yet.

## Verified during implementation

- `node --check main.js` passes with the handlers in place.
- All three restamped baselines assert clean against the README contract:
  `fromVersion: null`, `artifact.kind: portable-stage`, `toVersion: 1.2.0`,
  file counts 6362 (win32) / 6505 (darwin) / 6325 (linux). A few-hundred-file
  count would have meant the delta bundle was grabbed by mistake.

## Verified LIVE 2026-07-30 - the handler has now fired

Boot smoke run, user-witnessed. `throw new Error('boot smoke')` placed directly
after the two `process.on` registrations in `main.js`, dev app launched with
port 3000 free, throw reverted afterwards (`node --check main.js` clean,
`git diff -- main.js` empty).

Both halves fired:

- **Dialog** - error box titled "Cubric Vision failed to start", body carrying
  the timestamp, `[FATAL] [main] uncaughtException: Error: boot smoke` and the
  full stack down to `main.js:35:7`. Screenshotted by the user.
- **Log** - `%APPDATA%\Cubric Vision\logs\app.log` line 1878:
  `[2026-07-29T05:41:25.645Z] [FATAL] [main] uncaughtException: Error: boot smoke`.
  The synchronous `appendFileSync` beat process exit, which is the entire point
  of the fix - `routes/logger`'s awaited append would have lost this line.
- Process exited 1, matching Node's default action for an uncaught exception.

## NOT verified - do these before or during the 1.3.0 cut

1. **The update-only root name only exists in a NEW build.** After the 1.3.0
   artifacts are built, unzip the Windows update bundle and confirm the root
   folder reads `CubricVision-v1.3.0-update-only`.

2. **The archive name must NOT have changed.** Confirm the asset is still
   `CubricVision-windows-x64-update-v1.3.0.zip`. If it drifted, every existing
   install's `update.bat` glob stops matching and in-place updates break.

3. **Delta sanity.** The 1.3.0 update manifest should read `from 1.2.0`, not
   `from 1.0.0`. If it still says 1.0.0 the restamp did not reach CI.

## Follow-up recorded, not done

If the update ASSET name should also say "update-only", that needs a
dual-upload transition (same bytes under both names for two or three releases)
so shipped updaters keep matching. Not attempted here.
