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

## REMAINING — USER live Pod test (the yellow gate)

Cannot be automated (live RunPod ops are USER-only). On a v0.4.8 Pod:

1. [ ] Spin a v0.4.8 GPU Pod (cu124 card and/or cu128/Blackwell card).
2. [ ] `GET /wrapper/manifest` returns the provenance fields (schema 1, wrapper 0.2.10,
       cuda_profile, comfyui_ref, manifest_version).
3. [ ] Install a model → manifest still has the provenance fields AND the new models[] entry
       (stamp + model-record coexist, no clobber).
4. [ ] Stop → Start the Pod → manifest survives with models[] + initialized_at intact.
5. [ ] A compatible Pod generates with NO gate (the common path — must not false-block).
6. [ ] (Optional, proves the block) temporarily point the app's MANIFEST_SCHEMA_MAX below the
       Pod's schema, confirm the 409 → warning toast fires before any generation.

Until 1-5 pass on hardware, this stays maturity: validating.
