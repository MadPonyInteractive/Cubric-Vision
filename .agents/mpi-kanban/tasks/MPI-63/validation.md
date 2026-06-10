# MPI-63 Validation

## Local verification — PASS (2026-06-10)

- `node --check scripts/build-portable.mjs` parses clean.
- Dry-run stage darwin/arm64 (`--dry-run --no-archive --no-node-modules --version 0.0.11`):
  - `CubricVision.app/` lands at the FULL stage root top level, alongside
    `start-with-terminal.command`.
  - `CubricVision.app/` re-staged into the UPDATE bundle (`CubricVision-v0.0.11/`).
  - All 3 `.app` files (Info.plist, Contents/MacOS/CubricVision, Contents/Resources/icon.icns)
    appear in the update manifest `files[]` (hashed -> delta diffing covers them).
  - `manifest.artifact.launchers` = `[start-with-terminal.command, CubricVision.app,
    update.command, update-from-zip.command]`.
  - Old `start.command` is GONE from the manifest; `start-with-terminal.command` present.

## Design notes

- The `.app` is symlink-free (3 plain files), so it survives BOTH ditto (mac CI host)
  and the hand-rolled writer. ditto preserves the inner launcher's exec bit; the bundle
  is chmod'd at stage time on the mac runner.
- Inner launcher resolves the portable root 3 levels up from `$0`
  (`MacOS -> Contents -> .app -> root`), then reuses start.command's body (quarantine
  strip + CUBRIC_* env + bundled Electron exec via `exec`).
- Gatekeeper: an unsigned downloaded `.app` is quarantined; first-launch may show the
  "damaged/can't open" dialog before the inner strip runs. README right-click->Open
  trick covers it (same as the existing `.command`). The launcher also re-strips on
  every run.

## On-hardware verification (0.0.11 on M4) — .app FAILED, reverted

- [x] Double-click `CubricVision.app` -> **FAIL.** Finder prompted to install
  Rosetta (the .app was assessed as x86). After installing Rosetta, launching it
  crashed with:
  `Error: EPERM: process.cwd failed ... operation not permitted, uv_cwd`
  at `loadApplicationPackage (.../default_app.asar/main.js)`. Root cause: Finder
  launches a `.app` with the working directory set to `/`, so the bundled
  Electron's `process.cwd()` is denied and boot aborts before it can resolve the
  portable root. A `.app` whose payload is "run the portable folder next to me"
  is the wrong shape — the .app's cwd is not the portable root.
- [x] `start.command` (renamed test) -> **PASS** (launches clean after quarantine
  cleared). The proven launcher still works.

### Decision: DROP the .app. Keep start.command. Add setup.command.
The .app is not shippable (above). The real first-launch blocker is plain
Gatekeeper **quarantine** on the unsigned download — proven on M4:

```
xattr -dr com.apple.quarantine "/Users/rentamac/Downloads/CubricVision-macos-arm64-v0.0.11"
# then double-click start.command -> launches clean, no popup
```

The per-launch `xattr` inside start.command can't beat it (Gatekeeper blocks
before the script runs). Shipped fix in 0.0.12: a one-time `setup.command`
(mac-only) — right-click -> Open once, it strips quarantine on the whole folder,
then start.command works by double-click. Wired into build-portable.mjs
(`PLATFORM_CONFIG.darwin.setup`, staged into full + update bundle + manifest
launchers); documented in the macOS README + docs site.

### 0.0.11 functional acceptance — all 3 boxes PASS
Windows, Linux, and macOS (M4) all run 0.0.11 (boot + ComfyUI install +
generation) via their normal launchers. The only 0.0.11 defect was the broken
.app, fixed in 0.0.12.

A proper no-terminal mac launch (a signed/notarized .app) is **deferred** — it
needs a paid Apple Developer account for notarization. Not a 1.0.0 blocker.
