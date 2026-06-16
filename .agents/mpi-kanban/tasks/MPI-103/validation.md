# MPI-103 Validation

Live verification required (new image + Pod). Tick with date + Pod/GPU + image tag.

- [ ] Change idle timeout on a CONNECTED Pod → `POST /proxy/idle-timeout` 200,
      success toast, `/health` reports the new `idle_timeout_s`. No reconnect/recreate.
- [ ] Floor clamp honored: try < 10 min → clamped to 10 both app-side and wrapper-side.
- [ ] F8 (a): box-OFF warm-stop → Pod reaches EXITED.
- [ ] F8 (b): simulated crash/kill (no app teardown) → watchdog self-stops Pod at the
      configured timeout → console shows STOPPED (not running indefinitely).
- [ ] F8 (c): set a short timeout live on a connected idle Pod → watchdog fires at the
      NEW value within ~1 min of the deadline, no recreate.
- [ ] CPU download Pod inherits the same live-update + watchdog behavior (per
      docs/runpod-remote-engine.md: CPU Pod inherits the env self-stop backstop).
