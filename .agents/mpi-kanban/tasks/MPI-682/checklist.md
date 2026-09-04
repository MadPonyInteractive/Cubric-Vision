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

- [x] Phase 4 — REOPENED 2026-09-02. The user's own uninstall of Text to Speech freed
      0 bytes, which phases 1–3 could not have caught: MiniMax has no `targetPath` dep.
  - [x] Root cause, from the user's `app.log`, not inferred — 11 × `refused to trash
        outside managed models root`. The loop resolves a `targetPath` dep on the ENGINE
        (MPI-222) then tested containment against `managedModelsRoot`, which such a path
        can never be inside. Every `targetPath` weight was undeletable, app-wide.
  - [x] `_uninstallAllowedRoot(dep, roots)` — one root per dep class, extracted and
        exported; the two rails collapse into one that tests against it
  - [x] Second bug found in the same read: `isInModelsFolder` used the same fixed root,
        so `deleteFiles: false` DELETED engine-anchored weights it promised to keep
  - [x] `tests/uninstall-allowed-root.test.cjs` — 5 assertions over the real registry;
        mutation-checked twice (old root → assertion 1 fails; containment defeated →
        assertion 5 fails)
  - [x] C — `(flow)` added to the sentinel filter (it leaked as a literal holder name),
        and `MpiModelManager` now returns early on a flow key: the Flow Library already
        toasts, so a flow uninstall fired two, one of them printing the raw `flow:<id>`
  - [x] `docs/download-manager.md` — the trap recorded beside the MPI-222 targetPath entry
  - [x] **Live, 2026-09-04, the user's own app** — `removed 11, kept 1 universal,
        2 shared, 0 model files, swept 0`. 11 files left disk, `chatterbox_vc/` stayed,
        Voice Changer stayed Ready, the drawer repainted with no restart, and ONE toast
        named the flow. Re-installed: back to Ready, 13 files / 6.95GB, no restart.
  - [x] **The install direction is proven** — `models:checked` fans out on the way IN as
        well as OUT. The one thing this card could never show.
