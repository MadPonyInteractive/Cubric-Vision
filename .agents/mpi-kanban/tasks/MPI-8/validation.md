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

### Windows portable launch validation - 2026-06-06

Verification of the committed slice (HEAD `fea34e4`) surfaced a real packaging
defect, which was fixed before launch validation.

Defect found and fixed:

- `scripts/build-portable.mjs` `APP_COPY_EXCLUDES` was incomplete. The staged
  `app/` payload leaked dev-only roots and agent context: `.kilo`,
  `.playwright`, `.vscode`, `Cubric-Vision.code-workspace`, `build`,
  `debug.log`, `electron-builder.yml`, `media-for-testing`, `next.md`,
  `output`, `plans`, `tmp`, plus `CLAUDE.md` and `AGENTS.md`. These are now
  excluded. Runtime-referenced `dev_configs/`, `templates/`, and `LICENSE`
  remain staged.
- The copy walker (`copyAppTree`) had no guard against `--stage-dir` resolving
  inside the repo. A mangled stage path caused a recursive copy bomb
  (ENOSPC, runaway nested folders inside the repo) while the script still
  exited 0. Added: (a) a `skipAbs` guard so the walker never descends into the
  stage root, and (b) a fail-fast check in `main()` refusing stage dirs inside
  the repo tree except under `dist/`. `assertSafeClean` now also allows
  `D:\tmp` (preferred test root; C: is space-constrained).

Build:

- Clean full Windows build to `D:\tmp\cubric-validate` with
  `--no-source-manifest` succeeded: `buildHash: fea34e40c89c` (matches HEAD),
  `fileCount: 5330` (no recursion), `sourceManifest: null` (repo not dirtied).
- Verified clean `app/` payload: none of the leaked entries present;
  `app/js/core/buildInfo.js` stamped `fea34e40c89c`; `dev_configs/`,
  `templates/`, `LICENSE`, `node_modules/` present.
- In-repo stage-dir guard test rejected `--stage-dir ./should-fail-here` as
  expected.

Launch (from staged Electron, portable env vars set as `start.bat` does):

- App booted and `Server started at http://127.0.0.1:3000`; `Server signaled
  ready.` Three `electron.exe` processes ran.
- Portable roots honored: `APP_USER_DATA set to: D:\tmp\...\user-data`.
- `.env` injected 0 vars (no secret leak; `.env` excluded from payload).
- GPU detection resolved `NVIDIA GeForce RTX 4060 Ti` ->
  `ComfyUI_windows_portable_nvidia_cu126.7z` (engine provisioning path correct).
- HTTP probes: `GET /` 200; `GET /system/stats` returns RAM/VRAM;
  `GET /system/platform-config` returns `{platform: win32, comfyDir:
  ComfyUI_windows_portable}`.
- Build-hash error-report path verified by reading `routes/system.js`:
  `normalizeBuildHash` returns null for absent/`dev`/non-hex and a valid 7-40
  hex hash otherwise; body always prints `**Build:**` and the `build:<hash>`
  label is added only for a real (non-`dev`) hash. No GitHub issue was POSTed.

Test-environment note (not an artifact defect):

- The Claude Code shell has `ELECTRON_RUN_AS_NODE=1` set, which makes
  `electron.exe` run `main.js` as plain Node (`require('electron').app` is
  undefined -> `app.getPath` TypeError at `main.js:13`). Setting the var to
  empty does NOT clear it (presence-checked); `env -u ELECTRON_RUN_AS_NODE`
  is required. A real user double-clicking `start.bat` is unaffected.

Still remaining for Windows:

- Engine install/repair completion, Models slide-over discovery, one image
  generation, restart persistence, folder-open via Electron bridge, video
  extraction/crop, a live error-report submission, and update /
  update-from-zip on a copied portable folder. These are deeper interactive
  flows beyond the launch/path/boot validation above.

### Windows deep validation + GPU/models/dev_mode fixes - 2026-06-06

