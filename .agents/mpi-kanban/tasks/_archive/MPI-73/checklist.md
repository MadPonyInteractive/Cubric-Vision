# MPI-73 Checklist

- [x] Bug 1 — gate "Connected"/ready on the preview-WS actually open (+ comfyReady), not wrapper-health alone; refuse generation until truly ready
- [x] Bug 2 — Stop clears a STARTING/queued CUE job with no prompt_id / live WS, and the queue does not silently re-hang on the next promoted job
- [x] Connecting/disconnecting feedback — hero card (`connecting · offline` / `disconnecting · online`, no GPU card) + status bar (`IDLE · Connecting` / `IDLE · Disconnecting`); driven by `remote:connection` phase mirrored into `state.remoteEnginePhase`
- [x] Cue button disabled during a transition (button + hold-gesture + run-hotkey), read from `state.remoteEnginePhase` at mount (race-free for late-mounted PromptBox) + on `state:changed`; `ensureServerRunning` backstop demoted to an info toast
- [x] WS handshake correctness — `ensureWsConnected` retries across its window AND `await remoteEngineClient.refresh()` first (boot bypasses ensureServerRunning, so the WS token/base must be loaded or connect() falls back to local ws → false "almost ready")
- [x] Models hero stat re-sync on the remote connected edge (boot model check ran pre-connect → stale `N / N`)
