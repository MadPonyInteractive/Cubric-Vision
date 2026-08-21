# MPI-458 — Scope the single-instance lock so a test Electron never takes the user's

## The observation

2026-08-06, during the Flow rename session. The user ran `npm start` while
`npm run test:desktop` was running, and the app closed immediately after launch.

## What was verified at the time (facts, not theory)

- **The desktop suite does NOT use port 3000.** `tests/desktop/globalSetup.js` binds
  `:0`, reads the port back, releases it, and exports it as `CUBRIC_PORT` before
  Playwright forks its workers. The two runs that session logged `port 60525` and
  `port 61661`, each with the line "a dev app on 3000 is left alone."
- **Every desktop spec isolates its profile.** All 11 set `CUBRIC_E2E_USER_DATA`,
  either inline or through `launchApp` in `tests/desktop/launch.js`, which points it
  at a per-test `testInfo.outputPath('user-data')`.
- **Nothing was listening on 3000** when checked, and there were zero Electron
  processes. The only traffic to 3000 was a Chrome tab retrying a connection.

## The contradiction that has to be resolved first

`main.js` sets `userData` at line 258 (the `CUBRIC_E2E_USER_DATA` branch) and only
requests the lock at line 291:

```js
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
```

Electron keys that lock on the `userData` directory, and the E2E path is applied
BEFORE the request. So on paper a test instance already holds a different lock from
the dev app, and stealing it should be impossible.

**That means the mechanism is not yet understood.** Either the lock is not scoped the
way the docs describe on this Electron version / on Windows, or the app died for a
different reason and the lock is innocent. Do not ship a guard until one of those is
demonstrated — a fix that silences an unreproduced symptom is exactly what THE
ROOT-CAUSE RULE forbids.

## The other suspect, which must be ruled out

`server.js` exits non-zero on `EADDRINUSE` and `main.js` turns that into a fatal. A
second `npm start` against an already-served port 3000 therefore also produces
"launches, then closes immediately" — a different root with an identical symptom.
`globalSetup.js` documents this as deliberate ("even a lost race fails loudly", MPI-448).

Distinguishing them is cheap: the port path writes a fatal to `app.log`, the lock path
quits silently before any window opens.

## Proposed direction (user's call, 2026-08-06)

A test Electron has no business participating in the user's single-instance lock at
all. The intended shape is an explicit opt-out rather than reliance on `userData`
scoping being correct:

```js
// A test instance is not "the app" — it must never contend for the user's lock.
const gotTheLock = process.env.CUBRIC_E2E ? true : app.requestSingleInstanceLock();
```

`CUBRIC_E2E` is already set by every spec, so no test-side change is needed. Keep the
`second-instance` focus handler on the real path only.

## Acceptance

1. **Reproduce first.** Start a desktop spec, launch `npm start` mid-run, and record
   which of the two mechanisms fires — silent quit before any window (lock) or a fatal
   in `app.log` (port). Write the answer into `validation.md`.
2. Apply the fix for whichever root the repro names. If it is the port, this card's
   proposed guard is still worth landing as hardening, but say so explicitly rather
   than letting it read as the fix.
3. Prove it: with the fix in place, `npm start` and a full `npm run test:desktop` run
   concurrently, both surviving, and the dev app keeps its own window and its port.
4. `npm run test:desktop` still green (17/17) — the suite must not start sharing a lock
   between its own serial instances by accident.

## Notes

- The suite is documented as safe to run beside an open app (`docs/testing.md`, MPI-448,
  and CLAUDE.md's testing row says "never ask the user to close it"). If this defect is
  real, that guarantee is currently only half-true and both docs need a line.
- Related: MPI-448 (per-run `CUBRIC_PORT`), MPI-446 (E2E boot gate).
