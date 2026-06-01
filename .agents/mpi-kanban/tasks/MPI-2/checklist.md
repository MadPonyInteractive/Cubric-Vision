# Checklist

- [ ] Add app-stage and build-hash metadata exports beside `APP_VERSION`.
- [ ] Send app version, stage, and build hash from `MpiErrorDialog` to `/github/create-issue`.
- [ ] Normalize metadata and add Issue body fields in `routes/system.js`.
- [ ] Apply `bug`, `auto-report`, `stage:<x>`, and `build:<hash>` labels when creating GitHub Issues.
- [ ] Verify fallback behavior when stage/build metadata or dynamic labels are absent.
