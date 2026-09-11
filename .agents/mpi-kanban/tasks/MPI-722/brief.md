# MPI-722 — stamp master `1.6.0`, a dev-line marker that never ships

> Prerequisite for **MPI-720** (the hand-delivered 1.5.0 → master delta). Found while
> planning it; carded separately because it changes the version registry, which MPI-720
> does not otherwise touch.
> **1.6.0 is never published.** No tag, no GitHub Release, no branch. It exists so a build
> we hand to one person is ordered correctly against what is on GitHub.

## The problem

Master has read `APP_VERSION = '1.4.2'` for ~900 commits while the release line shipped
1.4.3, 1.4.4 and 1.5.0 (see `.claude/skills/mpi-release/SKILL.md` § Preconditions — the
release line is the branch named `1.4.2`). So any build cut from master reports a version
*lower* than what the reporter is already running, and
`updateChecker.js` — which prompts on `compareSemVer(latest, current) > 0` — would offer him
GitHub's 1.5.0 as an upgrade, silently reverting the build he is meant to be testing.

## Why 1.6.0 and not 2.0.0, and not a `-dev` suffix

Decided with Fabio 2026-09-11, against the applier's real behaviour rather than taste:

- **`2.0.0` strands him.** When the real 2.0.0 ships, `compareSemVer('2.0.0', '2.0.0')` is 0,
  the prompt never fires, and he sits on a point-in-time dev build believing it is the
  release. The failure is invisible, which is the worst property available.
- **`1.6.0` keeps him on the update path.** 2.0.0 > 1.6.0, so the prompt fires when 2.0
  ships. It is also above 1.5.0, so nothing offers him a downgrade in the meantime.
- **No `-dev` / `-rc` suffix.** `compareSemVer` (`js/managers/versioningManager.js:17`) is
  `v.split('.').map(Number)` with no prerelease handling, so `1.6.0-dev.1` parses to a NaN
  segment. The update check would survive on the major/minor comparison, but the SAME
  comparator backs `isOperationAvailableIn`, which decides operation availability when a
  project is opened — there a NaN silently reads as "introduced later" and hides ops.

## Steps

1. **`/mpi-version-bump` to 1.6.0 — the version triple ONLY**: `js/core/appVersion.js`
   (`APP_VERSION`), `package.json`, `package-lock.json`, kept identical
   (`.agents/mpi-kanban/close-out.md` § Versioning). `SCHEMA_VERSION` stays 4 — nothing about
   the project data shape changes, and MPI-720 depends on it matching 1.5.0.
2. **Do NOT fold `docs/releases/UNRELEASED.md` into `RELEASE_NOTES['1.6.0']`.** Those notes
   belong to 2.0; 1.6.0 never ships, so a frozen 1.6.0 notes block would describe a build no
   user can install. This is the one deliberate deviation from the bump mechanic — say so in
   the commit rather than letting the next reader think it was forgotten.
3. **Record that 1.6 is reserved** — master dev-line marker, never published — so nobody
   later cuts a real 1.6.0 off the release line into a collision with installs already
   reporting it. `docs/releases/UNRELEASED.md` is the wrong home (it ships); put it where the
   release procedure is read: `.claude/skills/mpi-release/SKILL.md` § Preconditions, beside
   the existing note that the release line is not master.
4. **Trim MPI-720**: with master stamped, its build no longer needs `--version` at build time
   — `build-portable.mjs` defaults to `package.json`. Its brief already says so conditionally.

`release:check` will still report the pre-existing engine red (pin moved 0.31.0 → 0.34.0
since v1.4.2 and `smoke-evidence.json` is older than the 2026-09-10 `node_lock.json` change,
33 node classes unattested). **That is not caused by this bump and does not block it** — it
blocks a master RELEASE, and clearing it is a smoke re-run (`/mpi-bump-engine`) or an
attestation in `dev_configs/engine-attestation.json`. Do not let it turn a stamp into an
engine job.

## Owed later, not here

- **At the 2.0 bump:** re-stamp any operation-registry entries that land with
  `appVersionIntroduced: '1.6.0'`. No released build ever had 1.6, so that label would point
  at a version no user can have run.
- **At the 2.0 RELEASE:** publish a **full** update bundle (`fromVersion: null`) alongside the
  usual delta, or hand him one. MPI-709's `assertBundleApplies`
  (`scripts/portable/apply-update.cjs:136`) refuses a delta whose `fromVersion` does not match
  the installed version, so the normal 1.5.0 → 2.0.0 delta will correctly refuse his 1.6.0
  install. The refusal message already promises the user exactly this ("a repair release that
  installs over any version is on the way"), so the full bundle is what makes good on it —
  for him and for anyone else on an odd version.

## Verify

- `js/core/appVersion.js`, `package.json` and `package-lock.json` all read 1.6.0 and nothing
  else moved; `SCHEMA_VERSION` still 4.
- `RELEASE_NOTES` has no `1.6.0` key and `UNRELEASED.md` is untouched.
- One check against the comparator, since the whole choice rests on it:
  `compareSemVer('2.0.0','1.6.0') === 1` (the 2.0 prompt fires) and
  `compareSemVer('1.5.0','1.6.0') === -1` (no downgrade offer).
