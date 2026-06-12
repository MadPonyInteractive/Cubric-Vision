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
