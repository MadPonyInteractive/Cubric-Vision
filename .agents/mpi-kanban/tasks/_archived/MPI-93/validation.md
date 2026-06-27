# MPI-93 Validation

## 2026-06-16

- User confirmed these live-verification items are already done: `M4`, `M5`, `A3`, and `G5`.
- Remaining live verification is `F8` only.
- Expected pass condition for `F8`: after a simulated crash/kill path where normal app teardown does not run, the remote Pod self-stops after about 15 minutes of idle time with no authenticated traffic.
