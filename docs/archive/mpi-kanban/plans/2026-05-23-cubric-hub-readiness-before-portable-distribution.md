# Cubric Hub Readiness Before Portable Distribution

**Kanban entry:** `Cubric hub readiness before portable distribution`
**Priority:** high
**Status:** complete (planning) - 2026-05-23
**Sequencing:** after current Cubric Vision app implementation work, before
cross-platform portable distribution.

## Purpose

Confirm that the Cubric hub/connector foundation is ready enough that portable
packaging will not need to be reworked around app identity, connector manifests,
broker startup assumptions, bundled hub artifacts, or update manifest
expectations.

This is a readiness checklist, not a Cubric Prompt implementation plan. Cubric
Prompt remains out of scope until Cubric Vision is mature enough to move from
alpha toward v1.

## Inputs Reviewed

- `docs/specs/cubric-connector-sdk.md`
- `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
- `docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md`
- `resources/cubric/connector-manifest.json`
- `docs/plans/2026-04-30-cross-platform-portable-distribution.md`
- `C:\AI\Mpi\Cubric-Studio\packages\connector\package.json`
- `C:\AI\Mpi\Cubric-Studio\packages\broker\package.json`

## Current State

- Cubric Vision app identity is locked as `cubric.vision`.
- Cubric Vision already ships a manifest-only connector stub at
  `resources/cubric/connector-manifest.json`.
- The manifest declares `project.context.read` and `asset.import`, both consent
  gated, and marks itself with `metadata.manifestOnly: true`.
- Stage 0 `@cubric/connector` exists in the hub folder at
  `C:\AI\Mpi\Cubric-Studio\packages\connector`.
- Stage 1-2 `@cubric/broker` exists in the hub folder at
  `C:\AI\Mpi\Cubric-Studio\packages\broker`.
- The Stage 1-2 plan records broker IPC, framing, HELLO/READY handshake,
  metadata, token handling, and baseline tests as shipped.
- Stage 3+ remains deferred: SDK `ensureBroker()`, broker registry
  persistence, portable app scan/import, permission grant UI, and product-app
  runtime integration.
- Portable distribution already plans `resources/cubric/update-manifest.json`,
  but that manifest is not implemented yet.

## Readiness Decision

Cubric Vision portable distribution can proceed without live connector runtime
integration, as long as the portable build preserves the manifest path and
defines update-manifest fields that future broker registry refresh can rely on.

The hub/broker packages do not need to be bundled into the first Cubric Vision
portable artifact unless a connector-dependent feature is promoted into the
release. For v0.0.1, Cubric Vision remains standalone and manifest-only.

## Required Before Portable Packaging Starts

- [ ] Keep `resources/cubric/connector-manifest.json` in portable staging.
  - Verify the portable build script does not exclude `resources/cubric/**`.
  - Verify the manifest path inside the staged app remains stable relative to
    the app root.

- [ ] Rename portable artifact and launcher examples from legacy
  `CubricStudio_*` to `CubricVision_*` while keeping the ecosystem/hub term
  Cubric Studio for future hub work.
  - Applies to zip/tarball names, launcher filenames, debug launcher names, and
    release-note examples.
  - Do not rename the future hub repo or connector package.

- [ ] Add `resources/cubric/update-manifest.json` generation to the portable
  build plan before implementing update bundles.
  - Required fields: `schemaVersion`, `appId`, `displayName`, `platform`,
    `arch`, `toVersion`, `protocolVersion`, `connectorManifestPath`,
    `connectorManifestHash`, `files[]`, `preserve[]`, and `createdAt`.
  - `connectorManifestPath` should be `resources/cubric/connector-manifest.json`.
  - `connectorManifestHash` must be computed from the staged manifest, not from
    a stale source-tree assumption.

- [ ] Add a portable build smoke assertion for connector metadata.
  - Read the staged connector manifest.
  - Assert `appId === "cubric.vision"`.
  - Assert `protocolVersion === "0.1.0"` unless the connector spec is bumped.
  - Assert `metadata.manifestOnly === true` for v0.0.1.
  - Assert update manifest connector fields match the staged connector
    manifest.

- [ ] Decide hub repo version-control baseline before any new hub implementation.
  - The hub folder currently contains only `packages/`.
  - The broker Stage 1-2 plan explicitly flags `git init` and workspace tooling
    as follow-ups.
  - Do this before Stage 3 broker lifecycle work, not necessarily before
    Cubric Vision portable packaging.

## Required Before Shipping Connector-Dependent Features

These are not blockers for Cubric Vision v0.0.1 portable packaging, but they
must be done before Cubric Prompt or any live app-to-app capability work ships.

- [ ] Hub repo initialized and committed with connector and broker packages.
- [ ] Hub root workspace tooling added so connector and broker build/test from
  one command.
- [ ] Spawn-based broker integration test added, using the shipped broker CLI
  instead of only in-process integration.
- [ ] Stage 3 `ensureBroker()` policy implemented in the SDK client adapter.
- [ ] Broker registry persistence implemented with launch registration and
  stale-manifest refresh.
- [ ] Trust and permission UI/UX implemented or intentionally scoped to a
  product-owned consent surface.
- [ ] Portable app scan/import flow designed for app folders that are installed
  but not running.
- [ ] Cubric Vision live connector integration planned separately, with
  PromptBox and project/artifact context wiring handled as a later child plan.

## Deferred Explicitly

- Cubric Prompt implementation.
- Cubric Vision PromptBox Enhance/Translate/Format runtime integration.
- Hub-owned visual app UI.
- Cross-app update manager.
- Shared UI component package.
- New connector capabilities beyond the locked initial vocabulary.

## Verification For This Planning Entry

- [x] Current Cubric Vision connector manifest reviewed.
- [x] Hub connector and broker package presence checked.
- [x] Stage 0 and Stage 1-2 status reconciled against the latest plan files.
- [x] Portable distribution plan checked for update-manifest expectations.
- [x] Concrete pre-portable and post-v0.0.1 readiness gates written.

## Handoff Notes

The next implementation plan is still
`docs/plans/2026-04-30-cross-platform-portable-distribution.md`. Fold the
"Required Before Portable Packaging Starts" checklist above into that work when
Phase 0/Phase 2 build scripting begins.

If connector-dependent functionality is promoted later, create a separate Stage
3 hub/broker child plan in the hub repo. Do not expand this readiness checklist
into Cubric Prompt work.
