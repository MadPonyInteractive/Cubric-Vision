# Validation

## Planning Validation - 2026-06-05

This card was rebuilt after checking the current codebase against the old
portable-distribution assumptions.

Validated facts:

- `scripts/build-portable.js` does not exist.
- `package.json` has no portable build/update scripts.
- `main.js` forwards only packaged `MPI_RESOURCES_PATH`, not the full portable
  env contract.
- `routes/platformEngine.js` still has Linux/macOS placeholder Comfy paths and
  returns Windows `.7z` download config.
- `routes/engine.js` provisions the engine through Windows `.7z` extraction.
- `routes/downloadManager.js` module-loads `node-7z` and `7zip-bin`.
- `routes/projects.js` still contains one bare shell `ffprobe`/`ffmpeg`
  extraction route.
- `routes/system.js` still opens folders with Windows `start`.
- `media/icons/` is absent.
- `resources/cubric/connector-manifest.json` exists.
- `resources/cubric/update-manifest.json` is absent.
- Build hash injection is absent from the error-report path.
- Model Manager slide-over and zero-model behavior are already implemented in
  runtime code and docs; MPI-8 only needs fresh-install validation for that
  flow.

Recorded details:

- `.agents/mpi-kanban/tasks/MPI-8/research/2026-06-05-plan-rewrite-validation.md`

## Implementation Validation

### Phase 1 - Scope cleanup and release contract - 2026-06-06

Validated document updates:

- `docs/releases/portable-distribution-contract.md` defines full portable
  artifacts and update bundles for early-access and public releases.
- The contract names GitHub-release and local-zip update sources without
  requiring users to manually merge folders.
- The contract defines root launcher names:
  `start.bat`, `update.bat`, `update-from-zip.bat`, `start.sh`, `update.sh`,
  `update-from-zip.sh`, `start.command`, `update.command`, and
  `update-from-zip.command`.
- The contract defines portable environment variables that launchers must set
  before app/server startup.
- The contract keeps Vision standalone and manifest-only for v1.
- The contract records platform disclosure language for Windows, Linux, and
  macOS based on actual validation reality.
- `docs/releases/README.md` links to the portable distribution contract.

User verified this Phase 1 slice on 2026-06-06.

### Parallel Batch - Independent implementation slices - 2026-06-06

User verified the parallel batch on 2026-06-06.

Validated implementation:

- Runtime portability helpers now honor portable roots and resources. A smoke
  check confirmed `CUBRIC_ENGINE_ROOT`, `CUBRIC_PORTABLE_ROOT`,
  `MPI_RESOURCES_PATH`, and `CUBRIC_MODELS_ROOT` resolve as expected.
- `routes/projects.js` no longer shells bare `ffprobe`/`ffmpeg` for the media
  extraction route; it uses `execFile` and `services/ffmpegBinary.js`.
- `/open-folder` no longer shells Windows `start`; it uses the Electron
  main-process bridge with a platform fallback.
- `routes/downloadManager.js` no longer module-loads `node-7z` or `7zip-bin`
  for custom-node ZIP extraction. `extract-zip` is declared as a direct runtime
  dependency.
- `scripts/build-portable.mjs`, `scripts/build-portable.ps1`, and
  `scripts/portable/**` provide a dry-run portable staging skeleton and
  launcher/update templates.
- `resources/cubric/update-manifest.json` and
  `resources/cubric/update-manifest.schema.json` exist, and dry-run staging
  computes `connectorManifestHash` from the staged connector manifest.
- Runtime release notes and release checklists/templates include honest
  platform disclosure and no positive Vision LLM claims.

Verification run:

- `node --check` on touched runtime route files passed.
- Route/import smoke passed.
- No-7z module-load smoke passed.
- `node scripts/build-portable.mjs --dry-run --platform win32 --arch x64 --stage-dir C:\tmp\cubric-portable-integrate` passed.
- `npm run lint` passed with 10 existing warnings in unrelated frontend files.
- MPI state JSON parse passed.

Known remaining gap:

