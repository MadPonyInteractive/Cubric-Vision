# MPI-334 — Validation

## Dev-verified (npm start, 2026-07-22)

- **Portable gate:** dev boot logs `[update] dev/non-portable build (v1.1.0) — update check skipped`; no popup. ✅
- **Popup renders** via dev-force flag (`localStorage 'mpi_dev_force_update'='9.9.9'`) → MpiOkCancel "Update available … v1.1.0 → v9.9.9". ✅
- **3× dismiss mute:** LATER ×3 → `dismissed (1/3)(2/3)(3/3)`, 4th reload → `v9.9.9 available but muted (dismissed 3x)`, no popup. ✅ Only explicit LATER counts (reload/Escape do not — MpiOkCancel emits 'cancel' on button only).
- **Update Now (dev):** invokes `run-update` → main returns `not-portable` → `[update] run-update failed: not-portable`. IPC wiring proven end-to-end. ✅

## Build-verify only (real portable build — NOT dev-testable)

- **Real GitHub fetch + compareSemVer:** `check-for-update` hits `api.github.com/repos/MadPonyInteractive/Cubric-Vision/releases/latest`, strips `v`, compares vs package.json version. (Dev is gated out; sandbox had no network.)
  - Note: while 1.1.0 is unreleased, `releases/latest` 404s → `[update] check failed: GitHub API 404` → no popup (graceful). Feature goes live once a GitHub release exists.
- **Real quit + spawn:** OK → `run-update` spawns `update.bat`/`.sh`/`.command` detached + `app.quit()`. Script (already hardware-validated) downloads+applies+relaunches.

## Files
- main.js — `check-for-update` + `run-update` IPC handlers, `spawn` import
- js/services/updateChecker.js — renderer glue (compare, mute, dialog)
- js/core/storageKeys.js + storage.js — `UPDATE_DISMISSED` key + get/set
- js/init.js — `checkForUpdate()` after shell boot
