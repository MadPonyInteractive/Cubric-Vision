# Checklist

Superseded on 2026-06-05. Active work moved to MPI-8.

## v1 scaffold

- [x] Moved to MPI-8: Portable/Electron build includes `resources/cubric/**` (manifest not excluded)
- [x] Moved to MPI-8: Manifest path stable relative to app root in staged build
- [x] Moved to MPI-8: Build smoke assertion: appId, protocolVersion 0.1.0, manifestOnly true
- [x] Moved to MPI-8: Update-manifest carries connectorManifestPath + connectorManifestHash
- [x] README handoff note dropped in `c:\AI\Mpi\Cubric-Studio\` for future hub-setup agent

## Verify

- [x] Moved to MPI-8: Vision still launches + behaves as standalone with no hub present (no dead buttons)

## Deferred (do NOT do here - post-v1 / Cubric Prompt era)

- ~~Live @cubric/connector import~~
- ~~ensureBroker() + HELLO/READY handshake~~
- ~~PromptBox Prompt actions~~
- ~~permission/trust UI~~
