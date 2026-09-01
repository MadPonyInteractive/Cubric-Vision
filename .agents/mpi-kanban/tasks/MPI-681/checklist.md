# MPI-681 Checklist

- [x] Implementation
  - [x] `syncModelInstalled()` diff key covers the flow-dep + plugin-dep caches the same
        sync just rewrote (`js/data/modelRegistry.js`)
  - [x] Shared primitive — one key, both `setFlowDepStatus` and `setPluginDepStatus` loops
- [x] Verify
  - [x] `tests/deps-only-install-fanout.test.cjs` — 5 edges, and it FAILS without the fix
  - [x] MPI-326's heartbeat guard intact (no-change re-sync stays silent)
  - [x] Regression: 6 neighbouring suites, 78 pass / 0 fail; eslint clean
  - [x] `plugin:` / `app:` consumer sweep (see `validation.md`)
  - [ ] Live drawer check — NOT run, deliberately: the weights are already on disk, so a
        repro costs a 13.4GB uninstall + re-download. Rationale in `validation.md`.
- [x] `docs/download-manager.md` entry beside MPI-607 (same symptom, opposite cause)
