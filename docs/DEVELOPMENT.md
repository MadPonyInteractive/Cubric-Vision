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

**Tests: `npm test` (unit) + `npm run test:desktop` (Playwright/Electron).** Both
are a release gate; the desktop suite runs fine with the app open (it takes its own
free port, MPI-448). The full suite contract, the green baseline and the
spec-authoring traps live in [testing.md](testing.md).

The Electron app uses an Express server on `127.0.0.1:3000` — `CUBRIC_PORT`
overrides it, which only the desktop suite does. Desktop tests use an isolated
Electron user-data directory so they do not modify normal app data.

### The app engine is on 48188, NOT ComfyUI's 8188 default (MPI-434)

`COMFYUI_PORT = 48188` (`routes/shared.js`). It was 8188 until 2026-08-03, and the
move is a product fix, not a preference: 8188 is ComfyUI's own default, so every user
with their own ComfyUI already owns it. `/comfy/status` calls the engine ready as soon
as **anything** answers `/history`, and `processState.activeComfyProcess` is truthy from
the moment we spawn — so the app adopted the stranger and dispatched into an install with
none of our custom nodes. Every generation then died as
`Node 'Input_Seed' not found` (`MpiInt`, from ComfyUI-MpiNodes), which reads to a user as
a broken install. It cost one user his whole 1.3.1 install before we found it.

Two things follow for local work:

- **The standalone authoring bench (`G:\ComfyUi`) no longer collides.** It stays on 8188;
  the app is on 48188. The MPI-346 hazard — the app silently dispatching into the bench,
  with its different `extra_model_paths.yaml` and node commits, proving the wrong thing —
  is gone. `scripts/workflow-to-api.mjs` and friends still default to `8188` (the bench)
  and honour `COMFY_URL`, so "am I probing the bench or the app?" is now answered by the
  port alone.
- **`/comfy/start` refuses a port it did not open.** If something already answers on 48188
  and we have no live child, it returns 409 with a plain message instead of adopting it.
  Do not downgrade that to a warning that proceeds — proceeding is the bug.

To see what is listening: `netstat -ano | grep -E ":48188.*LISTENING"` (and `:8188` for the
bench). Identify the PID before killing anything — 8188 is usually the user's. The port
lives as four separate literals across three module systems (`routes/shared.js`,
`js/services/comfyController.js`, `js/shell/memoryOps.js`, `main.js`'s Origin spoof —
miss that last one and ComfyUI 403s every call); `tests/comfy-port-lockstep.test.cjs`
holds them in lockstep.

The engine starts **on demand**, not at app boot, so `/comfy/status` reading
`running:false` before the first dispatch is normal.

Boot opens TWO windows: a frameless splash (`splash/splash.html`, loaded instantly
by `main.js`) and then the shell on `127.0.0.1:3000`; the splash is destroyed once the
shell window has both painted AND loaded a real HTTP response (MPI-410 — `ready-to-show`
alone fires on Chromium's error page, so on a slow start it used to close the splash
before the server was up). What that means for a desktop spec (never
`app.firstWindow()`) is in [testing.md](testing.md).

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
- **Read `logs/app.log` first**; the `logs/app-YYYYMMDD-HHMMSS.log` archives beside it are older sessions. Reach for one only when the window you need has already rotated out (an engine install can rotate twice) — and then pick it by timestamp, do not read them all.
- Retention is byte-rotation ONLY: at 256 KB `app.log` is renamed `app-YYYYMMDD-HHMMSS.log` and a fresh `app.log` starts; the newest 20 archives are kept (~5 MB). The per-file size stays small on purpose so an agent can read one whole. A startup line-trim used to also run; it was deleted in MPI-315 because it rewrote the file in place and swallowed its own errors. Do not reintroduce it — fix noise at the source instead of deleting evidence.
- ComfyUI stdout is filtered out of the file but still goes to the **terminal** (`logger.consoleOnly`). For engine detail beyond what the log holds, ask the user for the terminal output. Known gap: ~132 boot-banner lines/boot still reach the file; unexplained, deliberately not chased (see MPI-315).

### One file, one writer (MPI-418, was MPI-369's "two app.log files")

There is now a single `<userData>/logs/app.log` — portable: `<portable-root>/user-data/logs/app.log`. That is the file to ask a user for. Until MPI-418 there were two: `routes/logger.js` resolved its directory at module load from `APP_USER_DATA`, which `main.js` only ever injected into the forked server's env, so main logged to `<app>/logs` and every `[server]` line went to a file nobody collects. The path now resolves lazily and main sets the env var on itself.

Sharing the file means the write path has a rule: **only main writes it.** The forked server mirrors each line to stdout and skips its own file write (`typeof process.send === 'function'`); `pipeChildStream` appends those lines **verbatim**, so the child's own timestamp is what you read. Raw child output with no logger behind it (dotenv's banner, a Node module-resolution error) is formatted under `[server]`. Two writers is not a style preference — both processes ran stat → move → append, both rotated, and the second moved the fresh file over the real backup, erasing a full session (measured 2026-07-31). A standalone `node server.js` in dev has no fork parent and keeps writing its own file.

If the failure is a boot crash the file may still be empty (see below).

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
