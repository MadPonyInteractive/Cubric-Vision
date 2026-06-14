# Public Readiness Summary

Date: 2026-06-09

## Branch cleanup performed

Deleted locally and remotely after explicit maintainer approval:

- `dev`
- `backup/raw-gpu-attempt`
- `mpi-8-linux-engine-bootstrap`

Deferred:

- `mpi-8/git-auto-provision` remains local and remote. It is merged into
  `master`, but the local branch and remote branch point at different commits,
  so it should be reviewed separately before deletion.

## Contributor surfaces added or changed

Added:

- `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `.github/ISSUE_TEMPLATE/bug-report.yml`
- `.github/ISSUE_TEMPLATE/feature-request.yml`

Changed:

- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/build-portable.yml`

The portable workflow remains a dispatcher to private `mpi-ci`; it does not
upload public source-repo artifacts. The workflow-dispatch default `ref` now
matches the repo trunk: `master`.

## Memory promoted

Promoted stable, contributor-relevant facts into committed docs:

- Vision is image/video only.
- AGPL/open-source distribution means portable artifacts expose readable source.
- Early/public artifact gating is distribution/timing policy, not obfuscation.
- Private `mpi-ci` owns shippable portable artifact builds.
- Backend logger arity: `info`/`warn` are two-argument APIs; `error` accepts the
  error object.
- Relative ESM import depth differs for deeper `LandingPages` components.
- Model folder configuration is additive over the default models root.

No raw private memory was copied wholesale. No `.claude/rules/` changes were
needed.

## Validation performed

- Parsed MPI JSON files touched by this work with PowerShell `ConvertFrom-Json`.
- Confirmed key linked docs/files exist: `LICENSE`, `CONTRIBUTING.md`,
  `SECURITY.md`, `docs/PROJECT.md`,
  `docs/releases/portable-distribution-contract.md`, and new issue templates.
- Checked `.github/workflows/build-portable.yml` has `default: master` and no
  `upload-artifact` match.
- Ran `git diff --check` on the new/changed contributor files and GitHub
  templates.
- Checked new/changed public-facing files for non-ASCII characters.
- Verified deleted branches no longer appear in `git branch --all --verbose
  --no-abbrev`.

## Remaining manual settings

Recommended branch protection for `master` before public launch:

- require Pull Requests before merge;
- require maintainer review;
- require relevant checks for code/build changes;
- delete merged branches automatically;
- enable GitHub private vulnerability reporting if available.
- for Patreon/Discord tier priority on feature requests, use trusted source
  verification or maintainer-applied labels; do not trust self-selected public
  GitHub form fields.

## Unrelated working-tree note

`.agents/mpi-kanban/tasks/MPI-49/validation.md` is modified with an update-path
investigation note unrelated to MPI-51. It was not edited by this MPI-51 pass
and should be preserved.
