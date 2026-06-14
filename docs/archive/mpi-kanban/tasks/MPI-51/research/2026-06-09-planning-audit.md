# MPI-51 Planning Audit

Date: 2026-06-09

## Repository Contributor Surface

- Root `LICENSE` exists and `package.json` declares `AGPL-3.0-only`.
- Root `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` are absent.
- `.github/PULL_REQUEST_TEMPLATE.md` exists and is release/portable-aware, but it does not yet teach normal contributor expectations such as branch/PR hygiene, setup, lint/test commands, or project coding rules.
- `.github/ISSUE_TEMPLATE/portable-validation.yml` exists and asks for platform, OS, architecture, GPU, artifact name, validation path, app log tail, and macOS Gatekeeper notes.
- `.github/workflows/build-portable.yml` is a dispatcher to private `MadPonyInteractive/mpi-ci`; public source-repo Actions do not upload gated artifacts. Its workflow-dispatch default ref is `main`, while this repo's live branch is `master`, so MPI-51 should decide whether to change the default to `master`.

## Branch State

Checked with `git -c safe.directory=C:/AI/Mpi/Cubric-Vision branch --all --verbose --no-abbrev` and `git -c safe.directory=C:/AI/Mpi/Cubric-Vision branch --merged master --all`.

- `dev` is merged into `master`; local and remote refs exist.
- `backup/raw-gpu-attempt` is merged into `master`; local and remote refs exist.
- `mpi-8-linux-engine-bootstrap` is merged into `master`; local and remote refs exist.
- `mpi-8/git-auto-provision` is also merged into `master`; local branch is ahead of its remote by one commit. Treat this as a review-before-delete candidate, not a blind delete target.
- Working tree had unrelated changes before planning: `.claude/scheduled_tasks.lock` modified and `.agents/mpi-kanban/tasks/MPI-57/` untracked. Do not revert them.

## Memory Promotion Candidates

Project memory reviewed selectively from `C:\Users\Fabio\.claude\projects\C--AI-Mpi-Cubric-Vision\memory\MEMORY.md`.

- Already substantially documented: models-root/default-root behavior and additive `extra_model_paths.yaml` in `docs/comfy.md`, `.claude/rules/comfy_engine.md`, `routes/shared.js`, and `routes/yamlHelper.js`.
- Already substantially documented: private CI artifact gate in `.github/workflows/build-portable.yml` and `docs/releases/portable-distribution-contract.md`.
- Worth promoting into contributor docs: repo distribution/gating model, AGPL/open-source expectations, branch/PR lifecycle, public issue/PR workflow, and "portable artifacts expose source; gating is distribution/timing."
- Worth promoting into docs or rules after review: backend logger arity (`warn`/`info` are two args; only `error` accepts an error object), import-depth gotcha for deeply nested `LandingPages` components, and any component footguns not already covered by `.claude/rules/component-*.md`.
- Rule-file edits require explicit maintainer permission per `CLAUDE.md`; MPI-51 should prepare proposed changes first and ask before editing `.claude/rules/`.

## Planning Implications

- Branch deletion is destructive enough to require an explicit confirmation gate immediately before running remote or local delete commands.
- The contributor-readiness work can be split into disjoint surfaces: root onboarding docs, GitHub templates/workflow, and curated docs/rules promotion.
- A final maintainer review should happen before any public-launch claims are treated as done.
