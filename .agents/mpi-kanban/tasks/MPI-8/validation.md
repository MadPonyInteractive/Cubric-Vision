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

No portable distribution implementation validation has been performed yet.

Expected final validation is listed in `plan.md` under `## Verification`.
