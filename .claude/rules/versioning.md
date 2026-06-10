# Versioning, Release, and Bump Rules

Use this rule whenever work touches `APP_VERSION`, `SCHEMA_VERSION`,
ComfyUI engine/provisioning versions, operation/model/workflow support, release
notes, or portable build identity.

## Sub-Agent Briefing

- Read `docs/versioning.md` before editing version, schema, operation registry, model workflow, provisioning, release-note, or portable build files.
- Run `npm run release:check` after release/version edits and before portable builds, pre-release generation tests, tags, pushes, or publication.
- Keep `js/core/appVersion.js`, `package.json`, and root `package-lock.json` version metadata identical for app releases.
- Runtime release notes in `js/data/releaseNotes.js` and archival notes under `docs/releases/YYYY-MM-DD-vX.Y.Z.md` must both exist for public app versions.
- Operation changes must keep `js/data/commandRegistry.js`, `js/core/operationRegistry.js`, `operation_registry.json`, universal workflows, and model supported operations aligned.
- Project data-shape changes must update `SCHEMA_VERSION`, migrations, project creation defaults, and release notes together.
- Engine/provisioning changes must update `dev_configs/system_dependencies.json`, relevant provisioning routes/docs, and the release notes engine section.
- Portable build, launcher, updater, artifact naming, and manifest changes must be validated with the portable distribution contract and release notes platform section.

## Required Gate

`npm run release:check` is the release-health gate. A bump is not ready for
builds or publication until this command passes.

## Change Classification

Before cutting a bump, classify the change with the matrix in
`docs/versioning.md`. Do not rely on grep-only discovery for release work; the
matrix lists the expected files and bump rationale for copy-only, command,
operation, workflow, model, engine, schema, and build changes.
