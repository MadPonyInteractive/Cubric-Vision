# Portable distribution, updater, and release validation

## Current State

Project mode: scalable-foundation. This card is the executable plan for Cubric
Vision portable distribution. The old detailed document at
`docs/plans/2026-04-30-cross-platform-portable-distribution.md` is now
historical input, not the source of execution truth.

Validated against the repo on 2026-06-05:

- No portable build script exists yet. `scripts/` has utility/pre-release
  scripts only; `package.json` has no portable build/update scripts.
- `electron-builder.yml` still targets NSIS/DMG/AppImage and excludes
  `llama_engine/**` / `llama_models/**`. Installer formats are out of scope for
  this card; LLM/llama packaging is legacy and must not be carried forward as
  Vision scope.
- Runtime pathing is still mostly dev/electron-builder shaped. `main.js` only
  forwards `MPI_RESOURCES_PATH` when `app.isPackaged`; portable env vars such as
  `CUBRIC_PORTABLE_ROOT` and `CUBRIC_ENGINE_ROOT` do not exist yet.
- `routes/platformEngine.js`, `routes/engine.js`, `routes/shared.js`,
  `routes/comfy.js`, and `routes/downloadManager.js` cache `ENGINE_ROOT` at
  module import. Portable env/config must be set before `server.js` starts.
- Windows engine provisioning exists. Linux/macOS engine provisioning is still a
  placeholder: `resolveDownloadConfig()` always returns Windows `.7z` metadata,
  and `_runEngineDownload()` extracts with `node-7z`.
- `routes/downloadManager.js` imports `node-7z` and `7zip-bin` at module load.
  This can break Mac/Linux stages until custom-node ZIP extraction is moved to a
  cross-platform ZIP path or 7z is lazy-loaded only for Windows engine archives.
- `routes/projects.js` still has one route that shells bare `ffprobe` and
  `ffmpeg`. Most newer video routes already use `services/ffmpegBinary.js`.
- `routes/system.js` still opens folders with Windows `start`.
- `media/icons/` is absent. `main.js` sets Windows AppUserModelID to
  `process.execPath`, not the permanent `cubric.studio.vision` identity.
- `resources/cubric/connector-manifest.json` exists and is manifest-only.
  `resources/cubric/update-manifest.json` does not exist yet.
- Error reporter labels include app version and derived stage only; build hash
  injection and `build:<hash>` labels are not implemented.
- Model Manager slide-over and zero-model behavior have already shipped in
  runtime code. MPI-8 only needs the combined fresh-install/manual validation
  pass, not model-manager implementation.

Release/testing reality:

- One repo: this repo becomes public and publishes release artifacts here.
- Early access users still receive zip artifacts before public release.
- Windows can be tested on the development machine, but not on a clean separate
  Windows host.
- Linux can be install/launch tested on the user's old Ubuntu laptop. It is not
  expected to run ComfyUI generation on that hardware.
- macOS artifacts will still be produced, but they are maintainer-untested.
  Release copy must say this clearly and request community validation.

## Completed

- [x] MPI-44 Vision connector scaffold scope merged into this card.
- [x] Live Vision connector runtime kept out of v1 scope.
- [x] Model Manager slide-over and zero-model implementation completed
  elsewhere; only fresh-install validation remains here.
- [x] Repo/release/update/LLM scope decisions recorded in project memory on
  2026-06-05.
- [x] Phase 1 portable release contract documented in
  `docs/releases/portable-distribution-contract.md`.
- [x] Parallel implementation batch verified on 2026-06-06: runtime
  portability blockers, engine/download extraction portability, build/updater
  artifact tooling skeleton, and release docs/copy gates.

## Remaining Work

## Phase 1: Scope cleanup and release contract

- [x] Replace stale portable-distribution assumptions in this task workspace and
  keep the old long plan as historical reference only. **Verify:** this
  `plan.md`, `brief.md`, `checklist.md`, and `validation.md` describe the same
  executable scope and no longer treat LLM/llama packaging as Vision work.

- [x] Define the artifact contract for early-access and public releases.
  **Verify:** release notes/spec text names full portable artifacts, local
  update bundles, and GitHub update source without requiring manual folder
  merging.

- [x] Decide script names and root layout before build scripting.
  Recommended names:
  `start.bat`, `update.bat`, `update-from-zip.bat`; `start.sh`, `update.sh`,
  `update-from-zip.sh`; `start.command`, `update.command`,
  `update-from-zip.command`. **Verify:** scripts can set portable env vars
  before launching the app/server.

