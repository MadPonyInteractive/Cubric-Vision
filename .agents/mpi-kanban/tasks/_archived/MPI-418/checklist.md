# MPI-418 Checklist

The card asked whether "server.js runs as an Electron fork whose logger never
attaches the file sink". It is the mirror of that: the **fork's** logger is the
one that works. The **main process** logger writes to a second file.

- [x] Root cause established — `routes/logger.js` resolved `LOGS_DIR` at module load from `APP_USER_DATA`, which main.js never sets on itself
- [x] Fixed the sink, not the call sites — lazy resolve in `logger.js` + `process.env.APP_USER_DATA` set in `main.js` after `app.setPath('userData')`
- [x] First-log-line drop avoided (lazy resolve removed the module-load head start the old `_ready` flag relied on)
- [x] Regression test committed and proven to fail against the pre-fix logger
- [x] Confirmed on the rebuilt Windows portable: `user-data/logs/app.log` carries `[main]` and `[server]` lines — the exact MODULE_TYPELESS_PACKAGE_JSON lines from the card
- [x] Fixed the double-write the shared file exposed (main no longer replays what the child already persisted)

## Write-path redesign (the rotation race)

- [x] One writer — the fork skips its file write (`typeof process.send === 'function'`); standalone `node server.js` still writes
- [x] Verbatim relay — `logger.appendRaw()` appends the child's line unchanged, so its timestamp survives
- [x] Appends serialized within a process, so one writer cannot race itself across a rotation
- [x] `app.log` stays the active file; archives are `app-YYYYMMDD-HHMMSS.log`, collision-suffixed, immutable
- [x] Prune past the newest 20 archives
- [x] Test extended to 10 checks, driven through real `fork()` vs `spawn()`, and proven to fail against the pre-fix logger
- [ ] Live on a rebuilt portable: install the engine, confirm the engine install is still readable on disk afterwards
- [ ] No duplicate lines in a real session log

## Why dev never showed it

In dev neither process sets `APP_USER_DATA`, so both fall back to
`<repo>/logs/app.log` and the split is invisible. It needs a packaged build,
where main falls back to `<app>/logs` while the fork is handed
`<portable-root>/user-data`.
