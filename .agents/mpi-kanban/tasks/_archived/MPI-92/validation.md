# MPI-92 Validation

- 2026-06-15: `node --test tests/runpod-remote-hardening.test.cjs` passed with 13/13 tests.
- 2026-06-15: `node --check` passed for `routes/secretRedaction.js`, `routes/logger.js`, `routes/system.js`, and `tests/runpod-remote-hardening.test.cjs`.
- 2026-06-15: targeted ESLint passed for `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js`.
- Remaining live verification is user-only because the app is in use:
  - Open Settings -> RunPod Remote Engine and confirm the new responsibility copy is visible before Connect.
  - Confirm the added hints mention user-owned billing/storage and Community Cloud being unsupported.
  - If you want a manual secret sweep, trigger one remote-engine failure with a fake key/token and confirm `app.log` / GitHub issue payload text shows `[REDACTED]` instead of raw values.
- 2026-06-15: User completed the live Settings check and approved closing the card.
