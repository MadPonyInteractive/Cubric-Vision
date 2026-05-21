# Cubric Vision Foundation - Ecosystem Backend

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - ecosystem-backend`
**Priority:** high
**Track:** `ecosystem-backend`

## Purpose

Define the TypeScript-first backend/connector system that lets Cubric apps
discover each other and request action-based capabilities. This is the
ecosystem blocker before Cubric Prompt/future app implementation, but it is
not required for Cubric Vision v1 app-rename or release.

Decision clarification:
- The SDK/contract is the only piece Cubric Vision may need before it becomes
  ecosystem-ready. It can still ship v1 without live cross-app integrations.
- The broker is part of the future Cubric Studio hub/background system.
- The broker is a blocker for Cubric Prompt/future app-to-app capability work,
  not for Cubric Vision v1.

## Scope

In scope:
- App identity and discovery for installed Cubric apps.
- Capability registry and request/response contract.
- Local transport choice for app-to-app calls.
- Artifact reference shape for project-owned media and external files.
- Versioning, compatibility, error states, and security boundaries.
- TypeScript package/runtime ownership.

Out of scope:
- Implementing Cubric Prompt.
- Migrating Cubric Vision frontend/components to TypeScript.
- Building a visible Cubric Studio hub UI.
- Shipping ecosystem integrations in Cubric Vision v1 unless explicitly promoted.
- Rewriting project sidecar storage.

## Current State

- Cubric Vision is the current Electron app and can ship as a standalone app.
- Future apps and the hub/system direction are TypeScript-first.
- The locked app id for Cubric Vision is `cubric.vision`.
- The capability vocabulary should be action-based, not provider-prefixed.
  Candidate capabilities from the umbrella:
  `prompt.enhance`, `prompt.translate`, `prompt.format.model`,
  `asset.import`, `asset.export`, `project.context.read`.
- Project media metadata already lives in sidecars under `Media/.meta/<uuid>.json`.
- Project paths are portable, and `project.json` history stores UUIDs only.
- The hub is expected to be a small background connector system, not a visible
  app surface in v1.

## Architecture Questions

1. **Runtime owner**
   - Locked direction: both layers are needed.
   - The shared TypeScript SDK/contract is imported by each app.
   - The separate broker process belongs to the future Cubric Studio
     hub/background system.
   - Open question: what minimum SDK surface, if any, should land in Cubric
     Vision before v1 release?

2. **Discovery**
   - How does Cubric Vision discover Cubric Prompt when it is installed?
   - Does discovery read an app manifest, query a local broker, or use OS-level
     registration?
   - Where do app ids, display names, versions, and capabilities live?

3. **Transport**
   - Locked first transport: broker-mediated local IPC behind the SDK.
     Windows uses a named pipe; macOS/Linux use a Unix domain socket.
   - Localhost HTTP is fallback-only if platform IPC blocks implementation, and
     it must still use the broker auth/handshake boundary.

4. **Capability contract**
   - Request shape must name `from`, `to`, `capability`, `input`, and
     optional artifact refs.
   - Response shape must distinguish success, user cancellation, unavailable
     app, unsupported capability, validation error, runtime error, and timeout.
   - Capabilities remain action-based (`prompt.enhance`), with provider app id
     carried separately (`cubric.prompt`).

5. **Artifact handoff**
   - Project-owned media should prefer project-relative references plus sidecar
     ids.
   - External files may need absolute paths only when no Cubric project context
     exists.
   - UUID rules must prevent accidental global identity assumptions.

6. **Security and consent**
   - Local app-to-app calls need a trust model before implementation.
   - At minimum, avoid unauthenticated write/delete actions over a public
     localhost surface.
   - Decide whether first-release capabilities are read/transform-only.

## Blockers

- App identity: mostly locked by brand plan, but needs one canonical technical
  source (`cubric.vision`, future `cubric.prompt`, etc.).
- Capability vocabulary: candidates exist, but no formal schema yet.
- Transport choice: locked to broker-mediated local IPC (Windows named pipe,
  macOS/Linux Unix domain socket).
- Runtime owner: locked to shared SDK plus future Cubric Studio hub broker.
- Artifact reference shape: depends on Phase 4 handoff rules in the umbrella.
- TypeScript package location is locked to future hub repo
  `packages/connector`; package versioning mechanics remain part of Phase 5.
- Install/discovery story: launch registration plus cached/scanned portable app
  folders, with `resources/cubric/connector-manifest.json` as the stable bundle
  manifest path.
- Portable distribution means there is no installer-owned registration step.
  Apps are zip folders on Windows/macOS/Linux, so discovery must handle
  launch-time registration plus cached or hub-scanned app folders.
- Update story is now related and staged: portable app updates can change
  capabilities, so broker registry refresh compares app version, protocol
  version, and connector manifest hash.
- Portable update direction: full release artifacts for new users plus
  ComfyUI-style `update/` scripts/bundles for existing portable folders. See
  `docs/plans/2026-04-30-cross-platform-portable-distribution.md` Phase 6.

## Recommended MVP Shape

Start with a **TypeScript SDK plus broker-compatible contract**, not a full
runtime. The broker comes later as part of the Cubric Studio hub/background
system.

- Define package: `@cubric/connector`.
- Package location: future Cubric Studio hub repo, `packages/connector`.
- Ownership: future Cubric Studio hub/repo owns the connector SDK and broker.
- Validation: runtime schemas are required; TypeScript types alone are not
  enough at app/broker boundaries.
- Draft contract spec: `docs/specs/cubric-connector-sdk.md`.
- Implementation brief: `docs/plans/2026-05-20-connector-sdk-mvp-implementation-brief.md`.
- Define schemas/types for:
  - `CubricAppManifest`
  - `CubricCapability`
  - `CubricCapabilityRequest`
  - `CubricCapabilityResponse`
  - `CubricArtifactRef`
  - `CubricConnectorError`
- Define manifest examples for `cubric.vision` and future `cubric.prompt`.
- Define transport-agnostic interfaces first:
  - `discoverApps()`
  - `listCapabilities(appId?)`
  - `requestCapability(request)`
- Defer broker implementation until the schema and discovery model are signed
  off.
- Use `docs/plans/2026-05-20-cubric-prompt-start-blockers.md` as the
  pre-repo checklist for what Cubric Prompt needs from this connector work.

Why this is the right first step:
- It gives Cubric Prompt something to build against later.
- It avoids forcing Cubric Vision v1 to depend on an unfinished broker.
- It keeps the connector TypeScript-first without migrating the existing app.
- It lets the app-rename implementation proceed independently.

## Remaining Work

## Phase 1: Contract Boundaries

- [x] Decide runtime owner: SDK + broker. **Locked:** the SDK/contract is shared
  by apps; the broker belongs to the future Cubric Studio hub/background system.

- [x] Decide package/repo ownership for TypeScript connector work. **Locked:**
  the future Cubric Studio hub/repo owns both the connector SDK package and
  broker. Product apps such as Cubric Vision and Cubric Prompt consume it.

- [x] Decide exact package location/name inside the future Cubric Studio
  hub/repo. **Locked:** `packages/connector`, package name
  `@cubric/connector`.

- [x] Decide whether Cubric Vision v1 needs live SDK integration before release.
  **Locked:** live SDK integration is deferred; Cubric Vision v1 can ship
  standalone. The SDK contract may exist as a planning/spec artifact before
  release, but runtime integration happens later.

- [x] Define app manifest fields. **Drafted:** see
  `docs/specs/cubric-connector-sdk.md`. **Verify:** `cubric.vision` and future
  `cubric.prompt` can be represented without app-specific exceptions.

## Phase 2: Capability Schema

- [ ] Finalize initial capability vocabulary. **Drafted:** see
  `docs/specs/cubric-connector-sdk.md`. **Verify:** capability ids are
  action-based and not provider-prefixed.

- [x] Write request/response TypeScript interfaces. **Drafted:** see
  `docs/specs/cubric-connector-sdk.md`. **Verify:** examples cover
  `prompt.enhance`, `prompt.translate`, and `project.context.read`.

- [x] Define standard error codes. **Drafted:** see
  `docs/specs/cubric-connector-sdk.md`. **Verify:** unavailable app,
  unsupported capability, validation error, user cancellation, runtime error,
  and timeout are distinct.

- [x] Decide validation strategy. **Locked:** runtime validation is required
  and the SDK uses Zod as the source of truth for manifests, requests,
  responses, artifact references, protocol messages, registry records,
  connection metadata, and error envelopes.

## Phase 3: Artifact References

- [x] Define `CubricArtifactRef` for project-owned media. **Drafted:** see
  `docs/specs/cubric-connector-sdk.md`. **Verify:** it can point to one image
  and one video using project-relative paths plus sidecar ids.

- [x] Define external-file references. **Drafted:** see
  `docs/specs/cubric-connector-sdk.md`. **Verify:** absolute paths are allowed
  only when no project-relative context exists.

- [ ] Align UUID rules with project portability.
  **Verify:** artifact ids are not treated as global cross-app identity unless
  a future global id is explicitly introduced.

## Phase 4: Discovery And Transport

- [x] Decide local discovery mechanism. **Locked:** broker-owned discovery for
  portable app folders. Apps register on launch from
  `resources/cubric/connector-manifest.json`; the broker may cache, scan, or
  import known app folders before launch. **Verify:** app manifests can be
  found/refreshed on Windows/macOS/Linux without installers.

- [x] Decide first transport. **Locked:** broker-mediated local IPC behind the
  SDK: Windows named pipe, macOS/Linux Unix domain socket. Localhost HTTP is a
  fallback only if platform IPC blocks implementation, and must still use the
  same auth/handshake rules. **Verify:** the transport supports local
  request/response, app unavailable states, and broker-side permission checks.

- [x] Decide auth/handshake boundary. **Locked:** per-user broker session token
  plus validated manifest handshake and broker-side app trust record. **Verify:**
  manifest identity is not treated as secret, path changes do not silently
  inherit permissions, and mismatch failures map to `PERMISSION_DENIED` or
  `VERSION_UNSUPPORTED`.

- [x] Decide startup/lifecycle behavior. **Locked:** SDK `ensureBroker()` first
  connects to an existing user broker, then starts the hub-owned broker only
  when connector services are enabled and needed. The broker may stay alive for
  the user session/idle timeout and must support disable/shutdown/status states.
  **Verify:** Cubric Vision can remain standalone when the connector is absent.

- [x] Decide portable app update relationship. **Locked:** full releases and
  update bundles include `resources/cubric/update-manifest.json` with
  `connectorManifestPath` and `connectorManifestHash`; broker registry refresh
  compares app version, protocol version, and connector manifest hash. **Verify:**
  newly added capabilities do not look missing after an app update.

## Phase 5: Implementation Readiness

- [x] Produce a small TypeScript contract package plan. **Locked:** implement
  `packages/connector` with `src/index.ts`, `src/types.ts`, `src/schemas.ts`,
  `src/protocol.ts`, `src/errors.ts`, `src/client.ts`, `src/mockClient.ts`,
  plus schema and mock-client tests. No broker runtime in the MVP.

- [x] Identify Cubric Vision integration points, without implementing them.
  **Mapped:** see
  `docs/specs/cubric-vision-connector-integration-map.md` for PromptBox
  Enhance/Translate/Format attachment points, Help/Integrations
  discoverability, project context, selected artifact refs, draft Vision ->
  Prompt request payloads, and v1 non-goals.

- [x] Decide what, if anything, must land in Cubric Vision before Cubric Prompt
  begins. **Locked:** Cubric Vision v1 may ship a manifest-only stub at
  `resources/cubric/connector-manifest.json`; live SDK/broker integration is
  deferred until another app needs real connector services. This does not block
  Vision v1. **Implemented in this repo:** the manifest-only stub exists at
  `resources/cubric/connector-manifest.json`.

## Verification

This child plan is complete when:

- The ecosystem connector has a TypeScript-first contract and ownership model.
- Cubric Vision can ship standalone without this runtime.
- Cubric Prompt has a clear backend contract to target before implementation.
- Artifact references preserve project portability and sidecar semantics.
- Discovery/transport/security questions are resolved enough to estimate
  implementation work.

## Preservation Notes

- Do not edit `.claude/rules/` without explicit approval.
- Read `docs/project-integrity.md` before finalizing artifact references.
- Read `docs/data.md` before mapping app manifests to model/command metadata.
- Read `docs/comfy.md` only if connector capabilities might trigger generation.
