# Harden Release/Version Bump Integrity Workflow

## Current State

Project mode: scalable-foundation.

Cubric Vision is actively cutting/testing release `0.0.11`. The existing release docs and `.claude/skills/mpi-version-bump/SKILL.md` describe the intended bump flow, but the repository currently proves the workflow is not self-enforcing:

- `APP_VERSION` and `package.json` currently match at `0.0.11`.
- Engine version is centralized in `dev_configs/system_dependencies.json`.
- Runtime changelog notes exist for `0.0.11` in `js/data/releaseNotes.js`, and archival notes exist in `docs/releases/2026-06-10-v0.0.11.md`.
- `operationRegistry.js` and `operation_registry.json` now cover all active, non-stub commands, model supported operations, and universal workflows.
- `routes/projects.js` now creates schema v2 projects using `SCHEMA_VERSION` and initializes `shared.image` / `shared.video`.
- `scripts/pre_release_test.py` now reads ComfyUI version from `dev_configs/system_dependencies.json`.
- `scripts/build-portable.mjs` now fails fast if `APP_VERSION` and `package.json` drift before portable staging.
- `npm run release:check` is the new executable release-health gate and currently passes.
- Runtime release-note coverage now has archival markdown backfills for `0.0.1` and `0.0.8`, and the release-health gate checks every runtime release-note key.
- Agent release docs and the local bump skill now require `npm run release:check` and include a change impact matrix covering version, operation, model, schema, provisioning, build, and changelog-only changes.

This plan is intentionally broader than the current `0.0.11` release card: it should leave future agents with one release-health command and one clear playbook, instead of making them grep through version, provisioning, operations, model, workflow, build, and changelog files.

## Completed

- [x] Initial audit identified operation registry drift, schema creation drift, pre-release test engine-version drift, and missing build-time version parity enforcement.
- [x] Created this MPI task/card so release-hardening work is tracked separately from the active `0.0.11` build/testing card.
- [x] Repaired operation registry and JSON mirror drift for current active operations.
- [x] Added `npm run release:check`, fixed current release-health drifts, and added portable build version parity fail-fast.
- [x] Backfilled historical archival release notes and documented/enforced package-lock version parity.
- [x] Updated release docs and the local version-bump skill with the mandatory release gate and change impact matrix.

## Remaining Work

## Phase 1: Repair Current Registry Drift

- [x] Update `js/core/operationRegistry.js` so every active, non-stub operation in `js/data/commandRegistry.js` is represented with `latestVersion`, `appVersionIntroduced`, and deprecation metadata where needed. Include current active gaps: `t2v_ms`, `i2v_ms`, `resize`, `resizeVideo`. **Verify:** a registry comparison script reports no non-stub command missing from `OPERATION_REGISTRY`.
- [x] Update `operation_registry.json` to mirror `operationRegistry.js`, including universal flags where applicable. Include current mirror gaps: `imageUpscale`, `resize`, `resizeVideo`, and any Phase 1 additions. **Verify:** a mirror comparison script reports no registry entry missing from `operation_registry.json`.
- [x] Decide and record correct `appVersionIntroduced` values for operations that were added before `0.0.11` but not registered at the time. **Verify:** the decision is documented in the plan or release notes so future compatibility checks do not misrepresent history.

## Phase 2: Add Release Health Check

- [x] Add a script such as `scripts/release-health-check.mjs` and an npm script such as `npm run release:check`. It should fail on version drift between `APP_VERSION`, `package.json`, and lockfile root version; missing release notes for current `APP_VERSION`; schema constant drift; stale new-project schema; operation registry drift; JSON mirror drift; and pre-release test engine-version source drift. **Verify:** `npm run release:check` fails before the known drifts are fixed and passes after they are fixed.
- [x] Wire `scripts/build-portable.mjs` or the release build command to run/fail on the version parity subset before staging artifacts. **Verify:** a deliberate local mismatch between `APP_VERSION` and `package.json` causes a clear build failure before archive staging.
- [x] Update `scripts/pre_release_test.py` to read ComfyUI version from `dev_configs/system_dependencies.json`. **Verify:** the pre-release banner prints the current engine version from that file.

