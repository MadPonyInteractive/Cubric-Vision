# MPI-62 Validation

## What changed
- `scripts/portable/apply-update.cjs` — applier now accepts the bundle arg as a
  `.zip` OR an already-extracted directory. Directory → used in place as the
  search root (no `extractZip`, left untouched at cleanup). Zip → extracted to a
  scratch `tmpRoot` and cleaned as before.
- `scripts/portable/macos/update-from-zip.command` — guard relaxed `-f` → `-e`
  (accept file or dir); usage text now tells the user the Safari-extracted
  folder works too.
- `scripts/portable/linux/update-from-zip.sh` — same `-f` → `-e` relax for
  consistency.
- Windows `.bat` already used `if not exist` (matches dirs) — unchanged.

## Automated checks already run (dev machine, Windows)
- Synthetic **directory** bundle (Safari case): applier applied the manifest
  file (`old` → `new`), `extract-zip` was never called (a throwing stub proved
  it), and the user-supplied dir was preserved. Exit 0.
- **Zip** bundle regression (real `extract-zip` + real node_modules): applied
  (`old` → `newzip`), scratch `tmp` cleaned. Exit 0.

## Needs user validation — real macOS path (the original bug)
1. On a Mac with **default Safari** (auto-extract on), download a
   `CubricVision-macos-arm64-update-v*.zip` so Safari extracts it to a FOLDER
   (long name may be truncated by Archive Utility — that is fine now).
2. In Terminal: `./update-from-zip.command /path/to/<extracted-folder>`
   (drag the folder onto the script). No manual `ditto` re-zip should be needed.
3. Expect: "Applied Cubric Vision update to <version>." and the app updated.
4. Also confirm the classic **zip** path still works on Mac:
   `./update-from-zip.command /path/to/<the .zip>`.

## Status
Implemented + dev-verified on Windows. Awaiting on-Mac verification of the real
Safari auto-extract path before moving to `done`.
