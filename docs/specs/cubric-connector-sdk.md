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

The SDK should use runtime schemas from its first implementation.

Requirements:
- TypeScript interfaces and runtime schemas must describe the same contract.
- Every app manifest must be validated before registration or discovery output.
- Every capability request must be validated before routing.
- Every capability response must be validated before returning to the caller.
- Unknown optional metadata is allowed only inside explicit `metadata` or
  `details` objects.
- Version mismatches must produce `VERSION_UNSUPPORTED`, not generic runtime
  errors.

The specific schema library is still open. The important decision is that
runtime validation is required, not optional.

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
adapter decides whether the local implementation uses named pipes, sockets,
localhost HTTP, or another OS-appropriate channel.

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

### Current Recommendation

Use the SDK contract first, then implement a broker adapter that prefers an
OS-local private channel over public localhost HTTP.

Preference order for investigation:

1. Broker-owned named pipe / Unix domain socket style transport.
2. Broker-owned localhost HTTP only if bound to loopback with an auth token or
   equivalent handshake.
3. Direct app-to-app transport only for development fixtures or tests.

This keeps the security model centered on the broker and avoids every app
inventing its own discovery server.

### Portable App Constraint

Cubric apps ship as portable zip builds on Windows, macOS, and Linux. Users
download, extract, and run an app folder. There is no normal installer that can
be trusted to register apps with the operating system or with the broker.

Discovery must therefore work for portable folders:
- Each app bundle should include a connector manifest file.
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

### Decisions Still Open

- Exact transport primitive for Windows/macOS/Linux.
- Exact broker startup policy and user-visible controls.
- Auth token or handshake mechanism.
- Manifest registration path.
- Hub-side scan/import UX for portable app folders.
- Portable app update mechanism and how broker registry refresh ties into it.

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

- Whether Cubric Vision should include a manifest-only SDK stub before v1 or
  defer all SDK integration until after release.
- First discovery mechanism for portable app folders.
- First transport for broker-mediated requests.
- Permission model for project context and asset import/export.
- Which runtime schema library or JSON Schema tooling the SDK should use.
- Portable app update strategy.

## Implementation Readiness Checklist

- [x] Package/repo location chosen.
- [x] Runtime schema/validation strategy chosen.
- [ ] Manifest examples accepted.
- [ ] Request/response types accepted.
- [ ] Error codes accepted.
- [ ] Artifact reference shape accepted.
- [ ] Discovery and transport strategy chosen.
- [ ] Cubric Vision SDK integration timing decided.
