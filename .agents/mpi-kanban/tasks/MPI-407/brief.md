# MPI-407 — slow server start leaves a permanently black window

Found 2026-07-30 on the Linux desktop (ThinkPad X121e, Ubuntu 22.04) during
MPI-391 section D. First time the app has ever been launched on hardware slow
enough to trip this.

## Observed sequence

Verbatim from the attached terminal:

```
[2026-07-30T22:21:09.668Z] [INFO] [server] injected env (0) from .env
[main] Server signal timed out, attempting to create window anyway...
(node:4935) electron: Failed to load URL: http://127.0.0.1:3000/ with error: ERR_CONNECTION_REFUSED
[2026-07-30T22:21:20.518Z] [INFO] [server] [server.js] App initialization started
[2026-07-30T22:21:20.521Z] [INFO] [system] Server initialization started
[2026-07-30T22:21:21.265Z] [INFO] [system] Server started at http://127.0.0.1:3000
[main] Server signaled ready.
```

The window is created, its single load is refused, and the server then comes up
~11.6 s after launch. Window stays black indefinitely.

## Root cause

`main.js:789-795`:

```js
// Fallback timeout in case signal is missed (5 seconds)
setTimeout(() => {
  if (!readyCalled) {
    console.warn('[main] Server signal timed out, attempting to create window anyway...');
    onReady();
  }
}, 5000);
```

`onReady()` creates the window and calls `mainWindow.loadURL('http://127.0.0.1:3000')`
(`main.js:384`). There is **no `did-fail-load` handler anywhere in `main.js`** —
grep confirms — so one refused connection is terminal.

The server is healthy throughout. Only the renderer's single load attempt failed.

## Why it has never been seen

The Windows dev PC and the SAC laptop both bind the port in well under 5 s. It
needs a genuinely slow start: old hardware, a cold filesystem, or an AV-scanned
first run on Windows.

## Severity

High. A first-time user on a slow machine sees a black window and concludes the
app is broken.

**There is no user-accessible recovery.** Ctrl+R is not bound in the production
build (confirmed live) — reload is reachable only through DevTools. The user's
only option is to kill and relaunch, with no reason to think that would help.

## Fix

Add a `did-fail-load` handler on `mainWindow.webContents` that retries `loadURL`
with backoff until the server answers.

**Do NOT simply raise the 5000 ms constant.** That only moves the threshold and
re-breaks on a slower box or a colder start — it is the symptom patch, not the
fix. Optionally also gate window creation on the real `server-ready` signal with
a much longer safety net, but the retry is what actually closes the hole.

## Not a 1.3.0 regression

The 5 s fallback predates the release. Cheap to fix, and worth weighing against
the cost of a rebuild before publishing 1.3.0 — that call is the user's.
