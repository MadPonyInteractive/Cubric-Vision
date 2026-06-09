# Validation — Update flow (Windows + Linux) with version bump

## 0.0.3 -> 0.0.4 cycle (2026-06-09)

Bumped 0.0.3 -> 0.0.4 (commit 61cd926, pure patch: 3 portable bugs + MPI-48).
Built true delta update bundles (from 0.0.3) for all three platforms:
- Windows: local build, 266 changed files, `D:\CubricStudio\Vision\Builds\CubricVision-windows-x64-update-v0.0.4.zip`.
- Linux: mpi-ci run 27223953212, 19 changed files, `.../mpi-ci-linux-0.0.4/CubricVision-linux-x64-update-v0.0.4.zip`.
- macOS: mpi-ci same run, `.../mpi-ci-darwin-arm64-0.0.4/CubricVision-macos-arm64-update-v0.0.4.zip` (not yet applied/tested).

### PASS
- **Windows offline update (update-from-zip.bat):** applied onto a fresh 0.0.3
  install by DRAG-DROPPING the update zip onto `update-from-zip.bat` (the bat is
  arg-required; double-click with no arg flashes the usage line and exits — see
  UX note below). 0.0.3 -> 0.0.4 applied; user-verified valid.
- **Linux offline update (update-from-zip.sh):** applied onto a fresh 0.0.3
  install via terminal `sh ./update-from-zip.sh <zip>`. Update applied.
- **Linux BUG B (start.sh "Run as program"):** after recovering exec bits (see
  applier regression below), right-click start.sh -> "Run as program" launches
  the app. The `setsid --fork` detach fix is verified.

### REGRESSION FOUND + FIXED (rolls into 0.0.5)
- **Applier stripped the exec bit.** `apply-update.cjs` copied updated files with
  `fs.copyFileSync` (does NOT preserve mode), so updated launchers on Linux/mac
  (`start.sh`, `*.command`, etc.) landed non-executable: no "Run as program",
  double-click opened them as text. Recovered the live 0.0.4 install with a
  manual `chmod +x` of the launchers. Fixed in `apply-update.cjs` with
  `restoreExecBit()` (preserve bundle mode + force +x on `.sh`/`.command`/electron
  binary; Windows no-op). The fix only takes effect from a bundle built WITH it,
  so it ships in 0.0.5, NOT this 0.0.4 (committed status: pending as of this note).

### NOT YET VERIFIED
- **BUG C (engine install pause button removed)** — needs an engine install.
- **MPI-48 (gallery icon overlap)** — verified in dev via `npm start`; not yet
  re-checked on a box post-update.
- **BUG A (chosen models folder kept on first-run install)** — needs a fresh
  engine provision.
- Linux box cannot run generations, so generation-dependent checks are blocked
  there. Windows box is the place to verify BUG A/C and MPI-48 post-update.
- **macOS** update-from-zip not tested (no mac build/test this cycle).
- **Online update path (update.bat / update.sh)** NOT tested — needs a real or
  pre-release GitHub Release asset (gated per repo-distribution rules).

### UX NOTE (not a blocker; deferred)
`update-from-zip.bat/.sh/.command` require the zip path as an argument. Windows
users can drag-drop the zip onto the bat (Explorer passes it as %1); Linux/mac
file managers do NOT pass drops as args, so those users must run it from a
terminal with the path. Patreon delivery posts will include the terminal command.
A future "auto-detect zip in folder + prompt fallback" launcher improvement was
discussed but deferred.
