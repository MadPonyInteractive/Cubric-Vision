# Cross-platform portable distribution + Vision connector scaffold

## Legacy Markdown Entry

Source: `.agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md` line 181.
Legacy column: `PLANNING`.

Original plan file: `docs/plans/2026-04-30-cross-platform-portable-distribution.md`.

Sequencing lock 2026-05-21: start after current app implementation work and hub
readiness. After portable distribution is ready and tested, handle
website/Patreon/social/docs release surfaces before public release.

## Install + model verification

The "Model Manager slide-over and zero-model gating" plan defers its Phase 6
manual install/model session here to avoid a duplicate large-download test pass.
Once portable distribution is implemented, run one combined fresh-install
session:

1. clean portable app/user-data/engine state
2. first launch + engine install/repair
3. project page -> confirm Models discoverable
4. empty/new project zero-model -> Models slide-over auto-opens; existing-media
   project zero-model -> read-only, no PromptBox
5. install one model, or seed model files + UI refresh/resync
6. confirm first installed model unlocks PromptBox/generation
7. generate one image
8. restart -> installed-model detection persists

Note in final results whether the real download path or the seeded-file resync
path was exercised. Source:
`docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md` Phase 6.

## Handoff from MPI-2 (2026-06-02) - build hash injection deferred here

MPI-2 (in-app error reporter stage/build GitHub labels) shipped stage + version
labels but deliberately deferred the `build:<hash>` label to this card, since
build-time injection belongs in the portable/build pipeline, not the app source.

What MPI-8 must add when wiring the portable build:

- Inject a short git commit SHA at package/build time into an env the running
  app can read, e.g. `CUBRIC_BUILD_HASH`. Dev/source runs have no `.git`-derived
  value and should fall back to `dev`.
- Surface it to the renderer alongside the existing stage/version path. The
  error reporter already sends `build: { appVersion, stage }` to
  `/github/create-issue`; extend that object with `hash` and have the backend
  add a `build:<hash>` label. Skip the label when hash is `dev` or absent.
- Stage is derived from `APP_VERSION`, not a build env. Do not add a stage env
  var. See `js/core/appStage.js` and the mirrored `deriveStage()` in
  `routes/system.js`.

This ties into the merged MPI-44 connector-manifest item: both
`build:<hash>` and `connectorManifestHash` require staged-artifact values
computed at build time.

## Merged from MPI-44 (2026-06-05) - Vision connector scaffold

MPI-44 was merged into this card because its remaining Vision v1 work is part of
the portable build/update-manifest pipeline, not separate hub implementation.

Merged requirements:

- Keep `resources/cubric/connector-manifest.json` in portable staging. The
  portable/Electron build must not exclude `resources/cubric/**`, and the
  manifest path must remain stable relative to the app root.
- Add a build smoke assertion against the staged connector manifest:
  `appId === "cubric.vision"`, `protocolVersion === "0.1.0"`, and
  `metadata.manifestOnly === true` for v0.0.1.
- When this card adds `resources/cubric/update-manifest.json`, include
  `connectorManifestPath` and `connectorManifestHash`. Compute the hash from the
  staged manifest artifact, not from an assumed source-tree file.
- Preserve standalone Vision behavior in v1. Do not add `@cubric/connector`,
  `ensureBroker()`, broker spawn, PromptBox Prompt actions, permission/trust UI,
  or any dead promotional controls.
- The hub-side handoff README already exists in `c:\AI\Mpi\Cubric-Studio\`.
  Further live hub cards are post-v1 and are not blockers for this merged card.

Out of scope remains unchanged: live connector runtime integration belongs to a
future post-v1 / Cubric Prompt-era card.
