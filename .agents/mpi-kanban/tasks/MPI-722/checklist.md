# MPI-722 — checklist

Derived from `tasks/MPI-722/brief.md`. Prerequisite for MPI-720; 1.6.0 is never published.

- [x] Version triple stamped 1.6.0 and identical in all three: `js/core/appVersion.js`
      (`APP_VERSION`), `package.json`, `package-lock.json` (both the root `version` and the
      `packages[""]` copy)
- [x] `SCHEMA_VERSION` still 4 — nothing about the project data shape changes, and MPI-720's
      delta depends on it matching 1.5.0
- [x] NO `RELEASE_NOTES['1.6.0']` block and `docs/releases/UNRELEASED.md` untouched — those
      notes belong to 2.0, and a frozen 1.6.0 block would describe a build nobody can install.
      The deliberate deviation from the bump mechanic is named in the commit message
- [x] 1.6 recorded as reserved (master dev-line marker, never published) in
      `.claude/skills/mpi-release/SKILL.md` § Preconditions, beside the existing note that the
      release line is not master
- [x] MPI-720's brief trimmed: with master stamped its build no longer needs `--version`
      (`build-portable.mjs` defaults to `package.json`)
- [x] Comparator check, since the whole choice rests on it:
      `compareSemVer('2.0.0','1.6.0') === 1` (the 2.0 prompt fires) and
      `compareSemVer('1.5.0','1.6.0') === -1` (no downgrade offer)
- [x] `release:check` run and its output read: the engine red (pin 0.31.0 → 0.34.0 since
      v1.4.2, `smoke-evidence.json` older than the 2026-09-10 `node_lock.json`, 33 node
      classes unattested) is pre-existing, is not caused by this bump, and does NOT turn into
      an engine job here
- [x] Nothing else moved — `git diff --stat` shows only the claimed paths
