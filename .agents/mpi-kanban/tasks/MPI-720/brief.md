# MPI-720 — an UNRELEASED 1.5.1 build for the beta user to verify MPI-717

> Follows umbrella **MPI-717** (MPI-716 + MPI-718 + MPI-719, all `done` 2026-09-11).
> **This is NOT a release.** No tag, no GitHub Release, no `update-manifest.json` publish.
> A build, handed to one person, to get the only evidence this box cannot produce.

## Why a build at all

Two of the three fixes cannot be verified here and never will be:

- **MPI-716** (telemetry) — the slow-stream WARN wants a link sustaining under 1 MB/s for
  60 s. This connection does not do that, and the harness already fakes it.
- **MPI-718** (retry budget) — wants real blips mid-transfer on a multi-GB dep.
- **MPI-719** (scan race) — the one that IS fully verified here: deterministic test, plus
  the pre-fix bodies driven through the same shapes to prove the test fails without the fix.

The reporter's machine is not a fallback, it is the designed verification: MPI-716 exists so
his *next* run is readable from `app.log` alone instead of by differencing resume offsets.

## Order — do not reorder 1 and 2

1. **Base off the live release line, never master.** Master is ~918 commits past the release
   branch point (2026-08-15) with cards still in `doing`; shipping it would drag a month of
   in-flight Flow/audio/connector work to a beta user. That is the 1.2.0 failure recorded in
   `.claude/skills/mpi-release/SKILL.md` § "Cut the maintenance branch".
   - **The live release line is the branch named `1.4.2`** — it has carried 1.4.3, 1.4.4 and
     1.5.0. It is checked out at the sibling worktree `C:/AI/Mpi/Cubric-Vision-1.4.x`, in
     sync with `origin/1.4.2`, 3 commits past the `v1.5.0` tag (docs + baseline restamps,
     no code).
   - **The local `1.5.0` branch is stale — 7 commits BEHIND the `v1.5.0` tag. Do not use it.**
   - Branch `1.5.1` from `origin/1.4.2`.

2. **Port the three fixes, code/doc/test hunks only.** In order: `ef011238` (MPI-716),
   `43dab57a` (MPI-718), then the MPI-719 commit — find it with
   `git log --oneline --grep=MPI-719 master`, it is the one touching `routes/shared.js` and
   `routes/downloadCompletion.js`.
   - The release line does **not** carry this board, so leave every `.agents/` hunk out.
     `guard-git` blocks `checkout --` / `restore` / `stash` / `reset --hard` / `clean`, so
     pick a mechanic that does not need them (`cherry-pick -n` then commit by explicit
     pathspec is the shape the rest of this repo uses).
   - Drift measured 2026-09-11, so a conflict is not a surprise: `downloadCompletion.js` is
     **identical** on both lines; `findFileRecursive`'s body is identical too (the release
     line's `shared.js` drift is MPI-654 and MPI-525 *around* it); only
     `routes/downloadManager.js` carries real pre-existing drift (76 insertions / 35
     deletions) for the MPI-716 and MPI-718 hunks to land on. `server.js` takes MPI-716's
     boot line.
   - Engine pin untouched by all three (`dev_configs/node_lock.json` unchanged), so
     `release:check`'s smoke-evidence gate does not apply and no Pod spend is owed.

3. **Stamp 1.5.1** — `/mpi-version-bump`, third digit, bug fixes only. Delta baselines are
   already restamped to the shipped 1.5.0 on this line (`8df1c9b3`), which is exactly what
   the delta needs.

4. **Build, do not publish.** mpi-ci `workflow_dispatch` takes `ref: Branch, tag, or SHA` —
   point it at the `1.5.1` branch; it uploads the full artifact plus the update bundle.
   **Pass `--no-source-manifest`**: without it the run mirrors its manifest over the tracked
   `resources/cubric/update-manifest.json` (`docs/releases/portable-distribution-contract.md`
   § verification builds). A local `npm run build:portable:win` is the fallback — it stages to
   `D:\tmp\cubric-portable` and refuses to stage inside the repo.

5. **Hand him the DELTA bundle, not the full portable.** He runs `update-from-zip.bat` in his
   portable folder — the documented offline path for a manually delivered bundle. That keeps
   his projects, his models under his custom root, and his engine. A fresh full portable would
   make him re-do the whole engine/models dance for nothing.
   - **`fromVersion` is a PRECONDITION, not a label (MPI-709).** A 1.5.0 → 1.5.1 delta carries
     only the files that changed between those two, so it must land on a real 1.5.0 install.
     **Confirm his version in-app first, not from `update-manifest.json`** — that file is
     stale in the field (MPI-710). If he is not on 1.5.0, send the FULL bundle instead.
   - If the update leaves him broken, the Windows escape hatch is a fresh full download.

6. **Ask him for exactly this back** — one `app.log` after a download run, and the four greps
   that make it readable (`docs/download-manager.md` § MPI-716 carries the table):
   - `grep '\[download\].*free space'` — was the volume full, same volume as `userData`?
   - `grep '\[download\].*slow stream'` — rate, origin, peer IP, Cloudflare POP.
   - `grep '\[download\].*write probe'` — **disk or network?** The line the whole diagnosis
     turned on.
   - `grep 'models/check failed'` — **must be zero.** Two of these 102 ms after a cancel is
     what MPI-719 fixed.
   - And the behavioural one: does a large dep now survive blips instead of dying at 3/3?

## Then, and only then

If his run confirms it, cut the real 1.5.1 with `/mpi-release` off the same branch. If it does
not, the log now says why — which was the point of shipping MPI-716 first.

## Evidence

The original captures are kept OUTSIDE every git root because they carry a third-party
username and folder layout. **The board is public: never paste that path, the username, or
his model-root path into a card, brief or validation file.** MPI-717's plan holds the pointer.
