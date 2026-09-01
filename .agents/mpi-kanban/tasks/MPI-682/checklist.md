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
  - [x] `download:uninstalled` listener toasts; repaint is `models:checked` (MPI-681),
        deliberately not a second paint off a pre-uninstall cache
  - [x] `tests/desktop/flow-uninstall-button.spec.js` passes; mutation-checked twice
        (model id instead of the flow key → fails; drop the deps gate → fails)
- [ ] Phase 3 — live proof (needs the user's own app; 13.4GB is really on disk)
  - [ ] MiniMax Music uninstalls, 13.4GB freed from `G:/CubricModels`, drawer repaints
        without a restart
  - [ ] Re-install lands (also closes MPI-681's outstanding live check)
  - [ ] `voice-changer` uninstall leaves `chatter-box`'s 3 shared deps on disk
- [x] Docs — `docs/playbooks/add-flow/04-overlay-and-shell.md` (flows.md is a pointer only),
      `docs/download-manager.md` beside the MPI-310 guard entry

Machine verification: 874/874 node tests, 46/46 desktop specs. Phase 3 is the one check an
agent cannot run — it deletes 13.4GB from the user's own disk in their own session.
