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

## 0.0.5 cycle — online-update path investigation (2026-06-09)

Investigated `update.bat` / `update.sh` (and `update.command`, same shape)
before attempting the online test. The scripts as shipped CANNOT pull from a
private repo. Three hard blockers:

1. **`/releases/latest` excludes prereleases/drafts.** GitHub's `latest`
   endpoint never returns a prerelease, so a private *pre*-release tag is
   invisible. Online update only sees a FULL (non-prerelease) release.
2. **No auth.** Both scripts send only a `User-Agent` header (no
   `Authorization: token`). A private repo returns 404 on both the API call
   and `browser_download_url`. Private-repo online update is impossible as
   written.
3. **Gating conflict.** Per memory `project_repo_distribution_gating` +
   `project_private_ci_artifact_gate`, portable artifacts are intentionally
   gated (built in private mpi-ci, NOT attached to public Cubric-Vision
   releases). A public release asset is exactly what the gating avoids.

Options to actually test the online path:
- (A) Publish a real PUBLIC, non-prerelease release on
  MadPonyInteractive/Cubric-Vision with the update zip attached. Works
  unchanged, but ships an ungated artifact (violates current gating unless
  accepted for this cycle).
- (B) **[recommended]** Patch the three scripts to support a token + explicit
  tag: send `Authorization: token <CUBRIC_GITHUB_TOKEN>`, use
  `/releases/tags/<tag>` instead of `/releases/latest` (so prereleases work),
  set `CUBRIC_GITHUB_REPO` to the private repo. Tests privately, keeps gating
  intact, and the token+tag support is reusable for gated early-access
  delivery. Requires script edits + a PAT on the test box.
- (C) Throwaway separate private repo as a fake release host — same script
  patch + PAT as (B), fully isolated from the real repos.

Status: investigation complete; no online test run yet (awaiting the 0.0.5
build + a decision on A/B/C). Build held until MPI-51 (open-source branch/docs
cleanup, currently `doing`) finishes, to avoid concurrent git activity.

### 0.0.5 prep done (2026-06-09)
- `release-baselines/windows-x64.json` + `linux-x64.json` refreshed to the
  **0.0.4** update-bundle manifests (win 266 files, linux 19 files,
  toVersion 0.0.4 / fromVersion 0.0.3) so 0.0.5 deltas against 0.0.4.
  `darwin-arm64.json` left at 0.0.3 (mac skipped this cycle). README "Current
  baselines" note updated. NOT committed (held with the bump).
- MPI-54 (download resume, commit 1f21db1) and MPI-57 (model WebP/hover,
  commit 0dde673) already landed on master — they ship in 0.0.5.

### BLOCKED on MPI-51 (decision: WAIT)
0.0.5 bump+build is held until the MPI-51 codex agent commits its uncommitted
open-source files (README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md,
.github/ISSUE_TEMPLATE/*, PULL_REQUEST_TEMPLATE.md, build-portable.yml).
Reason: `build-portable.mjs` stages the WORKING TREE, and those docs are NOT in
`APP_COPY_EXCLUDES`, so building now would ship half-written contributor docs;
also avoids a git race with MPI-51's branch/commit work. When the tree is clean,
do the full 0.0.5 pass in one go: bump -> build deltas (win local
--from-manifest --no-source-manifest + mpi-ci linux `-f ref=master`, skip mac)
-> clean Builds (delete 0.0.3 folders + extracted 0.0.4 dupes, keep archives +
mpi-ci-*-0.0.4) -> create a PUBLIC non-prerelease GitHub Release with the delta
zips (user toggles repo public for the online test, then back to private).
Online updater works unchanged on a public, non-prerelease release (the
`/releases/latest` API skips prereleases, so it must be marked latest).
