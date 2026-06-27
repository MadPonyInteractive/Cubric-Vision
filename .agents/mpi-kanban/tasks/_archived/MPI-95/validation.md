# MPI-95 Validation

## Status
App half + wrapper half BOTH written. Wrapper half is GATED on the MPI-81
Pod-image rebuild (candidate #5). Full fix only observable AFTER that rebuild.

## Pre-build checks (done)
- `python -m py_compile wrapper/wrapper.py` → OK
- `node -c routes/downloadManager.js` → OK
- eslint (downloadService.js, MpiModelManager.js, MpiInstalledDisplay.js) → clean
- Local download path: no `indeterminate`/`phase` references on the local code
  path (`_startDownload`/`_wireProgress`/`ResumableDownloader`) → local UNCHANGED.

## Pass criteria (LIVE, after MPI-81 rebuild + fresh Pod)
- Remote install, multi-dep model (e.g. a Wan video model = 2×15GB + VAE + CLIP):
  - Bar does NOT snap to ~80%; climbs honestly from a real denominator.
  - At the end, the per-dep hash shows "Verifying…" (animated sweep), NOT a frozen
    99.9% bar.
  - Smooth overall.
- Verified on a small (SDXL ~7GB) and a large (I2V) model.
- Local-mode download path unchanged (regression check).

## Result
- Build gate: ✅ CLEARED — the wrapper half shipped in image v0.4.1+ (MPI-81 candidate #5; all profiles built + public).
- Live verify: ❌ FAILED (2026-06-16, USER on a live Pod). The denominator/aggregation is STILL wrong:
  - After UNINSTALLING a model the card shows `36GB / 36GB installed` — false (should reflect removed bytes / drop to partial-or-not-installed).
  - On INSTALL the bar reaches 100% then sits at 100% for a long time before completing → the aggregate does NOT correctly sum across ALL dependencies (it hits 100% early then waits on an un-counted dep). This is BEYOND the original ~80%-snap (an accepted aria2c -x16 preallocation artifact, see [[project_remote_install_progress_truth]]); the remaining bug is real aggregation math + post-uninstall installed-bytes state, not the prealloc cosmetic.
- NOT done. Reassigned to the MPI-97 session (owns routes/downloadManager.js install/uninstall progress + just fixed the adjacent uninstall-deleteFiles bug — same code family).

## Fixes applied by MPI-97 owner (2026-06-16) — pending re-verify

Live ground truth: probed the running app's `/comfy/models/check` for `wan-22-i2v` while the user had it open on a CPU Pod. All 4 weight deps reported `installed:true`; the ONLY missing dep was `ComfyUI-PainterI2Vadvanced` (a 144KB per-model custom_node) → model AND-flag `installed:false` → PARTIALLY INSTALLED, while the byte bar sat at 36.5/36.5GB. Two real bugs, both app-side:

1. **"Sits at 100%" (install aggregation).** `_onRemoteInstallEvent` summed the denominator from only the per-dep totals that had ARRIVED; a dep whose wrapper install had not emitted its first tick counted as 0 in the denominator, so the ratio hit 1.0 while it was still pending. Fix: `_depDenominator(d) = max(d.totalBytes, d.seedBytes)` — every dep is floored at its registry size from job creation. Applied to both `_onRemoteInstallEvent` branches and `_recalculateModelJobProgress`.
2. **Post-uninstall "36.5/36.5 + PARTIALLY INSTALLED" contradiction.** (a) The MPI-97 Phase-5 keep-uninstall was deleting per-model custom_nodes even on "keep files" (carve-out `dep.type !== 'custom_nodes'`), so unchecking the box still dropped PainterI2Vadvanced → model partial. Removed the carve-out: keep = keep ALL volume deps. (b) The card's partial bar derived only from bytes, so a missing tiny dep rounded to a full bar. Now driven by dep COUNT and clamped ≤0.99 so a missing component is always visible (`MpiModelManager.js`, both render blocks).

## Re-verify (LIVE, after app restart — loads new route + renderer)

App MUST be restarted: route code (`downloadManager.js`) is loaded in memory at boot and does not hot-reload.

1. **Install aggregation:** install a multi-dep model on the CPU Pod → bar climbs from a real denominator, does NOT hit 100% then sit; settles to complete in step with the last dep.
2. **Keep-uninstall keeps everything:** re-install I2V (restores `ComfyUI-PainterI2Vadvanced`), then uninstall with "delete files from disk" UNCHECKED → model stays FULLY installed (NOT partial); every dep incl. the per-model node remains on the volume.
3. **Delete-uninstall removes:** uninstall with the box CHECKED → bytes removed.
4. **Partial bar honest:** for any genuinely partial model (missing a small dep) → bar reads < 100%, never a full bar under a PARTIALLY INSTALLED badge.
