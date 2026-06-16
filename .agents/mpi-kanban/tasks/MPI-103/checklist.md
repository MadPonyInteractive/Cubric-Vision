# MPI-103 Checklist

- [x] Wrapper: make `IDLE_TIMEOUT_S` a mutable `Watchdog.timeout_s` field; replace the three reads (init/touch/gen_end).
- [x] Wrapper: add `Watchdog.set_timeout(s)` — clamp to floor (600s, mirrors app), set timeout_s, recompute deadline live, update enabled.
- [x] Wrapper: add authed `POST /wrapper/idle-timeout {seconds}` (token guard + touch + set_timeout + return new value). No DOWNLOAD_MODE gate — CPU Pod has the watchdog too.
- [x] Wrapper: surface `idle_timeout_s` in both `/health` returns. (`WRAPPER_VERSION` bump = app const 0.2.7→0.2.8 + CI `wrapper_version` input at dispatch; Dockerfile ARG default unchanged.)
- [x] App: add `POST /proxy/idle-timeout` forward route in routes/remoteProxy.js (mirror /proxy/restart-comfy; 404 = older image → keep value for next create).
- [x] App: pass `idleTimeoutS` (from `health.idle_timeout_s`) through `/remote/comfy/status`.
- [x] App: MpiSettings — input always editable (mount-once), on-change pushes live when connected + ui:success toast, reflects live value in place; `_idleDisabled`→`_idleMounted`/`_idleConnected`.
- [x] App: rewrite the idle-timeout hint (static template L150 + dynamic), supersedes the 2026-06-16 interim stopgap copy. `node --check` clean on both app files; `ast.parse` clean on wrapper.
- [ ] Image: build via mpi-ci dispatch (commit+push mpi-ci main first); GHCR make-public. NOTE: CI matrix = **cu124 + cpu only**; **cu128 is LOCAL-BUILD-ONLY** (commented out in the workflow — overflows the runner). Plan: dispatch cu124 first (only_profile=cu124, manifest_version=0.4.6, wrapper_version=0.2.8) → validate → then cpu via CI + cu128 locally.
- [ ] F8 verify (new image): (a) box-OFF warm-stop EXITED path.
- [ ] F8 verify (new image): (b) simulated crash/kill → watchdog self-stops Pod at configured timeout (console STOPPED).
- [ ] F8 verify (new image): (c) live-update honored — change timeout on a connected Pod, watchdog fires at the NEW value, no recreate.
