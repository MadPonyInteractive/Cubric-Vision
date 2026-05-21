# Cubric Connector SDK Contract

**Status:** draft contract
**Package name:** `@cubric/connector`
**Package location:** future Cubric Studio hub repo, `packages/connector`
**Owner:** future Cubric Studio hub/repo
**Related plan:** `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
**Primary consumers:** Cubric Vision, future Cubric Prompt, future Cubric Studio hub/broker

## Purpose

Define the shared TypeScript contract that Cubric apps use to describe
themselves, advertise capabilities, and exchange capability requests.

This document defines the SDK contract only. It does not define or implement
the future Cubric Studio broker runtime.

When implemented, the SDK must include runtime validation for manifests,
requests, responses, artifact references, and error envelopes. Static
TypeScript types are not enough at app and broker boundaries because payloads
can cross process, version, and app trust boundaries.

## Scope

In scope:
- App manifests.
- Capability declarations.
- Request and response envelopes.
- Artifact and project references.
- Standard error codes.
- Example payloads for Cubric Vision and Cubric Prompt.

Out of scope:
- Broker process implementation.
- App installation/discovery implementation.
- Cubric Vision live SDK integration.
- Cubric Prompt app implementation.
- UI component sharing.

## Architecture Position

The connector system has two layers:

1. `@cubric/connector`: shared TypeScript SDK/contract imported by apps.
2. Cubric Studio broker: future hub-owned background runtime for discovery,
   routing, trust, and lifecycle.

Ownership is hub-first. Cubric Studio owns the connector contract and broker
because it is the master/hub for all Cubric apps, even if it later grows into
a visible app. Product apps such as Cubric Vision and Cubric Prompt consume the
connector; they do not own it.

Cubric Vision v1 can ship without live SDK integration. Cubric Prompt and later
apps should not start real app-to-app implementation until this SDK contract is
stable enough to target.

## Naming Rules

App ids are lowercase dotted identifiers:

```text
cubric.vision
cubric.prompt
cubric.audio
cubric.video
```

Capability ids are lowercase dotted action ids and are not provider-prefixed:

```text
prompt.enhance
prompt.translate
prompt.format.model
asset.import
asset.export
project.context.read
```

The provider app id is carried separately from the capability id.

## Package Ownership

The connector package lives in the future Cubric Studio hub repo:

```text
packages/connector
```

The package name is:

```text
@cubric/connector
```

Cubric Studio owns this package because it owns the hub and broker. Product
apps consume it.

## Validation Strategy

The SDK uses Zod runtime schemas from its first implementation. Zod schemas are
the source of truth for validation; TypeScript types should be inferred from
those schemas where practical.

Requirements:
- TypeScript interfaces and runtime schemas must describe the same contract.
- Every app manifest must be validated before registration or discovery output.
- Every capability request must be validated before routing.
- Every capability response must be validated before returning to the caller.
- Unknown optional metadata is allowed only inside explicit `metadata` or
  `details` objects.
- Version mismatches must produce `VERSION_UNSUPPORTED`, not generic runtime
  errors.

JSON Schema export can be added later if another runtime or language needs to
consume the connector contract. It is not required for the MVP.

## Discovery And Transport Direction

Discovery answers: "Which Cubric apps are installed, reachable, and able to
handle a capability?"

Transport answers: "How does a request get from one app to another?"

The recommended direction is broker-owned discovery and broker-mediated
transport. Cubric Vision should not scan for Cubric Prompt directly, and
Cubric Prompt should not expose a broad unauthenticated localhost API. Product
apps should talk to the Cubric Studio broker through the connector SDK, and the
broker should own app registration, capability lookup, routing, permissions,
and lifecycle.

Recommended shape:

```text
Cubric Vision -> @cubric/connector -> Cubric Studio broker -> Cubric Prompt
```

The SDK remains transport-agnostic at the public API layer. Apps call
`discoverApps`, `listCapabilities`, and `requestCapability`; the broker/client
adapter uses the Stage 1 local IPC transport unless a later transport is added
behind the same request shapes.

### Transport Requirements

The first real transport must:
- Work on Windows, macOS, and Linux.
- Be local-only.
- Support request/response calls.
- Support app unavailable and timeout states.
- Carry app identity and protocol version.
- Allow broker-side permission checks.
- Avoid unauthenticated write/delete actions over a public localhost surface.
- Be replaceable behind the SDK without changing app-facing request shapes.

### Implementation Stages

The remaining discovery, transport, auth, broker lifecycle, registration, and
portable update questions are now staged implementation decisions rather than
open architecture questions. Each stage must be implemented behind the
transport-agnostic SDK API.

#### Stage 0: Contract-Only SDK

Ship `@cubric/connector` as schemas, TypeScript types, constants, error
helpers, and in-memory/mock client fixtures.

Requirements:
- No broker process is required.
- Cubric Vision v1 may remain standalone and may skip runtime integration.
- Cubric Prompt planning may target mock connector fixtures.
- Zod runtime schemas validate manifests, requests, responses, artifact refs,
  protocol messages, broker registry records, connection metadata, and error
  envelopes.
- The SDK package includes broker protocol types and a mock client, but no
  broker runtime.

MVP package layout:

```text
packages/connector/
  src/
    index.ts
    types.ts
    schemas.ts
    protocol.ts
    errors.ts
    client.ts
    mockClient.ts
  tests/
    schemas.test.ts
    mockClient.test.ts