## Phase 2: Runtime portability blockers

- [x] Add portable root/env resolution. `getEngineRoot()` should prefer
  `CUBRIC_ENGINE_ROOT` before `.engine-config.json`; launchers should set
  `CUBRIC_PORTABLE_ROOT`, `CUBRIC_ENGINE_ROOT`, `MPI_RESOURCES_PATH`, and
  platform-specific `CUBRIC_UV_BIN` where applicable. **Verify:** a dev smoke
  script can start the server with these env vars and print roots resolved to a
  copied portable folder.

- [x] Replace the remaining bare `ffprobe`/`ffmpeg` shell route in
  `routes/projects.js` with `execFile` using `services/ffmpegBinary.js`.
  **Verify:** project media extraction still produces the same output shape and
  works with paths containing spaces.

- [x] Make `/open-folder` cross-platform. Prefer Electron `shell.openPath`
  through IPC or another established main-process bridge. **Verify:** landing
  "open folder" still opens the folder on Windows and the route no longer
  shells `start`.

- [x] Remove Mac/Linux module-load dependency on `7zip-bin` for custom-node ZIP
  extraction. Use a cross-platform ZIP extractor for GitHub custom-node zips, or
  lazy-load 7z only for Windows engine `.7z` archives. **Verify:**
  `require('./routes/downloadManager')` succeeds on a non-Windows host/stage
  without a Mac 7z binary, and Windows custom-node ZIP extraction still works.

- [x] Add permanent app identity. Set Windows AUMID to
  `cubric.studio.vision`. **Verify:** dev Windows launch still opens normally.

- [x] Add platform icon assets from the existing source logo. Generate
  `media/icons/cubric-vision.ico`, `media/icons/cubric-vision.icns`, and
  `media/icons/cubric-vision.png` from `assets/mascot/logo.png`.
  **Verify:** files exist and can be staged into portable artifacts.

## Phase 3: Build metadata and connector manifests

- [x] Add build-time short commit hash injection. Dev/source runs should report
  `dev`; staged portable builds should expose the short commit SHA to the
  renderer/backend. **Verify:** error reports include `build.hash`, and backend
  applies `build:<hash>` only when hash is neither absent nor `dev`.

- [x] Preserve `resources/cubric/connector-manifest.json` in every staged
  artifact. **Verify:** staged manifest path is stable relative to the app root
  and smoke assertions pass for `appId === "cubric.vision"`,
  `protocolVersion === "0.1.0"`, and `metadata.manifestOnly === true`.

- [x] Generate `resources/cubric/update-manifest.json` during staging from
  staged artifacts. Include `schemaVersion`, `appId`, `displayName`,
  `platform`, `arch`, `toVersion`, `protocolVersion`,
  `connectorManifestPath`, `connectorManifestHash`, `files[]`, `preserve[]`,
  and `createdAt`. **Verify:** `connectorManifestHash` is computed from the
  staged manifest file, not from an assumed source-tree path.

- [x] Keep Vision standalone. **Verify:** no runtime import of
  `@cubric/connector`, no broker spawn, no PromptBox connector actions, no
  permission/trust UI, and no disabled promotional connector controls.

## Phase 4: Windows portable artifact

- [x] Implement the Windows staging/build path. It should stage app source,
  `node_modules`, portable Electron/Node runtime as needed, resources, launchers,
  connector/update manifests, and updater scripts. **Verify:** a full Windows
  artifact can be extracted outside the repo and launched from its start script.

- [x] Implement Windows updater scripts. `update.bat` should download/apply the
  latest compatible GitHub release/update bundle; `update-from-zip.bat` should
  apply a local early-access/offline bundle. Both must preserve engine, models,
  projects, and user-owned local config. **Verify:** update on a copied
  portable folder replaces app files and leaves engine/model folders intact.

- [ ] Run Windows validation on this machine. **Verify:** launch, engine
  install/repair, Models slide-over discovery, model install or seeded-model
  resync, one image generation, restart persistence, folder open, video
  extraction/crop, error report build labels, and update-from-copy/update script
  behavior.

## Phase 5: Linux portable artifact

- [x] Implement Linux staging/build path. Include `start.sh`, `update.sh`,
  `update-from-zip.sh`, staged resources, connector/update manifests, and
  `uv`/comfy-cli bootstrap support if Linux engine install is in this artifact.
  **Verify:** artifact extracts on Linux and `start.sh` can launch the app shell.

