# MPI-95 Checklist

- [x] App: indeterminate "Preparing…"/"Verifying…" bar infra (MpiInstalledDisplay) + thread through service/manager
- [x] App: `_onRemoteInstallEvent` handles `models:install-verifying` → indeterminate Verifying…
- [x] App: dropped redundant app-side HEAD pre-seed (wrapper owns the denominator now)
- [x] Wrapper: `_resolve_total` HEAD seed of `rec["total"]` (kills ~80% jump)
- [x] Wrapper: emit `models:install-verifying` before sha256 (kills 99.9% hang)
- [x] Verify local download path untouched (no indeterminate/phase on local code path)
- [x] Build wrapper via MPI-81 rebuild (USER-run), bump WRAPPER_VERSION both sides — DONE (v0.4.1+ shipped); 80% snap accepted as aria2c -x16 prealloc artifact ([[project_remote_install_progress_truth]])
- [ ] ~~LIVE verify (first attempt)~~ FAILED 2026-06-16: (a) install bar hits 100% then SITS, (b) post-uninstall 36/36GB false. Reassigned to MPI-97 owner.

## Reassigned to MPI-97 owner — follow-up fixes (2026-06-16)

Live-verify failure root-caused to TWO app-side bugs (no image/wrapper change):

- [x] **"Sits at 100%"** = aggregate denominator summed only ARRIVED per-dep totals; a not-yet-emitting dep counted as 0 → bar hit 100% while it was still pending. Fix: `_depDenominator(d) = max(realTotal, registry seedBytes)` floors every dep in the denominator from job creation. Applied to both `_onRemoteInstallEvent` branches + `_recalculateModelJobProgress` (`routes/downloadManager.js`).
- [x] **Post-uninstall "36.5/36.5GB" + PARTIALLY INSTALLED contradiction** = model partial because ONE 144KB per-model custom_node (`ComfyUI-PainterI2Vadvanced`) was missing, but its tiny byte size left the bar at ~100%. TWO fixes: (1) the keep-uninstall (MPI-97 Phase 5) was DELETING per-model custom_nodes even on "keep files" — removed the `dep.type !== 'custom_nodes'` carve-out so keep means keep everything; (2) the card's partial bar is now driven by dep COUNT and clamped to ≤0.99 so a missing small dep can never render a full bar (`MpiModelManager.js`, both render blocks).
- [ ] USER live-verify after app restart (loads new route + renderer): see validation.md
