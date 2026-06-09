# Branch cleanup, contributor onboarding, and rules/docs sync for open source

## Current State

Project mode: scalable-foundation.

- MPI-51 is a `todo` task about preparing Cubric Vision for public/open-source contribution while teaching the maintainer the relevant git workflow.
- The repo has `LICENSE` and `package.json` license metadata, but no root `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, or `CODE_OF_CONDUCT.md`.
- `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/portable-validation.yml`, and `.github/workflows/build-portable.yml` exist. The portable build workflow dispatch default is `main`, while this repo uses `master`.
- Branch audit on 2026-06-09 found `dev`, `backup/raw-gpu-attempt`, and `mpi-8-linux-engine-bootstrap` merged into `master`; `mpi-8/git-auto-provision` is also merged but has a local ahead-only commit and must be reviewed before deletion.
- Private memory contains public-launch and contributor-relevant facts. Some are already documented; the remaining useful/stable facts need curated promotion, not raw memory dumping.

## Completed

- [x] Read MPI-51 brief and current task state.
- [x] Audited current root contributor files, GitHub templates/workflow, branch state, and selected memory-promotion candidates.
- [x] Preserved planning findings in `research/2026-06-09-planning-audit.md`.

## Remaining Work

## Phase 1: Teach and Confirm Branch Hygiene

- [ ] Add a maintainer-facing branch/PR explanation in the task workspace or contributor docs, covering branch basics, fork/branch/PR flow, review/merge/delete lifecycle, and why open-source contributors do not push to `master` directly. **Verify:** The explanation is plain-language, specific to this repo, and includes the exact lifecycle `branch -> commit -> push -> PR -> review -> merge -> delete branch`.
- [ ] Re-check branch state immediately before deletion with safe-directory git commands and identify deletion targets as either "safe merged cleanup" or "review first." **Verify:** Output confirms whether `dev`, `backup/raw-gpu-attempt`, `mpi-8-linux-engine-bootstrap`, and `mpi-8/git-auto-provision` are still merged into `master`, and whether any branch has unique local or remote commits.
- [ ] Ask the maintainer for explicit confirmation before deleting any local or remote branch. On approval, delete only confirmed branches and prune stale remote-tracking refs. **Verify:** `git branch --all` no longer lists deleted refs, and no unconfirmed review-first branch was removed.

## Parallel Batch: Contributor Surfaces

- [ ] Create root onboarding docs. Ownership: `README.md`, `CONTRIBUTING.md`, optionally `SECURITY.md`, optionally `CODE_OF_CONDUCT.md`. Briefings: project profile, `CLAUDE.md` critical rules, `docs/PROJECT.md`. **Verify:** A newcomer can identify what Cubric Vision is, its image/video scope, AGPL license, setup/run/test commands, contribution workflow, coding conventions, and where to report security issues.
- [ ] Review and tighten GitHub contribution surfaces. Ownership: `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `.github/workflows/build-portable.yml`. Briefings: project profile, `docs/releases/portable-distribution-contract.md`, private CI gating notes. **Verify:** PR/issue templates ask for the right platform and validation details, public Actions still do not expose gated artifacts, and the build workflow ref default matches the repo's actual default branch or has an explicit reason not to.

## Phase 2: Curate Memory Into Committed Docs

- [ ] Sweep the project memory index and classify entries as already documented, stable-to-promote, private/session-specific, or obsolete. **Verify:** The classification is recorded in a short note under MPI-51 research or in the plan before docs are edited.
- [ ] Promote stable public knowledge into committed docs, preferring existing docs over new files. Likely targets: repo distribution/gating in root contributor docs or release docs; backend logger arity in backend/contributor guidance; import-depth gotcha in component/contributor guidance; models path only if current docs need a small gap-fill. **Verify:** Each promoted fact has a committed-doc home and avoids duplicating private memory verbatim.
- [ ] For any needed `.claude/rules/` changes, show the maintainer the exact proposed rule edits and ask for permission before editing. **Verify:** Rule files are changed only after explicit approval, or the plan records that rule changes were deferred.

## Phase 3: Review and Close Readiness

- [ ] Run targeted validation for documentation and repo metadata changes. **Verify:** Markdown links and referenced commands/paths are checked by inspection, `npm run lint` is run only if code/template JS changes happened, and `git status --short` shows only intended MPI-51 files plus pre-existing unrelated changes.
- [ ] Prepare a final public-readiness summary for the maintainer: branch cleanup performed, docs/templates added or changed, memory items promoted/deferred, and remaining manual GitHub settings such as branch protection. **Verify:** Summary names exact branches deleted, files changed, deferred decisions, and the suggested branch protection policy for `master`.

## Plan Drift

- None yet.

## Verification

MPI-51 is implementation-ready when:

- The task has a clear first implementation step through `mpi-continue`.
- Branch deletion is gated behind an explicit confirmation brief.
- Contributor docs/templates have disjoint ownership where parallel execution is useful.
- Memory promotion is curated, with `.claude/rules/` edits requiring explicit maintainer approval.
- Final validation records branch state, changed files, and unresolved public-launch settings.

## Preservation Notes

- Do not commit or push in normal MPI implementation; session close owns commits.
- Do not revert unrelated existing changes: `.claude/scheduled_tasks.lock` and `.agents/mpi-kanban/tasks/MPI-57/` were already present during planning.
- Use `git -c safe.directory=C:/AI/Mpi/Cubric-Vision ...` for git reads in this sandbox.
- Remote branch deletion requires maintainer confirmation immediately before execution.
- Before changing `.claude/rules/`, ask the maintainer and show current content plus proposed changes.
