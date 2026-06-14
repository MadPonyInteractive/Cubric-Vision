# Cubric Vision Foundation - Model Resource Registry

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - model-resource-registry`
**Priority:** low until multi-app runtime work starts
**Status:** decision complete

## Purpose

Close the Cubric Vision Foundation question: what would a future shared
model/resource registry need to know, without building it now.

This is a boundary decision, not an implementation plan. Cubric Vision v1 keeps
its current engine/model behavior. A shared registry becomes relevant only when
multiple Cubric apps need to discover or reuse the same local resources.

## Decision

Do not build a shared model/resource registry for Cubric Vision v1.

When needed later, the registry should be hub-owned and describe resources
without owning app settings or app-specific engine environments.

Locked direction:

- Cubric Vision keeps its current model registry, engine folders, and
  `.engine-config.json` behavior.
- Future Cubric apps keep independent settings and engine profiles.
- A future shared registry may index stable local resources such as downloaded
  model files, LLaMA model files, connector manifests, and app-owned resource
  roots.
- The registry must not become a global settings store.
- The registry must not make one app's engine layout the default for every
  other app.
- Resource identity should be path/hash/version based, not inferred from
  Cubric Vision model ids.

## Scope

In scope:

- Define what a future registry would need to know.
- Separate current Cubric Vision behavior from future ecosystem behavior.
- Preserve per-app settings and per-app engine ownership.
- Avoid adding runtime work to Cubric Vision v1.

Out of scope:

- Implementing a registry.
- Changing Cubric Vision model download/install behavior.
- Moving model files.
- Creating a hub UI.
- Adding connector runtime integration to Cubric Vision.
- Sharing ComfyUI engine environments across apps.

## Current Cubric Vision Behavior

Cubric Vision remains the current owner of:

- `engine/`
- `llama_engine/`
- `llama_models/`
- `.engine-config.json`
- Vision model registry entries and model-specific settings
- ComfyUI workflow/model injection rules

These are implementation details of Cubric Vision for v1. Future apps may learn
from them, but they should not import Vision's model registry as the ecosystem
registry.

## Future Registry Responsibilities

A future hub-owned registry would answer:

- Which local resource roots are available?
- Which model/resource files exist?
- Which app owns or last registered each resource root?
- Which files are reusable across apps?
- Which app-specific engines can consume a resource?
- Which resources are missing, stale, or version-incompatible?

Minimum future record shape:

```ts
interface CubricResourceRecord {
  schemaVersion: 1;
  resourceId: string;
  kind: 'comfy-model' | 'llama-model' | 'engine' | 'workflow' | 'app-resource' | 'connector-manifest';
  ownerAppId?: string;
  displayName?: string;
  absolutePath: string;
  relativePath?: string;
  sizeBytes?: number;
  sha256?: string;
  version?: string;
  compatibleAppIds?: string[];
  compatibleEngineKinds?: string[];
  lastSeenAt: string;
  status: 'available' | 'missing' | 'stale' | 'incompatible';
  metadata?: Record<string, unknown>;
}
```

This shape is intentionally descriptive. It does not prescribe where apps store
settings, which model is selected, or how a model is injected into a workflow.

## Non-Goals And Guardrails

- Do not centralize per-app settings.
- Do not centralize model selection.
- Do not require every app to share one ComfyUI install.
- Do not treat Cubric Vision model ids as universal ids.
- Do not make model files part of portable project folders.
- Do not require the hub/broker to run for Cubric Vision v1.

## Implementation Trigger

Create an implementation plan only when at least one of these is true:

- A second Cubric app needs to reuse local models already downloaded by Vision.
- The hub needs an installed-resource view.
- Portable update/install work needs a resource inventory.
- Multiple apps need to validate whether a model/workflow dependency is
  present before launching a capability.

Until then, this remains a closed foundation decision.

## Acceptance

- [x] Current Cubric Vision engine/model behavior remains unchanged.
- [x] Future registry ownership is hub-owned, not Vision-owned.
- [x] The registry is descriptive, not a shared settings store.
- [x] Per-app settings and per-app engine profiles remain independent.
- [x] No Cubric Vision v1 implementation work is created by this decision.
