# MPI-341 — validation

## Verified (2026-07-23)

- **`--quick-test-for-ci` exit-code semantics** — read upstream `main.py` at BOTH `v0.27.0`
  (our current `node_lock` core pin) and `v0.28.0` (the MPI-342 target): `if
  args.quick_test_for_ci: exit(0)`, unconditional. `nodes.init_extra_nodes` only LOGS
  `IMPORT FAILED: <dir>` for custom nodes. => the grep in the Dockerfile layer is the actual
  gate; the brief's bare `RUN` would have been vacuously green.
- **`PIP_CONSTRAINT` mechanics** — local pip: `list` and `uninstall` ignore it (exit 0, no
  error), and a constrained resolve really is forced (`certifi==0.0.1` in the file →
  `Collecting certifi / Using cached certifi-0.0.1.tar.gz`, not latest).
- Dockerfile parses as intended by inspection only — **no build has been run**.

## Outstanding (needs the dev-tag build — rides with MPI-342)

1. Build to the MPI-340 **dev** tag; the smoke-test layer must PASS on a clean build.
   Do NOT rebuild the released v0.16.0.
2. **Prove the smoke test bites**: temporarily drop the `kornia==0.8.2` pin, rebuild,
   confirm the build FAILS at the smoke-test layer on the LTXVideo import. Restore the pin.
3. **Prove the constraints bite** (cheap, same build): `pip list` in the final image still
   shows `+cu130` for all three torch packages, and `/opt/constraints.txt` is non-empty with
   the three `==...+cu130` lines.
4. Connect a dev Pod and run one LTX gen (the node pack the trap targets).

## Known coverage gap (do not try to solve here)

The smoke test only covers IMAGE-BAKED nodes. Code-only volume nodes (MpiNodes,
VideoHelperSuite, UltimateSDUpscale, PainterI2Vadvanced) install at connect and do not exist
at build time — unverified by this layer.
