# MPI-273 Checklist

- [x] Backend marker sniffer (routes/comfy.js) — `[MPI_PHASE:<label>]` regex → `comfy:phase` SSE
- [x] Executor forward + renderer listener — `comfy:phase`→`tool:phase`→`setPhaseLabel`; latch suppresses N/M
- [ ] Pilot workflow (user wires MpiLogger + live verify — needs server restart for routes/comfy.js)
- [ ] Rollout + N/M removal (deferred)
