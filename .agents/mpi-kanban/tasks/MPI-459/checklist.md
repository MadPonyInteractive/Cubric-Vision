# MPI-459 Checklist

- [x] Move the pass to shared
- [x] Drop the pass from the install path
- [x] Run it at engine start
- [x] Update the guard test and docs
- [x] Verify — `npm test` 459/459, live boot with a corrupted marker (pass ran before spawn,
      marker restamped, 1870 classes) and the no-op control (2 ms, no pip). See `validation.md`.
