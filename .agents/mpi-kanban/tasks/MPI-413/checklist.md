# MPI-413 Checklist

- [x] Phase 2a — curated input + generated lock
- [x] Phase 2b — generator + drift check
- [x] Phase 2c — consumer (one-pass install, per-node steps disabled)
- [x] Phase 2d — anti-drift docs (playbook + rule)
- [x] Phase 2 real-engine verification on the Linux box (2026-08-04) — 1 pip pass,
      0 triton/nvidia, torch untouched at +cpu, 47 already-satisfied, marker idempotent
- [x] Phase 1 residual — CLOSED AS SUPERSEDED (`--no-deps` makes a local PIP_CONSTRAINT
      structurally unable to matter; see plan.md § Phase 1 disposition)
- [x] Pod convergence — code written (Dockerfile + wrapper.py + build-context copy + docs)
- [ ] Pod convergence — SHIP IT: publish wrapper to R2 `dev` → test → promote, THEN build
      the image. **Both are user-authorized live ops.**
- [ ] After the Pod ships — delete the now-dead local set together: `requirementsDrop` +
      `_filterRequirements` (routes/downloadManager.js), their `nodesDeps.js` entries,
      `tests/requirements-filter.test.cjs`, and the `install_command` / `pip_pins`
      passthrough at `routes/remoteModels.js:412-417`