```

#### Stage 1: Transport Primitive

First real transport is broker-owned local IPC:
- Windows: named pipe.
- macOS/Linux: Unix domain socket.

Implementation direction:
- Use a length-prefixed JSON message protocol over a single local stream.
- Keep request/response correlation in the envelope through `requestId`.
- Keep app-facing SDK shapes unchanged if the stream protocol is replaced.
- Direct app-to-app transport is allowed only in tests and development
  fixtures.
- Localhost HTTP is a fallback only if a platform-specific IPC blocker appears;
  if used, it must bind to loopback and use the same handshake/auth rules.

This locks the first production primitive to private OS-local IPC and avoids a
public unauthenticated localhost API.

#### Stage 2: Auth And Handshake

Authentication is per-user broker-session authentication plus broker-side app
trust, not a claim that connector manifests are secret.

Broker startup creates a random session token and writes connection metadata to
a user-scoped runtime file. The metadata contains only the broker endpoint,
protocol version, broker pid/start time, and a short-lived bearer token. File
permissions must be owner-only where the platform allows it.

Connection metadata path:
- Windows: `%LOCALAPPDATA%\Cubric\broker\connection.json`
- macOS: `~/Library/Application Support/Cubric/broker/connection.json`
- Linux: `${XDG_RUNTIME_DIR}/cubric/broker/connection.json`, falling back to
  `~/.cache/cubric/broker/connection.json` when `XDG_RUNTIME_DIR` is missing.

Handshake flow:

1. App opens the broker endpoint from the connection metadata or receives it
   through `CUBRIC_BROKER_ENDPOINT` / `CUBRIC_BROKER_TOKEN` when the SDK starts
   the broker.
2. App sends `HELLO` with:
   - `appId`
   - `displayName`
   - `version`
   - `protocolVersion`
   - `manifestPath`
   - `manifestHash`
   - bearer token
   - SDK version
3. Broker validates the token, manifest schema, protocol compatibility, and
   app trust record.
4. Broker returns `READY` with broker protocol version, granted permissions, and
   a connection-scoped session id.

Trust rules:
- The session token authenticates that the caller can read the current user's
  broker connection file or was spawned with broker environment variables.
- The manifest identifies the app but is not treated as a secret.
- First registration from a new app path creates an untrusted or pending record
  unless the hub has imported/scanned that folder.
- Re-registration for the same `appId` from a different path is a trust-change
  event and must not silently inherit permissions.
- Permission-denied and protocol mismatch failures use `PERMISSION_DENIED` and
  `VERSION_UNSUPPORTED`, not generic runtime errors.

#### Stage 2A: MVP Permission Model

The v0 permission model is trust-app-once plus consent for project and media
access.

Trust states:
- `pending`: app is known but not trusted.
- `trusted`: app path and manifest identity have been accepted.
- `blocked`: app is denied until the user or future hub UI changes it.

Capability policy:
- `prompt.enhance`, `prompt.translate`, and `prompt.format.model` are allowed
  when both caller and provider apps are trusted.
- `project.context.read` requires consent.
- `asset.import` requires consent.
- `asset.export` requires consent.
- A changed app path for the same `appId` resets trust to `pending`.

Consent UI is future hub/product UI scope. The SDK and broker contracts must
represent the permission requirement and return `PERMISSION_DENIED` when a
permission is missing or denied.

#### Stage 3: Broker Startup Policy

The SDK exposes an internal `ensureBroker()` path used by real connector
clients. It follows this policy:

1. Try the current user's broker connection metadata.
2. If the broker is reachable, connect and handshake.
3. If not reachable and connector services are enabled, start the hub-owned
   broker from a known bundled or configured broker path.
4. Wait for readiness with a bounded startup timeout.
5. If startup fails or connector services are disabled, return normal connector
   unavailable errors and let the product app degrade.

Runtime policy:
- The broker starts when any Cubric app needs connector services.
- It stays alive for the user session or until idle timeout, explicit shutdown,
  or explicit disable.
- The broker must not be started separately for every capability request.
- Product apps must work without the broker when no connector-dependent feature
  is required.
- User-visible controls are future hub UI scope, but the backend must already
  support disable, shutdown, and status states.

#### Stage 4: Manifest Registration

Every portable app bundle includes a connector manifest at a stable relative
path:

```text
resources/cubric/connector-manifest.json
```

The broker registry has two registration sources:
- **Launch registration:** required. The running app sends its validated
  manifest during handshake and is the authority for current live capabilities.
- **Cached/pre-launch registration:** optional but supported. The broker can
  remember or scan portable app folders so other apps can show installed but not
  currently running apps.

Registry record requirements:
- `appId`
- `displayName`
- `version`
- `protocolVersion`
- `manifestPath`
- `manifestHash`
- `installRoot`
- `lastSeenAt`
- `registrationSource` (`launch`, `scan`, or `import`)
- capability summary copied from the validated manifest
- trust/permission state

Registry path:
- Windows: `%APPDATA%\Cubric\broker\registry.json`
- macOS: `~/Library/Application Support/Cubric/broker/registry.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/cubric/broker/registry.json`

Refresh rules:
- Launch registration always replaces the cached capability view for that
  `appId` and trusted path.
- A changed `version`, `protocolVersion`, `manifestHash`, or manifest modified
  timestamp marks the registry entry stale until the manifest validates.
- Stale manifest refresh is a normal update condition, not a runtime error.
- A removed portable folder marks the app unavailable but keeps enough registry
  history to explain why capability lookup failed.

#### Stage 5: Portable Update Manifest

Portable full releases and update bundles include a version/update manifest.
For connector compatibility, the update manifest must include enough
information for scripts and the broker registry to detect app, protocol, and
capability changes.

Recommended file:

```text
resources/cubric/update-manifest.json
```

Minimum shape:

```ts
export interface CubricPortableUpdateManifest {
  schemaVersion: 1;
  appId: CubricAppId;
  displayName: string;
  platform: 'windows' | 'macos' | 'linux';
  arch: 'x64' | 'arm64';
  fromVersion?: string;
  toVersion: string;
  protocolVersion: string;
  connectorManifestPath: string;
  connectorManifestHash: string;
  files: CubricUpdateFileEntry[];
  delete?: string[];
  preserve?: string[];
  createdAt: string;
  packageSha256?: string;
  metadata?: Record<string, unknown>;
}

