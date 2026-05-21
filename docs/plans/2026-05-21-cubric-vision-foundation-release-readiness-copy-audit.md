# Cubric Vision Foundation - Release Readiness Copy Audit

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - release-readiness-copy-audit`
**Priority:** high near release, medium before portable distribution
**Status:** planning checklist

## Purpose

Create a focused release-readiness audit for naming, copy, package metadata,
docs references, and verification commands after the app-first implementation
work is done.

This should run after the current app implementation tasks and portable
distribution Phase 0 work are in better shape. It should not become a broad
website/docs rewrite.

## Scope

In scope:
- Search release-facing surfaces for stale `Cubric Studio` app naming.
- Confirm `Cubric Vision`, `cubric.vision`, and package artifact names are
  used intentionally.
- Reconcile release notes, launcher names, package metadata, docs links, and
  public repo URLs.
- Run normal build/runtime checks or record known blockers.

Out of scope:
- Redesigning Website or Docs.
- Patreon page rebuild.
- Connector broker implementation.
- New app features.

## Inputs

- `docs/plans/2026-05-19-cubric-vision-foundation.md`
- `docs/plans/2026-04-30-cross-platform-portable-distribution.md`
- `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_app_rename_complete.md`
- `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_portable_distribution_plan.md`
- `C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_website_push_gate.md`

## Planning Work

### Phase 1: Audit Matrix

- [ ] List app metadata files to audit.
- [ ] List release/package/build files to audit.
- [ ] List docs and website references that are release-facing.
- [ ] List historical/deferred references that are allowed to remain.

### Phase 2: Grep Set

- [ ] Define exact searches:
  `Cubric Studio`, `CubricStudio`, `Cubric Vision`, `CubricVision`,
  `cubric.studio`, `cubric.vision`, `MadPonyInteractive/Cubric-Studio`,
  `MadPonyInteractive/Cubric-Vision`.

### Phase 3: Verification Commands

- [ ] Define release verification commands for the app.
- [ ] Define smoke checks that require Electron rather than browser mode.
- [ ] Define what can be skipped until portable packaging exists.

### Phase 4: Output Format

- [ ] Decide whether the implementation output is a markdown checklist, kanban
  update, release notes draft, or a small patch.

## Implementation Phase

Implementation should run as an audit/fix pass. It may produce small copy or
metadata edits, but only after app-first implementation work is otherwise ready
for release alignment.

## Acceptance

- Release-facing naming is internally consistent.
- Historical/deferred `Cubric Studio` references are explicitly classified.
- Verification commands are run or blocked with clear release impact.
