# MPI-103 Validation

Live verification required (new image + Pod). Tick with date + Pod/GPU + image tag.

Environment: L4 24GB / 62GB RAM, image v0.4.6-cu124 (wrapper 0.2.8), 2026-06-16.

- [~] Change idle timeout on a CONNECTED Pod → `POST /proxy/idle-timeout` 200,
      success toast, `/health` reports the new `idle_timeout_s`. No reconnect/recreate.
      PARTIAL: `/remote/comfy/status` (proxies /health) returns `idleTimeoutS:600` on the
      live L4 Pod → the /health passthrough + 600s value are CONFIRMED. The POST-200 +
      toast path (vs baked-at-create) still needs an explicit live change observed.
- [x] Floor clamp honored: `/health` reports 600 (= 10-min floor), not a lower value.
      App-side input min=10 + wrapper set_timeout clamps to 600. CONFIRMED 600 on the Pod.
- [ ] F8 (a): box-OFF warm-stop → Pod reaches EXITED.
- [x] F8 (b): simulated crash/kill (no app teardown) → watchdog self-stops Pod.
      PASS 2026-06-16, L4 Pod 5sdz3cgj08p1ll, image v0.4.6-cu124 (wrapper 0.2.8):
      force-killed the app via Task Manager (no clean teardown) → ~10 min later the Pod
      self-STOPPED in the RunPod console (pause icon, util/mem/disk blank, cost dropped
      $0.40/hr → $0.01/hr = GPU billing stopped). Crash backstop confirmed working.
      NOTE: the LIVE app keeps the watchdog alive — MpiMemoryMonitor polls
      /remote/pod/stats every 2s → authed /wrapper/stats → watchdog.touch() resets the
      deadline each tick. The watchdog is a CRASH backstop, NOT an idle-while-connected
      timer. Confirmed: Pod stayed RUNNING 57min idle-with-app-up; stopped ~10min after
      the kill. THIS is the reason MPI-103 pivoted to REMOVING the user-facing idle
      control (a connected app never idles → the Settings number was meaningless).
- [ ] F8 (c): set a short timeout live on a connected Pod, THEN kill the app → watchdog
      fires at the NEW value within ~1 min of the deadline, no recreate. (Same app-must-
      be-dead caveat as (b) — a connected Pod is never "idle" while the app polls stats.)
- [ ] CPU download Pod inherits the same live-update + watchdog behavior (per
      docs/runpod-remote-engine.md: CPU Pod inherits the env self-stop backstop).
      Blocked on the v0.4.6-cpu image (not yet built).
