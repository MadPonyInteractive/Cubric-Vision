# MPI-87 Checklist

- [x] Investigation: RunPod pull/extract % is NOT in the public API (verdict B, console-websocket-only)
- [x] Decide path: elapsed-estimate % (no real layer % reachable) — user-confirmed 2026-06-15
- [x] Decide surface: bare number (e.g. `29%`) in project-page GPU slot `#heroStatGpu`; footer keeps `connecting · offline`
- [x] Add `remote:connect-progress {pct}` emit to `_pollRemoteReady` (shell.js) + `_pollEngineReady` (MpiSettings.js)
- [x] Render: subscribe in heroStats.js, paint `#heroStatGpu = pct+'%'` while phase connecting; seed `0%` in connecting branch
- [x] Verify: user confirmed % shows during connect (estimate, not exact — accepted) 2026-06-15
