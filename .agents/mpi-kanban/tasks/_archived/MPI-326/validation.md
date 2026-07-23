# MPI-326 — Validation

## Fix (shipped this session, committed)
- **Fix A (root)** `js/shell.js:1370` — edge-guard the connect-sync:
  `if (connected && !_wasRemoteConnected)`. The connection heartbeat
  (`_initRemoteStatusFeed`) re-emits `remote:connection {connected:true}` every
  ~5s for the live cost badge; without the edge guard the listener re-ran
  `syncModelInstalled()` every 5s. MPI-200 pod-swap re-check preserved — a swap
  routes through the disconnect edge (`shell.js:1401`) which resets
  `_wasRemoteConnected=false`.
- **Fix B (defence in depth)** `js/data/modelRegistry.js:223` — module-level
  `_lastEmittedInstalledKey`/`_lastEmittedDriftedKey`; the `models:checked` emit
  early-returns when neither set changed, so any redundant re-sync stays silent.
  Protects all 6 consumers at once (PromptBox dropdown, GalleryBlock slider,
  AppLibrary, ModelManager, heroStats, shell `s_installedModelIds`).

`node --check` clean on both. All `syncModelInstalled` / `reSyncInstalledModels`
callers swept — none relies on a no-op re-emit.

## Remote runtime proof — PASS (RTX PRO 4000 Pod, volume cubric-vision-EU-RO-1, 2026-07-21)
Fresh app launch (JS with the fix), connected, sat idle:

- **A — Network `models` filter: 0/32 requests over ~20s idle.** No
  `/comfy/models/check`, no `/wrapper/models/status` 5s poll. Root killed by Fix A.
- **B — Op dropdown:** opened, hovered, held ~15s → stayed open, no flash, no
  auto-close. Branch 1 (`_refreshOpDropdown` teardown) dead.
- **C — Denoise slider:** dragged slow in the Krea2 popup, held 0.71 → tracked
  the drag, no snap-back. Branch 2 (`setModelList → _refreshOpSlot` rebuild) dead.

No poll → no `models:checked` fan-out → no rebuild. Both symptoms gone at the source.

## Result
Remote-verified. Card → done.
