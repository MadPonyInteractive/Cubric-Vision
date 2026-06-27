# MPI-85 Validation

**VERIFIED by user 2026-06-15.** All in-app checks below confirmed.

## Files changed
- `js/core/storage.js` — new `autoConnectOnStart` flag in DEFAULT_RUNPOD_CONFIG + normalize.
- `js/shell.js` — boot gate branches on `autoConnectOnStart` (was `enabled`); auto-start ComfyUI gate likewise; symmetric `syncModelInstalled()` on disconnect edge.
- `js/services/comfyController.js` — `_ensureRemoteReady` not-ready branch now flips remote mode off + refreshes + re-enters `ensureServerRunning` (local) + one-time `ui:info` toast, instead of throwing.
- `js/components/Compounds/LandingPages/MpiSettings/MpiSettings.js` (+ `.css`) — auto-connect sub-checkbox under Enable; reworded Enable hint.

## Verify in-app
- [ ] Enable RunPod ON, **auto-connect OFF (default)**, relaunch → app boots LOCAL (status bar LOCAL), hit Generate → runs on the local engine, NO bug-reporter modal, one-time "running locally" toast.
- [ ] **Auto-connect ON**, relaunch → a Pod auto-connects at start (status bar flips to Remote when ready).
- [ ] **Mid-session disconnect** (Disconnect, or Pod OOM/drop) → next Generate falls back to local seamlessly + toast; the model picker drops to local-only models and a stale remote-only selection swaps to a local one.
- [ ] Enable RunPod ON **with a connected Pod** → still routes remote (no regression).
- [ ] Settings: the "Automatically connect on app start" checkbox appears indented under Enable only when Enable is ON; toggling it persists across relaunch.

## Notes
- No gen-time "Connect to use this model" guard: `/comfy/models/check` is engine-scoped, so remote-only models are simply absent from the local list; the disconnect re-check + `setModelList` fallback handle the swap (per user direction 2026-06-15).
- Recursion safe: after the fallback flips backend `active:false`, the re-entered `ensureServerRunning` re-runs `refresh()` → `isRemote()` false → local path, never re-enters `_ensureRemoteReady`.
