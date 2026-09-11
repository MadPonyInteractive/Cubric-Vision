# MPI-722 — validation

Master is stamped `1.6.0`. The version triple only; 1.6 is never published.

## What landed

| File | Change |
|---|---|
| `js/core/appVersion.js` | `APP_VERSION` `1.4.2` → `1.6.0`. `SCHEMA_VERSION` untouched at 4 |
| `package.json` | `version` `1.4.2` → `1.6.0` |
| `package-lock.json` | root `version` and `packages[""].version` → `1.6.0` |
| `.claude/skills/mpi-release/SKILL.md` | § Preconditions gains the `1.6.x is RESERVED` bullet |
| `.agents/mpi-kanban/tasks/MPI-720/brief.md` | trap 3 retargeted: master now reads 1.6.0, so the build passes NO `--version` flag |

`git diff --stat` on the triple is 4 changed lines and nothing else.

## Evidence

- **Comparator, run against the real module** (`node --input-type=module` importing
  `js/managers/versioningManager.js` and `js/core/appVersion.js`) — the whole version choice
  rests on this and it is measured, not asserted:
  - `APP_VERSION 1.6.0`, `SCHEMA_VERSION 4`
  - `compareSemVer('2.0.0','1.6.0') === 1` — the real 2.0 prompt WILL fire
  - `compareSemVer('1.5.0','1.6.0') === -1` and `('1.4.4','1.6.0') === -1` — nothing published
    offers a downgrade
  - `compareSemVer('1.6.0','1.6.0') === 0` — the exact trap that ruled out stamping 2.0.0
- **`npm test` 918/918 pass.** The one test carrying a literal `1.4.2`
  (`tests/issue-report-url.test.cjs`) builds it as fixture data and never reads `APP_VERSION`.
- **`npm run release:check`** — version drift clean (the three files agree, which is the check
  this card owns). It fails on three lines, none of which is a defect here:
  1. `Missing runtime release notes for APP_VERSION 1.6.0` and
  2. `Missing archival release note docs/releases/YYYY-MM-DD-v1.6.0.md` — **deliberate**.
     1.6.0 never ships, so a frozen notes block would describe a build no user can install;
     `docs/releases/UNRELEASED.md` stays whole and belongs to 2.0. Confirmed: no `'1.6.0'` key
     in `js/data/releaseNotes.js`, no `1.6` file in `docs/releases/`, `UNRELEASED.md` shows
     clean in `git status`.
  3. The engine red — pin moved `0.31.0 → 0.34.0` since `v1.4.2`, `smoke-evidence.json`
     recorded 2026-09-05 against a `node_lock.json` last changed 2026-09-10, 33 node classes
     unattested. **Pre-existing and independent of this bump**: that check
     (`scripts/release-health-check.mjs`, the `bumpNote` block) reads the last `v*` tag,
     `node_lock.json` and `smoke-evidence.json` — `APP_VERSION` is not one of its inputs, and
     no tag was cut here. Clearing it is `/mpi-bump-engine` or an attestation in
     `dev_configs/engine-attestation.json`, and it blocks a master RELEASE, not this stamp.

A red `release:check` is the correct resting state for master right now: it refuses to release
1.6.0, which is exactly what 1.6.0 is for.

## Owed later (carried forward from the brief, not done here)

- **At the 2.0 bump:** re-stamp any operation-registry entry that lands with
  `appVersionIntroduced: '1.6.0'` — no released build ever had 1.6. None exist today.
- **At the 2.0 RELEASE:** publish a **full** bundle (`fromVersion: null`) alongside the delta.
  `assertBundleApplies` (`scripts/portable/apply-update.cjs`) refuses a delta whose
  `fromVersion` does not match the installed version, so the ordinary 1.5.0 → 2.0.0 delta will
  correctly refuse a 1.6.0 install. Recorded in `.claude/skills/mpi-release/SKILL.md`
  § Preconditions so the release procedure carries it, not just this card.

## Unblocks

MPI-720 — build the 1.5.0 → master delta. Its brief's step 0 precondition is now satisfied.