export interface CubricUpdateFileEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
  executable?: boolean;
}
```

Update rules:
- v1 update bundles are changed-file bundles, not binary deltas.
- The app must be closed during script-driven updates.
- Update scripts verify they are running from a Cubric portable root before
  writing files.
- `preserve` must cover engines, models, projects, generated media, user config,
  and other app-owned runtime data.
- Connector manifests are refreshed as part of the update, not as a later
  migration.
- After update, next launch registration must replace the broker's cached
  capability view if `version`, `protocolVersion`, or
  `connectorManifestHash` changed.
- Future hub-owned updaters may use the same manifest and add process
  coordination, but must not change the connector-facing fields without a schema
  version bump.

### Portable App Constraint

Cubric apps ship as portable zip builds on Windows, macOS, and Linux. Users
download, extract, and run an app folder. There is no normal installer that can
be trusted to register apps with the operating system or with the broker.

Discovery must therefore work for portable folders:
- Each app bundle must include a connector manifest file at
  `resources/cubric/connector-manifest.json`.
- Apps should register with the broker on launch.
- The broker may keep a cached registry of previously seen apps.
- Registration should also be possible from a hub-side scan/import flow later,
  so an app can be known before it is launched.
- Registration must refresh capabilities and protocol versions every launch so
  portable app updates do not leave stale capabilities in the broker.

This implies "both" registration modes:
- **Launch registration:** required. The running app is the authority for its
  current manifest and capabilities.
- **Cached/pre-launch registration:** useful. The broker can remember or scan
  portable app folders so other apps can show availability before the target
  app is currently running.

Because portable app updates are folder replacement/extraction events, update
detection should compare manifest `appId`, `version`, `protocolVersion`, and a
manifest hash or modified timestamp. If an app's manifest changes, the broker
must refresh capabilities before reporting them to other apps.

Portable update bundles should also refresh connector manifests. If a user runs
an update script that adds Prompt capabilities or changes protocol support, the
next app launch/registration must replace the broker's cached capability view.
The broker should treat stale manifests as a normal update condition, not as a
runtime error.

### Broker Lifecycle Direction

The broker should be hub-owned and normally available while the user is working
with Cubric apps. A user in Cubric Vision may request Cubric Prompt repeatedly
while building prompts, so startup latency should not happen on every request.

Recommended lifecycle:
- The Cubric Studio hub/broker starts when any Cubric app needs connector
  services.
- It may stay alive in the background for the user session.
- Product apps should degrade cleanly when the broker is absent.
- The broker should support an explicit shutdown/disable path for users who do
  not want background services.

### Remaining Broker Decisions

The backend implementation stages above lock the first transport primitive,
auth/handshake mechanism, broker startup policy, manifest registration path,
and portable update manifest shape.

Still open:
- Hub-side scan/import UX for portable app folders.
- Exact permission prompt UI and persisted consent UI.
- Idle timeout duration and user-facing broker status wording.

## TypeScript Types

```ts
export type CubricAppId =
  | 'cubric.vision'
  | 'cubric.prompt'
  | 'cubric.audio'
  | 'cubric.video'
  | (string & {});

