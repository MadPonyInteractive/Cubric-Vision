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
- **Restamp AFTER the new release is PUBLISHED — never before.** These files
  describe the PREVIOUS release. Advancing them to version X while X is still
  being built makes every rebuild of X an X-to-X delta: the bundle carries only
  the files that changed since the *earlier build of X*, so a user still on the
  previous version applies it and receives almost nothing. Stale baselines are
  merely wasteful (a larger but still correct delta); premature ones are broken.
  Measured: MPI-409, where a restamp done ~3 minutes after the 1.3.0 build cut
  turned the next Windows bundle from 451 MB into 970 KB.

## Current baselines

- All three hold the **v1.3.1 FULL (portable-stage)** manifests (2026-08-02,
  MPI-427) from the shipped 1.3.1 build, so the next release deltas against
  1.3.1. `toVersion: 1.3.1`, `fromVersion: null`, `kind: portable-stage`:
  - `darwin-arm64.json` — 6565 files
  - `linux-x64.json` — 6385 files
  - `win32-x64.json` — 6420 files

  Restamped from the published artifacts (mpi-ci run 30755518372, SHA
  `5328c033`, branch `1.3.1`) **after** v1.3.1 went live on the GitHub release,
  per the timing rule in **Contract**. The previous v1.3.0 values were 6563 /
  6383 / 6418; v1.2.0 were 6505 / 6325 / 6362.
- They had been left at 1.0.0 through 1.0.1, 1.1.0 and 1.2.0, so every "delta"
  since was computed against 1.0.0 — correct, but far larger than needed (the
  1.2.0 Windows update bundle reads `from 1.0.0 -> 1.2.0`, 1226 files, 90 MB).
  Refreshing them to 1.2.0 fixed that: the 1.3.0 Linux and macOS bundles came out
  as real 209- and 208-file deltas (2.8 MB / 3.3 MB).
- **2026-07-31 (MPI-409): restored here from `36f972cf~1`.** Commit 36f972cf had
  restamped all three to the 1.3.0 manifests (6418 / 6383 / 6563) while 1.3.0 was
  still unpublished, so the rebuild carrying the MPI-406/407/408 fixes emitted a
  1.3.0→1.3.0 delta — 970 KB win32, 971 KB linux, 1.5 MB darwin. Restamp to the
  1.3.0 manifests only once 1.3.0 is live on the GitHub release; see the timing
  rule in **Contract** above.

> **The next Windows delta is effectively a FULL bundle, and that is correct.**
> MPI-387 fix D moved the Windows app tree from `app/` to `resources/app/` and put
> Electron's runtime at the portable root, so every Windows path in
> `win32-x64.json` changed. The diff is SHA256-by-path, so every one of those
> ~6300 files reads as "added" (measured on a staged build: 6501 changed, 2
> deletes; the shipped 1.3.0 bundle came out 6408 files / 451 MB). Do not treat
> the size as a bug or try to "fix" the baseline by hand-editing paths —
> `win32-x64.json` is the historical v1.2.0 truth and can only be replaced by the
> FULL manifest from the next shipped Windows build. Linux and macOS are
> unaffected; their layout did not move, which is why their deltas stayed tiny in
> the same build.
>
> **RESOLVED 2026-08-02 — it was the one-off it claimed to be.** With
> `win32-x64.json` restamped to the post-move 1.3.0 layout, the 1.3.1 Windows
> delta came out **21 changed / 0 deleted, 1.17 MB** — the same shape as linux
> (21 / 1.17 MB) and darwin (21 / 1.67 MB). A fat Windows bundle from here on is
> a NEW layout change; do not re-blame MPI-387.

### Extracting a baseline from a shipped artifact

The manifest lives at `resources/cubric/update-manifest.json` in the FULL
artifact (never the `-update-` one):

> **Windows has NO top-level folder — its member path differs from the others.**
> Since the MPI-387 fix-D layout move, the Windows zip extracts to the current
> directory with `resources/` at its root, so the path is
> `resources/cubric/update-manifest.json` with no `CubricVision-…-v<ver>/` prefix.
> Linux and macOS still wrap in a top-level folder. Using the wrapped path on
> Windows fails with `caution: filename not matched` — and because the command
> redirects, it **truncates the existing baseline to 0 bytes** before failing.
> Restore with `git checkout -- release-baselines/win32-x64.json` and retry.
> Also ignore `resources/app/resources/cubric/update-manifest.json` (~4 KB) —
> that is the repo's own copy shipped inside the app, not the portable stage.

```sh
unzip -p CubricVision-windows-x64-v<ver>.zip \
  'resources/cubric/update-manifest.json' > win32-x64.json
tar -xzOf CubricVision-linux-x64-v<ver>.tar.gz \
  'CubricVision-linux-x64-v<ver>/resources/cubric/update-manifest.json' > linux-x64.json
unzip -p CubricVision-macos-arm64-v<ver>.zip \
  'CubricVision-macos-arm64-v<ver>/resources/cubric/update-manifest.json' > darwin-arm64.json
```

Then assert `fromVersion: null`, `artifact.kind: portable-stage`, and a file count
in the thousands. A few hundred files means you grabbed the delta bundle by
mistake — the 0.0.5 failure mode described above.
