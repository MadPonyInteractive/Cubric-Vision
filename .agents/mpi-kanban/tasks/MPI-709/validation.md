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

## The release gate — closed 2026-09-08

### Why the old leg passed a corrupt build

`docs/playbooks/install-test/README.md:75` asserted one thing: *"confirm `user-data\`
SURVIVES"*. On the broken install it did — projects, secrets and settings were all intact,
because the applier never touches those prefixes. The leg had no way to fail.

Two conditions were missing, and both are now required by § 3 of that playbook:

1. **A gap.** Updating from one version behind passes even with the applier completely
   broken: a delta's `fromVersion` IS the previous release, the single install it fits. The
   test now requires a source install at least two released versions behind.
2. **A working app.** The new leg runs a real generation and opens the output. In the 1.5.0
   failure the server was healthy and only the renderer was dead — every automated signal
   the old leg could have read was green.

### The gate is executable, not a checklist line

`scripts/release-health-check.mjs` gained `checkUpdateEvidence(appVersion)`, mirroring the
MPI-467 smoke-evidence gate. It reads `dev_configs/update-evidence.json` and fails on:
missing file · `toVersion` ≠ `APP_VERSION` · `fromVersion` absent, unpublished, or only one
release behind · no `generation.ok` + named artefact · `userDataSurvived` not recorded. It
skips with a warning when fewer than two releases precede this one.

**It runs only under `--publish` (`npm run release:check:publish`).** `release:check` is run
at the version-bump gate (mpi-release step 2), long before CI has produced an artifact to
install-test, so an unconditional gate would refuse every bump. The default run now prints
that the update-test evidence was not checked, and `mpi-release` step 6 runs the publish
mode before `gh release create`.

### Evidence

Five fixtures against the live repo (`APP_VERSION` 1.4.2; published tags … 1.4.0, 1.4.1),
each written to `dev_configs/update-evidence.json`, run, then removed:

| Fixture | Result |
|---|---|
| `fromVersion 1.4.1` (one behind) | REFUSED — *"only ONE release behind … Re-run from 1.4.0 or older"* |
| `fromVersion 1.4.0` (two behind), generation ok | accepted, no update-evidence failure |
| `generation.artifact` empty | REFUSED — *"records no real generation after the update"* |
| `toVersion 1.5.0` on a 1.4.2 build | REFUSED — *"that run tested a different build"* |
| `fromVersion 9.9.9` | REFUSED — not a published version, and it lists the ones that are |

The semver sort is numeric, not lexical — the published list comes back
`0.0.5, 0.0.6, 0.0.7, 0.0.12, 1.0.1 …`.

`node scripts/release-health-check.mjs` with no flag reports exactly one failure, and it is
**pre-existing and unrelated**: the engine pin moved 0.31.0 → 0.34.0 and
`smoke-evidence.json` (2026-09-05) is older than the `node_lock.json` change
(2026-09-06T18:14:27+01:00), so the MPI-467 gate calls it stale. `git diff` confirms
`checkSmokeEvidence` is untouched apart from hoisting its local `git()` helper to module
scope for reuse. `node --test tests/smoke-evidence-merge.test.cjs` — 3/3 pass.

**That stale smoke evidence blocks the 1.5.0 re-cut.** `release:check` is red right now for
a reason that has nothing to do with this card; the re-cut needs a fresh
`node scripts/smoke-workflows.mjs` run first.

## Not done — Fabio's GitHub steps and one spin-out

Unchanged from the handoff: delete `refs/tags/v1.5.0`, delete or re-point
`refs/heads/1.5.0`, remove the three `release-baselines/*.json` before the re-cut, and the
new card for the stale top-level `update-manifest.json`. See `checklist.md`.