export type CubricCapabilityId =
  | 'prompt.enhance'
  | 'prompt.translate'
  | 'prompt.format.model'
  | 'asset.import'
  | 'asset.export'
  | 'project.context.read'
  | (string & {});

export type CubricMediaType = 'image' | 'video' | 'audio' | 'text' | 'project';

export type CubricCapabilityKind = 'read' | 'transform' | 'import' | 'export';

export interface CubricAppManifest {
  schemaVersion: 1;
  appId: CubricAppId;
  displayName: string;
  version: string;
  protocolVersion: string;
  capabilities: CubricCapability[];
  entrypoints?: CubricEntrypoints;
  metadata?: Record<string, unknown>;
}

export interface CubricEntrypoints {
  broker?: {
    registrationPath?: string;
  };
  direct?: {
    transport: 'http' | 'pipe' | 'socket' | 'ipc';
    endpoint: string;
  };
}

export interface CubricCapability {
  id: CubricCapabilityId;
  providerAppId: CubricAppId;
  kind: CubricCapabilityKind;
  label: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  mediaTypes?: CubricMediaType[];
  requiresConsent?: boolean;
  version: string;
}

export interface CubricCapabilityRequest<TInput = unknown> {
  schemaVersion: 1;
  requestId: string;
  from: CubricAppRef;
  to?: CubricAppRef;
  capability: CubricCapabilityId;
  input: TInput;
  context?: CubricRequestContext;
  artifacts?: CubricArtifactRef[];
  timeoutMs?: number;
}