- Platform icon assets are still missing. Generate
  `media/icons/cubric-vision.ico`, `media/icons/cubric-vision.icns`, and
  `media/icons/cubric-vision.png` from `assets/mascot/logo.png`.

Expected final validation is listed in `plan.md` under `## Verification`.

### Platform icons, build hash, and portable artifacts - 2026-06-06

Implemented in this continuation:

- Generated `media/icons/cubric-vision.png`,
  `media/icons/cubric-vision.ico`, and `media/icons/cubric-vision.icns` from
  `assets/mascot/logo.png`.
- Added `js/core/buildInfo.js` with source/dev `BUILD_HASH = 'dev'`.
- `scripts/build-portable.mjs` now stamps the staged copy of
  `js/core/buildInfo.js` with the short Git commit hash.
- Error reports now send `build.hash`; `routes/system.js` includes
  `build:<hash>` labels only for valid non-`dev` hashes and records the build
  value in the issue body.
- `scripts/build-portable.mjs` now stages full portable roots, matching update
  bundle roots, resources, icons, launchers, updater helper scripts, and
  zip/tar.gz archives without adding a packaging dependency.
- Windows `start.bat`, `update.bat`, and `update-from-zip.bat` use normalized
  portable roots. `update-from-zip.bat` applies a local zip through the shared
  `update/apply-update.cjs` helper.
- Linux and macOS launcher/update templates now use the same local update
  helper and GitHub-release asset download pattern, but remain mechanically
  staged and not platform-validated on real hosts.

Verification run:

- Icon header/metadata checks passed: PNG is 1024x1024 with alpha, ICO has a
  seven-image directory, and ICNS has the expected `icns` header.
- `node --check scripts/build-portable.mjs` passed.
- `node --check scripts/portable/apply-update.cjs` passed.
- `node --check routes/system.js` passed.
- `node scripts/build-portable.mjs --dry-run --clean --platform win32 --arch x64 --stage-dir C:\tmp\cubric-portable-final-dry` passed and refreshed the source manifest with build hash `2fc25b0b1b2d`.
- Linux dry-run archive staging passed for `--platform linux --arch x64`.
- macOS dry-run archive staging passed for `--platform darwin --arch arm64`.
- Full Windows staging passed with
  `node scripts/build-portable.mjs --clean --platform win32 --arch x64 --stage-dir C:\tmp\cubric-portable-full-final --no-archive --no-source-manifest`.
- Full Windows archive staging passed with
  `node scripts/build-portable.mjs --clean --platform win32 --arch x64 --stage-dir C:\tmp\cubric-portable-full-archive --no-source-manifest`,
  producing both `CubricVision-windows-x64-v0.0.1.zip` and
  `CubricVision-windows-x64-update-v0.0.1.zip`.
- Pre-commit review caught and fixed full-zip root layout: full portable zip
  entries now include the `CubricVision-windows-x64-v0.0.1/` root folder, while
  update-bundle zip entries remain rootless for updater application.
- Pre-commit review also excluded dev-only roots from staged `app/` copies:
  `.agents`, `.claude`, `.github`, `.env*`, lint/test configs, `scripts/`,
  `tests/`, and related build/test output folders are not included in the
  portable app payload.
- Staged manifest assertions passed: `artifact.kind === "portable-stage"`,
  `artifact.buildHash === "2fc25b0b1b2d"`, connector manifest present, icon
  assets present, and `update/apply-update.cjs` present.
- Local update smoke passed on a copied full Windows stage:
  `update-from-zip.bat` applied a tiny update zip, replaced
  `app/js/core/buildInfo.js`, and created a rollback folder under
  `update/rollback/`.
- `npm run lint` passed with 10 existing unrelated warnings and 0 errors.

Remaining validation:

- Launch the full Windows portable artifact from `start.bat` outside the repo.
- Run Windows engine/model/folder-open/video/error-report validation.
- Exercise Linux artifact extraction/launch on Ubuntu.
- Keep macOS marked maintainer-untested until contributor or maintainer Mac
  validation is recorded.
