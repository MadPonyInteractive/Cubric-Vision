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

## VERIFIED at the 1.3.0 cut - 2026-07-30 (MPI-391 section A)

Source: CI run `30559394491` (mpi-ci, all three legs success), artifacts pulled to
`D:\CubricStudio\Vision\Builds\v1.3.0\` and integrity-tested (`unzip -t` on all
five zips, `tar -tzf` on the tarball - no errors in any).

1. **Update-only root name - PASS.** All THREE update bundles (not just Windows)
   unzip to a root of `CubricVision-v1.3.0-update-only`.

2. **Archive name unchanged - PASS.** The asset is exactly
   `CubricVision-windows-x64-update-v1.3.0.zip`. Shipped `update.bat` globs still
   match.

3. **Delta sanity - PASS.** All three update manifests read
   `fromVersion 1.2.0 -> toVersion 1.3.0`, `kind: update-bundle`. The 1.2.0
   restamp DID reach CI, and the proof is in the delta sizes: Linux 209 files /
   2.8 MB and macOS 208 files / 3.3 MB, against the 1226-file 90 MB bundle a
   stale 1.0.0 baseline produced last time.

4. **File counts sane - PASS.** Full (portable-stage) manifests, `fromVersion:
   null`: win32 6418 (+56 vs 6362), darwin 6563 (+58 vs 6505), linux 6383 (+58
   vs 6325). A small swing, not an order-of-magnitude one.

5. **Baselines restamped - DONE** (`36f972cf`). All three byte-copied from the
   shipped 1.3.0 full manifests; `release-baselines/README.md` § Current
   baselines updated.

### The Windows update bundle is 6408 files / 451 MB, and that is CORRECT

MPI-387 fix D moved the Windows app tree to `resources/app/` with Electron's
runtime at the portable root, so every Windows path in the v1.2.0 baseline
changed and the SHA256-by-path diff reads all ~6300 as added. Linux and macOS
were untouched in the SAME build, which is what proves the delta machinery is
healthy rather than broken. One-off: `win32-x64.json` now holds the post-move
layout, so a large 1.4.0 Windows delta would mean a NEW layout change.

### Also confirmed, MPI-387 fix A

`CubricVision.exe` sits at the TOP LEVEL of `CubricVision-windows-x64-v1.3.0.zip`
(no internal root folder), which is what makes Explorer "Extract All" produce ONE
folder with the exe directly inside instead of two nested ones. macOS and Linux
full artifacts keep their internal root folder, which is correct for their
extraction tools.

## Follow-up recorded, not done

If the update ASSET name should also say "update-only", that needs a
dual-upload transition (same bytes under both names for two or three releases)
so shipped updaters keep matching. Not attempted here.
