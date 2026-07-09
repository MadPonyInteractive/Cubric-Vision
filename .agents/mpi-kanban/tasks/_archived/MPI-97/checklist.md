# MPI-97 Checklist

- [x] Phase 1 — Remote dep attach: in-flight deps skip `toInstall` (no 2nd `remoteInstallDep`), B's bar fills from A's shared SSE — `_startRemoteDownload` in-flight branch (`routes/downloadManager.js`)
- [x] Phase 2 — Cancel respects refCount: shared in-flight dep not wrapper-cancelled while another model still owns it — refCount gate already correct; guard comment added so attach (refCount≥2) is honoured
- [x] Phase 3 — Collision never surfaces as error+GitHub dialog; dep-only `download:failed` (no modelId) no longer dialogs — `js/services/downloadService.js`; backend attach already prevents the collision emit
- [x] Phase 4 — SSE-recover: `openInstallEventStream` onClose → driver reconnects with backoff + reconciles missed completions via `/wrapper/models/status` (no new wrapper endpoint); card never hangs at 100%
- [x] Phase 5 — Remote uninstall honors "delete files from disk" checkbox: unchecked now KEEPS volume bytes (was always trashing them; user lost ~30GB Wan 2.2 T2V) — `routes/downloadManager.js` remote uninstall branch reads `deleteFiles`, populates `keptModelFiles` (renderer already consumes it). Folded in from agent handoff message. **CORRECTED:** removed the `dep.type !== 'custom_nodes'` carve-out (was deleting the per-model PainterI2Vadvanced node even on keep → model dropped to partial). keep = keep ALL volume deps.
- [x] Phase 6 — Wrapper-reachability resilience (3 parts):
  - (a) `wrapperFetch` retried only on 404; a transient **502/503/504** (proxy warming / wrapper upstream dropped) fell through → `/comfy/models/check` failed + uninstall guard safe-aborted → "Uninstall does nothing." Fix: retry 502/503/504 too. Real wrapper 4xx/501 still surface.
  - (b) Retry budget 8s → ~30s (4×2s → 15×2s). Live log proved the 502/404 was a **Pod RESUMING from warm-stop** (auto-reconnect at app start); the wrapper takes 20-60s to answer. 8s surfaced a failure mid-resume; ~30s rides it out so the op self-heals.
  - (c) **Toast, not error+GitHub dialog.** The uninstall safe-abort emitted `ui:error` → MpiErrorDialog with a **REPORT ON GITHUB** button → junk issues for a benign warm-up. Re-routed remote-uninstall-unavailable to `ui:warning` (StatusBar toast). Backend tags `reason:'wrapper-unreachable'` + honest "Pod is still starting up… try again" copy (`routes/downloadManager.js`, `js/services/downloadService.js`). Same family as MPI-94 G1 / [[feedback_no_toast_user_stop]].
- [x] USER live-verify on a no-GPU Pod 2026-06-16 — **PASSED**:
  - Phase 1 attach **proven live**: 4 models installed concurrently (Wan I2V + T2V + PONY Mix + ill-anime); the shared `umt5` showed byte-identical progress on BOTH video models = single download, both attached; NO Download-Failed dialog. All 4 reached `installed=true, missing=none` (incl. `ComfyUI-PainterI2Vadvanced`).
  - Phase 5 keep/delete: keep-unchecked kept files (model stays installed); checked-delete removed.
  - Phase 6a/b 502 retry + budget: uninstall worked through a warm-up window (no restart).
  - Phase 6c toast-not-dialog: got a toast, no error+GitHub dialog.
  - Phases 2 (cancel-safe) + 4 (SSE recover) shipped but not exercised (no cancel pressed, no SSE drop occurred) — defensive, left unverified.
- [ ] NOT part of MPI-97: "Uninstall opens no dialog after an install" is a separate renderer bug → **MPI-99** (new card).
