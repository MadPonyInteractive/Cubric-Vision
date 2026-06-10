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

## 0.0.4 -> 0.0.5 cycle (2026-06-09)

Bumped 0.0.4 -> 0.0.5 (commit 8bbc50e, pure patch). Ships: MPI-54 (model
download cross-restart resume), MPI-57 (model preview WebP + hover video),
MPI-49 (applier exec-bit fix — first bundle to carry it), MPI-51 (open-source
contributor docs).

### BASELINE BUG FOUND + FIXED (important)
The first 0.0.5 Windows build produced a **bogus 5093-file "delta"**. Root cause:
the release-baselines were refreshed to the 0.0.4 **update-bundle (delta)**
manifest (266 files) instead of the **full portable-stage** manifest. The delta
diff needs the previous release's COMPLETE file set; with only 266 hashes it
flagged the whole app as "added". Fixed by using the full
`portable-stage` manifest (`fromVersion: null`) from the previous **full** build
(win 5343 files, linux 5304 files) -> real **38-file / 5-delete** delta.
`release-baselines/README.md` contract corrected so this won't recur.
Second trap: the stale stage dir wasn't wiped between builds, so a temp dir
(`tmp-baseline-fix/`) created inside the repo got swept into the bundle. Fix:
always pass `--clean`, and never create temp dirs inside the repo root during a
build.

### Deltas built + verified (true 0.0.4 -> 0.0.5 deltas, buildHash 8bbc50e0d01d)
- Windows: local build, 38 files / 5 deletes,
  `D:/CubricStudio/Vision/Builds/CubricVision-windows-x64-update-v0.0.5.zip`.
- Linux: mpi-ci run 27234648345 (success), 38 files / 5 deletes,
  `.../mpi-ci-linux-0.0.5/CubricVision-linux-x64-update-v0.0.5.zip`. Same
  buildHash as Windows (both from 8bbc50e); mpi-ci read the committed full
  baseline and produced a real delta too.
- macOS: SKIPPED this cycle (per user; next stage = author the mac build from
  the build-experience-log).
- Both bundles carry `update/apply-update.cjs` with the exec-bit fix.

### GitHub Release created (for online-updater test)
`gh release create v0.0.5 --repo MadPonyInteractive/Cubric-Vision --target master`
non-prerelease, marked latest. `/releases/latest` returns v0.0.5. Both delta
zips attached (names match the updater patterns
`CubricVision-{windows-x64,linux-x64}-update-v*.zip`). Tag `v0.0.5` -> 8bbc50e
pushed to origin.

### ONLINE UPDATE TEST — READY (awaiting user)
Repo is private; the updater's `/releases/latest` + asset download 404 on a
private repo (no auth in the scripts). To test: toggle the repo PUBLIC, run the
online updater on a v0.0.4 install, confirm it pulls + applies v0.0.5, then
toggle PRIVATE again.
- Windows: run `update.bat` in the v0.0.4 portable install.
- Linux: run `sh ./update.sh` in the v0.0.4 portable install.

### Cleanup commands (release is fully deletable)
- `gh release delete v0.0.5 --repo MadPonyInteractive/Cubric-Vision --yes`
- `git push origin :refs/tags/v0.0.5` (delete remote tag)
- `git tag -d v0.0.5` (delete local tag, if created locally)

### ONLINE UPDATE TEST — RESULT (2026-06-10)
- **Windows online update: PASS.** `update.bat` (PowerShell) pulled v0.0.5 from
  the public release and applied it.
- **Linux online update: the original `update.sh` FAILED — root cause `curl` not
  installed** ("curl: not found", exit 127; `set -e` aborted, terminal just
  flashed). The updater must NOT assume host tools (especially for macOS, which
  we cannot test). FIX: all network work moved into a new
  `scripts/portable/fetch-release.cjs` (pure Node `https`, follows redirects,
  clear 404/private-repo message) run via electron-as-node — the bundled
  Electron binary is the ONLY guaranteed runtime. `update.sh` and
  `update.command` rewritten to just locate Electron + run fetch-release.cjs +
  error/pause; zero curl/wget/system-node dependency. `update.bat` left on
  PowerShell (guaranteed on Windows; already worked). build-portable.mjs now
  copies fetch-release.cjs into `update/`. After this, Linux online update
  APPLIED v0.0.5 successfully (run from a terminal).
