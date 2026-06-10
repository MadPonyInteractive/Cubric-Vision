# Release baselines (delta-update `--from-manifest` sources)

These are the **previous release's FULL (portable-stage) manifests**, one per
platform/arch:

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

- **None.** Reset 2026-06-10 for the **0.0.11 baseline release**. The stale
  manifests (darwin `0.0.3`, linux/windows `0.0.6`) were removed so the 0.0.11
  CI build produces **FULL** update bundles for all three platforms (no
  stale-delta superset). 0.0.11 is the new fresh-install baseline installed on
  all three boxes.
- **Next step (after the 0.0.11 build):** commit the three 0.0.11 **FULL
  (portable-stage)** manifests here — `darwin-arm64.json`, `linux-x64.json`,
  `windows-x64.json`, each the top-level `resources/cubric/update-manifest.json`
  from inside `CubricVision-<plat>-<arch>-v0.0.11.zip`/`.tar.gz` (`toVersion:
  0.0.11`, `fromVersion: null`, `kind: portable-stage`). The next version
  (0.0.12) then deltas cleanly against 0.0.11.
