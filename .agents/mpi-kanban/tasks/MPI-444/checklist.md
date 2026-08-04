# MPI-444 - checklist

- [x] connector resolution decided — **no change needed, the blocker was false**
- [x] npm ci green on a lone checkout (unmodified package.json)
- [x] pre-existing test race found and fixed (it would have made the gate flaky)
- [x] macOS dangling-symlink claim checked against the build script, recorded on MPI-416
- [x] tests.yml added
- [x] tag-build coupling decided
- [x] red suite proven to fail the workflow — PR #1, `failure`, 3 failed vs master's 2
- [x] artifacts proven diagnosable — `gh run download` gave trace + screenshot + error-context
- [x] the 301 MB Electron profile excluded from the upload
- [ ] a GREEN master run — blocked on MPI-446, both specs `test.fixme`'d on CI meanwhile

## What was measured, 2026-08-04

**The stated blocker does not exist.** `npm ci` on a lone checkout with the
UNMODIFIED `package.json` exits **0** — npm 11.9.0 / Node v24.14.0 does not fail on a
missing `file:` target, it creates a dangling symlink and moves on. Verified twice: on a
copy of `package.json` + `package-lock.json` in a directory with no `../Cubric-Studio`,
and on a real `git clone` (tracked files only — exactly what `actions/checkout` gets).
Both `npm ci` and the full `npm test` suite (417 tests) ran green there.

So option (d) is unnecessary: **no PAT secret, no registry publish, no vendored copy, and
no `package.json` edit.** `@cubric/connector` stays a `dependencies` `file:` path.

Option (d) was also measured against its second claimed benefit and does **not** deliver
it: `optionalDependencies` still creates the same dangling symlink at exit 0, so it would
not have fixed the macOS artifact bug either. Detail recorded on MPI-416.

## The real blocker was a flaky test, not the connector

The first clone run failed `tests/extra-model-folders.test.cjs` ("primary.safetensors"
missing from the list-files union), then passed on re-run — the classic shape of a race,
not a clean-checkout failure.

Root cause: `node --test` runs test **files** in parallel, and two files
(`extra-model-folders.test.cjs`, `settings-models-root-guard.test.cjs`) both POST
`/comfy/set-path`, which rewrites the single global `extra_model_paths.yaml` in the engine
root. `getCustomRoot()` reads `base_path` back out of that same file, so when the second
file's revert lands between the first file's set-path and its list-files, the primary root
drops out of the union.

Fix: each file sets `process.env.CUBRIC_ENGINE_ROOT` to its own `mkdtempSync` dir before
the `routes/comfy` require captures `ENGINE_ROOT`. Structural, not a retry or a
concurrency cap — the shared state is gone. Side benefit: the suite no longer rewrites the
developer's real engine `extra_model_paths.yaml` (verified: mtime unchanged across a full
`npm test`).

## Tag-build coupling — decided: stay decoupled

`build-portable.yml` keeps dispatching on a `v*` tag with no test dependency. A tag is cut
from a commit that `tests.yml` has already run, and `mpi-version-bump` still has its human
gate; putting a full Windows suite in front of the dispatch would re-run a signal already
collected and add ~10 min to every release.

The one hole that WAS real is closed instead at the trigger: release branches are named
bare (`1.3.0`, `1.3.1`), so a hotfix landing there never touches master. `tests.yml` now
also runs on push to `[0-9]*.[0-9]*.[0-9]*`.
