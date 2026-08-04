# MPI-409 Validation

Fixed and verified 2026-07-31. Wall-clock note: the GitHub `Date:` header read
`Thu, 30 Jul 2026 23:18:19 GMT` while this was written; the board's stamps run
~1h ahead of that, so card timestamps here follow the board's existing sequence
rather than true UTC. No VPN was on — local `date -u` matched GitHub exactly.

## Fix

Commit `addc03a2` — `fix(release): restore the 1.2.0 baselines so 1.3.0 rebuilds emit real deltas`.

- `release-baselines/{win32-x64,linux-x64,darwin-arm64}.json` restored with
  `git checkout 36f972cf~1 --`. Blob hashes confirm the restore is byte-exact
  against the pre-restamp tree, not a re-serialisation:

  | file | blob at `36f972cf~1` | blob at `addc03a2` |
  |---|---|---|
  | `win32-x64.json` | `defa546db64852324efc7d1d433892361b10769b` | same |
  | `linux-x64.json` | `a8c8a5ea6400058828465d77156ed933086c7f60` | same |
  | `darwin-arm64.json` | `61143fad11550342f15a1ecd934120d6a5b51b38` | same |

  All three now read `toVersion: 1.2.0`, `fromVersion: null` — 6362 / 6325 /
  6505 files.
- `release-baselines/README.md` — "Current baselines" reverted to describe the
  1.2.0 manifests, plus a dated MPI-409 entry. The Contract bullet that said
  *"Restamp these as part of cutting a release"* — the exact instruction that
  caused this bug — was replaced with the timing rule: **restamp AFTER the
  release is published, never before**, because a stale baseline is merely
  wasteful while a premature one is broken.

## Rebuild

mpi-ci run **30589473208**, from SHA `addc03a2`, success on all three platforms.

```
gh workflow run cubric-vision-portable.yml -R MadPonyInteractive/mpi-ci \
  -f source_repo=MadPonyInteractive/Cubric-Vision \
  -f ref=addc03a2365a232660362beb2d6ff852721b725b -f version=1.3.0
```

## Evidence — update bundles

Read out of each downloaded zip at
`CubricVision-v1.3.0-update-only/resources/cubric/update-manifest.json`:

| platform | bundle bytes | broken (run 30588169394) | fromVersion | toVersion | kind | files | deletes |
|---|---|---|---|---|---|---|---|
| windows-x64 | 451,106,855 | 970,553 | **1.2.0** | 1.3.0 | `update-bundle` | 6408 | 2 |
| linux-x64 | 2,787,524 | 971,302 | **1.2.0** | 1.3.0 | `update-bundle` | 209 | 2 |
| macos-arm64 | 3,313,302 | 1,472,703 | **1.2.0** | 1.3.0 | `update-bundle` | 208 | 2 |

File counts match the last known-good bundles (run 30559394491) exactly —
6408 / 209 / 208. Bundle bytes are ~4.5 KB larger than that run because the
MPI-406/407/408 source changes are now inside them. The Windows bundle being
effectively a full one is the expected MPI-387 fix-D layout-move consequence,
documented in `release-baselines/README.md`.

Size alone was not accepted as proof; every `fromVersion` was read from the
manifest inside the shipped zip.

## Evidence — the fixes are in the artifacts

The three changed files are present in the delta bundles
(`app/` on Linux, `resources/app/` on Windows): `main.js`,
`routes/engine.js`, `js/data/releaseNotes.js`.

Read out of `CubricVision-linux-x64-v1.3.0.tar.gz` (the artifact going to the
Linux desktop):

- `app/routes/engine.js:364` — `uv venv --clear --seed --python 3.12` (MPI-408)
- `app/routes/engine.js:392` — `--fast-deps` present only on the `--nvidia`
  branch (MPI-406)
- `app/main.js:399` — `mainWindow.webContents.on('did-fail-load', …)` with the
  ERR_ABORTED skip (MPI-407)

## Artifacts on disk

`D:/CubricStudio/Vision/Builds/v1.3.0/` now holds one coherent set from run
30589473208 — three FULL artifacts and three update bundles. The previous
update zips (correct sizes, but pre-fix code from run 30559394491) were moved
to `SUPERSEDED-pre-fix-bundles-MPI-409/`; they were **not** deleted because CI
artifact retention is 1 day and they can no longer be re-downloaded. They must
never be published.

## Remaining before this card closes

Nothing blocking the ship. One deferred step, by design:

- **After** 1.3.0 is live on the GitHub release, restamp
  `release-baselines/*.json` to the 1.3.0 FULL manifests (6418 win32 / 6383
  linux / 6563 darwin) so 1.4.0 deltas against 1.3.0.

## CLOSED 2026-08-01 — the deferred step ran, in the right order

v1.3.0 is live. Published from tag `v1.3.0` → `baefe4c3` (the build-#5 SHA;
the tag was force-moved off the stale `e22ce1a5` first, since it had been
pushed on 30 July purely as the CI build trigger and never followed the five
rebuild rounds). Created as a draft, all six assets attached and byte-size
matched against disk, then flipped live — so no assetless release was ever
visible. `releases/latest` verified: `tag_name v1.3.0`, `draft false`,
`prerelease false`, `assets 6`.

**Only then** the baselines were restamped — commit `eaa6de3c`. Extracted
verbatim from the shipped full artifacts (no re-serialisation) and asserted:

| file | toVersion | fromVersion | kind | files |
|---|---|---|---|---|
| `win32-x64.json` | 1.3.0 | null | portable-stage | 6418 |
| `linux-x64.json` | 1.3.0 | null | portable-stage | 6383 |
| `darwin-arm64.json` | 1.3.0 | null | portable-stage | 6563 |

Counts match the values predicted on this card before the ship, which is the
cross-check that the right manifests were grabbed.

**Trap found while doing it, now documented in `release-baselines/README.md`.**
The extraction command in that README used a `CubricVision-<plat>-v<ver>/`
top-level prefix for all three platforms. That is wrong for Windows since the
MPI-387 fix-D layout move — the Windows zip has no wrapper folder and the
manifest sits at `resources/cubric/update-manifest.json`. The wrapped path
fails with `caution: filename not matched`, and because the command redirects,
it **truncates the existing baseline to 0 bytes before failing**. Recovered
with `git checkout --`. Same trap would hit anyone cutting 1.4.0.

Also note `resources/app/resources/cubric/update-manifest.json` (~4 KB) inside
the Windows zip — the app's own shipped copy, not the portable stage. Grabbing
it would reproduce the 0.0.5 false-delta failure mode this card's Contract
warns about.

CI storage hygiene done: the three un-expired artifacts on mpi-ci run
30674488835 deleted (~1.9 GB).
