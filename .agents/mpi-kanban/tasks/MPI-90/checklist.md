# MPI-90 Checklist

## D0 — Wrapper/image writer (mpi-ci, USER ships; dependency)
- [ ] Manifest stamps schema_version + wrapper_version + comfyui_ref + workflow_bundle_version at first boot
- [ ] Stamp survives Pod stop/start; verified live by USER

## Phase 1 — App pre-check route (ships now)
- [x] Backend fetches GET /wrapper/manifest via wrapperFetch (low retry: 404 is a legit fresh-volume signal, not transient)
- [x] App max-known schema_version defined as one constant (MANIFEST_SCHEMA_MAX)
- [x] Returns structured verdict { ok, block } (warns deferred to D0 — no fields yet)
- [x] 404 → ok:true (fresh volume valid, never a block)

## Phase 2 — Gate first remote generate
- [x] Pre-check called before first /wrapper/prompt, cached per Pod connection (one fetch/connection)
- [x] block verdict → 409 → renderer warning toast (not bug dialog), no dispatch
- [x] verdict cache cleared on Pod swap (setRemoteMode)
- [x] compatible Pod generates with no gate
- [~] bundle mismatch pre-empt — deferred to D0 (wrapper doesn't write the field yet); wrapper 409 stays the backstop
- [x] tests: 3 cases (compatible / unknown-schema block / fresh-404) green in runpod-remote-hardening.test.cjs

## Phase 3 — Warn surface (needs D0)
- [ ] Incomplete models warn (reuse resume-download)
- [ ] Version drift = provenance warn in status panel only
- [ ] Old image (missing fields) → no false block, no spurious warn

## Guards
- [ ] No Reinitialize/Repair flows reintroduced (Design-A out of scope)
- [ ] Degrades gracefully on missing manifest / missing fields
