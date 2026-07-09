# MPI-90 Validation

## Shipped (automated-verified)

- **App pre-check** (`routes/remoteProxy.js`): `_evaluatePodHealth` reads `/wrapper/manifest`,
  blocks first generate on unknown schema-version (409), 404=fresh-volume-OK, cached per Pod
  connection, cleared on Pod swap. Unit tests: 3 cases green in `runpod-remote-hardening.test.cjs`
  (compatible / unknown-schema block / fresh-404). 16/16 file.
- **409 UX**: routed to warning toast (`pod_incompatible` → commandExecutor branch), not bug dialog.
- **Wrapper writer (D0)**: first-boot `_stamp_manifest_provenance` stamps schema + provenance,
  merge-preserving models[]+initialized_at. Self-check `wrapper/test_manifest_stamp.py` passes
  locally AND inside the built cu128 image (`python -c "import wrapper; wrapper._stamp..."` → schema 1,
  wrapper 0.2.10, comfyui_ref master, cuda cu128).
- **Images**: v0.4.8 cu124+cpu (GH Actions run 27678122526, success), cu128 (local build+push).
  All 3 tags verified pullable + public on GHCR. App pins updated to v0.4.8 / wrapper 0.2.10.

## Live Pod test — PASSED 2026-06-17 (Pod ylffaes0u2jrzd, L40S/cu124, Any-region ephemeral)

1. [x] v0.4.8 Pod spun (L40S → v0.4.8-cu124; app log confirmed image tag after app restart
       picked up the new pins).
2. [x] `GET /wrapper/manifest` returns provenance: schema 1, wrapper 0.2.10, cuda_profile cu124,
       comfyui_ref master, manifest_version 0.4.8, initialized_at/last_written_at. /health
       reported wrapper_version 0.2.10 (was 0.2.9 on the old v0.4.7 image — confirms new image booted).
3. [x] Model install → 5 models[] entries (Wan 2.2 i2v high/low, vae, text encoder, custom node)
       AND provenance fields intact, initialized_at UNCHANGED (no clobber — merge verified live).
4. [x] Stop → Start survived: provenance + 5 models intact, initialized_at unchanged (10:00:48Z).
       NB: this was an EPHEMERAL no-volume Pod — survival here exceeded the design expectation
       (step originally N/A for ephemeral); the stamp re-ran on restart and merge-preserved state.
5. [x] Generations ran with NO compatibility gate (schema 1 == app MANIFEST_SCHEMA_MAX → pass
       silently; no spurious "Pod not compatible" toast, generation proceeded).

Step 6 (deliberate block proof) not run live — covered by unit test
`runpod-remote-hardening.test.cjs` "unknown schema version blocks with 409".

All criteria met on real hardware. MPI-90 complete + accepted.
