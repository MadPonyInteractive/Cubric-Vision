# MPI-65 Validation

## 2026-06-10

- PASS: registry comparison reports no missing active operations between `COMMANDS`, `OPERATION_REGISTRY`, `UNIVERSAL_WORKFLOWS`, and `operation_registry.json`.
- PASS: `node --check js/data/releaseNotes.js`.
- PASS: `board.json`, `tasks/MPI-65/task.json`, and `operation_registry.json` parse as JSON.

Remaining validation belongs to Phase 2+ release-health automation.

## 2026-06-10 Phase 2

- PASS: `npm run release:check`.
- PASS: `node --check scripts/release-health-check.mjs`.
- PASS: `python -m py_compile scripts/pre_release_test.py`.
- PASS: `node --check scripts/build-portable.mjs`.
- PASS: portable dry-run smoke with `node scripts/build-portable.mjs --dry-run --no-archive --no-update-bundle --no-source-manifest --stage-dir C:\tmp\cubric-release-health-smoke --clean`; staged `CubricVision-windows-x64-v0.0.11`.

## 2026-06-10 Phase 3

- PASS: `npm run release:check`.
- PASS: `node --check scripts/release-health-check.mjs`.
- PASS: historical runtime release-note versions now have archival markdown coverage for `0.0.1` and `0.0.8`.
