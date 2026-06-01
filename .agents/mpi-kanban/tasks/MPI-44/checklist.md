# Checklist

## v1 scaffold (now / with MPI-8)

- [ ] Portable/Electron build includes `resources/cubric/**` (manifest not excluded)
- [ ] Manifest path stable relative to app root in staged build
- [ ] Build smoke assertion: appId, protocolVersion 0.1.0, manifestOnly true
- [ ] Update-manifest carries connectorManifestPath + connectorManifestHash (when MPI-8 adds update-manifest)
- [x] README handoff note dropped in c:\AI\Mpi\Cubric-Studio\ for future hub-setup agent

## Verify

- [ ] Vision still launches + behaves as standalone with no hub present (no dead buttons)

## Deferred (do NOT do here — post-v1 / Cubric Prompt era)

- ~~Live @cubric/connector import~~
- ~~ensureBroker() + HELLO/READY handshake~~
- ~~PromptBox Prompt actions~~
- ~~permission/trust UI~~
