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
- [ ] Pod convergence — SHIP IT to **dev only**. **Every step is a user-authorized live op
      — ask before each.** `promote` is NOT here: it is a release gate (plan.md § Plan
      drift, 2026-08-04).
  - [ ] `./publish-runtime.sh dev` in `c:/AI/Mpi/mpi-ci/cubric-vision-pod`
  - [ ] Recreate the Pod from the **Windows dev app** (only a BOOT re-fetches wrapper.py;
        `restart-comfy` does not). Verify `wrapperVersion === 0.2.41`, connect reaches
        comfyReady, one generation, and a **VideoHelperSuite** video op — VHS is the one
        node whose pip step the new wrapper removed
  - [ ] `build-pod-image` → new dev tag. Its MPI-341 `IMPORT FAILED` grep is the one card
        metric the Linux box could not measure
  - [ ] Test the new dev image + dev wrapper together (the real target state)
  - [ ] Bump `WRAPPER_VERSION` `0.2.36` → `0.2.41` and `POD_IMAGE_VERSION_DEV` /
        `POD_IMAGE_VERSION_CPU_DEV` to the new tag in `routes/remotePodLifecycle.js`;
        restart the app. Dev-only pins — no released user is touched
- [ ] DEFERRED TO THE NEXT RELEASE (not this card): `./publish-runtime.sh promote` + the
      stable `POD_IMAGE_VERSION` bump. `mpi-release`'s manifest-drift precondition is the
      backstop
- [ ] After the Pod ships — delete the now-dead local set together: `requirementsDrop` +
      `_filterRequirements` (routes/downloadManager.js), their `nodesDeps.js` entries,
      `tests/requirements-filter.test.cjs`, and the `install_command` / `pip_pins`
      passthrough at `routes/remoteModels.js:412-417`