- [x] Add Linux engine bootstrap path without claiming generation support from
  the user's old Ubuntu laptop. The code should use `uv` plus `comfy-cli` with
  zip-local uv env vars. **Verify:** on Ubuntu laptop, install/launch path and
  engine setup UI can be exercised far enough to validate paths/logs; ComfyUI
  generation remains community or stronger-host validation.
  <!-- DONE 2026-06-07: uv + comfy-cli bootstrap installed ComfyUI on the Ubuntu
  laptop; install/launch path, engine setup UI, models-folder repoint, and
  paths/logs all validated (see validation.md). Generation left to community/
  stronger-host per the verify carve-out (8GB box OOM-kills SDXL fp32 on CPU,
  below the advertised 16-32GB minimum). -->

- [x] Implement Linux updater scripts using the same update engine as Windows.
  **Verify:** update-from-zip can apply an early-access bundle on Ubuntu while
  preserving user-owned folders.

## Phase 6: macOS portable artifact

> **READ FIRST:** `docs/releases/build-experience-log.md` → section
> "macOS pre-build checklist — carry-overs from the Linux build". It consolidates
> every Linux obstacle with a mac analogue (engine layout, comfy-cli torch arch,
> Metal vs --cpu launch, tar exec-bit trap, dock name/icon + `build/icon.icns`,
> git via `xcode-select`, additive-folder re-test) into an ordered pre-build
> checklist. macOS is untestable here, so this is the primary risk-reduction doc.

- [ ] Implement macOS staging/build path and launch/update scripts, with
  `start.command`, `update.command`, and `update-from-zip.command`. **Verify:**
  the artifact is mechanically produced and contains expected app, resource,
  manifest, launcher, and updater files.

- [ ] Mark macOS support as untested by maintainer in artifact notes and release
  copy. **Verify:** GitHub release text and early-access notes explicitly say
  macOS is community-validation-needed, and do not imply maintainer smoke
  testing.

- [ ] Add a contributor validation checklist for macOS. **Verify:** checklist
  asks for OS version, CPU arch, launch result, Gatekeeper behavior, app log
  tail, engine setup result, and whether generation was tested.

## Phase 7: Release readiness and public repo flow

- [x] Replace placeholder `0.0.1` changelog/release copy through the version
  bump/release-note flow. **Verify:** `js/data/releaseNotes.js` has real
  `APP_VERSION` notes and no placeholder warning for the released version.

- [x] Prepare GitHub release asset naming and disclosure copy. **Verify:**
  release assets are named for Cubric Vision, not legacy CubricStudio names, and
  platform support language matches actual validation reality.

- [x] Prepare open-source contribution surfaces before public release.
  **Verify:** issue/PR templates or release notes ask contributors for platform,
  arch, GPU, artifact name, clean install/update path, and app log tail.

## Parallel Batch: Independent implementation slices

Use `mpi-execute-parallel` only after Phase 1 settles the exact artifact layout
and if file ownership is clean.

- [x] Runtime portability blockers. Ownership: `main.js`,
  `routes/platformEngine.js`, `routes/system.js`, `routes/projects.js`,
  `services/ffmpegBinary.js`. Briefings: dos_and_donts, comfy_engine, shell,
  project integrity. **Verify:** server/app path smoke plus focused route
  checks pass on Windows.

- [x] Engine/download extraction portability. Ownership: `routes/engine.js`,
  `routes/downloadManager.js`, `routes/shared.js`, `dev_configs/system_dependencies.json`.
  Briefings: comfy_engine, downloads, project integrity. **Verify:** Windows
  engine install path still works and custom-node ZIP extraction no longer
  depends on Mac/Linux `7zip-bin` module load.

- [x] Build/updater artifact tooling. Ownership: `scripts/build-portable.*`,
  staged launcher/update templates, `resources/cubric/update-manifest.json`
  generation. Briefings: dos_and_donts, versioning, connector manifest context.
  **Verify:** dry-run/staging command produces expected manifests and preserve
  lists without touching user folders.

- [x] Release docs/copy gates. Ownership: `docs/releases/**`,
  `js/data/releaseNotes.js`, release checklist docs or GitHub template files.
  Briefings: versioning, project memory repo distribution. **Verify:** copy
  states Windows tested locally, Linux install-tested on weak Ubuntu hardware,
  macOS untested/community validation needed, and no Vision LLM claims.

## Plan Drift