User-verified on a fresh portable install (zip-extracted outside repo):
engine install, one image generation, settings change, app restart, settings
persisted, project.json clean. update-from-zip self-verified (replace +
preserve + rollback). open-folder bridge, ffprobe/ffmpeg execFile route, and
ffmpeg binaries staged — all verified by inspection/run.

Defects found during deep validation and fixed:

- **GPU build selection was broken.** `detectNvidiaGPU()` read the `CUDA
  Version:` header from stderr, but `--query-gpu=name` never emits it (header is
  on stdout, bare `nvidia-smi` only), so CUDA was always `unknown` and every
  card fell back to `cu126` (the legacy 10-series build per Comfy-Org). Modern
  cards incl. Blackwell would get a non-working build. Fixed: two nvidia-smi
  calls; new `selectNvidiaBuild()` picks by GPU architecture (20-series+/
  datacenter Turing+ → `nvidia.7z`, 10-series/older → `cu126`). 16/16 unit
  cases pass; live on RTX 4060 Ti → CUDA 13.2 + `nvidia.7z`; asset URL HEAD
  302→200 (1.98 GB).
- **Models path resolved to two folders.** Engine-install UI hardcoded relative
  `engine/mpi_models/` → written verbatim to `extra_model_paths.yaml`. Cubric
  resolves vs server cwd (`app/`), ComfyUI resolves vs its own dir → model
  installed where generation can't see it. Fixed: `resolveModelsRoot()` anchors
  to absolute (default `<ENGINE_ROOT>/mpi_models`); set-path/get-path always
  absolute; UI hydrates default from server. 4 stale `ComfyUI/models` fallbacks
  unified to `getDefaultModelsRoot()`. Settings folder labels separator-clean.
- **dev_mode footgun removed.** Now derived `BUILD_HASH === 'dev'` (renderer +
  main both); builds stamp staged buildInfo.js only, source untouched. Verified
  dev=true / staged build=false for both readers.

Verification: node --check + eslint clean on all changed files; resolution unit
tests pass; fresh zip rebuilt (buildHash 41ff0f5700f0) with all fixes staged
and confirmed.

Still user-pending for Windows: engine repair, Models slide-over discovery on a
truly fresh install, restart persistence on the rebuilt zip, folder-open click,
video extraction/crop in-app, a live error-report POST, and update/
update-from-zip on a copied install. User will run a fresh install later.

---

## 2026-06-07 — Linux portable laptop validation (Ubuntu, GPU-less, 8GB RAM)

Build under test: Linux x64 portable, hash `0a19fb4` (later cleanup on top,
hash c9c6fbf, merged to master).

VERIFIED on the laptop:
- **Taskbar/dock branding** — the app shows "Cubric Vision" + our logo in the
  taskbar (was "Electron" + default icon). First-run `setup-desktop.sh` per-user
  `.desktop` + hicolor icon path works.
- **Additive models folder** — installed in the default folder, then repointed
  the models folder in Settings to a pre-existing `/home/<user>/CubricModels`
  holding `checkpoints/SDXL_Realistic.safetensors`. The model shows as
  INSTALLED, and there is **NO false "no models" popup**. Confirms the two-block
  additive YAML + status-check fallback to the default root (FIX 5).
- **No-models popup** (FIX 2) — already verified on the Windows build; not
  re-triggered here because models were present.

NOT validated (hardware limit, not a bug — deferred):
- **CPU generation** — starting a generation makes the ComfyUI process die
  mid model-load ("ComfyUI process exited" → frontend "failed to become ready").
  Root cause: 8GB RAM is below our advised 16-32GB; SDXL fp32 on CPU OOM-kills.
  Filed as MPI-53 (diagnostics: capture exit code/signal + clear OOM message;
  low-RAM detection / fp16 CPU load). User OK'd merging MPI-8 without CPU-gen.

Still pending (Linux/mac, when hardware available): a generation on an
in-spec machine, comfy-cli CPU-torch waste (MPI-52), macOS first build (icon.icns,
plutil name, dock icon, additive-folder re-test).
