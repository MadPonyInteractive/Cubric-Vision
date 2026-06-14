# Connector Broker Stage 1-2 Implementation Brief

**Related spec:** `docs/specs/cubric-connector-sdk.md`
**Related plan:** `docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md`
**Target repo:** `C:\AI\Mpi\Cubric-Studio\`
**Existing SDK package:** `packages/connector`
**New broker package:** `packages/broker`
**Status:** ready for implementation

## Purpose

Implement the first real connector runtime behind the already shipped
`@cubric/connector` Stage 0 SDK. This work adds local broker IPC transport and
HELLO/READY authentication while keeping app-facing SDK methods stable:

```ts
discoverApps()
listCapabilities(appId?)
requestCapability(request)
```

This is backend/runtime work for the future Cubric Studio hub repo. It must not
wire Cubric Vision PromptBox features or require Cubric Vision to run the broker
before v1.

## Required Outcomes

- A Node/TypeScript broker package can start a local IPC server.
- Broker startup writes a user-scoped connection metadata file.
- The SDK can create a real broker-backed `CubricConnectorClient`.
- Client and broker exchange length-prefixed JSON frames.
- Client must send `HELLO` and receive `READY` before normal RPC messages.
- Bad token, bad protocol, invalid manifest, timeout, and broker unavailable
  errors map to existing connector error codes.
- Tests cover framing, handshake, integration happy path, and failure paths.

## Package Changes

### `packages/connector`

Keep public schemas/types as the source of truth. Add:

```text
packages/connector/src/
  brokerClient.ts
  transport/
    frame.ts
    localEndpoint.ts
    localConnection.ts
```

Required exports from `src/index.ts`:
- `createBrokerConnectorClient(options)`
- `encodeBrokerFrame(message)`
- `FrameDecoder`
- endpoint/metadata helper types only if they are stable enough for tests

Do not expose low-level transport helpers as the main product API. Apps should
still consume `CubricConnectorClient`.

### `packages/broker`

Create:

```text
packages/broker/
  package.json
  tsconfig.json
  src/
    index.ts
    cli.ts
    brokerServer.ts
    connectionMetadata.ts
    token.ts
    endpoint.ts
    handshake.ts
    router.ts
  tests/
    metadata.test.ts
    handshake.test.ts
    broker.integration.test.ts
