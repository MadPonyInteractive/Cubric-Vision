# Checklist

- [ ] Define explicit build-stage/build-metadata source for the app.
- [ ] Send stage/version/build metadata from the reporter to `/github/create-issue`.
- [ ] Apply `stage:<x>`, `auto-report`, and build/version labels when creating GitHub Issues.
- [ ] Verify fallback behavior when stage/build metadata is absent.
