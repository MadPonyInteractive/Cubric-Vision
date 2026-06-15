# MPI-96 Validation

## Done (this session)

- `node --check` clean on both edited files (`routes/remoteProxy.js`,
  `MpiSettings.js`).
- `require('./routes/remoteProxy.js')` loads with no error.
- ESLint clean on `MpiSettings.js`.
- `_pollEngineReady` has a single call site — the added `onNotRunning` 3rd
  positional arg breaks no other caller.
- `clientLogger.warn(category, message)` arity matches (2 args).
- Dead-Pod cleanup uses `/remote/pod/delete-active` (targets the tracked Pod;
  the EXITED Pod IS the tracked one) — NOT `cleanup-orphans` (which spares the
  tracked id) — so the dead Pod stops billing container disk. Saved `podId` +
  `wasConnected` cleared so the next Connect creates fresh.

## What changed

- Backend `GET /remote/comfy/status`: when the wrapper `/health` isn't ready,
  attaches `podStatus` from a throttled (12s TTL) `client.getPod` read of
  RunPod's `desiredStatus`.
- Renderer `_pollEngineReady`: a terminal not-running status
  (EXITED/TERMINATED/DEAD) past a 30s grace stops the loop early and fires
  `onNotRunning`; the connect flow then deletes the dead Pod, resets the bar to
  0, and shows "Pod failed to start on its RunPod host — pick another GPU."
- Healthy slow-boot (RUNNING but wrapper not ready) is unchanged — still waits
  the full timeout. The MPI-86 time-based watchdog is untouched (complementary).

## USER live-verified on hardware (2026-06-15) — ACCEPTED

- Forced the not-running path with the env stub (`CUBRIC_TEST_POD_EXITED=1`):
  on Connect the bar did NOT crawl to 99% — within ~30s status flipped to
  "stopped", the yellow "Pod failed to start on its RunPod host…" hint showed,
  Connect went live, and the Pod was deleted from the RunPod console. Confirmed
  on the boot auto-connect path (the path the user actually uses). Both UI and
  RunPod console screenshots match.
- Stub removed (env-gated, removed before commit; grep-clean, no refs).
- Regression: after restart with plain `npm start`, a real L4 Connect booted to
  ready normally — the bail does NOT false-trip a healthy connect.

Note: the stub overrides real status, so it proves the bail/delete/message/
bar-stop mechanism but not the grace-window discrimination on a *genuine*
phantom Pod (slow-boot survives vs dead-host bails). The healthy-L4 reconnect
covers the "must not false-trip" half; a real bad-host event in the wild would
exercise the other half. Accepted as sufficient.

## A second path was found + fixed mid-test

The boot auto-connect (`js/shell.js` `_pollRemoteReady` / `_initRemoteBoot`) had
the SAME fake-99% bug, on a separate code path from Settings Connect. Extended
the fix there too (bail on EXITED/TERMINATED/DEAD past grace → delete dead Pod +
"Pod failed to start on host" dialog + clear saved podId). Live-verified on the
boot path specifically.
