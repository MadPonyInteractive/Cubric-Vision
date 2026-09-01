# MPI-682 Checklist

- [x] Phase 1 — server guard unblocked
  - [x] `_flowRequiredDepIds(excludeUninstallId)` skips the owning flow's key
  - [x] Threaded at BOTH call sites (`_localSharedDepsMap:269`, `_remoteSharedDepIds:519`)
  - [x] Exported for test
  - [x] `tests/flow-uninstall-guard.test.cjs` passes; mutation-checked (drop the exclude
        branch → assertion 1 fails on `minimax-music3-dit`)
- [x] Phase 2 — Uninstall button in the Flow Library drawer
  - [x] `MpiOkCancel` mounted + destroyed in `el.destroy()`
  - [x] Button only when flow is `available` AND has own `requiredDeps`
  - [x] `_uninstallFlow` → `downloadService.uninstall(flowDepKey(id), ownDeps, true)`
  - [x] `download:uninstalled` listener toasts (no paint there — the cache is still
        pre-uninstall at that instant)
  - [x] repaint is `await reSyncInstalledModels()` in `_uninstallFlow`, which ends in
        `models:checked` → `_patchAllAffected`. This was NOT how phase 2 shipped; see
        phase 3.
  - [x] `tests/desktop/flow-uninstall-button.spec.js` passes; mutation-checked twice
        (model id instead of the flow key → fails; drop the deps gate → fails)
- [x] Phase 3 — live proof, isolated instance over HARDLINKS to the real weights
      (the user's engine was busy with another agent's GPU smoke tests)
  - [x] Music Maker uninstalls; the 3 real weights leave disk and the drawer repaints
        with no restart — footer, deps row, tile badge and header count all flipped
  - [x] `voice-changer` uninstall leaves `chatter-box`'s 3 shared deps on disk, both
        tiles stay Ready, toast names the reason
  - [x] User's `G:/CubricModels` verified intact afterwards (132 files, 193.3GB)
  - [x] Re-run on the customRoot resolver branch (an `extra_model_paths.yaml` like
        theirs) — identical result; that is the branch their machine actually takes
  - [x] **Caught a real defect the plan had ruled out** — no repaint, because
        `downloadService` re-syncs only in its SSE listener and no EventSource exists
        until a download starts. Fixed with `await reSyncInstalledModels()`; pinned.
- [x] MPI-681 fan-out, live: `models:checked` DID fire for a deps-only change (that is
      what repainted the drawer). Proven in the uninstall direction only — the install
      direction would need a 13.4GB download.
- [x] Docs — `docs/playbooks/add-flow/04-overlay-and-shell.md` (flows.md is a pointer only),
      `docs/download-manager.md` beside the MPI-310 guard entry

All three phases verified — see `validation.md`. 874/874 node tests, 46/46 desktop specs,
and a live run against real weights that found and fixed a repaint defect.