## Phase 3: Normalize Schema and Changelog Coverage

- [x] Fix project creation paths so new projects are created at current `SCHEMA_VERSION` and include v2 fields such as `shared`. **Verify:** creating a project through the backend route produces `schemaVersion: 2` and does not need immediate migration.
- [x] Add release-health validation that every public runtime release note has matching archival markdown, while allowing explicitly internal/skipped versions such as `0.0.9` through an allowlist. **Verify:** the script reports `0.0.8`/`0.0.1` historical gaps unless they are documented or backfilled.
- [x] Decide whether current `package-lock.json` root version should be bumped with app releases or explicitly excluded from release identity. **Verify:** the decision is enforced by `npm run release:check` and documented in `docs/versioning.md`.

## Phase 4: Agent Playbook and Rule Updates

- [x] Update `docs/versioning.md`, `docs/releases/README.md`, and `.claude/skills/mpi-version-bump/SKILL.md` so agents must run `npm run release:check` before building or testing a bump. **Verify:** all release docs name the same command and describe the same required gates.
- [x] Add a small "change impact matrix" for agents: command control changes, operation parameter changes, workflow filename/graph changes, model additions, engine/provisioning changes, schema changes, build/launcher changes, and changelog-only releases. **Verify:** each change type lists the exact files/scripts to update and the required bump type or "no bump" rationale.
- [x] Update project rules only if the user explicitly approves rule-doc changes after code/doc changes, per `CLAUDE.md`. **Verify:** no `.claude/rules/` files were changed; final implementation asks whether `.claude/rules/` should be updated if routing or architecture expectations changed.

## Parallel Batch: Independent Follow-Up Work

- [ ] Release gate script implementation. Ownership: `scripts/release-health-check.mjs`, `package.json`. Briefings: versioning docs. **Verify:** `npm run release:check` catches all known drift cases.
- [ ] Release docs/playbook update. Ownership: `docs/versioning.md`, `docs/releases/README.md`, `.claude/skills/mpi-version-bump/SKILL.md`. Briefings: versioning docs. **Verify:** docs consistently point to the release-health gate and impact matrix.
- [ ] Project schema path cleanup. Ownership: `routes/projects.js`, project creation tests if added. Briefings: project integrity docs. **Verify:** backend-created projects use current schema and v2 shape.

Use `mpi-execute-parallel` only after Phase 1 registry repair is complete, because the first repair touches shared release-version source files and should be serialized with the active `0.0.11` bump.

## Plan Drift

- 2026-06-10: Phase 2 pulled `package-lock.json` version parity and backend project schema creation into the current implementation because the new release-health gate would otherwise be red on known drift. The remaining Phase 3 work is now historical release-note coverage and documentation of the lockfile policy.
- 2026-06-10: Phase 3 backfilled archival notes for `0.0.1` and `0.0.8` instead of allowlisting them. `0.0.9` remains only an internal/skipped build note folded into `0.0.10`, so it is not present in runtime release notes.
- 2026-06-10: Phase 4 first updated release docs and the local bump skill. After explicit user approval, `.claude/rules/versioning.md` was added and the project router now requires it before `docs/versioning.md` for versioning/release work.

## Verification

Final verification should include:

- `npm run release:check`
- Targeted registry/mirror comparison output showing no missing active operations.
- `node --check js/data/releaseNotes.js`
- A dry-run or targeted check proving portable build version parity fails fast on mismatch.
- Pre-release test banner or unit-level check showing ComfyUI version comes from `dev_configs/system_dependencies.json`.

## Preservation Notes

- Coordinate with the active `0.0.11` release/testing agent before editing release files already in flight.
- Do not rewrite user/agent changes in the dirty worktree.
- If this changes `.claude/rules/` expectations, ask the user before editing rule files.
