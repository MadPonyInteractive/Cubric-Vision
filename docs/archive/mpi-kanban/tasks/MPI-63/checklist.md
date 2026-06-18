# MPI-63 Checklist

- [x] Tried CubricVision.app no-terminal launcher — FAILED on M4 (Rosetta + uv_cwd EPERM)
- [x] Reverted to start.command (proven terminal launcher)
- [x] Diagnosed real blocker: Gatekeeper download quarantine (confirmed via xattr -dr on M4)
- [x] Added setup.command (one-time quarantine clear) + build wiring
- [x] Updated macos/README.txt (lead with setup.command step) + handed commands to docs site
- [x] Shipped in 0.0.12 (.app removed)
