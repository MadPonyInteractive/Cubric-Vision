# MPI-95 Checklist

- [x] App: indeterminate "Preparing…"/"Verifying…" bar infra (MpiInstalledDisplay) + thread through service/manager
- [x] App: `_onRemoteInstallEvent` handles `models:install-verifying` → indeterminate Verifying…
- [x] App: dropped redundant app-side HEAD pre-seed (wrapper owns the denominator now)
- [x] Wrapper: `_resolve_total` HEAD seed of `rec["total"]` (kills ~80% jump)
- [x] Wrapper: emit `models:install-verifying` before sha256 (kills 99.9% hang)
- [x] Verify local download path untouched (no indeterminate/phase on local code path)
- [ ] Build wrapper via MPI-81 rebuild (USER-run), bump WRAPPER_VERSION both sides
- [ ] LIVE verify on a fresh Pod after rebuild: no 80% jump, Verifying… at end, smooth
