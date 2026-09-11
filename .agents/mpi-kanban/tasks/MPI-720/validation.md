# MPI-720 — validation

The 1.5.0 → master delta is built and checked. Nothing was published: no tag, no GitHub
Release, no manifest mirrored into the repo.

## The artifact

| | |
|---|---|
| Bundle | `CubricVision-windows-x64-update-v1.6.0.zip` — **15.5 MB**, 564 entries |
| Built from | `df2400bf`, a **detached worktree at master HEAD**, stamped `BUILD_HASH df2400bfe3d8` |
| Mode | `delta`, `fromVersion 1.5.0` → `toVersion 1.6.0`, 563 files, 22 deletes |
| Output | `D:\CubricStudio\Vision\Builds` (the script's own Windows default) |
| Alongside | the full portable `CubricVision-windows-x64-v1.6.0.zip` (518.7 MB) as the fallback, and a `READ-ME-FIRST.md` handover note |

**15.5 MB against 518.7 MB is the whole point of the delta.** On the 20-40 KB/s link this card
exists to diagnose, the full bundle is 4-7 hours; the delta is 7-13 minutes.

## The one thing that nearly shipped wrong

`build-portable.mjs` copies the **WORKING TREE** (`copyAppTree(REPO_ROOT, …)`), not a git ref.
This tree held ~31 uncommitted files from three live peer sessions — mid-implementation
`MpiPromptBox`, `MpiGalleryGrid`, `state.js`, `navigation.js`, `projectService.js`,
`routes/projects.js`. A build from here would have handed a beta tester three sessions' worth
of half-finished UI as if it were master, on the one run that is supposed to isolate a
download bug.

So the build ran in `git worktree add --detach D:/tmp/cv-720`. Two bonuses fell out of it: the
worktree's own `npm install` resolved the current `package.json`, where this repo's
`node_modules` still carries a stale `@cubric/` link that `assertNoDanglingSymlinks` would have
**failed the build on**; and `--no-source-manifest` plus an out-of-tree build means no repo file
was touched by the build at all.

## Evidence

- **Manifest, read from inside the zip** (not from the staged folder): `fromVersion 1.5.0`,
  `toVersion 1.6.0`, `win32/x64`, 563 files, 22 deletes.
- **All 22 deletes sit under `resources/app/`** — app files that existed in 1.5.0 and are gone
  on master (three retired flow workflows, `MpiFlowHeadSwap`, `MpiFlowImageRegen`,
  `connectorOps.js`, `brokerBoot.js`, `connectorResponder.js`, the release line's own
  `release-baselines/` and 1.4.3/1.4.4/1.5.0 notes). **Zero** fall under a PRESERVE prefix
  (`engine/`, `models/`, `user-data/`, `<documents>/Cubric Vision/…`), checked
  programmatically, so his models, engine and projects are untouched.
- **The stamp inside the bundle**: `APP_VERSION = '1.6.0'`, `SCHEMA_VERSION = 4`,
  `BUILD_HASH = 'df2400bfe3d8'`.
- **The fixes are actually in it**, verified by reading file bodies out of the zip rather than
  trusting the file list: `routes/downloadManager.js` carries all three MPI-716 telemetry
  strings (`free space`, `slow stream`, `write probe`) plus MPI-718's retry budget, and
  MPI-719's two readers (`routes/shared.js`, `routes/downloadCompletion.js`) are both present.
- **Baseline provenance**: extracted with `git show 1.4.2:release-baselines/win32-x64.json`
  (`toVersion 1.5.0`, 6527 files) rather than read off a working copy.

## The gate this card hit

`build-portable.mjs` calls `assertApproved()` on every non-dry-run build, and refuses without
`RELEASE_NOTES['<version>']` **and** a matching `docs/releases/.approved-<version>.json`. MPI-722
had deliberately created neither. There is no bypass and the CI route hits the same gate, so the
build was blocked outright.

Resolved by writing a 1.6.0 entry for the one person who will actually read it — the changelog
overlay fires once per `APP_VERSION`, so this build's single user does see it. Approved by
Fabio, landed in `df2400bf`. `docs/releases/UNRELEASED.md` was **not** folded and still owns the
2.0 changelog. Once `APP_VERSION` passes 1.6.0 both the entry and the token are inert (lookup is
by exact key), so removing them is cleanup at the 2.0 bump, not urgent work.

## Open — the evidence this card was built to collect

The bundle and its handover note are on disk. What remains is outside this repo: Fabio sends
the zip, the reporter runs `update-from-zip.bat`, and his `app.log` comes back with the four
greps. That is the verification MPI-716/718/719 cannot get on this machine, and it arrives on
his schedule, not ours.
