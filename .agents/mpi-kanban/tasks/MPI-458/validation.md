# MPI-458 — Validation

## Verdict: the premise is DISPROVEN. The single-instance lock is correctly
## scoped, the desktop suite is innocent, and the card's proposed guard must NOT ship.

Measured 2026-08-08 on the reporting machine. Electron **41.1.1**, Windows 11.
Three probes, each changing exactly one variable. The user's dev app (PID 8040,
serving :3000, default profile `%APPDATA%\Cubric Vision`) was running throughout
and was never closed, restarted, or otherwise touched.

### Probe 1 — a test-profile instance beside the running dev app

`CUBRIC_E2E=1`, `CUBRIC_E2E_USER_DATA=<temp>`, `CUBRIC_PORT=59074`, launched while
the dev app held the default-profile lock.

**Result: ALIVE at 25s.** Booted fully — server on 59074, broker attached, engine
gate skipped (MPI-446), GPU detected. Killed by the probe's own SIGTERM, not by
Electron. The dev app was still on :3000 afterwards.

→ **Electron keys `requestSingleInstanceLock()` on `userData` on this version and
platform, exactly as the docs describe.** `main.js` applies the
`CUBRIC_E2E_USER_DATA` branch (line 258) before requesting the lock (line 291), so
a test instance and the dev app hold two different locks. A test Electron cannot
take the user's lock. The card's contradiction resolves in favour of the docs.

### Probe 2 — a dev-profile instance beside the running dev app (symptom repro)

No `CUBRIC_E2E*`, no `CUBRIC_PORT` — i.e. literally what `npm start` does.

**Result: EXITED after 2282ms, code 0**, splash never rendered
(`Splash failed to load: ERR_FAILED (-2)`), and `disk_cache` logged
`Unable to move the cache: Access is denied` because it was sharing the running
app's profile. **This is the reported symptom, reproduced exactly**: launches,
then closes immediately.

Critically, it is the LOCK signature, not the port one — exit 0, quiet, no
`EADDRINUSE` and no fatal in `app.log`. The `server.js` EADDRINUSE suspect named
in the brief is ruled out: the process quits before it ever forks the server.

### Probe 3 — the discriminator: probe 2 with only the profile changed

Identical to probe 2 except `CUBRIC_USER_DATA_ROOT=<temp>` and its own free port
(64754). One variable moved.

**Result: ALIVE at 20s**, fully booted. Killed by SIGTERM.

→ The quitter in probe 2 was the **shared profile**, i.e. the ordinary
single-instance lock doing its job, because an instance with the same default
profile was already running.

## What actually happened on 2026-08-06

A second app instance on the default profile was live when `npm start` ran — the
lock fired, correctly. The concurrent `npm run test:desktop` was coincident, not
causal. The brief's "zero Electron processes" check was made after the fact and
cannot exclude an instance that had since been closed.

Supporting facts, re-verified rather than taken from the brief: all **11** desktop
specs isolate their profile (9 set `CUBRIC_E2E_USER_DATA` inline, 2 via
`launchApp`), and `globalSetup.js` gives the run its own free `CUBRIC_PORT`. No
suite instance ever takes the default-profile lock or binds :3000.

Two other cross-instance channels were considered and cleared. The broker is
shared at `%LOCALAPPDATA%\Cubric\broker\connection.json`, outside `userData`, and
every instance registers under the same `cubric.vision` appId with a
`system.shutdown` route that reaches `app.quit()` through `process.send`. Probe 1
registered a second `cubric.vision` session while the dev app held one, and the
dev app survived — a duplicate registration does not evict or shut down the
incumbent. No code in the suite kills processes (`taskkill`/`process.kill`: zero
hits under `tests/desktop/`).

## Why the proposed guard must NOT ship

```js
const gotTheLock = process.env.CUBRIC_E2E ? true : app.requestSingleInstanceLock();
```

It fixes nothing — the lock is already scoped, as probe 1 shows — and it is
actively harmful. Its only reachable effect is on a spec that sets `CUBRIC_E2E`
but forgets `CUBRIC_E2E_USER_DATA`. Today that spec loses the lock and dies
loudly. With the guard it would boot **against the user's real user data
directory** and write to it. The guard converts a visible, harmless quit into a
silent corruption of the user's profile. The lock is the safety net here, not the
bug.

## Acceptance status

1. **Reproduce first — DONE.** Probe 2 reproduces it; probe 3 names the root as
   the profile-scoped lock, not the port. Recorded above.
2. **Apply the fix — N/A, deliberately.** There is no defect to fix, and the
   proposed hardening is a regression (above). Card closes as not-a-defect.
3. **Concurrent full-suite + `npm start` — OWED.** Probe 1 is that scenario's
   decisive half (a test-profile instance and the dev app coexisting), but the
   full `npm run test:desktop` leg was deferred: a live model smoke test was
   running in the app on 2026-08-08 and the machine was not to be loaded.
4. **`npm run test:desktop` still green (17/17) — OWED**, same reason. No source
   file was changed by this card, so neither is a regression risk; both are
   confirmation only.

## Docs

`docs/testing.md` and CLAUDE.md's testing row say the suite is safe to run beside
an open app and that the user must never be asked to close it. **That guarantee
holds** — this card does not dent it. The line worth adding is the adjacent trap:
you still cannot start a *second* dev app while one is open, and when that
happens during a suite run it reads as "the tests killed my app". It is the
single-instance lock, working.
