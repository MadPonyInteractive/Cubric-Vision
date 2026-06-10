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

## On-hardware verification — PENDING (with the 0.0.11 build)

- [ ] Double-click `CubricVision.app` on M4 -> app launches, NO Terminal window.
- [ ] `start-with-terminal.command` -> app launches WITH Terminal.
- [ ] Dock shows the Cubric icon (not generic).
- [ ] First-launch Gatekeeper right-click->Open works on the `.app`.
