# MPI-86 Checklist

- [x] Abortable connect poll — `_connectAbort` flag + per-tick check in `_pollEngineReady`
- [x] Cancel button — relabel Connect→"Cancel" (enabled) during connect; `_cancelConnect()` deletes the half-started Pod via `/remote/pod/delete-active`
- [x] Click routing — Cancel→`_cancelConnect`, Disconnect→choice, else→Connect
- [x] GPU-switch auto-cancel — `gpuInst.on('change')` cancels an in-flight connect before adopting the new GPU
- [x] Boot watchdog — second threshold (~5 min) in `_pollEngineReady` fires `onWatchdog` → "taking too long" prompt; prompt-only, no auto-cancel
- [x] Destroy breaks any in-flight poll (`_connectAbort = true`); does not delete the Pod
- [x] `node --check` + ESLint clean
- [x] Settings panel mounts in the running app with no JS error
- [ ] LIVE (USER): Pod stuck past threshold → Cancel → Pod deleted, no orphan billing, Connect re-enabled
- [ ] LIVE (USER): pick a different GPU mid-connect → in-flight Pod auto-cancelled, Connect to new card works
- [ ] LIVE (USER): healthy fast boot completes normally — no premature cancel, no spurious prompt
