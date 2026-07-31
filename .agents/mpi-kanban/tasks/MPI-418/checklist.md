# MPI-418 Checklist

The card asked whether "server.js runs as an Electron fork whose logger never
attaches the file sink". It is the mirror of that: the **fork's** logger is the
one that works. The **main process** logger writes to a second file.

- [x] Root cause established — `routes/logger.js` resolved `LOGS_DIR` at module load from `APP_USER_DATA`, which main.js never sets on itself
- [x] Fixed the sink, not the call sites — lazy resolve in `logger.js` + `process.env.APP_USER_DATA` set in `main.js` after `app.setPath('userData')`
- [x] First-log-line drop avoided (lazy resolve removed the module-load head start the old `_ready` flag relied on)
- [x] Regression test committed and proven to fail against the pre-fix logger
- [ ] Confirmed on a rebuilt portable build: `user-data/logs/app.log` carries `[main]` and `[server]` lines

## Why dev never showed it

In dev neither process sets `APP_USER_DATA`, so both fall back to
`<repo>/logs/app.log` and the split is invisible. It needs a packaged build,
where main falls back to `<app>/logs` while the fork is handed
`<portable-root>/user-data`.
