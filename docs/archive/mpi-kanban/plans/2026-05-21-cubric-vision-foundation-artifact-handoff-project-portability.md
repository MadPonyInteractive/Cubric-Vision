# Cubric Vision Foundation - Artifact Handoff Project Portability

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - artifact-handoff-project-portability`
**Priority:** high for ecosystem planning, not a Cubric Vision v1 runtime blocker
**Status:** implementation ready

## Purpose

Lock the Phase 4 foundation decisions around how future Cubric apps can consume
Cubric Vision artifacts and projects without turning Vision into a required
runtime dependency or inventing global artifact identity.

This plan is documentation and contract planning only. It does not add live
connector integration, broker behavior, project import UI, or schema migration.

## Decision

Future Cubric apps should support **both selected artifact handoff and whole
project folder handoff**, using different levels of context:

- Selected artifact handoff uses `CubricArtifactRef` from the connector SDK.
- Whole project handoff uses `CubricProjectRef` plus the project folder on disk.
- Template projects with settings/models and no media remain valid portable
  projects.
- Artifact identity remains project-local. There is no global artifact id in
  this foundation phase.
- Cubric Vision v1 remains standalone and does not require a broker, another
  Cubric app, or a shared runtime to open projects or media.

## Scope

In scope:
- Review sidecar fields needed by future apps.
- Decide selected-artifact vs whole-folder consumption.
- Preserve template project portability.
- Align with `CubricArtifactRef` and `CubricProjectRef`.
- Define implementation-ready acceptance criteria.

Out of scope:
- Runtime connector implementation in Cubric Vision.
- Broker permissions UI or consent flows.
- New global artifact registry.
- Project schema migration.
- Moving media, models, or engine folders.
- Import/export UI for future Cubric apps.

## Inputs Read

- `CLAUDE.md`
- `.claude/rules/dos_and_donts.md`
- `docs/PROJECT.md`
- `docs/project-integrity.md`
- `docs/projects.md`
- `docs/specs/cubric-connector-sdk.md`
- `docs/plans/2026-05-19-cubric-vision-foundation.md`

## Sidecar Compatibility Review

The current sidecar model is sufficient as the foundation handoff primitive.
Future apps should read sidecar JSON as item metadata and project-relative media
paths as the durable file reference when the artifact is inside a Cubric
project.

| Need | Current field or rule | Decision |
| --- | --- | --- |
| Prompt | `prompt` | Existing field is the canonical positive prompt for generated items. |
| Negative prompt | `negativePrompt` | Existing field is sufficient. Connector payloads may also carry `negativePrompt` in capability-specific input. |
| Seed | `seed` | Existing field is sufficient. Missing/null is allowed for uploads and nondeterministic imported items. |
| Model id | `modelId` | Existing field is sufficient. It identifies the Vision model registry id, not a universal model id. |
| Operation | `operation` | Existing field is sufficient and remains the operation key, not a display label. |
| Media type | `type` plus `CubricArtifactRef.mediaType` | Existing Vision sidecar uses `type`; connector refs use `mediaType`. Mapping is direct for image/video. |
| Dimensions | `pixelDimensions` | Existing field is sufficient for images and videos. |
| Video metadata | `thumbPath`, `fps`, `duration`, `frameCount`, `hasAudio`, `videoMeta` | Existing fields are sufficient for basic future app context. `videoMeta` remains optional enrichment. |
| Source lineage | `sourceItemId`, `sourceGroupId`, `extendedFrom`, operation-specific metadata | Existing fields cover current lineage. Future apps must treat lineage as best-effort unless the field is documented for that operation. |
| Generation timings | `generationMs` | Existing field is sufficient. Null is valid for uploads/crop and other non-sampling items. |
| Trim | `trim` | Existing optional `{ in, out }` in seconds is sufficient. Absence means no persisted trim. |
| Preview assets | `previewAssets`, `stage`, `frozenParams`, `loraSnapshot` | Existing fields are sufficient for Vision preview cards. Future apps may inspect them but must not require them for normal artifact handoff. |

No new required sidecar field is needed for the foundation decision. If a future
app needs richer lineage, it should add a clearly named optional field under a
future project schema plan rather than redefining `id`, `operation`, or
`filePath`.

## Artifact Identity Rules

Artifact identity is scoped to the project:

- `project.json.id` is the project id.
- `.meta/<uuid>.json.id` is the project-local item id.
- `project.json.itemGroups[].history[]` stores sidecar ids only.
- `CubricProjectArtifactRef.itemId` maps to the sidecar id.
- `CubricProjectArtifactRef.sidecarRelativePath` points at
  `Media/.meta/<itemId>.json`.
- `CubricProjectArtifactRef.relativePath` points at the media file relative to
  the project root.

The stable reference tuple is:

```text
projectRoot + projectId + itemId + sidecarRelativePath
```

This is not a global identity. If a user copies or forks a project folder, the
same `projectId` and item ids may exist in more than one location. Future apps
must not cache `{ projectId, itemId }` as globally unique across machines,
folders, accounts, or duplicated projects.

If global artifact identity is ever needed, it must be introduced later as an
explicit optional field, for example `globalArtifactId`, with its own generation
and collision rules. This plan deliberately does not introduce it.

## Handoff Modes

### Selected Artifact Handoff

Use this when an app action targets one or more specific images/videos.

Shape:
- Capability request includes `artifacts: CubricArtifactRef[]`.
- Project-owned media uses `kind: 'project-artifact'`.
- External media uses `kind: 'external-file'` only when no Cubric project
  context exists.
- Prompt-only actions may use text refs or capability-specific input without
  media artifacts.

Rules:
- Prefer project-relative refs for media already inside a Cubric project.
- Include `displayName` and `operation` for user-facing context.
- Put optional app-specific context in `metadata`, not at the top level.
- Consumers resolve media paths from the provided project root/context and the
  artifact relative paths. They do not infer filenames from item ids.

### Whole Project Folder Handoff

Use this when a future app needs broader context: recent prompts, model
settings, tool settings, multiple related groups, or a template project.

Shape:
- Capability request includes `context.project: CubricProjectRef`.
- `projectRoot` may be included when the permission model allows folder access.
- The receiving app reads `project.json`, then hydrates sidecars from
  `Media/.meta/` when media items are needed.

Rules:
- `project.json` remains the entry point.
- `itemGroups[].history[]` remains UUID strings on disk.
- Full item data remains in sidecars.
- Consumers must tolerate empty `itemGroups`, empty `history`, missing media
  after reconciliation, and template projects with no `Media/` payload.
- Consumers must not require hidden global state or a running Cubric Vision
  process to understand the folder.

## Template Projects

Template projects remain portable when they contain:

- `project.json`
- `schemaVersion`
- `modelSettings`
- `toolSettings`
- optional empty `itemGroups`
- no media files
- no sidecars

Future metadata additions must preserve this rule:

- Do not require `Media/` to exist for a project to load.
- Do not require a thumbnail or selected media item.
- Do not require sidecar reads when `history[]` is empty.
- Do not make model settings depend on local engine/model files existing.
- Treat missing model files as an availability issue, not project corruption.

This keeps settings/model templates shareable independently of generated media.

## Implementation Guidance

When implementation eventually starts, keep the work staged:

1. Add connector helper functions that convert an in-memory Vision item into a
   `CubricProjectArtifactRef`.
2. Add tests for path conversion from server file URLs to project-relative
   paths before exposing the helper.
3. Add project context helper functions only after a real capability needs
   whole-project context.
4. Keep runtime UI hidden until connector services and permissions exist.

Implementation must not change the current on-disk project shape unless a
separate schema/versioning plan explicitly approves it.

## Acceptance

- [x] Every requested future-app metadata need maps to an existing sidecar field
  or an explicitly deferred optional future field.
- [x] Selected artifact handoff is aligned with `CubricArtifactRef`.
- [x] Whole project handoff is aligned with `CubricProjectRef` and portable
  project folders.
- [x] Template projects with settings/models and no media remain valid.
- [x] The foundation supports selected artifacts, whole projects, or both
  without hidden global state.
- [x] Artifact identity remains project-local; no global artifact id is
  introduced.
- [x] Cubric Vision remains standalone with no runtime connector implementation
  required by this plan.

## Umbrella Updates

This child plan closes the open Phase 4 decisions in
`docs/plans/2026-05-19-cubric-vision-foundation.md`:

- Sidecar schema compatibility review.
- Template project portability.
- Selected artifact vs whole project consumption.

The connector SDK implementation-readiness checklist still owns acceptance of
the TypeScript `CubricArtifactRef` schemas and examples.