```

The broker imports schemas and types from `@cubric/connector`. It must not
copy protocol definitions.

## Transport Contract

### Endpoints

Windows named pipe:

```text
\\.\pipe\cubric-broker-<userHash>
```

`userHash` is a short SHA-256 prefix derived from stable per-user identity data.
Do not include raw usernames, app ids, or tokens in the pipe name.

macOS socket:

```text
~/Library/Application Support/Cubric/broker/broker.sock
```

Linux socket:

```text
${XDG_RUNTIME_DIR}/cubric/broker.sock
```

Fallback when `XDG_RUNTIME_DIR` is missing:

```text
~/.cache/cubric/broker/broker.sock
```

The metadata file is authoritative. Clients should read `endpoint` from
metadata rather than reconstructing these paths.

### Framing

Each frame is:

```text
uint32_be length
utf8_json_payload
```

Rules:
- `length` is the byte length of the JSON payload only.
- JSON payload must parse as `CubricBrokerMessage`.
- Stage 1-2 max frame length is 8 MiB.
- Inline media blobs are not allowed; use artifact references.
- Decoder must support fragmented frames and multiple frames in one chunk.
- Invalid frame length, invalid JSON, or schema failure closes/rejects that
  connection with `VALIDATION_ERROR`.

## Metadata Contract

Broker writes metadata after binding the endpoint:

Windows:

```text
%LOCALAPPDATA%\Cubric\broker\connection.json
```

macOS:

```text
~/Library/Application Support/Cubric/broker/connection.json
```

Linux:

```text
${XDG_RUNTIME_DIR}/cubric/broker/connection.json
```

Fallback:

```text
~/.cache/cubric/broker/connection.json
```

Shape:

```ts
CubricBrokerConnectionMetadata
```

Permissions:
- POSIX dirs: `0700`
- POSIX file: `0600`
- Windows: rely on user-profile ACLs for Stage 1-2; avoid broad shared temp
  directories.

Cleanup:
- On graceful shutdown, delete connection metadata.
- On Unix socket startup, unlink stale socket only after confirming no live
  broker responds at that endpoint.
- If metadata exists but broker is unreachable, SDK returns `APP_UNAVAILABLE`
  for Stage 1-2. Stage 3 may add startup/recovery.

## Authentication And Handshake

Token:
- Generate 32 random bytes with Node `crypto`.
- Encode using base64url.
- Keep token in broker memory.
- Write token only to metadata or `CUBRIC_BROKER_TOKEN` in controlled child
  process startup flows.
- Never log the token or include it in thrown error messages.

Client handshake:

1. Read metadata or explicit env override.
2. Open local stream.
3. Send `HELLO` as first frame:

```ts
{
  type: 'HELLO',
  requestId,
  payload: {
    appId,
    displayName,
    version,
    protocolVersion,
    manifestPath,
    manifestHash,
    token,
    sdkVersion
  }
}
```

4. Broker validates:
   - token matches current session
   - protocol version is compatible with broker protocol
   - manifest file exists and hashes to `manifestHash`
   - manifest parses with `CubricAppManifestSchema`
   - app identity matches manifest identity
   - trust record stub allows the app for Stage 1-2 tests
5. Broker returns `READY`:

```ts
{
  type: 'READY',
  requestId,
  payload: {
    protocolVersion,
    sessionId,
    permissions
  }
}
```

Before `READY`, any non-HELLO message returns `ERROR` with
`PERMISSION_DENIED` and closes the connection.

## Error Mapping

- Missing/unreachable metadata or endpoint: `APP_UNAVAILABLE`
- Broken pipe before response: `APP_UNAVAILABLE`
- Request timeout: `TIMEOUT`
- Bad token: `PERMISSION_DENIED`
- Untrusted or blocked app: `PERMISSION_DENIED`
- Protocol mismatch: `VERSION_UNSUPPORTED`
- Invalid manifest: `VALIDATION_ERROR`
- Invalid frame or schema failure: `VALIDATION_ERROR`
- Unsupported RPC message in router: `CAPABILITY_UNSUPPORTED` where it maps to
  a capability call, otherwise `RUNTIME_ERROR`

## Router Scope

Stage 1-2 router is intentionally thin:
- `DISCOVER_APPS` returns the broker's in-memory registered/handshaken app
  manifests.
- `LIST_CAPABILITIES` returns capabilities from handshaken app manifests,
  optionally filtered by `appId`.
- `REQUEST_CAPABILITY` may return `CAPABILITY_UNSUPPORTED` until Stage 3/4
  routing work exists, unless tests use an in-memory fixture handler.

Do not implement registry persistence, portable folder scan/import, permission
prompt UI, or product-app launch orchestration in this stage.

## Test Requirements

### Connector Unit Tests

- `encodeBrokerFrame` prefixes a valid byte length.
- `FrameDecoder` handles:
  - one complete frame
  - fragmented frame chunks
  - multiple frames in one chunk
  - invalid JSON
  - invalid schema
  - frame larger than 8 MiB
- Broker client maps unavailable metadata to `APP_UNAVAILABLE`.
- Broker client maps request timeout to `TIMEOUT`.

### Broker Unit Tests

- Metadata path resolves for Windows/macOS/Linux using env overrides.
- Token generation produces non-empty unique base64url strings.
- Handshake accepts valid HELLO and returns READY.
- Handshake rejects bad token as `PERMISSION_DENIED`.
- Handshake rejects protocol mismatch as `VERSION_UNSUPPORTED`.
- Handshake rejects bad manifest/hash mismatch as `VALIDATION_ERROR`.

### Integration Tests

- Spawn broker process.
- Wait for metadata file.
- Connect SDK client with a valid fixture manifest.
- Complete HELLO/READY.
- `discoverApps()` returns the fixture app.
- `listCapabilities()` returns fixture capabilities.
- Broker shutdown removes metadata.
- Broken pipe with pending request rejects predictably.

## Smoke Command Targets

Add package scripts equivalent to:

```json
{
  "build": "tsc -p tsconfig.json",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "smoke:broker": "node dist/cli.js --smoke"
}
```

Exact workspace orchestration can follow the hub repo's package manager once
that repo has a root workspace config.

## Acceptance Criteria

- `packages/connector` builds and tests pass.
- `packages/broker` builds and tests pass.
- One spawned broker and one SDK client complete HELLO/READY over local IPC.
- Bad-token, protocol-mismatch, unavailable-broker, timeout, invalid-manifest,
  and malformed-frame tests pass.
- No Electron dependency is introduced.
- No Cubric Vision runtime code is changed.
- No permission UI, registry persistence, scan/import UX, or Stage 3
  `ensureBroker()` startup policy is implemented in this stage.
