# MPI-73 Validation

State: USER-VERIFIED 2026-06-14 (renderer-only, no rebuild). Live remote on an RTX A4500 Pod.

## Verified live (USER, boot auto-reconnect after a Stop-not-Delete quit)

- Bug 1 / feedback: boot auto-connect shows `connecting · offline` (hero, no GPU card) + `IDLE · Connecting` (status bar); resolves to `remote · online` + Pod card + `IDLE · Remote` once the preview WS actually opens. No false "Generation failed" / "Remote engine not connected" popup at boot.
- Cue disabled during the transition (button greyed; click + run-hotkey no-op); re-enables on connect.
- WS handshake: "Remote engine ready" success toast (NOT the earlier false "almost ready") — confirmed after the `remoteEngineClient.refresh()` fix that stopped connect() falling back to the local ws.
- Models hero stat: now re-syncs on the connected edge (was stale until a navigation forced a re-check). Confirmed it updates a few seconds after connect without navigating.
- Local GPU line during boot auto-connect: no longer lingers under `connecting · offline` (the late `/system/gpu-info` fetch re-painted it over the cleared card; `_renderGpu` now also skips when a transition phase is active). Boot + Settings-button connect now behave the same. USER-VERIFIED.

## Known residual (accepted, not a blocker)

- ~30s between the Pod actually being ready (confirmed in the RunPod browser console) and the app displaying connected. Cause: wrapper-health poll cadence (4s interval + 5s fetch timeout) plus the preview-WS handshake stacking. User flagged as not a concern; left as-is rather than risk the connect-correctness logic for a cosmetic delay. Candidate follow-up if it becomes annoying.

## Not yet exercised live (Bug 2 specific)

- Stop on a STARTING/queued job with no prompt_id (WS down) — logic verified by code trace; the live trigger (queue a job during a WS-down window) was not specifically reproduced this session. The connecting-state Cue-disable now largely prevents reaching that state from the UI.
