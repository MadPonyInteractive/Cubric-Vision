# Cubric Vision Foundation - Connector Broker Stage 1-2

**Plan family:** `cubric-vision-foundation`
**Parent plan:** `docs/plans/2026-05-19-cubric-vision-foundation.md`
**Kanban entry:** `Cubric Vision foundation - connector-broker-stage-1-2`
**Priority:** high
**Status:** Stage 1-2 shipped 2026-05-21 — `@cubric/broker` + connector
transport layer landed in `C:\AI\Mpi\Cubric-Studio\packages\`. 56 tests pass
(connector 36, broker 20 incl. 4 integration). See "Implementation Result"
below.
**Implementation brief:** `docs/plans/2026-05-21-connector-broker-stage-1-2-implementation-brief.md`

## Implementation Result

Shipped 2026-05-21 in `C:\AI\Mpi\Cubric-Studio\` (hub repo, not yet a git
repo — flag for `git init` follow-up).

`packages/connector` (extended):
- `src/transport/frame.ts` — 4-byte length-prefixed JSON, `FrameDecoder` with
  fragmented/multi-frame/8 MiB-limit handling.
- `src/transport/localEndpoint.ts` — Windows named pipe + POSIX UDS resolution,
  `CUBRIC_BROKER_ENDPOINT` override, user-hash derivation, metadata path.
- `src/transport/localConnection.ts` — `connectLocal()` with timeout + retries.
- `src/brokerClient.ts` — `createBrokerConnectorClient()` implementing
  `CubricConnectorClient` over IPC, with HELLO → READY, request correlation,
  timeout mapping, transport-error → `APP_UNAVAILABLE` mapping.
- Public exports added to `src/index.ts`.
- Tests: `tests/frame.test.ts` (8) + `tests/brokerClient.test.ts` (2).

`packages/broker` (new):
- `package.json`, `tsconfig.json` matching connector style.
- `src/token.ts` — 32-byte base64url session token + `timingSafeEqual` compare.
- `src/connectionMetadata.ts` — atomic write + cleanup; POSIX 0700/0600.
- `src/handshake.ts` — token check, protocolVersion match, manifest file +
  hash + schema + appId-match validation, optional trust list.
- `src/router.ts` — DISCOVER_APPS, LIST_CAPABILITIES, REQUEST_CAPABILITY
  (returns `CAPABILITY_UNSUPPORTED` per Stage 1-2 scope).
- `src/brokerServer.ts` — `startBrokerServer()`; one socket per session,
  HELLO-first enforcement, ERROR-on-violation + close, metadata
  write/delete, UDS unlink-on-shutdown.
- `src/endpoint.ts` — re-exports endpoint helpers from connector.
- `src/cli.ts` — `cubric-broker [--smoke] [--endpoint X] [--metadata Y]`,
  SIGINT/SIGTERM clean shutdown.
- `src/index.ts` — public API.
- Tests: `tests/metadata.test.ts` (9), `tests/handshake.test.ts` (7),
  `tests/broker.integration.test.ts` (4 — in-process broker + real SDK
  client over UDS/named pipe; covers HELLO/READY, DISCOVER_APPS,
  LIST_CAPABILITIES, REQUEST_CAPABILITY → CAPABILITY_UNSUPPORTED,
  shutdown metadata delete, untrusted-app PERMISSION_DENIED).

Acceptance criteria status:
- [x] Both packages build + typecheck clean.
- [x] One spawned broker + one SDK client complete HELLO/READY over local IPC.
- [x] Bad-token, protocol-mismatch, unavailable-broker, timeout,
  invalid-manifest, malformed-frame all map to expected error codes.
- [x] No Electron dependency.
- [x] No Cubric Vision runtime code changed.
- [x] Stage 3 deferred (no `ensureBroker()`, no registry persistence, no
  permission UI, no scan/import).

Follow-ups outside this stage:
- Hub repo `git init` + first commit so future work is version-controlled.
- Workspace tooling (npm workspaces / pnpm) at hub root.
- Spawn-based integration test (current integration uses in-process broker;
  shipped `cli.ts` enables true cross-process tests in Stage 3+).
- Stage 3: `ensureBroker()` startup policy, registry persistence, portable
  app scan/import, permission grant UX.

## Purpose

Plan the next connector implementation after the shipped Stage 0
`@cubric/connector` MVP. Stage 0 provides TypeScript/Zod schemas, protocol
types, errors, and a mock client only. Stage 1-2 adds the real local broker
transport and handshake foundation needed before Cubric Prompt can perform real
app-to-app calls.

Shipped SDK package:

```text
C:\AI\Mpi\Cubric-Studio\packages\connector\
```

Memory note:

```text
C:\Users\Fabio\.claude\projects\C--AI-Mpi-CubricStudio\memory\project_connector_sdk_mvp.md
```

## Scope

In scope:
- Broker package/runtime shape in the future hub repo.
- SDK real client adapter shape.
- Local IPC transport primitive.
- Length-prefixed JSON message framing.
- HELLO/READY handshake.
- Broker connection metadata file.
- Per-user session token.
- Initial implementation tests and smoke checks.

Out of scope:
- Permission prompt UI.
- Full trust registry UX.
- App scan/import UI.
- Cubric Prompt implementation.
- Live Cubric Vision PromptBox integration.
- Portable update runtime wiring beyond respecting manifest fields already in
  the SDK.

## Inputs

- `docs/specs/cubric-connector-sdk.md`
- `docs/plans/2026-05-20-cubric-vision-foundation-ecosystem-backend.md`
- `docs/plans/2026-05-20-connector-sdk-mvp-implementation-brief.md`
- `C:\AI\Mpi\Cubric-Studio\packages\connector\`

## Architecture Decisions

### Phase 1: Broker Ownership And Package Layout

- [x] Broker runtime package path: `C:\AI\Mpi\Cubric-Studio\packages\broker\`.
- [x] The broker package owns process lifecycle, connection metadata, IPC
  server, session token generation, trust lookup stubs, and request routing
  skeletons.
- [x] The existing `@cubric/connector` SDK package keeps public app-facing
  types and gains an internal real client adapter under `src/brokerClient.ts`
  plus transport helpers under `src/transport/`.
- [x] Shared protocol schemas remain exported from `@cubric/connector`; the
  broker imports them instead of duplicating message contracts.
- [x] Local dev startup flow: broker tests spawn the package CLI from
  `packages/broker`, wait for connection metadata, then connect using the SDK
  real client. Unit tests can use direct in-process transport fixtures.

### Phase 2: IPC Transport

- [x] Windows endpoint format: named pipe endpoint stored in metadata, generated
  as `\\.\pipe\cubric-broker-<userHash>` where `userHash` is a short SHA-256
  prefix of stable per-user identity data. Do not put raw usernames or tokens
  in the pipe name.
- [x] macOS/Linux endpoint format: Unix socket endpoint stored in metadata.
  Linux uses `${XDG_RUNTIME_DIR}/cubric/broker.sock` when available and falls
  back to `~/.cache/cubric/broker/broker.sock`; macOS uses
  `~/Library/Application Support/Cubric/broker/broker.sock`.
- [x] Frame format: 4-byte unsigned big-endian payload length followed by UTF-8
  JSON encoded `CubricBrokerMessage`. Maximum frame length is 8 MiB for Stage
  1-2; larger payloads must travel as artifact references, not inline blobs.
- [x] Correlation: every outbound request has a unique `requestId`; clients and
  broker keep a pending map keyed by `requestId`. Unknown response ids are
  ignored after logging in dev/test builds.
- [x] Timeout behavior: each client call has a bounded timeout. Expiry rejects
  locally with `TIMEOUT`, removes the pending entry, and leaves the stream open
  unless the caller explicitly closes it.
- [x] Shutdown behavior: broker removes metadata and unlinks Unix socket files
  on graceful shutdown. Broken pipes reject pending requests with
  `APP_UNAVAILABLE` unless the caller already timed out.

### Phase 3: Handshake And Metadata

- [x] Connection metadata is created after the broker successfully binds its
  endpoint and before it accepts client calls.
- [x] Metadata paths are the ones locked in
  `docs/specs/cubric-connector-sdk.md`:
  `%LOCALAPPDATA%\Cubric\broker\connection.json` on Windows,
  `~/Library/Application Support/Cubric/broker/connection.json` on macOS, and
  `${XDG_RUNTIME_DIR}/cubric/broker/connection.json` with
  `~/.cache/cubric/broker/connection.json` fallback on Linux.
- [x] Metadata file content uses existing `CubricBrokerConnectionMetadata`:
  `schemaVersion`, `endpoint`, `token`, `protocolVersion`, `brokerPid`, and
  `startedAt`.
- [x] Metadata permissions: create parent directories owner-only where the
  platform supports it (`0700` dirs and `0600` files on POSIX). Windows relies
  on the user profile ACL for Stage 1-2, with a follow-up note if explicit ACL
  hardening becomes necessary.
- [x] Session token: generate 32 random bytes from Node `crypto`, encode as
  base64url, keep in memory, write only to metadata/env, and never log it.
- [x] HELLO flow: client opens endpoint, sends `HELLO` as the first frame, and
  must receive `READY` before `DISCOVER_APPS`, `LIST_CAPABILITIES`, or
  `REQUEST_CAPABILITY` messages are accepted.
- [x] Failure mapping: invalid token or blocked/untrusted app returns `ERROR`
  with `PERMISSION_DENIED`; protocol mismatch returns `VERSION_UNSUPPORTED`;
  invalid manifest or payload returns `VALIDATION_ERROR`; unreachable broker
  maps to `APP_UNAVAILABLE`.

### Phase 4: Test Plan

- [x] Unit tests for framing parser: complete frames, fragmented frames,
  multiple frames in one chunk, invalid JSON, invalid length, and max-frame
  rejection.
- [x] Unit tests for protocol schema validation using the exported
  `CubricBrokerMessageSchema`, `CubricHelloPayloadSchema`,
  `CubricReadyPayloadSchema`, and metadata schema.
- [x] Integration test for one broker process and one SDK client:
  spawn broker, read metadata, connect, perform HELLO/READY, call
  `discoverApps()` and `listCapabilities()`, then shut down cleanly.
- [x] Failure tests for unavailable broker, bad token, protocol mismatch,
  timeout, malformed frame, invalid manifest, and broken pipe with pending
  request.

## Implementation Sequence

1. Extend `@cubric/connector` with transport primitives:
   `encodeFrame`, `FrameDecoder`, `createLocalBrokerConnection`, and
   `createBrokerConnectorClient`.
2. Add `packages/broker` with a TypeScript CLI/runtime, metadata path helpers,
   token generation, IPC server, HELLO gate, and minimal router.
3. Wire broker smoke fixtures so tests can run without Cubric Vision or Cubric
   Prompt.
4. Add failure-path tests before adding any Stage 3 startup policy.
5. Leave `ensureBroker()`, registry persistence, permission prompt UI, and
   product-app integrations to later stages.

## Implementation Boundary

This child plan produced the separate implementation brief linked above. Code
for Stage 1-2 should be written in the future hub repo:

```text
C:\AI\Mpi\Cubric-Studio\
```

Cubric Vision should not gain live connector integration as part of this work.
At most, this repo should receive documentation links or plan status updates.

## Acceptance

- [x] Stage 1 transport and Stage 2 handshake can be implemented from the brief
  without reopening architecture questions.
- [x] Cubric Vision remains standalone and does not gain live SDK integration.
- [x] Cubric Prompt can later target a real broker-backed connector client.
- [x] The next agent can execute implementation in `C:\AI\Mpi\Cubric-Studio\`
  from the linked brief without needing to re-decide package ownership,
  endpoint shape, framing, metadata, token handling, or handshake errors.
