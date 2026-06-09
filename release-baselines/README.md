# Release baselines (delta-update `--from-manifest` sources)

These are the **previous release's** update-bundle manifests, one per platform/arch:

- `linux-x64.json`
- `windows-x64.json`
- `darwin-arm64.json`

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
`node scripts/build-portable.mjs --from-manifest release-baselines/windows-x64.json ...`

## Contract

- Each file is the **update-bundle** top-level `update-manifest.json` from the
  PREVIOUS shipped version (the one users are updating FROM). Its `toVersion` is
  that previous version (e.g. `0.0.3`), which becomes the new bundle's
  `fromVersion`.
- The diff is **scope-aware**, so a baseline with extra roots the new bundle does
  not ship is fine.
- **After cutting a release**, refresh these files with that release's update
  manifests so the NEXT version deltas against it. Stale baselines just produce a
  larger (but still correct) delta.

## Current baselines

Captured from mpi-ci run 27209468252 (v0.0.3). `toVersion: 0.0.3` for all three.
