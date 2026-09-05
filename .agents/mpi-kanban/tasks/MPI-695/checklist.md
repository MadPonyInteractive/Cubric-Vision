# MPI-695 Checklist

- [x] `GiveUp` error class; `waitReady` ends on it, keeps polling on everything else
- [x] `installProbe(modelId)` factory used by BOTH install rounds (retry hole closed)
- [x] `:623` Pod-ready wait still swallows transient throws (regression-asserted)
- [x] `--self-check` asserts: give-up is fast, transient still polls, probe thresholds
- [x] `node scripts/smoke-workflows.mjs --self-check` passes, mutation-verified ×3
- [ ] Live: a stalled install recycles the Pod in ~10 min, not ~3 h