export interface CubricCapabilityResponse<TOutput = unknown> {
  schemaVersion: 1;
  requestId: string;
  ok: boolean;
  from: CubricAppRef;
  capability: CubricCapabilityId;
  output?: TOutput;
  artifacts?: CubricArtifactRef[];
  error?: CubricConnectorError;
}

export interface CubricAppRef {
  appId: CubricAppId;
  displayName?: string;
  version?: string;
}

export interface CubricRequestContext {
  project?: CubricProjectRef;
  sourceOperation?: string;
  sourceModelId?: string;
  locale?: string;
}

export interface CubricProjectRef {
  appId: CubricAppId;
  projectId: string;
  projectName?: string;
  projectRoot?: string;
  schemaVersion?: number;
}

export type CubricArtifactRef =
  | CubricProjectArtifactRef
  | CubricExternalFileRef
  | CubricTextArtifactRef;

export interface CubricProjectArtifactRef {
  kind: 'project-artifact';
  mediaType: Exclude<CubricMediaType, 'text' | 'project'>;
  projectId: string;
  itemId: string;
  relativePath: string;
  sidecarRelativePath: string;
  displayName?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

export interface CubricExternalFileRef {
  kind: 'external-file';
  mediaType: CubricMediaType;
  absolutePath: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface CubricTextArtifactRef {
  kind: 'text';
  mediaType: 'text';
  text: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export type CubricConnectorErrorCode =
  | 'APP_UNAVAILABLE'
  | 'CAPABILITY_UNSUPPORTED'
  | 'VALIDATION_ERROR'
  | 'USER_CANCELLED'
  | 'RUNTIME_ERROR'
  | 'TIMEOUT'
  | 'PERMISSION_DENIED'
  | 'VERSION_UNSUPPORTED';

export interface CubricConnectorError {
  code: CubricConnectorErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type CubricBrokerMessage =
  | CubricBrokerHelloMessage
  | CubricBrokerReadyMessage
  | CubricBrokerErrorMessage
  | CubricBrokerDiscoverAppsMessage
  | CubricBrokerDiscoverAppsResultMessage
  | CubricBrokerListCapabilitiesMessage
  | CubricBrokerListCapabilitiesResultMessage
  | CubricBrokerRequestCapabilityMessage
  | CubricBrokerRequestCapabilityResultMessage;

export interface CubricBrokerHelloMessage {
  type: 'HELLO';
  requestId: string;
  payload: CubricHelloPayload;
}

export interface CubricBrokerReadyMessage {
  type: 'READY';
  requestId: string;
  payload: CubricReadyPayload;
}

export interface CubricBrokerErrorMessage {
  type: 'ERROR';
  requestId: string;
  payload: CubricConnectorError;
}

export interface CubricBrokerDiscoverAppsMessage {
  type: 'DISCOVER_APPS';
  requestId: string;
  payload?: Record<string, never>;
}

export interface CubricBrokerDiscoverAppsResultMessage {
  type: 'DISCOVER_APPS_RESULT';
  requestId: string;
  payload: CubricAppManifest[];
}

export interface CubricBrokerListCapabilitiesMessage {
  type: 'LIST_CAPABILITIES';
  requestId: string;
  payload: {
    appId?: CubricAppId;
  };
}

export interface CubricBrokerListCapabilitiesResultMessage {
  type: 'LIST_CAPABILITIES_RESULT';
  requestId: string;
  payload: CubricCapability[];
}

export interface CubricBrokerRequestCapabilityMessage {
  type: 'REQUEST_CAPABILITY';
  requestId: string;
  payload: CubricCapabilityRequest;
}

export interface CubricBrokerRequestCapabilityResultMessage {
  type: 'REQUEST_CAPABILITY_RESULT';
  requestId: string;
  payload: CubricCapabilityResponse;
}

export interface CubricHelloPayload {
  appId: CubricAppId;
  displayName: string;
  version: string;
  protocolVersion: string;
  manifestPath: string;
  manifestHash: string;
  token: string;
  sdkVersion: string;
}

export interface CubricReadyPayload {
  protocolVersion: string;
  sessionId: string;
  permissions: CubricPermissionGrant[];
}

export type CubricTrustState = 'pending' | 'trusted' | 'blocked';

export type CubricRegistrationSource = 'launch' | 'scan' | 'import';

export type CubricPermissionId =
  | 'prompt.transform'
  | 'project.context.read'
  | 'asset.import'
  | 'asset.export'
  | (string & {});

export interface CubricPermissionGrant {
  permission: CubricPermissionId;
  granted: boolean;
  requiresConsent?: boolean;
}

export interface CubricBrokerConnectionMetadata {
  schemaVersion: 1;
  endpoint: string;
  token: string;
  protocolVersion: string;
  brokerPid: number;
  startedAt: string;
}

export interface CubricBrokerRegistry {
  schemaVersion: 1;
  apps: CubricBrokerRegistryApp[];
}

export interface CubricBrokerRegistryApp {
  appId: CubricAppId;
  displayName: string;
  version: string;
  protocolVersion: string;
  installRoot: string;
  manifestPath: string;
  manifestHash: string;
  registrationSource: CubricRegistrationSource;
  trustState: CubricTrustState;
  permissions: CubricPermissionGrant[];
  capabilities: CubricCapability[];
  lastSeenAt: string;
}
```

## SDK Interface Shape

The SDK should expose transport-agnostic functions first. The broker can later
implement these interfaces.

```ts
export interface CubricConnectorClient {
  discoverApps(): Promise<CubricAppManifest[]>;
  listCapabilities(appId?: CubricAppId): Promise<CubricCapability[]>;
  requestCapability<TInput = unknown, TOutput = unknown>(
    request: CubricCapabilityRequest<TInput>
  ): Promise<CubricCapabilityResponse<TOutput>>;
}
```

## Manifest Examples

### Cubric Vision

Cubric Vision v1 ships this manifest-only stub at
`resources/cubric/connector-manifest.json`. It does not ship live connector
runtime integration before v1.

```json
{
  "schemaVersion": 1,
  "appId": "cubric.vision",
  "displayName": "Cubric Vision",
  "version": "0.0.1",
  "protocolVersion": "0.1.0",
  "capabilities": [
    {
      "id": "project.context.read",
      "providerAppId": "cubric.vision",
      "kind": "read",
      "label": "Read project context",
      "mediaTypes": ["project", "image", "video"],
      "requiresConsent": true,
      "version": "0.1.0"
    },
    {
      "id": "asset.import",
      "providerAppId": "cubric.vision",
      "kind": "import",
      "label": "Import asset into project",
      "mediaTypes": ["image", "video"],
      "requiresConsent": true,
      "version": "0.1.0"
    }
  ]
}
```

### Cubric Prompt

```json
{
  "schemaVersion": 1,
  "appId": "cubric.prompt",
  "displayName": "Cubric Prompt",
  "version": "0.0.1",
  "protocolVersion": "0.1.0",
  "capabilities": [
    {
      "id": "prompt.enhance",
      "providerAppId": "cubric.prompt",
      "kind": "transform",
      "label": "Enhance prompt",
      "mediaTypes": ["text", "image", "video"],
      "requiresConsent": false,
      "version": "0.1.0"
    },
    {
      "id": "prompt.translate",
      "providerAppId": "cubric.prompt",
      "kind": "transform",
      "label": "Translate prompt",
      "mediaTypes": ["text"],
      "requiresConsent": false,
      "version": "0.1.0"
    },
    {
      "id": "prompt.format.model",
      "providerAppId": "cubric.prompt",
      "kind": "transform",
      "label": "Format prompt for model",
      "mediaTypes": ["text"],
      "requiresConsent": false,
      "version": "0.1.0"
    }
  ]
}
```

## Request Examples

### Vision Requests Prompt Enhancement

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000000",
  "from": {
    "appId": "cubric.vision",
    "displayName": "Cubric Vision",
    "version": "0.0.1"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.enhance",
  "input": {
    "prompt": "a cinematic portrait of a woman in neon rain",
    "negativePrompt": "",
    "targetModelId": "sdxl-realistic",
    "operation": "t2i"
  },
  "context": {
    "sourceOperation": "t2i",
    "sourceModelId": "sdxl-realistic"
  },
  "timeoutMs": 30000
}
```

Expected success response:

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000000",
  "ok": true,
  "from": {
    "appId": "cubric.prompt",
    "displayName": "Cubric Prompt"
  },
  "capability": "prompt.enhance",
  "output": {
    "prompt": "cinematic portrait of a woman standing in neon rain, dramatic rim lighting, wet reflective street, shallow depth of field",
    "negativePrompt": "low quality, blurry, distorted hands",
    "notes": "Expanded visual detail and added a conservative negative prompt."
  }
}
```

### Vision Requests Prompt Translation

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000001",
  "from": {
    "appId": "cubric.vision"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.translate",
  "input": {
    "prompt": "retrato cinematografico de uma mulher na chuva neon",
    "sourceLanguage": "pt",
    "targetLanguage": "en"
  },
  "timeoutMs": 30000
}
```

### Vision Requests Model Formatting

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000002",
  "from": {
    "appId": "cubric.vision"
  },
  "to": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.format.model",
  "input": {
    "prompt": "a high detail fantasy city at sunset",
    "targetModelId": "wan-video",
    "operation": "t2v",
    "style": "model-default"
  }
}
```

### Prompt Requests Vision Project Context

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000003",
  "from": {
    "appId": "cubric.prompt"
  },
  "to": {
    "appId": "cubric.vision"
  },
  "capability": "project.context.read",
  "input": {
    "includeSelectedItems": true,
    "includeModelContext": true,
    "includeRecentPrompts": true
  },
  "context": {
    "project": {
      "appId": "cubric.vision",
      "projectId": "proj_123",
      "projectName": "Campaign Concepts"
    }
  }
}
```

## Artifact Reference Examples

Project-owned media should prefer project-relative references and sidecar ids.
The `itemId` is project-local unless a future global artifact id is explicitly
introduced.

```json
{
  "kind": "project-artifact",
  "mediaType": "image",
  "projectId": "proj_123",
  "itemId": "6e409682-8b95-4ff7-aa77-e24e7656cbf8",
  "relativePath": "Media/t2i_001.png",
  "sidecarRelativePath": "Media/.meta/6e409682-8b95-4ff7-aa77-e24e7656cbf8.json",
  "displayName": "t2i_001",
  "operation": "t2i"
}
```

External files are allowed only when no Cubric project context exists:

```json
{
  "kind": "external-file",
  "mediaType": "image",
  "absolutePath": "C:\\Users\\Fabio\\Pictures\\reference.png",
  "displayName": "reference.png"
}
```

## Error Examples

App unavailable:

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000004",
  "ok": false,
  "from": {
    "appId": "cubric.vision"
  },
  "capability": "prompt.enhance",
  "error": {
    "code": "APP_UNAVAILABLE",
    "message": "Cubric Prompt is not installed or is not reachable."
  }
}
```

Unsupported capability:

```json
{
  "schemaVersion": 1,
  "requestId": "req_01J00000000000000000000005",
  "ok": false,
  "from": {
    "appId": "cubric.prompt"
  },
  "capability": "prompt.format.model",
  "error": {
    "code": "CAPABILITY_UNSUPPORTED",
    "message": "Cubric Prompt does not support this capability version."
  }
}
```

## Open Decisions

- Hub-side scan/import UX for portable app folders.
- Exact broker idle timeout and status/disable wording.
- Exact permission prompt UI and persisted consent UI.

## Implementation Readiness Checklist

- [x] Package/repo location chosen.
- [x] Runtime schema/validation strategy chosen.
- [x] MVP package shape chosen.
- [x] Broker protocol message shape chosen.
- [x] Broker connection metadata path chosen.
- [x] Broker registry path/shape chosen.
- [x] MVP permission model chosen.
- [ ] Manifest examples accepted.
- [ ] Request/response types accepted.
- [ ] Error codes accepted.
- [ ] Artifact reference shape accepted.
- [x] Discovery and transport strategy chosen.
- [x] Cubric Vision SDK integration timing decided.
