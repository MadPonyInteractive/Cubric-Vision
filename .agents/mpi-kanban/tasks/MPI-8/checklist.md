# Checklist

## Portable Distribution

- [ ] Execute `docs/plans/2026-04-30-cross-platform-portable-distribution.md`

## Merged From MPI-44 - Vision v1 Connector Scaffold

- [ ] Portable/Electron build includes `resources/cubric/**` (manifest not excluded)
- [ ] Manifest path stable relative to app root in staged build
- [ ] Build smoke assertion: appId, protocolVersion 0.1.0, manifestOnly true
- [ ] Update-manifest carries connectorManifestPath + connectorManifestHash computed from the staged manifest
- [x] Hub-side README handoff note exists in `c:\AI\Mpi\Cubric-Studio\`
- [ ] Vision still launches and behaves as standalone with no hub present (no dead buttons)

## Deferred - Do Not Do Here

- ~~Live @cubric/connector import~~
- ~~ensureBroker() + HELLO/READY handshake~~
- ~~PromptBox Prompt actions~~
- ~~permission/trust UI~~
