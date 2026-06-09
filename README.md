# Cubric Vision

Cubric Vision is a desktop app for local open-source image and video generation.
It wraps ComfyUI as the generation engine and provides project history, model
management, LoRA settings, and image/video workflow tools in a three-workspace
interface.

Vision is scoped to image and video workflows only. Audio generation,
prompt-intelligence, and hub-agent features belong to sibling Cubric apps.

## Status

This repository is preparing for public open-source release. The app is under
active development, and portable distribution is still validation-gated by
platform. Treat release claims as evidence-based: a platform is not "supported"
just because an artifact can be built.

## License

Cubric Vision is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).

Portable artifacts include readable app source, dependencies, launch scripts,
and resources. Early-access gating is a distribution and timing policy, not a
technical source-code restriction.

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
  [docs/PROJECT.md](docs/PROJECT.md).
- `.claude/rules/` - agent-facing architecture rules that also document many
  project invariants for AI-assisted work.

## Portable Builds

The source repository workflow at `.github/workflows/build-portable.yml` is a
dispatcher. Shippable portable artifacts are built in the private
`MadPonyInteractive/mpi-ci` workflow so early-access artifacts are not exposed
by public source-repository Actions runs.

The portable release contract is documented in
[docs/releases/portable-distribution-contract.md](docs/releases/portable-distribution-contract.md).
Do not claim Windows, Linux, or macOS support beyond recorded validation.

## Contributing

Contributions should go through branches and Pull Requests. Outside
contributors should not push directly to `master`.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. It covers the
branch/PR lifecycle, setup commands, validation expectations, and project coding
rules.

For security-sensitive reports, see [SECURITY.md](SECURITY.md).
