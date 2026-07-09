# Portable distribution, updater, and release validation

## Purpose

MPI-8 owns the first portable Cubric Vision distribution flow: build full
portable artifacts, provide update scripts, keep the Vision connector manifest
stable, inject build metadata, and validate release behavior honestly across the
platforms the project can actually test.

This card supersedes the old short "Plan Reference" workspace. The historical
portable plan remains at:

- `docs/plans/2026-04-30-cross-platform-portable-distribution.md`

The executable source of truth is now:

- `.agents/mpi-kanban/tasks/MPI-8/plan.md`

## Release Model

- One repo: this repo becomes public and publishes GitHub Release artifacts.
- New users download full portable artifacts.
- Early-access users receive zip/update artifacts before the public release.
- Updates should use one updater system with two sources:
  - GitHub release/update manifest.
  - Local update zip for early-access/offline delivery.
- Users should not manually merge folders. Update scripts preserve user-owned
  folders and replace app-owned files.

## Platform Reality

- Windows: testable on this development machine, but not on a separate clean
  Windows host.
- Linux: install/launch testable on the user's old Ubuntu laptop. ComfyUI
  generation is not expected on that weak hardware.
- macOS: artifact will be produced, but maintainer-untested. Release copy must
  say this clearly and request community validation.

## Current Codebase Findings

Validated 2026-06-05:

- No portable build script exists.
- No updater scripts exist.
- No `resources/cubric/update-manifest.json` exists.
- `resources/cubric/connector-manifest.json` exists and is manifest-only.
- Portable env vars are not wired; `main.js` only forwards packaged
  `MPI_RESOURCES_PATH`.
- Windows engine install exists; Linux/macOS engine install is placeholder.
- `downloadManager` still module-loads `node-7z` / `7zip-bin`.
- `routes/projects.js` still has one bare shell `ffmpeg`/`ffprobe` route.
- `/open-folder` still shells Windows `start`.
- `media/icons/` is absent; Windows AUMID is not the permanent app id.
- Build hash injection is absent.
- Model Manager slide-over and zero-model behavior already shipped; MPI-8 only
  validates the fresh-install/model flow.

See research note:

- `.agents/mpi-kanban/tasks/MPI-8/research/2026-06-05-plan-rewrite-validation.md`

## In Scope

- Portable app layout and launch/update scripts.
- Windows portable artifact and full local validation.
- Linux artifact and install/launch validation.
- macOS artifact with explicit untested/community-validation disclosure.
- ComfyUI engine install path corrections needed for portable release.
- Update system with GitHub and local-zip sources.
- Connector manifest staging and update-manifest generation.
- Build hash injection for error-report labels.
- Real release notes and platform disclosure copy.

## Out Of Scope

- NSIS, DMG, AppImage, or system-wide installers.
- Requiring Git for user updates.
- Manual folder merging by users.
- Vision LLM/llama runtime or packaging.
- Live `@cubric/connector` runtime integration.
- Broker startup, PromptBox connector actions, permission/trust UI.
- Claiming macOS is tested before community or maintainer validation exists.

## Carry-Overs

### From MPI-44

- Keep `resources/cubric/connector-manifest.json` in staged artifacts.
- Assert `appId === "cubric.vision"`, `protocolVersion === "0.1.0"`, and
  `metadata.manifestOnly === true`.
- Generate update-manifest connector fields from staged artifacts.

### From MPI-2

- Inject build hash at build/stage time.
- Add `build:<hash>` GitHub labels for real build hashes only.
- Keep stage derived from `APP_VERSION`; do not add a stage env var.

### From Model Manager Validation

Run one combined fresh-install validation session:

1. Clean portable app/user-data/engine state.
2. Launch app and run engine install/repair.
3. Confirm Models is discoverable.
4. Confirm zero-model gate/read-only behavior.
5. Install or seed one model and refresh/resync.
6. Confirm PromptBox/generation unlocks after model detection.
7. Generate one image where hardware allows.
8. Restart and confirm installed-model detection persists.
