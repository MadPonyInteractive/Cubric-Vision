# Release baselines (delta-update `--from-manifest` sources)

These are the **previous release's FULL (portable-stage) manifests**, one per
platform/arch:

- `linux-x64.json`
- `win32-x64.json`
- `darwin-arm64.json`

> **Filename = `<matrix.platform>-<matrix.arch>.json`, NOT `<config.label>`.**
> The mpi-ci workflow looks up `release-baselines/${matrix.platform}-${matrix.arch}.json`,
> and its Windows matrix uses `platform: win32` (the Node `process.platform`
> value), so the Windows baseline MUST be `win32-x64.json` — even though the
> build's artifact label is `windows`. It was `windows-x64.json` through 0.0.12,
> which silently never matched, so every Windows build fell back to a FULL update
> bundle (MPI-66). darwin/linux match either way. Keep this name in sync with the
> CI matrix `platform` value, not the artifact label.

## Purpose

`scripts/build-portable.mjs --from-manifest <path>` diffs a freshly staged update
bundle against a baseline manifest to produce a true file-level SHA256 **delta**
update bundle (see `docs/releases/portable-distribution-contract.md` and the
MPI-56 delta work). The mpi-ci workflow
(`MadPonyInteractive/mpi-ci/.github/workflows/cubric-vision-portable.yml`) reads
the file matching the current `--platform`/`--arch` and passes it as
`--from-manifest` when it exists; if it is absent the build falls back to a full
bundle (first-release safe).

Local Windows builds do the same by hand:
`node scripts/build-portable.mjs --from-manifest release-baselines/win32-x64.json ...`

## Contract

- Each file is the **FULL (portable-stage) `update-manifest.json`** from the
  PREVIOUS shipped version's **full build** — the top-level
  `resources/cubric/update-manifest.json` inside `CubricVision-<plat>-<arch>-v<ver>.zip`
  / `.tar.gz` (NOT the `-update-v<ver>` delta bundle). It has `fromVersion: null`,
  `artifact.kind: portable-stage`, and lists **every** staged file's hash (~5k+
  entries). Its `toVersion` (e.g. `0.0.4`) becomes the new bundle's `fromVersion`.
- **Do NOT use the update-bundle (delta) manifest** as a baseline. It only lists
  the handful of files that changed last release, so the diff has no hashes for
  the unchanged files and flags the whole app as "added" — producing a bogus
  multi-thousand-file "delta" instead of a real one. (This bit us on 0.0.5: a
  266-file update-bundle baseline yielded a 5093-file false delta; the correct
  5343-file full manifest yielded the real 38-file delta.)
- The diff is **scope-aware**, so a baseline with extra roots the new bundle does
  not ship is fine.
- **After cutting a release**, refresh these files with that release's FULL
  manifests so the NEXT version deltas against it. Stale baselines just produce a
  larger (but still correct) delta.

## Current baselines

- All three refreshed to the **v1.0.0 FULL (portable-stage)** manifests
  (2026-06-10) from the 1.0.0 first-public-release build (mpi-ci run #25), so the
  next build (1.0.1) deltas cleanly against 1.0.0. `toVersion: 1.0.0`,
  `fromVersion: null`, `kind: portable-stage`:
  - `darwin-arm64.json` — 5501 files
  - `linux-x64.json` — 5321 files
  - `win32-x64.json` — 5358 files
- First cycle where the `win32-x64.json` name is correct (MPI-66), so the next
  Windows delta should finally be minimal instead of a ~390 MB full bundle.
