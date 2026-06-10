# Checklist

- [x] Add app-stage metadata derived from `APP_VERSION` (`js/core/appStage.js`). Build-hash deferred to MPI-8.
- [x] Send app version and stage from `MpiErrorDialog` to `/github/create-issue`.
- [x] Normalize metadata and add Issue body fields in `routes/system.js` (stage re-derived server-side; client value advisory).
- [x] Apply `bug`, `auto-report`, and `stage:<x>` labels when creating GitHub Issues. (`build:<hash>` deferred to MPI-8.)
- [x] Verify fallback behavior when stage/build metadata or dynamic labels are absent (missing build → `unknown`/`alpha`; 422 label → degrade to `bug` + warn).
