# MPI-448 — validation

Measured 2026-08-05. Commits: `407d9351` (code) + the docs commit that follows it.

## The acceptance criteria, and what proved each

| Criterion | Evidence |
|---|---|
| Suite passes with the dev app running on :3000, and does not touch it | `npm run test:desktop` while the user's instance held `127.0.0.1:3000` (PID 34452, user confirmed open mid-run): `[desktop suite] port 63877`, **17 passed (46.5s)**. Instance still serving after; the user closed it themselves afterwards. |
| A busy port fails loudly, never a silent attach | Negative control: a `net.createServer` squatter on a free port, then Electron launched with `CUBRIC_PORT` = that port. Result **exit code 1**, no window, and in `app.log`: `[ERROR] [system] Port 52525 is already in use — another Cubric Vision (or another app) owns it. Refusing to start.` → `[ERROR] [server] Server process exited with code 1 signal null` → `[FATAL] [main] server-exit: …`. |
| One port value across server.js / main.js / shellWindow.js / globalSetup.js | `CUBRIC_PORT`, default 3000, resolved identically in all four. `grep -rn 3000 tests/desktop/` leaves only prose and an unrelated `performance.now()` budget. |
| The "port 3000 must be free first" warnings are gone | `CLAUDE.md` router row, `docs/testing.md` § The desktop suite, `docs/DEVELOPMENT.md`, `.github/workflows/tests.yml` comment, `playwright.desktop.config.js` comment, and `mpi-version-bump` SKILL.md § 6 (whose whole "🛑 STOP — the app must be closed" block is now an explicit *do not ask*). |

## Also run

- `npm test` — **430/430**, 0 fail.
- `npm run test:desktop` re-run after the `reportFatal` change — **17/17**.
- `node --check` on all five touched JS files; eslint clean.

## Two things worth knowing

**No per-spec launch change was needed.** Playwright forks its workers *after*
`globalSetup`, so `process.env.CUBRIC_PORT` set there reaches every spec, and all
ten launch blocks already spread `{ ...process.env }` into the Electron env. The
brief expected nine specs to need conversion to `launch.js`; none did.

**`reportFatal`'s dialog had to be suppressed under `CUBRIC_E2E`.** `showErrorBox`
is modal — reusing `reportFatal` for the server-exit path would have turned a loud
failure into a process that hangs forever waiting on a click nobody makes. The log
line and the non-zero exit are what a test run reads anyway.
