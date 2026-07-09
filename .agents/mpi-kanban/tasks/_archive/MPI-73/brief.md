# MPI-73 Brief — Remote connect-readiness gate + cancel a not-started queued job

Two related remote-engine UX bugs found live 2026-06-13 during MPI-64 testing (branch RunPod); connects to B4 part 2/4 (readiness/reconnect state).

## BUG 1 — premature 'Connected' before the Pod preview-WS is ready

On boot auto-reconnect (and Settings Connect), the app shows 'Connected' / IDLE·REMOTE while the Pod is still RESUMING and the binary-preview WebSocket is NOT up. Live evidence: restart 07:29 → reconnect 07:30:00 → 'Pod resume kicked off' 07:30:03 → 'WebSocket error (may be transient)' 07:30:27; console `WebSocket connection to wss://igcx9udiw5471i-8889.proxy.runpod.net/ws... failed`. Trusting 'Connected', the user queued 2 I2V jobs → the RUNNING job hung in STARTING because the WS never connected → nothing generating on the Pod (telemetry VRAM 1% / GPU 0%). Worse form of the logged stale-connection-feed bug.

FIX: gate the 'Connected'/ready signal on the preview WS actually being open (or /remote/comfy/status ready AND a successful WS handshake), not just the Pod resume kickoff; show 'connecting…' and guard generation until truly ready.

## BUG 2 — Stop/Cancel can't clear a STARTING job with no prompt_id

When a CUE job is STARTING (never got a prompt_id because the WS never connected), STOP is a no-op — exec.cancel() → comfyController.interrupt() POSTs /proxy/interrupt but there is no running ComfyUI prompt to interrupt → the renderer job state never clears → queue hangs (1 RUNNING / 1 QUEUED), repeated STOP does nothing.

FIX: a client-side cancel that clears a STARTING/queued CUE job WITHOUT a prompt_id / live WS — if no prompt_id assigned, end the generation locally (activeGenerations.end + clear the Cue job) instead of relying on the interrupt. NOTE: a SINGLE healthy gen's Stop DOES work (verified this session, ~5s + Pod VRAM drops); this bug is specific to a job that never started on the Pod.

## REPRO

Remote mode, Pod stopped/resuming → restart app (boot auto-reconnect) → queue 1-2 I2V jobs as soon as 'Connected' shows → running job hangs in STARTING, STOP does nothing.

## VERIFY

'Connected' only appears once the preview WS is open and generation is not accepted before then; STOP on a STARTING/queued job clears it immediately even with no live WS.

## Scope addition (2026-06-14)

Connecting/disconnecting feedback in two surfaces: the projects-page hero engine card (`connecting · offline` / `disconnecting · online`, no GPU card during the transition) and the status bar (`IDLE · Connecting` / `IDLE · Disconnecting`).

---

Distinct from the backend stream-pipe crash (fixed dcd3482) and from B0/B4 part 1+3 (committed). Found during MPI-64 (RunPod Remote Engine).
