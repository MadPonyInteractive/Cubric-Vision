# Developing Cubric Vision

This guide is for developers who want to run Cubric Vision from source or work
on the codebase. If you just want to use the app, grab a portable build from
[GitHub Releases](https://github.com/MadPonyInteractive/Cubric-Vision/releases/latest)
instead.

## Requirements

- Node.js and npm for development.
- Git for source checkout and contribution workflow.
- A local GPU-capable environment for meaningful generation validation.
- Windows is the maintainer's primary development host. Linux/macOS portable
  behavior is validated only when a recorded host test says so.

## Install And Run From Source

```sh
npm install
npm start
```

Useful development commands:

```sh
npm run server
npm run lint
npm run lint:components
npm run test:desktop
npm run build:portable:dry-run
```

**The unit suite has no npm script — run it by glob:**

```sh
node --test tests/*.test.cjs
```

`node --test tests/` (the directory form) does NOT work: Node treats the path as a
module and dies with `Cannot find module '...\tests'`. Only `npm run test:desktop`
above is scripted, and that is the Playwright/Electron suite, not this one.

A green run is NOT the baseline — **check the failure LIST, not the count.** As of
2026-07-29 the suite is 254/263 with 9 long-standing failures
(`optional-media-placeholder` on missing fixtures, `permodel-key-allowlist` ×3 on
drifted source-text regexes, `resolve-model-deps`, `remoteProxy` ×4). The total
moves as tests are added, so a changed count proves nothing on its own.

The Electron app uses an Express server on `127.0.0.1:3000`. Desktop tests use
an isolated Electron user-data directory so they do not modify normal app data.

Boot opens TWO windows: a frameless splash (`splash/splash.html`, loaded instantly
by `main.js`) and then the shell on `127.0.0.1:3000`; the splash is destroyed on the
shell's `ready-to-show`. So a desktop spec must NOT use `app.firstWindow()` — it
returns the splash, which then closes underneath the test. Use the
`tests/desktop/shellWindow.js` helper (`const window = await shellWindow(app)`).

## Project Shape

- `main.js`, `server.js` - Electron main process and local Express server.
- `splash/` - the frameless boot splash shown until the shell window is ready.
- `js/` - frontend app, components, services, state, shell, and data registries.
- `routes/` - backend routes for projects, ComfyUI, downloads, engine setup, and
  media utilities.
- `services/` - Node-side helpers such as ffmpeg and video concatenation.
- `comfy_workflows/` - ComfyUI workflow JSON files. Author these in the graph
  editor; do not hand-edit casually.
- `docs/` - architecture and subsystem documentation. Start with
  [PROJECT.md](PROJECT.md).
- `.claude/rules/` - agent-facing architecture rules that also document many
  project invariants for AI-assisted work.

## Reading `logs/app.log` — filter, never read whole (MPI-315)

Every line is `[ts] [LEVEL] [category] …`, so the file is queryable. Use that instead of reading it:

- **Pick the category your bug lives in** and grep for it. `\[download\]` returns ~72 lines out of 3478. `[comfy]` is ComfyUI engine stdout and is usually NOT your bug — skip it unless the engine is the suspect.
- **Choose the window deliberately.** Tail (last 50–100 lines) for a crash that JUST happened; grep-by-category for anything older. A tail is the wrong window for an hour-old bug — and reading "nothing there" as proof it did not happen is how MPI-310 nearly drew a false conclusion from an evicted log.
- **Never read `logs/app.log.1`** (rotated overflow) unless the user asks for it.
- Retention is byte-rotation ONLY (256 KB → `app.log.1`, one generation, overwritten). A startup line-trim used to also run; it was deleted in MPI-315 because it rewrote the file in place and swallowed its own errors. Do not reintroduce it — fix noise at the source instead of deleting evidence.
- ComfyUI stdout is filtered out of the file but still goes to the **terminal** (`logger.consoleOnly`). For engine detail beyond what the log holds, ask the user for the terminal output. Known gap: ~132 boot-banner lines/boot still reach the file; unexplained, deliberately not chased (see MPI-315).

### There are TWO app.log files — know which one you are asking for (MPI-369)

`routes/logger.js` resolves `LOGS_DIR` from `process.env.APP_USER_DATA`, and **`main.js` only injects that into the forked server's env** (`buildServerEnv`), never its own. So:

- **Server fork** (routes, downloads, comfy, everything `logger.*` in `routes/`) → `<userData>/logs/app.log`. Portable: `<portable-root>/user-data/logs/app.log`. This is the file to ask a user for.
- **Main process** (`main.js`'s own `logger.*` calls) → falls back to `__dirname/../logs`, a DIFFERENT file that no support instruction names.

Asking a user for the wrong one wastes a round trip — and if the failure is a boot crash, BOTH may be empty (see below).

### A boot crash: what now exists, and what it cannot tell you (MPI-369)

`main.js` installs `uncaughtException` + `unhandledRejection` handlers that write a `[FATAL] [main] …` line **synchronously** (`appendFileSync`) to `<userData>/logs/app.log` and raise `dialog.showErrorBox`. The sync write is load-bearing: `routes/logger.js` appends with `await`, which never resolves on a dying process, so before this a fatal boot error left literally nothing on disk.

Still invisible: anything that kills the process before those handlers register (a require-time throw in `main.js`'s first nine lines), and anything that prevents Electron from starting at all. For those, ask the user to run the app from a terminal — `start-with-terminal.bat` on Windows — because main-process stdout never reaches any log file.

## A failed re-test is often a STALE BUILD, not a regression (MPI-383)

Before treating a re-test failure as a bug, prove the app is running your code. A renderer only
re-fetches ES modules on reload, so anything written after the page loaded is invisible to it —
silently, with the OLD behaviour intact. Two checks, both cheaper than reading code:

- **A stack-trace line number that disagrees with the file on disk = stale build.** MPI-383's
  console said `MpiCanvasViewer.js:1101`; that call sits at 1110 on disk. Conclusive on its own.
- **Compare file mtimes to the process start time** — `ls -l --time-style=+%Y-%m-%d\ %H:%M <files>`
  against `Get-Process -Id <pid> | Select StartTime` (pid from `netstat -ano | grep ":3000.*LISTENING"`).

Then say **reload or restart, precisely**: if `routes/*` / `services/*` predate the boot the server
already has them and Ctrl+R is enough — only main-process or separate-window files force a restart
(see MPI-279).

## Portable Builds

The source repository workflow at `.github/workflows/build-portable.yml` is a
dispatcher. Shippable portable artifacts are built in the private
`MadPonyInteractive/mpi-ci` workflow so early-access artifacts are not exposed
by public source-repository Actions runs.

The portable release contract is documented in
[releases/portable-distribution-contract.md](releases/portable-distribution-contract.md).
Do not claim Windows, Linux, or macOS support beyond recorded validation.

## Contributing

Contributions should go through branches and Pull Requests. Outside
contributors should not push directly to `master`.

Start with [CONTRIBUTING.md](../CONTRIBUTING.md) before opening a PR. It covers
the branch/PR lifecycle, setup commands, validation expectations, and project
coding rules.

For security-sensitive reports, see [SECURITY.md](../SECURITY.md).
