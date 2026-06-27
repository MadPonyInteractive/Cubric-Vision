# MPI-96 Checklist

- [ ] Backend: add getPod runtime-status route (desiredStatus/runtime).
- [ ] Renderer: poll Pod status in _pollEngineReady alongside /remote/comfy/status.
- [ ] Detect EXITED/TERMINATED/not-running after create → stop fake bar, surface "Pod failed to start on host".
- [ ] Healthy slow-boot (RUNNING, wrapper not ready) still waits full timeout.
- [ ] node --check + ESLint clean; Settings panel mounts no-error.
- [ ] USER live-verify phantom-Pod repro (yellow until done).
