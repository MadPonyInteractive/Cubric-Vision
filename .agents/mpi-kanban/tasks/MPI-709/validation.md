# MPI-709 — validation evidence

## What landed this session

`scripts/portable/apply-update.cjs` gained the missing precondition. Before it, the applier
validated `appId` and `platform` and nothing else, so a delta bundle applied onto any
installation and reported success either way.

- `readInstalledVersion(portableRoot)` reads the app's own `package.json` —
  `resources/app/package.json` (Windows) or `app/package.json` (Linux/macOS), the same two
  layouts `loadExtractZip` already walks.
- `assertBundleApplies(manifest, root)` returns immediately for a FULL bundle
  (`fromVersion: null`), and otherwise requires the installed version to equal
  `manifest.fromVersion`. An unreadable installed version is a refusal, not a guess.
- The call sits after the `files` check and **before `fs.mkdirSync(rollbackRoot)`** — the
  first write. A refused bundle therefore leaves the installation byte-identical.

## The mid-fix correction, which is the useful part of this record

The guard was first written against `resources/cubric/update-manifest.json` `toVersion`,
which looks like the obvious source and is wrong. Measured on the real install
(`D:\cubric-install-test\CubricVision-windows-x64-v1.3.0`):

| Signal | Value | Age |
|---|---|---|
| `resources/app/package.json` | **1.5.0** | current |
| `js/core/appVersion.js` | **1.5.0** | current |
| `resources/cubric/update-manifest.json` | **1.3.0** | `createdAt` 2026-08-01 |
| `resources/app/resources/cubric/update-manifest.json` | **0.0.11** | `createdAt` 2026-06-10 |

The top-level manifest is stale across **two** separate in-place updates (1.4.0 on Aug 10,
1.5.0 today) even though MPI-523 made the applier copy it explicitly and that unit test
passes. Keying the guard off it would have refused legitimate deltas for anyone whose
manifest had drifted — the opposite of the bug being fixed, and it would have shipped
undetected without the real-artifact repro.

**That staleness is a second, separate defect and is NOT fixed here.** It needs its own
card: MPI-523's fix does not hold in the field.

## Evidence

**Full suite: 906 pass, 0 fail** (`npm test`).

`tests/portable-update-apply.test.cjs` — 4 tests, all green. The three new ones seed
`package.json` and the manifest with *deliberately disagreeing* versions, so a regression
back to the manifest fails loudly:

- a FULL bundle applies onto an install four releases behind
- a mismatched delta is refused, and the app file, the version and the manifest are all
  untouched with no rollback directory created
- a delta is refused when the installed version cannot be read

The pre-existing MPI-523 test needed `app/package.json` added to its fixture — every real
install has one because Electron needs it to find `main`, so this is fixture parity rather
than a workaround.

**Against the real shipped artifact.** The actual
`CubricVision-windows-x64-update-v1.5.0.zip` from the install's own `update/downloads/`,
extracted and read: `fromVersion: 1.4.4`, `toVersion: 1.5.0`, 116 files, 0 deletes — which
confirms the root cause on the shipped bundle rather than by inference. Replayed against a
scratch copy of the install's real version signals (nothing written to the install itself):

```
This installation is 1.5.0, so the 1.5.0 update was not applied. It expects 1.4.4.
Nothing was changed. A repair release that installs over any version is on the way —
take that update when it is offered.
  exit: 1
  sentinel still: untouched
  rollback dir created: False
```

The message deliberately never tells a user to reinstall or download a full build: a fresh
download lands in a new folder with no `engine/`, costing them the whole ComfyUI download
(Fabio, 2026-09-08).

## Release decision — 1.5.0 is cancelled, not superseded

`gh api .../releases/tags/v1.5.0` reported **2 total downloads**, both on
`CubricVision-windows-x64-update-v1.5.0.zip`, both Fabio's own test runs. Zero on every
full artifact, zero on Linux and macOS. **No external user ever had 1.5.0.**

That removes the objection to deleting it — the semver-stranding problem only affects people
already on 1.5.0. So 1.5.0 is deleted and re-cut carrying this fix, rather than a 1.5.1
being issued, and there is no phantom version to explain.

Three things must travel with the deletion, verified present on origin at the time of
writing:

1. `refs/tags/v1.5.0` — deleting the release does not remove the tag, and the version cannot
   be re-cut while it exists.
2. `refs/heads/1.5.0` at `a8691834` — the maintenance branch cut by MPI-706.
3. **The three `release-baselines/*.json`, currently stamped `toVersion: 1.5.0`** by
   `22239f5e`. If 1.5.0 never shipped, the newest version any user holds is 1.4.4, so a
   baseline claiming 1.5.0 makes the next build emit a `1.5.0 → next` delta that no user can
   apply. Removing the files entirely is better than reverting them to 1.4.4: mpi-ci treats
   an absent baseline as "ship a FULL bundle", which serves 1.4.4 and everything older.
   Restamp from the published full build afterwards, as the existing post-publish step does.

## Not done — carried to the handoff

The gate work, which is the half that prevents a repeat:
`docs/playbooks/install-test/README.md:75`, the `release:check` evidence requirement, and
the contract doc. See `checklist.md`.
