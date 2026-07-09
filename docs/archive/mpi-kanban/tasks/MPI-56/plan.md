# Delta update bundles: ship only changed files, not the full app

## Current State

- Parent: MPI-8 portable distribution. Blocks the deferred MPI-8 update-flow test.
- `scripts/build-portable.mjs` `stageUpdateBundle()` (L587-603) currently copies the
  ENTIRE staged `app/` + `resources/` + `update/` + launchers into the update bundle,
  then calls `createUpdateManifest()` which lists every file. Result: the update zip is
  nearly the size of the full ~398MB portable. Only `engine/`/`models/` are excluded
  (they are never in the staged tree at all; PRESERVE keeps them on the user's disk).
- The applier `scripts/portable/apply-update.cjs` is ALREADY manifest-driven: it copies
  only `manifest.files[]`, deletes `manifest.delete[]`, with a rollback backup. **No
  applier change is expected** — the work is entirely build-side.
- Manifest plumbing already supports delta: `fromVersion`, `toVersion`, `files[]` (each
  `{path,size,sha256}`), and `delete[]` exist in the schema
  (`resources/cubric/update-manifest.schema.json`) and in `createUpdateManifest()`.
  `buildFileEntries()` already computes per-file SHA256.
- The committed `resources/cubric/update-manifest.json` is the v0.0.1 baseline (full
  file list + hashes, `fromVersion:null, toVersion:"0.0.1"`). It is OVERWRITTEN by every
  full build via the `shouldMirrorSource` mirror-back (L580-582), so it cannot be relied
  on implicitly as the baseline — hence the explicit-flag decision below.
- Contract: `docs/releases/portable-distribution-contract.md` L136-137 — "simple
  changed-file bundles ... Do NOT implement binary deltas for MPI-8." File-level delta
  is the correct and only sanctioned scope.

## Design decisions (locked with user)

1. **Baseline source = explicit `--from-manifest <path>` flag.** Points at the previous
   release's `update-manifest.json` (full file list + hashes). The release/CI flow passes
   it; nothing is read implicitly. Sidesteps the mirror-back overwrite-ordering trap.
2. **No baseline (flag omitted / first release) = emit FULL bundle + warn.** `fromVersion`
   stays `null`, `delete[]` stays `[]`, behavior is exactly today's output. Never produces
   a broken partial update. A clear `console.warn` states "no --from-manifest; shipping a
   FULL update bundle".
3. **Diff is file-level by SHA256**, not binary delta (per contract). A file is INCLUDED
   in the bundle iff its `sha256` is absent from, or differs from, the baseline entry for
   the same `path`. A path present in the baseline but absent in the new build goes into
   `delete[]`.
4. **`fromVersion` is set from the baseline manifest's `toVersion`** when a baseline is
   supplied. Optional sanity: `compareSemVer(baseline.toVersion, opts.version)` should be
   `< 0` (downgrade/equal → warn, do not hard-fail; a rebuild of the same version is a
   legitimate dev case).
5. **PRESERVE / launcher / platform invariants are unchanged.** `delete[]` MUST never list
   anything under a PRESERVE prefix (defense-in-depth filter), and the bundle must still
   contain `resources/cubric/update-manifest.json` itself + the launchers the applier and
   runbook expect.

## Implementation

- [ ] Add delta support to `scripts/build-portable.mjs`, build-side only:
  - Parse a new `--from-manifest <path>` (and `--from-manifest=<path>`) arg in `parseArgs`;
    default `opts.fromManifest = null`. Add to `printHelp`.
  - In `stageUpdateBundle()` keep staging the FULL tree to a working dir first (the full
    staged set is what we diff). Then, if `opts.fromManifest` is set: read + JSON-parse the
    baseline manifest, build a `Map(path -> sha256)` from `baseline.files[]`, compute the
    full new file entries (reuse `buildFileEntries`/`listFiles`+`sha256`), then:
      - **changed/added** = new entries whose path is missing in the baseline map OR whose
        sha256 differs → these are the only files that stay in the bundle tree (prune the
        rest from `updateStageRoot`, but ALWAYS keep `resources/cubric/update-manifest.json`
        and the launcher scripts the applier/runbook require).
      - **delete[]** = baseline paths absent from the new file set, minus any path under a
        PRESERVE prefix and minus the manifest path itself.
  - Set `fromVersion` on the manifest from `baseline.toVersion`; optional `compareSemVer`
    warn on non-forward version.
  - When `opts.fromManifest` is null: skip all of the above, `console.warn` the full-bundle
    notice, leave `fromVersion:null` / `delete:[]` (today's behavior).
  - Thread `fromVersion` + `delete[]` into `createUpdateManifest()` (extend its signature or
    compute inside) so the bundle manifest carries them. Keep the FULL artifact's own
    manifest unchanged (`fromVersion:null`).
  - Add delta stats to the final `summary` JSON (e.g. `deltaFromVersion`,
    `deltaChangedCount`, `deltaDeleteCount`, or `deltaMode:'full'`).
  **Verify:** (a) `node scripts/build-portable.mjs --dry-run` with NO `--from-manifest`
  still produces a full bundle, `fromVersion:null`, `delete:[]`, prints the warn, and
  `validateUpdateManifest` passes. (b) Run a full build to produce a v0.0.2 baseline-style
  manifest, make a trivial edit to one app file, rebuild with
  `--from-manifest <that manifest>`: bundle manifest has `fromVersion` set, `files[]`
  contains ONLY the changed file(s), `delete[]` is correct for any removed path, no PRESERVE
  path appears in `delete[]`, and `validateUpdateManifest` passes. (c) Confirm
  `scripts/portable/apply-update.cjs` is untouched and would copy exactly `files[]` + delete
  `delete[]`.

## Completed

- [ ] Nothing yet.

## Remaining Work

- Build-side delta in `scripts/build-portable.mjs` (single coherent change).
- (Out of scope, separate session) MPI-8 update-flow test at `D:/cubric-install-test`,
  then Linux.
- (Out of scope, user will request) update `mpi-version-bump` skill + portable-distribution
  contract doc to describe the delta flow + `--from-manifest`.

## Plan Drift

- None yet.

## Verification

1. `node scripts/build-portable.mjs --dry-run` (no `--from-manifest`) → full bundle,
   `fromVersion:null`, `delete:[]`, warn printed, manifest validates.
2. Full build → keep its `update-manifest.json` as baseline. Edit one app file. Rebuild
   with `--from-manifest <baseline>` → delta bundle: only changed file(s) in `files[]`,
   correct `delete[]`, `fromVersion` set, no PRESERVE path in `delete[]`, manifest validates.
3. Diff `scripts/portable/apply-update.cjs` → unchanged.
4. No edits to backend `ResumableDownloader` or any download path.

## Preservation Notes

- After this lands + verifies, the `mpi-version-bump` skill and
  `docs/releases/portable-distribution-contract.md` should document the delta flow and the
  `--from-manifest` flag (user will explicitly request this — do not pre-empt).
- The deferred MPI-8 update-flow test resumes in a separate session against the existing
  install at `D:/cubric-install-test` (do NOT overwrite it); confirm the PRESERVE list
  survives.
- Do NOT modify the fragile backend `ResumableDownloader` pause/abort path.
