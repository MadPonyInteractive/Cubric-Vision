# Connector SDK MVP Implementation Brief

**Related spec:** `docs/specs/cubric-connector-sdk.md`
**Related plan:** `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
**Target repo:** future Cubric Studio hub repo
**Target package:** `packages/connector`
**Package name:** `@cubric/connector`
**Status:** ready for implementation

## Purpose

Implement the first `@cubric/connector` package as a TypeScript contract SDK.
This MVP does not implement the broker runtime. It provides schemas, types,
protocol message definitions, errors, a client interface, and a mock client so
future Cubric apps can build against the connector contract.

## Repository Placement

Create or use the future Cubric Studio hub repo, then scaffold:

```text
packages/connector/
```

The hub repo is separate from Cubric Vision. Cubric Vision may ship a
manifest-only stub but should not own the connector package.

## Required Tech Choices

- TypeScript-first package.
- Zod is the runtime schema source of truth.
- Types should be inferred from Zod schemas where practical.
- Minimal RPC broker protocol messages are defined as TypeScript/Zod contracts.
- No broker process/runtime in this MVP.

## Package Layout

```text
packages/connector/
  package.json
  tsconfig.json
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

## Public API

Export:
- app/capability/request/response/artifact/error types
- Zod schemas for all public payloads
- broker protocol message types and schemas
- broker connection metadata and registry record types/schemas
- `CubricConnectorClient`
- `createMockConnectorClient`
- error helpers/constants

The client interface:

```ts
export interface CubricConnectorClient {
  discoverApps(): Promise<CubricAppManifest[]>;
  listCapabilities(appId?: CubricAppId): Promise<CubricCapability[]>;
  requestCapability<TInput = unknown, TOutput = unknown>(
    request: CubricCapabilityRequest<TInput>
  ): Promise<CubricCapabilityResponse<TOutput>>;
}
```

## Schema Requirements

Implement Zod schemas for:
- `CubricAppManifest`
- `CubricCapability`
- `CubricCapabilityRequest`
- `CubricCapabilityResponse`
- `CubricAppRef`
- `CubricRequestContext`
- `CubricProjectRef`
- `CubricArtifactRef`
- `CubricConnectorError`
- `CubricBrokerMessage`
- `CubricHelloPayload`
- `CubricReadyPayload`
- `CubricPermissionGrant`
- `CubricBrokerConnectionMetadata`
- `CubricBrokerRegistry`
- `CubricBrokerRegistryApp`
- `CubricPortableUpdateManifest`
- `CubricUpdateFileEntry`

Validation rules:
- Unknown optional extension data is allowed only inside explicit `metadata` or
  `details` objects.
- Manifests, requests, responses, protocol messages, registry records,
  connection metadata, and portable update manifests must be parseable through
  exported schemas.
- Protocol/version mismatch helpers must produce `VERSION_UNSUPPORTED`.

## Protocol Messages

Implement minimal RPC message schemas for:
- `HELLO`
- `READY`
- `ERROR`
- `DISCOVER_APPS`
- `DISCOVER_APPS_RESULT`
- `LIST_CAPABILITIES`
- `LIST_CAPABILITIES_RESULT`
- `REQUEST_CAPABILITY`
- `REQUEST_CAPABILITY_RESULT`

Each message has:

```ts
{
  type: string;
  requestId: string;
  payload?: unknown;
}
```

Use discriminated unions for message parsing.

## Mock Client

`createMockConnectorClient(options)` should support:
- seeded app manifests
- seeded capability handlers
- `discoverApps()`
- `listCapabilities(appId?)`
- `requestCapability(request)`

Behavior:
- Validate requests before invoking handlers.
- Return `APP_UNAVAILABLE` if the target app is missing.
- Return `CAPABILITY_UNSUPPORTED` if no handler exists.
- Return `TIMEOUT` if a supplied timeout is exceeded.
- Return `VALIDATION_ERROR` on invalid input.
- Return successful `CubricCapabilityResponse` from handlers.

## Tests

Add focused tests for:
- valid Cubric Vision manifest parses
- invalid manifest fails
- request/response examples parse
- broker protocol messages parse by discriminator
- registry record parses
- connection metadata parses
- portable update manifest parses
- mock client discovery/listing works
- mock client successful capability request works
- mock client missing app/capability errors work

## Acceptance Criteria

- `npm test` or the package's chosen test command passes.
- `npm run build` passes.
- Type declarations are emitted.
- Public exports are reachable from `src/index.ts`.
- No broker runtime, local IPC implementation, Electron dependency, or UI code is
  included in this package.
- Cubric Vision remains a consumer/future client, not the owner of this package.

## Out Of Scope

- Broker process implementation.
- Named pipe / Unix socket transport implementation.
- Hub UI.
- Permission prompt UI.
- Portable app scan/import UX.
- Live Cubric Vision SDK integration.
