# MPI-103 Checklist

> PIVOT (2026-06-16): the user-facing idle-timeout feature was REMOVED, not shipped.
> Live verify proved the watchdog is a CRASH backstop (resets on the app's 2s authed
> stats poll → never fires under a live app; only fires when the app dies). A
> connected app is never "idle", so the Settings control was meaningless. MPI-103
> rescoped to: remove the control + make the watchdog a fixed 10-min crash backstop.
> The struck items below were built then reverted in the same card.

- [~] ~~Wrapper: mutable `Watchdog.timeout_s` + `set_timeout` + `POST /wrapper/idle-timeout`~~ — BUILT (wrapper 0.2.8) then REVERTED (0.2.9): watchdog reads `IDLE_TIMEOUT_S` directly again, endpoint removed.
- [x] Wrapper: `IDLE_TIMEOUT_S` default 900 → **600** (fixed 10-min crash backstop); `/health` still reports `idle_timeout_s` for debugging. Wrapper 0.2.9.
- [~] ~~App: `POST /proxy/idle-timeout` forward + `idleTimeoutS` passthrough in `/remote/comfy/status`~~ — BUILT then REMOVED.
- [~] ~~App: MpiSettings editable idle input + live-push + hint~~ — BUILT then REMOVED (form group, `_renderIdleTimeout`/`_pushIdleTimeoutLive`/`_reflectLiveIdleTimeout`, IDLE_* consts, idleTimeoutS create/reconnect body all gone). MPI-78 containerDiskGb preserved.
- [x] App: remove the user-facing idle-timeout control + all live-update machinery (commit c4ee82c). `node --check` clean both files; `ast.parse` clean on wrapper.
- [x] Image: v0.4.7 built across all 3 profiles — cu128 (local, primary/RTX5090), cu124 + cpu (CI run 27633750911 success). GHCR public. Wrapper 0.2.9.
- [x] F8 verify (b): simulated crash/kill → watchdog self-stops Pod. **PASS** on L4 v0.4.6-cu124 (force-kill → self-stop ~10min, cost 0.40→0.01/hr). Re-confirm on a fresh v0.4.7-cu128 (5090) Pod that the behavior is unchanged.
- [ ] F8 verify (a): box-OFF warm-stop (clean Disconnect) → Pod EXITED. (Not the watchdog — normal teardown path.)
- [x] ~~F8 (c): live-update honored~~ — MOOT: live-update removed. A connected Pod never idles, so there is no "fire at the new value" case.
- [ ] Final: re-deploy a FRESH v0.4.7-cu128 (RTX 5090) Pod → confirm the Settings "Idle timeout" field is GONE + the watchdog still self-stops after an app force-kill.
