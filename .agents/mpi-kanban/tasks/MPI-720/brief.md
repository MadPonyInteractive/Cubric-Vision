# MPI-720 — a 1.5.0 → master delta, so the reporter can verify the download fixes

> Follows umbrella **MPI-717** (MPI-716 + MPI-718 + MPI-719, all `done` 2026-09-11).
> **Not a release. No tag, no GitHub Release, no `update-manifest.json` publish.**
> One update-only bundle, handed to one person.

**Decided 2026-09-11 (Fabio): no 1.5.1.** The 1.5.x line is already set up so the next
update off it is 2.0, and cutting a patch release there means the whole release loop for one
verification. Instead the reporter gets **master** as a delta over his 1.5.0 install. The fix
then ships to everyone in 2.0 as normal, with his run as the evidence it works.

## Why a build at all

Two of the three fixes cannot be verified on the dev box and never will be: no link here
sustains 20-40 KB/s (MPI-716's slow-stream WARN) and nothing here reproduces real mid-transfer
blips on a multi-GB dep (MPI-718's budget reset). MPI-719 IS fully verified here — deterministic
test, plus the pre-fix bodies driven through the same shapes to prove the test fails without
the fix. His machine is not a fallback, it is the designed verification: MPI-716 exists so his
next run is readable from `app.log` alone.

## The five facts that shape the build

Measured 2026-09-11, master `78400b06` vs the shipped `v1.5.0`:

1. **`SCHEMA_VERSION` is 4 on both.** No project migration either way, so his projects are not
   trapped and he can go back to 1.5.0 by reinstalling it. This is what makes the whole plan
   safe; re-check it if master's schema moves before the build.
2. **Engine core pin is identical (`v0.34.0`), but master pins 21 custom nodes against
   1.5.0's 16.** His first boot after the update will install the extra nodes and their python
   deps. Tell him up front: it is a download, it is expected, and it happens to exercise the
   very path under test.
3. **master's `APP_VERSION` was `1.4.2` — LOWER than the 1.5.0 he is running.** Left alone, his
   app reports a downgrade and `updateChecker.js` (`compareSemVer(latest, current) <= 0` gates
   the prompt) would offer him 1.5.0 as an upgrade, quietly reverting the build under test.
   **MPI-722 landed on 2026-09-11 and master now reads `1.6.0`** — above every published
   release, below the 2.0 master is heading for, never itself published, and ordered so his
   install still takes the real 2.0 update when it ships. So **pass no `--version` flag**:
   `build-portable.mjs` defaults to `package.json`, which is already stamped, and a flag here
   could only reintroduce drift. Never a `-dev` suffix, which parses to NaN in `compareSemVer`.
   The build warns when the baseline's `toVersion` is not older than the version being stamped,
   which is the same problem telling you about itself.
4. **The 1.5.0 baseline manifest is NOT on master** — `release-baselines/` there holds only
   `README.md`. It lives on the release line: `release-baselines/win32-x64.json` at branch
   `1.4.2`, restamped to the shipped 1.5.0 by `8df1c9b3`. Pull that file out and hand it to
   `--from-manifest`; a wrong baseline silently produces a bundle that is fat or wrong rather
   than one that errors.
5. **master is mid-flight** — cards still in `doing`, Flow/audio/connector work partly landed.
   Unrelated breakage may muddy his report. Accepted deliberately: the alternative was the
   1.5.1 release loop. If he hits something unrelated, it is a finding, not a blocker.

## Steps

0. **MPI-722 first** — master stamped 1.6.0. Everything below assumes it.
1. Build on master:
   `node scripts/build-portable.mjs --from-manifest <the 1.5.0 win32-x64 baseline>
   --no-source-manifest`
   - **`--no-source-manifest` is not optional.** Without it the run mirrors its manifest over
     the tracked `resources/cubric/update-manifest.json`
     (`docs/releases/portable-distribution-contract.md` § verification builds).
   - Stages to `D:\tmp\cubric-portable`; the script refuses to stage inside the repo.
   - mpi-ci `workflow_dispatch` is the alternative and takes `ref: Branch, tag, or SHA`.
2. Sanity-check the emitted manifest before sending: `fromVersion` reads 1.5.0, `toVersion`
   reads the stamp, and `delete[]` contains nothing under the PRESERVE prefixes (`engine/`,
   `models/`, `user-data/`, Documents).
3. **Confirm he is actually on 1.5.0, in-app, not from `update-manifest.json`** — that file is
   stale in the field (MPI-710). `fromVersion` is a PRECONDITION, not a label (MPI-709): the
   delta carries only what changed between those two trees, so on any other base it silently
   leaves him half-updated. If he is not on 1.5.0, send a FULL bundle instead
   (omit `--from-manifest`).
4. Send the delta zip. He runs **`update-from-zip.bat`** in his portable folder — the
   documented offline path for a manually delivered bundle. His projects, models and engine
   stay where they are. If it leaves him broken, the Windows escape hatch is a fresh full
   download.

## Ask him for exactly this back

One `app.log` after a download run, plus the four greps that make it readable
(`docs/download-manager.md` § MPI-716 carries the table):

- `grep '\[download\].*free space'` — was the volume full, and is it the same volume as `userData`?
- `grep '\[download\].*slow stream'` — rate, origin, peer IP, Cloudflare POP.
- `grep '\[download\].*write probe'` — **disk or network?** The line the whole diagnosis turned on.
- `grep 'models/check failed'` — **must be zero.** Two of these 102 ms after a cancel is what
  MPI-719 fixed.
- And the behavioural one: does a large dep now survive blips instead of dying at 3/3?

## Then

His run is the evidence for all three fixes; they ship to everyone in 2.0 with no further
work. If the log says the crawl is still there, it now says WHY — which was the point of
shipping MPI-716 first.

**This bundle never reaches GitHub** (Fabio, 2026-09-11). It is handed over directly and
nothing about it is published. His route back to the normal channel is the 2.0 release, which
his 1.6.0 stamp will prompt for — see MPI-722 § Owed later for the one thing 2.0's release
owes him: a FULL update bundle, since the ordinary 1.5.0 → 2.0.0 delta will refuse a 1.6.0
install by design.

## Evidence

The original captures are kept OUTSIDE every git root because they carry a third-party
username and folder layout. **The board is public: never paste that path, the username, or his
model-root path into a card, brief or validation file.** MPI-717's plan holds the pointer.