- 2026-06-06: Windows deep validation surfaced and fixed three real defects
  (none from build tooling): GPU engine-build selection was broken (CUDA parsed
  from wrong stream; everyone got legacy cu126 — now arch-based via
  `selectNvidiaBuild`), models path resolved to two different folders in Cubric
  vs ComfyUI (relative base_path — now forced absolute via `resolveModelsRoot`,
  4 stale fallbacks unified), and dev_mode is now derived from BUILD_HASH (no
  manual flip before release). User verified install/generate/persist on a fresh
  portable extract. Remaining Windows checks (engine repair, slide-over on fresh
  install, live error-report POST, update on copied folder) are user-pending.

- 2026-06-05: Rebuilt after validating the old portable plan against the repo.
  Major drift found: no portable build script exists, Linux/macOS engine paths
  are placeholders, update manifests are absent, the old LLM/llama future track
  is no longer Vision scope, and model-manager implementation is already done.
- 2026-06-06: Phase 1 contract work landed as
  `docs/releases/portable-distribution-contract.md`. Build scripting should use
  that document for artifact names, root layout, launcher/update script names,
  update sources, preservation rules, update-manifest fields, connector staging,
  and platform disclosure language.
- 2026-06-06: Parallel batch verified. Remaining drift: Phase 2 icon asset
  generation is still open because `media/icons/` does not exist yet; the source
  image for those assets is `assets/mascot/logo.png`.
- 2026-06-06: Sequential continuation generated platform icon assets, added
  build-hash injection, implemented full Windows portable/update staging plus
  built-in zip/tar.gz artifact writers, and added mechanical Linux/macOS
  dry-run artifact paths. Remaining validation is launch/platform hardware
  validation, Linux engine bootstrap validation, and macOS community validation.
- 2026-06-06: Verification of the committed slice found two `build-portable.mjs`
  defects, now fixed: (1) `APP_COPY_EXCLUDES` leaked dev-only roots + agent
  context (`.kilo`, `.vscode`, `.playwright`, `build`, `media-for-testing`,
  `next.md`, `output`, `plans`, `tmp`, `.code-workspace`, `electron-builder.yml`,
  `debug.log`, `CLAUDE.md`, `AGENTS.md`) into the user payload; (2) the copy
  walker could recurse into a stage dir resolved inside the repo (recursive copy
  bomb, exit 0 hid it). Added a `skipAbs` walker guard, a fail-fast in-repo
  stage-dir refusal, and `D:\tmp` allowance in `assertSafeClean`. A fresh clean
  Windows build (`D:\tmp`, buildHash `fea34e40c89c`, 5330 files) launched from
  the staged Electron with portable env: server reached
  `http://127.0.0.1:3000`, portable user-data root honored, GPU/engine config
  resolved, `/`, `/system/stats`, `/system/platform-config` all OK. Note: the
  Claude shell sets `ELECTRON_RUN_AS_NODE=1`; must `env -u` it to launch
  electron in this environment (not an artifact defect).

## Verification

Final completion requires:

- Windows portable artifact extracts outside the repo and launches.
- Windows engine install/repair can complete and one image generation succeeds.
- Windows model-manager/manual fresh-install sequence is recorded, including
  whether real downloads or seeded model files were used.
- Linux artifact extracts and launches on Ubuntu; logs/path diagnostics confirm
  portable roots. Generation is marked unvalidated unless a stronger Linux host
  or contributor validates it.
- macOS artifact is produced but release notes clearly mark it maintainer
  untested until community validation arrives.
- Updater supports GitHub-release source and local update-zip source, with one
  shared preserve/replace model.
- Connector manifest and update manifest smoke assertions pass for staged
  artifacts.
- Error reports include stage/version/build hash labels as designed.
- Release notes are real, platform-specific, and honest about validation gaps.

## Preservation Notes

- Do not implement installer formats in this card: no NSIS, DMG, AppImage, or
  system-wide install flow.
- Do not require Git for user updates. GitHub updater scripts should download
  release assets/manifests, not run `git pull` in a user folder.
- Do not manually ask users to merge folders. Updater scripts own replacement
  and preservation.
- Keep early-access zip/update delivery as a first-class path.
- Do not add LLM/llama runtime or packaging back into Cubric Vision. LLM/prompt
  intelligence belongs to Cubric Prompt.
- Do not add live connector runtime work here. Vision v1 remains manifest-only
  and standalone.
- If implementation changes component wiring, workspace routing, events, state,
  or Comfy injection behavior, ask before updating `.claude/rules/`.
