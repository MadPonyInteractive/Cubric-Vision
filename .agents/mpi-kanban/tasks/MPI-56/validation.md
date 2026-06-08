# MPI-56 Validation

Date: 2026-06-08. Validated by: implementer + user ("it's verified").

## What was built

Build-side file-level delta in `scripts/build-portable.mjs` (only file changed).
New `--from-manifest <path>` flag; `applyDelta()` does a scope-aware SHA256 diff
vs the baseline manifest. Applier `scripts/portable/apply-update.cjs` unchanged
(already manifest-driven).

## Tests run

1. **Full-bundle fallback (no flag).** `node scripts/build-portable.mjs --dry-run
   --no-archive` → warn printed, summary `updateBundleMode:full`,
   `deltaFromVersion:null`, `deltaDeleteCount:0`, manifest validated (no throw). PASS.
2. **Delta vs full-artifact baseline (scope-aware).** Built a pristine
   `--no-node-modules` full artifact (392 files) as baseline, doctored it to simulate
   an in-scope changed file (appVersion.js hash), an in-scope deleted file
   (`app/js/__deleted_probe__.js`), and an out-of-scope/PRESERVE probe
   (`engine/__preserve_probe__.txt`). Rebuilt with `--from-manifest <baseline>`.
   Result manifest:
   - `files[]` contained ONLY changed/added files (appVersion.js + the file the
     concurrent MPI-55 agent edited) + alwaysKeep (connector-manifest + launchers).
   - `delete[]` = exactly `["app/js/__deleted_probe__.js"]`.
   - README.txt, `update/*`, and the engine PRESERVE probe were NOT deleted
     (out of update-bundle scope / PRESERVE).
   - `fromVersion` set from baseline `toVersion`; manifest path absent from `files[]`.
   - `validateUpdateManifest` passed. ALL 9 assertions PASS.
3. **Applier untouched.** `git status scripts/portable/apply-update.cjs` → clean.
4. **No download-path edits.** `ResumableDownloader` not touched.
5. **Bonus / real-world proof.** The delta correctly detected a live edit to
   `docs/releases/portable-distribution-contract.md` made by the concurrent MPI-55
   agent between the two test builds — confirming real SHA256 drift detection.

## Notes / follow-ups (out of scope for MPI-56)

- Repo `resources/cubric/update-manifest.json` left pristine (v0.0.1, 5335 files).
- Pre-existing build behavior: a `--dry-run` without `--no-source-manifest` mirrors
  a dry-run manifest back over the committed baseline. Not introduced by MPI-56;
  noted for the MPI-8 release flow (always use `--no-source-manifest` for test builds,
  or fix the mirror to skip dry-runs).
- MPI-8 CI wiring must pass `--from-manifest` from the private mpi-ci workflow
  (builds moved there per MPI-55). mpi-ci must source the prior release's manifest
  from durable private storage.
- User will later request: update mpi-version-bump skill +
  portable-distribution-contract doc to document the delta flow + `--from-manifest`.
