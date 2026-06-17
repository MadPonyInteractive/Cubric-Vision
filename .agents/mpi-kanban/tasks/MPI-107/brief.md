# MPI-107 — Remote per-model restart poll watches wrong readiness flag

## Symptom (live, L4 remote, Wan 2.2 i2v)
Two faces of one bug:
1. Cancel a remote gen, tweak params, regen → toast "not connected, generating locally" even though Pod is alive. Console: `POST /proxy/interrupt 503` + `[generationService] Generation completed but no output returned`.
2. Regen i2v → dialog "Generation failed: The remote engine is still loading the new nodes — give it a moment, then try again." Stack: `_ensureRemoteReady (comfyController.js:329)`.

Pod telemetry throughout: alive, 27m uptime, GPU 0% (never ran the gen).

## Root cause
`comfyController.js:319` (remote per-model-restart poll):
```js
if (s.ready) { ready = true; break; }
```
`s.ready` = WRAPPER health. On a `/proxy/restart-comfy` the wrapper never goes down — only the ComfyUI subprocess reloads. The flag that actually flips is `s.comfyReady` (`comfy_ready`). Comment at line 312 already says "Poll wrapper health until comfy_ready first" — code does the wrong thing.

Consequences, stacked:
- Wrong flag → poll breaks too early (false-ready → gen against not-yet-up ComfyUI → 503/interrupt-503/no-output) OR never matches → 240s timeout → line 329 throw.
- `comfyNeedsRestart` only clears (remote) at line 322, behind the broken poll → never clears → every i2v gen re-loops restart.
- Restart-timeout silently falls to LOCAL (line 355) → POSTs `/remote/mode {active:false}` → Pod orphaned (alive + billing, app disconnected) → "generating locally" toast.

`comfyNeedsRestart` itself was set legitimately: a Wan-i2v custom node installed onto the Pod volume this session (downloadManager.js:786, gated on wrapper `needs_comfy_restart`). Not a spurious set — the bug is that it can't clear.

## Reference
- `js/shell.js:653` already uses the correct gate: `s.ready && (s.noGpu || s.comfyReady === undefined || s.comfyReady)`.
- `routes/remoteProxy.js:427` exposes `comfyReady: !!health.comfy_ready` in the status payload.
- Memory: [[project_remote_comfy_restart_v042]] (wrapper owns+supervises ComfyUI; restart-comfy reloads only ComfyUI), [[project_wrapper_fetch_502_retry]] (transient wrapper errors must retry, not fail hard).

## Fix scope (app-only, no Pod rebuild)
1. comfyController.js:319 → poll `comfyReady` (compat: `comfyReady === undefined` for old images).
2. On restart-poll timeout: do NOT silent-fall-to-local; keep `_mode.active` true, surface a retry message. (line 325-329 already throws a message — the issue is the fall-to-local path at 355 firing on transient probe miss.)
3. Verify flag clears on success so the restart loop doesn't re-fire every gen.

## Open question resolved by verify
Whether the Pod's ComfyUI actually recovered (case a: app-only bug) or genuinely failed (case b: Pod rebuild too). The reconnect+retry verify doubles as this probe — read `comfyReady` from `/remote/comfy/status` after reconnect.
