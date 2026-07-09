# MPI-8 plan rewrite validation - 2026-06-05

## Goal

Validate the old MPI-8 portable distribution assumptions against the current
repo before rewriting the task plan.

## Sources Read

- `.agents/mpi-kanban/tasks/MPI-8/task.json`
- `.agents/mpi-kanban/tasks/MPI-8/brief.md`
- `.agents/mpi-kanban/tasks/MPI-8/plan.md`
- `.agents/mpi-kanban/tasks/MPI-8/checklist.md`
- `docs/plans/2026-04-30-cross-platform-portable-distribution.md`
- `docs/plans/2026-05-23-cubric-hub-readiness-before-portable-distribution.md`
- `docs/plans/2026-05-22-model-manager-slide-over-zero-model-gating.md`
- `docs/plans/2026-05-21-remove-local-llm-llama-runtime.md`
- `docs/specs/cubric-connector-sdk.md`
- `docs/specs/cubric-vision-connector-integration-map.md`
- `package.json`
- `electron-builder.yml`
- `main.js`
- `routes/platformEngine.js`
- `routes/engine.js`
- `routes/shared.js`
- `routes/comfy.js`
- `routes/downloadManager.js`
- `routes/projects.js`
- `routes/system.js`
- `services/ffmpegBinary.js`
- `resources/cubric/connector-manifest.json`
- `js/data/releaseNotes.js`
- `js/shell.js`
- `js/shell/projectUI.js`
- `docs/workspaces.md`

## Findings

### Build and packaging

- No portable build script exists in `scripts/`.
- `package.json` has no portable build or update scripts.
- `electron-builder.yml` targets installer-style formats: NSIS, DMG, AppImage.
  These are not the desired portable release path.
- `electron-builder.yml` still excludes `llama_engine/**` and
  `llama_models/**`. This is defensive residue from old LLM scope; active
  Vision distribution should not plan LLM/llama folders.

### Runtime pathing

- `main.js` sets `MPI_RESOURCES_PATH` only when `app.isPackaged`.
- No portable env contract exists yet for `CUBRIC_PORTABLE_ROOT`,
  `CUBRIC_ENGINE_ROOT`, or `CUBRIC_UV_BIN`.
- `getEngineRoot()` still prefers `.engine-config.json` and falls back to
  repo-local `engine/`.
- `routes/engine.js`, `routes/shared.js`, `routes/comfy.js`, and
  `routes/downloadManager.js` cache `ENGINE_ROOT` at module import time. Any
  portable env must be present before `server.js` starts.

### Engine install

- Windows engine install exists and downloads/extracts a ComfyUI Windows
  portable `.7z`.
- Linux/macOS in `routes/platformEngine.js` are placeholders.
- `resolveDownloadConfig()` currently returns Windows `.7z` metadata for all
  platforms.
- `_runEngineDownload()` in `routes/engine.js` is Windows/archive shaped and
  extracts through `node-7z`.
- `dev_configs/system_dependencies.json` currently only tracks the ComfyUI
  engine version; no pinned `uv` entry exists.

### Archive extraction

- `routes/downloadManager.js` imports `node-7z` and `7zip-bin` at module load.
  This remains a release blocker for Mac/Linux stages unless changed.
- Custom-node GitHub archives are ZIP files and do not inherently require 7z.

### OS-specific shell issues

- `routes/projects.js` has one remaining bare shell `ffprobe` and `ffmpeg`
  route for project-media extraction.
- Newer video routes already use `services/ffmpegBinary.js`.
- `routes/system.js` opens folders using Windows `start`.
- GPU/VRAM checks still use `nvidia-smi` but degrade to zeros on failure.

### Identity and assets

- `media/icons/` is absent.
- `main.js` sets Windows AppUserModelID to `process.execPath`, not permanent
  `cubric.studio.vision`.
- App display name is already `Cubric Vision` through `js/core/appName.cjs`.
- `package.json` name is already `cubric-vision`.

### Connector and update manifests

- `resources/cubric/connector-manifest.json` exists and is manifest-only.
- It declares `appId: "cubric.vision"`, `protocolVersion: "0.1.0"`, and
  `metadata.manifestOnly: true`.
- `resources/cubric/update-manifest.json` does not exist.
- The build must compute `connectorManifestHash` from the staged connector
  manifest artifact.

### Build hash and issue labels

- Error reporter sends `build: { appVersion, stage }`.
- Backend re-derives stage from `APP_VERSION`.
- No build hash value is passed.
- Backend labels include `bug`, `auto-report`, and `stage:<stage>` only.

### Model Manager validation

- `models:open` routes to the Models slide-over.
- Project page has a Models action.
- Gallery and Group History use installed-model state and zero-model behavior.
- The old model-manager implementation plan is complete for runtime purposes.
  MPI-8 only needs the combined fresh-install validation pass.

### Platform validation constraints

- Windows can be validated only on this development machine.
- Linux can be install/launch validated on the user's old Ubuntu laptop, but
  ComfyUI generation is not expected.
- macOS will be released as an artifact, but maintainer-untested. Release copy
  must disclose this.

## Plan Rewrite Decisions

- Make `.agents/mpi-kanban/tasks/MPI-8/plan.md` the executable source of truth.
- Keep the old long plan as historical context only.
- Remove LLM/llama from active Vision distribution scope.
- Plan updater as one preserve/replace system with two sources:
  GitHub release asset and local update zip.
- Do not require Git in user folders.
- Do not ask users to manually merge folders.
- Treat macOS as build-produced but maintainer-untested until contributors
  validate it.
