# MPI-695 Checklist

- [x] `GiveUp` error class; `waitReady` ends on it, keeps polling on everything else
- [x] `installProbe(modelId)` factory used by BOTH install rounds (retry hole closed)
- [x] Pod-ready wait still swallows transient throws (regression-asserted)
- [x] `--self-check` asserts: give-up is fast, transient still polls, probe thresholds
- [x] `node scripts/smoke-workflows.mjs --self-check` passes, mutation-verified ×3
- [x] Live: `/comfy/downloads/status` confirms the job shape the probe assumes
- [x] Live: the poll loop runs against the real app (proven under MPI-692)
