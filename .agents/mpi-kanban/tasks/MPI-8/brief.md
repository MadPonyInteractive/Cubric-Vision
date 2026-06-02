# Cross-platform portable distribution  ## Legacy Markdown Entry  Source: .agents/mpi-kanban/legacy/kanban-2026-06-01-072015.md line 181 Legacy column: PLANNING  ```md ### Cross-platform portable distribution - tags: [PLAN]
  - priority: medium
  - defaultExpanded: false
    ```md
    Plan file: docs\plans\2026-04-30-cross-platform-portable-distribution.md
    Sequencing lock 2026-05-21: start after current app implementation work and
    hub readiness. After portable distribution is ready and tested, handle
    website/Patreon/social/docs release surfaces before public release.
    
    Install + model verification (run AFTER this implementation):
    The "Model Manager slide-over and zero-model gating" plan defers its
    Phase 6 manual install/model session here to avoid a duplicate
    large-download test pass. Once portable distribution is implemented, run
    one combined fresh-install session:
    1. clean portable app/user-data/engine state
    2. first launch + engine install/repair
    3. project page → confirm Models discoverable
    4. empty/new project zero-model → Models slide-over auto-opens;
    existing-media project zero-model → read-only, no PromptBox
    5. install one model (or seed model files + UI refresh/resync)
    6. confirm first installed model unlocks PromptBox/generation
    7. generate one image
    8. restart → installed-model detection persists
    Note in final results whether the real download path or the seeded-file
    resync path was exercised.
    Source: docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md Phase 6.
    ``` ```

## Handoff from MPI-2 (2026-06-02) — build hash injection deferred here

MPI-2 (in-app error reporter stage/build GitHub labels) shipped stage + version
labels but **deliberately deferred the `build:<hash>` label to this card**, since
build-time injection belongs in the portable/build pipeline, not the app source.

What MPI-8 must add when wiring the portable build:

- Inject a short git commit SHA at package/build time (e.g. electron-builder
  `beforeBuild` or a build script) into an env the running app can read, e.g.
  `CUBRIC_BUILD_HASH`. Dev/source runs have no `.git`-derived value → fall back
  to `'dev'`.
- Surface it to the renderer alongside the existing stage/version path. The error
  reporter already sends `build: { appVersion, stage }` to `/github/create-issue`
  ([js/components/Compounds/MpiErrorDialog/MpiErrorDialog.js]); extend that object
  with `hash` and have the backend ([routes/system.js] `/github/create-issue`)
  add a `build:<hash>` label (skip the label when hash is `'dev'`/absent).
- Stage is **derived from APP_VERSION**, not a build env — do NOT add a stage env
  var. See `js/core/appStage.js` (frontend) and the mirrored `deriveStage()` in
  `routes/system.js`. Build hash is the only build-injected piece.

This also ties into MPI-44 item 3 (`connectorManifestHash` in update-manifest),
which likewise wants a STAGED-artifact hash computed at build time — same pipeline.