- **EXEC-BIT STRIP recurred after the online update** (launchers lost "Run as
  program"). Root cause this round: the install was 0.0.4, so the OLD applier
  (no exec-bit fix) applied the bundle. The 0.0.5 bundle DID ship the fixed
  applier (verified: `restoreExecBit` present), so the install now has it.
  Hardening added so this never depends on applier version or delta contents:
  (1) `restoreLauncherBits()` in apply-update.cjs — a final sweep that force +x's
  every known launcher + the Electron binary, manifest-independent;
  (2) wrapper-side `chmod +x` sweeps in update-from-zip.{sh,command} that always
  run, immune to applier version skew. Three independent layers now.
- ALL the above (fetch-release.cjs, launcher-bit sweeps) are UNCOMMITTED and ship
  from **0.0.6**. The current 0.0.5 install has the fixed applier but not the new
  sweeps. Manual recovery of the live Linux install:
  `chmod +x start.sh start-with-terminal.sh update.sh update-from-zip.sh resources/setup-desktop.sh`.
- NEXT: cut 0.0.6 with these fixes, then test 0.0.5 -> 0.0.6 online update and
  confirm the launchers STAY executable (the real self-heal proof).

## 0.0.5 -> 0.0.6 cycle (2026-06-10)

Bumped 0.0.5 -> 0.0.6 (commit 0a36ed2 fixes + 9b293cf baselines, pure patch).
Ships the online-updater hardening (no curl/wget/system-node; 3-layer exec-bit
self-heal). Baselines refreshed to the **0.0.5 FULL** manifests (win 5350, linux
5311 files) the trap-aware way.

### Deltas built + verified (true 0.0.5 -> 0.0.6, buildHash 9b293cffb52e)
- Windows: local, 15 files / 0 deletes,
  `D:/CubricStudio/Vision/Builds/CubricVision-windows-x64-update-v0.0.6.zip`.
- Linux: mpi-ci run 27255860983 (success), 15 files / 0 deletes, same buildHash.
  Confirmed the bundle carries `update/fetch-release.cjs`,
  `update/apply-update.cjs` (self-heal), `update.sh`, `update-from-zip.sh`.
  (First Linux dispatch 27255819123 was cancelled — it ran before the 0.0.5
  baseline was pushed; re-dispatched against 9b293cf.)
- macOS: SKIPPED again.

### GitHub Release swapped v0.0.5 -> v0.0.6
Deleted the v0.0.5 release + remote tag; created v0.0.6 (non-prerelease, latest,
target master) with both 0.0.6 delta zips. `/releases/latest` returns v0.0.6.
Tag v0.0.6 -> 9b293cf pushed.

### ONLINE UPDATE TEST 0.0.5 -> 0.0.6 — READY (awaiting user)
This is the real proof of both fixes. On a v0.0.5 install, with the repo PUBLIC:
- Linux: `sh ./update.sh` from a terminal. Expect: NO curl needed (uses bundled
  Electron), downloads + applies 0.0.6, AND the launchers REMAIN executable
  afterwards ("Run as program" still works) — because the v0.0.5 install now has
  the fixed applier, plus the wrapper re-chmods. Verify with `ls -l *.sh` (should
  be -rwxr-xr-x) and that "Run as program" is still offered.
- Windows: `update.bat` (PowerShell path, unchanged; should still work).
Then toggle the repo PRIVATE again.

### Cleanup commands (v0.0.6 fully deletable)
- `gh release delete v0.0.6 --repo MadPonyInteractive/Cubric-Vision --yes`
- `git push origin :refs/tags/v0.0.6`

### RESULT — 0.0.5 -> 0.0.6 (2026-06-10): PASS (Linux, all verified by user)
- **Bootstrap trap confirmed + escaped.** The 0.0.5 install shipped the OLD
  curl-based `update.sh`; on the curl-less box it could not pull its own fix
  online. Escaped via the offline path: `sh ./update-from-zip.sh
  CubricVision-linux-x64-update-v0.0.6.zip` — needs NO curl (extract+apply via
  bundled Electron only). Applied 0.0.6 cleanly.
- **Exec-bit self-heal PROVEN.** After the offline 0.0.6 apply the launchers are
  `-rwxr-xr-x` and "Run as program" works again — the three-layer fix
  (restoreExecBit + restoreLauncherBits + wrapper chmod) holds.
- App reports 0.0.6; `update/fetch-release.cjs` present.
- A manual copy of `update.sh` alone (without its fetch-release.cjs companion)
  correctly fails loud: "updater helper missing at .../fetch-release.cjs ... Press
  Enter to close" — by-design, not a bug. The two files travel together.
- Note: from 0.0.6 onward the updater has NO host-tool dependency, so this class
  of online-update failure is ended going forward; the offline `update-from-zip`
  path remains the permanent curl-free escape hatch (lead with it in Patreon/README
  instructions for any jump to a fixed updater).

**MPI-49 portable update-flow testing is COMPLETE** for Windows + Linux
(0.0.3->0.0.4->0.0.5->0.0.6, offline + online, exec-bit, no-curl). macOS remains
untested (no mac hardware/build this cycle); the updater fixes cover .command +
the Electron.app binary but are unverified on real Apple hardware — see the macOS
pre-build checklist.

### ONLINE UPDATE via "Run as program" — FULL PASS (0.0.6 -> 0.0.7, 2026-06-10)
Cut a throwaway 0.0.7 (changelog-only) and tested the ONLINE path from the click
method users use: right-click `update.sh` -> "Run as program" opened a terminal,
showed the updating output, applied 0.0.7; launching the app (also "Run as
program") showed the "Updated to version 0.0.7" overlay. No curl needed; exec-bit
self-heal held. This is the definitive online-update proof for Linux. The 0.0.7
release + tag are to be deleted (throwaway):
- `gh release delete v0.0.7 --repo MadPonyInteractive/Cubric-Vision --yes`
- `git push origin :refs/tags/v0.0.7`
