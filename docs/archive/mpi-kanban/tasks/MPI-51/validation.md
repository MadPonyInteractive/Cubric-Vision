# MPI-51 Validation

## 2026-06-09 Phase 1 Started

- Moved MPI-51 from `todo` to `doing`.
- Created derived checklist from `.agents/mpi-kanban/tasks/MPI-51/plan.md`.
- Branch deletion remains gated behind explicit maintainer confirmation.

## 2026-06-09 Branch Workflow and Recheck

- Added maintainer-facing branch/PR explanation and branch audit at `research/2026-06-09-branch-workflow.md`.
- Rechecked merged status for `dev`, `backup/raw-gpu-attempt`, `mpi-8-linux-engine-bootstrap`, and `mpi-8/git-auto-provision`.
- Confirmed all named refs have zero branch-unique commits relative to `master`.
- Proposed first deletion set: `dev`, `backup/raw-gpu-attempt`, and `mpi-8-linux-engine-bootstrap`.
- Deferred `mpi-8/git-auto-provision` for separate review because local and remote refs differ even though both are merged.
- No branches have been deleted.

## 2026-06-09 Approved Branch Cleanup

- Maintainer explicitly approved deleting `dev`, `backup/raw-gpu-attempt`, and `mpi-8-linux-engine-bootstrap`.
- Final pre-delete checks still showed `0` branch-unique commits for the local and remote refs.
- Deleted remote refs with `git -c safe.directory=C:/AI/Mpi/Cubric-Vision push origin --delete dev backup/raw-gpu-attempt mpi-8-linux-engine-bootstrap`.
- Deleted local refs with `git -c safe.directory=C:/AI/Mpi/Cubric-Vision branch -d dev backup/raw-gpu-attempt mpi-8-linux-engine-bootstrap`.
- Verified `git branch --all --verbose --no-abbrev` no longer lists those three branches locally or under `remotes/origin/`.
- Deferred `mpi-8/git-auto-provision` remains present locally and remotely for separate review.

## 2026-06-09 Contributor Surfaces And Memory Promotion

- Added `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md`.
- Added `.github/ISSUE_TEMPLATE/bug-report.yml` and `.github/ISSUE_TEMPLATE/feature-request.yml`.
- Updated `.github/PULL_REQUEST_TEMPLATE.md` with contributor checklist and project invariants.
- Updated `.github/workflows/build-portable.yml` workflow-dispatch default `ref` from `main` to `master`.
- Recorded memory classification and promotion decisions in `research/2026-06-09-memory-promotion.md`.
- No `.claude/rules/` files were changed; no rule edit was needed for this contributor-doc pass.

## 2026-06-09 Final Validation

- Added final public-readiness summary at `research/2026-06-09-public-readiness-summary.md`.
- JSON parse check passed for touched MPI board/task/state files.
- Path checks passed for root docs, release docs, and new issue templates.
- `.github/workflows/build-portable.yml` now contains `default: master` and no `upload-artifact` match.
- `git diff --check` passed for new/changed contributor docs and GitHub templates.
- New/changed public-facing docs/templates are ASCII-only.
- `git branch --all --verbose --no-abbrev` confirms deleted stale branches are absent and only deferred `mpi-8/git-auto-provision` remains beside `master`.
- `npm run lint` was not run because this pass changed docs/templates/workflow metadata only, not application JS.
- Unrelated working-tree change observed: `.agents/mpi-kanban/tasks/MPI-49/validation.md` has a separate update-path investigation note and was left untouched.

## 2026-06-09 Feature Request Tier Routing Adjustment

- Removed the supporter tier dropdown from `.github/ISSUE_TEMPLATE/feature-request.yml`.
- Public GitHub issue forms cannot verify Patreon/Discord membership, so a user-selectable tier field would be spoofable.
- Tier priority should be assigned from a trusted source Fabio controls, such as a Discord tier channel, Patreon workflow, or manual maintainer label after verification.
- If a future feature request mentions a tier in its body, agents must verify the requester is a valid Patreon subscriber before treating the request as tier-priority.
