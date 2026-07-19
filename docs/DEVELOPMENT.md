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

The Electron app uses an Express server on `127.0.0.1:3000`. Desktop tests use
an isolated Electron user-data directory so they do not modify normal app data.

## Project Shape

- `main.js`, `server.js` - Electron main process and local Express server.
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
