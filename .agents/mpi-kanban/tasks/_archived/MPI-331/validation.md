# MPI-331 Validation

## What shipped (2026-07-21)

Collapsed the 3 release skills into ONE GitHub-only `mpi-release` skill.

**Skills:**
- NEW `.claude/skills/mpi-release/` — SKILL.md + references/build-dispatch.md + references/copy-review.md. One flow, all digits (3rd=fix / 2nd=feature / 1st=breaking) = same mechanical op: version-bump → Gate 1 changelog → commit/push master → push `v<ver>` tag (CI build trigger) → download 6 artifacts → Gate 2 release body → `gh release create` with full builds + update bundles.
- DELETED: mpi-merge-branches, mpi-apply-patch, mpi-release-public, mpi-release-shared (+ link-model.md, r2-upload.md).
- EDITED: mpi-version-bump (4 spots → mpi-release), mpi-end step 3 (→ mpi-release).

**Docs:**
- docs/releases/README.md — Branch Model (master-only), release-flow pointer, distribution gating → GitHub-only.
- docs/releases/portable-distribution-contract.md — Release Channels table (one public channel), early-access language dropped, GitHub carries full+update.
- docs/releases/github-release-checklist.md — early-access framing dropped; update bundles now always attached.
- docs/README.md — knowledge-map row repointed off deleted patch-distribution.md → mpi-release skill.
- DELETED docs/releases/patch-distribution.md; plans/app-update-strategy.md bannered SUPERSEDED.
- .agents/mpi-kanban/project-knowledge-index.md — Release-ops block → GitHub-only + mpi-release.

## Key mechanical decision (grounded in .github/workflows/build-portable.yml)

`v*` tag and `workflow_dispatch` BOTH just trigger the private mpi-ci build — neither publishes a release. So: tag push = build trigger (one build), `gh release create` on that tag = the public moment. No redundant dispatch.

## Approved forks (AskUserQuestion 2026-07-21)

1. Fold the 2 kept references into mpi-release; delete mpi-release-shared (no vestigial lib for one consumer).
2. GitHub release carries FULL builds + UPDATE bundles (online `update.*` needs the bundle; no Cloudflare delta path left).
3. Delete patch-distribution.md; banner app-update-strategy.md.

## Auto-verification (passed)

- board.json + task.json parse as valid JSON.
- mpi-release/ has SKILL.md + both references.
- grep: no retired-skill / Cloudflare-release refs remain in LIVE files (kanban history, handoffs, archived tasks, and past release notes intentionally left as frozen records).

## Corrected handoff assumptions

- **CLAUDE.md, .claude/rules/versioning.md, docs/versioning.md need NO change** — verified they never named the retired skills or the Cloudflare flow. CLAUDE.md's only Cloudflare/tier hits are legit (R2 *weights*; model/app *tier selectors*).

## Follow-up (user review round 1, 2026-07-21)

- **Dropped `macos-x64`** from github-release-checklist.md + portable-distribution-contract.md (both artifact tables). Live build matrix is arm64-only; 1.0.1 GitHub release shipped 3 fulls (linux-x64, macos-arm64, windows-x64). build-dispatch.md note reworded to "don't invent a macos-x64 asset".
- **Version digits confirmed** as `v.big_change.new_models_and_features.bugfix` = major.minor.patch — already documented correctly, no change.
- **Stripped R2/Cloudflare** from all release docs (skill invariant bullet, build-dispatch, README) — the release flow no longer touches R2. R2-for-weights stays documented in its own capability doc, not here.

## Needs user eyes before → done

- Read the new `mpi-release` SKILL.md flow — does it match how you actually want to cut a release (tag-as-build-trigger, then `gh release create`)?
- Skim the docs/releases/* edits.
- NOT run live (no release cut). First real use of `mpi-release` is the true test.
- Commit is deferred to `mpi-end` (shared tree, explicit pathspec).
