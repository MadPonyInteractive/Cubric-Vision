# Cubric Vision foundation - connector-broker-stage-1-2  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 890 Legacy column: COMPLETED  ```md ### Cubric Vision foundation - connector-broker-stage-1-2 - tags: [IMPL, architecture, typescript, integration]
  - priority: high
  - defaultExpanded: false
    ```md
    Shipped 2026-05-21.
    
    Parent: docs/plans/2026-05-19-cubric-vision-foundation.md
    Plan file: docs/plans/2026-05-21-cubric-vision-foundation-connector-broker-stage-1-2.md
    Brief: docs/plans/2026-05-21-connector-broker-stage-1-2-implementation-brief.md
    
    Target repo: C:\AI\Mpi\Cubric-Studio\ (NOT a git repo yet — flag for
    later git init follow-up).
    
    Delivered:
    - packages/connector transport layer: src/transport/{frame,
    localEndpoint, localConnection}.ts + src/brokerClient.ts +
    public exports in src/index.ts.
    - packages/broker (new): token, connectionMetadata, handshake,
    router, brokerServer, endpoint, cli, index. Bin: `cubric-broker`.
    
    Tests: 56/56 green.
    - connector: 36 (frame 8, brokerClient 2, schemas 16, mockClient 10)
    - broker: 20 (metadata 9, handshake 7, integration 4)
    Integration test runs in-process broker + real SDK client over UDS
    (POSIX) / named pipe (Windows), covers HELLO/READY happy path,
    DISCOVER_APPS, LIST_CAPABILITIES, REQUEST_CAPABILITY →
    CAPABILITY_UNSUPPORTED, shutdown metadata cleanup, untrusted-app
    PERMISSION_DENIED.
    
    Acceptance: all criteria met. No Electron, no Cubric Vision runtime
    changes, Stage 3+ (ensureBroker, registry persistence, perm UI, scan
    /import) deferred as scoped.
    
    Follow-ups (NEW kanban entries as work surfaces):
    - git init the hub repo + workspace tooling.
    - True spawn-based integration test (cli.ts is ready; current
    integration uses in-process server).
    - Stage 3 plan.
    ``` ``` 