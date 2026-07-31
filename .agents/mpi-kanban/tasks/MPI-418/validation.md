# MPI-418 Validation

## Root cause (code-established, 2026-07-31)

Not a category filter and not a missing sink — **two processes writing two
different files.**

| | resolves `APP_USER_DATA` | log file in a packaged build |
|---|---|---|
| server fork | yes — handed it in `buildServerEnv` (`main.js:592`) | `<user-data>/logs/app.log` ← what users send |
| Electron main | **never set on itself** | `<app>/logs/app.log` ← nobody collects |

`routes/logger.js:39` read the env var at **module load**, and `main.js:6`
requires the logger on its first line — before `app.setPath('userData')` runs at
`main.js:244-254`, and before `buildServerEnv` exists.

Every `[server]` line comes from `pipeChildStream` (`main.js:650-692`), which
replays the fork's stdout/stderr through the **main** logger. So the whole
category landed in the orphan file. `[engine]` lines are emitted inside the fork
and were never affected — which is exactly what made the bug read as "a category
is being filtered".

## Fix

1. `routes/logger.js` — resolve the log dir lazily on first write. Require order
   no longer decides where the app logs.
2. `main.js` — `process.env.APP_USER_DATA = app.getPath('userData')` immediately
   after the `setPath` block, before any log write.

Nothing changed at the call sites.

### One trap handled

Lazy resolution removes the module-load head start the old `_ready` flag quietly
depended on, so the **first** line written would have been dropped — precisely
where boot failures live. `_appendToFile` now awaits the `ensureDir` promise
instead of racing a boolean.

## Evidence

`tests/logger-sink-userdata.test.cjs` — drives the real module in child
processes, 3 assertions:

```
logger-sink-userdata: PASS (3 checks)
```

Proven to be a real regression guard, not a tautology — the same "env set after
require" case run against `HEAD:routes/logger.js`:

```
OLD code — late-env log exists at ...\late\logs\app.log ? false
NEW code — same check passes
```

## Outstanding

Not yet confirmed on a packaged build — dev cannot show this bug, because with
neither process setting `APP_USER_DATA` both fall back to `<repo>/logs` and the
two files coincide. Closes when a rebuilt portable's
`user-data/logs/app.log` is seen carrying `[main]` and `[server]` lines.
