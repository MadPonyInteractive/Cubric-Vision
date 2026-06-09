# Contributing To Cubric Vision

Thanks for helping improve Cubric Vision. This project is an Electron desktop
app around ComfyUI for local image and video generation.

## Scope

Vision is for image and video workflows. Do not add audio, 3D, LLM, or
prompt-intelligence features to this repo unless the maintainer has explicitly
accepted a scope change. Those capabilities belong to sibling Cubric apps.

## Branch And Pull Request Flow

Use the standard branch lifecycle:

```text
branch -> commit -> push -> PR -> review -> merge -> delete branch
```

For outside contributors:

1. Fork the repository.
2. Create a branch in your fork.
3. Commit focused changes.
4. Push your branch.
5. Open a Pull Request against `master`.

Contributors do not push directly to `master`. Branches and PRs keep
work-in-progress isolated and give the maintainer a review point before code
lands in the trunk.

After a branch is merged, deleting it is normal cleanup. The commits remain in
`master`; only the old branch pointer is removed.

## Local Setup

```sh
npm install
npm start
```

Common checks:

```sh
npm run lint
npm run lint:components
npm run test:desktop
```

Run only the checks relevant to your change, but always state what you ran in
the PR. For portable-build changes, read
[docs/releases/portable-distribution-contract.md](docs/releases/portable-distribution-contract.md)
before editing scripts, workflows, release copy, or update behavior.

## Architecture Orientation

Read these before broad changes:

- [docs/PROJECT.md](docs/PROJECT.md) - orientation hub.
- [docs/workspaces.md](docs/workspaces.md) - Landing, Gallery, and Group History.
- [docs/comfy.md](docs/comfy.md) - ComfyUI integration, Cue queue, workflows,
  downloads, and model paths.
- [docs/project-integrity.md](docs/project-integrity.md) - project files,
  sidecars, reconciliation, and history data.
- [docs/shell.md](docs/shell.md) - app shell, overlays, hotkeys, and managers.

Agent and AI-assisted contributors should also read `CLAUDE.md`, `AGENTS.md`,
and the relevant `.claude/rules/*.md` files before code changes.

## Coding Rules

These are project invariants, not style suggestions:

- Use CSS variables from `styles/01_base.css`; do not hardcode colors.
- Use BEM class names: `.mpi-block__element--modifier`.
- Components must use `ComponentFactory.create()`.
- Do not modify `js/components/factory.js`.
- Import icons from `js/utils/icons.js`; do not paste raw SVG into components.
- Use DOM helpers from `js/utils/dom.js` instead of raw `document.querySelector`
  or raw component-level `addEventListener`.
- Use `Events.on()` and `Events.emit()` for cross-component communication, and
  clean up returned unsubscribe functions.
- Use `Hotkeys.bind()` / `Hotkeys.unbind()` with registry IDs for keyboard
  shortcuts.
- Keep global app state in `js/state.js`; replace top-level state keys instead
  of mutating nested state in place.
- Server routes that write `project.json` must use the queued atomic
  `updateProjectJson()` helper in `routes/projects.js`.
- Frontend logging goes through `js/services/clientLogger.js`; backend logging
  goes through `routes/logger.js`.
- ComfyUI workflow injection targets node `_meta.title`, never numeric node IDs.

## Common Footguns

Backend logger arity:

- `logger.info(category, message)` accepts two arguments.
- `logger.warn(category, message)` accepts two arguments.
- `logger.error(category, message, err)` accepts an error object.

If you need structured detail in `info` or `warn`, include it in the message
string. A third argument to `info` or `warn` is dropped.

Relative import depth:

- Components directly under `js/components/Primitives/`, `Compounds/`,
  `Organisms/`, or `Blocks/` usually need three `..` segments to reach `js/`.
- Components under `js/components/Compounds/LandingPages/` are one level deeper
  and usually need four `..` segments.

Do not copy an import from a shallower neighbor without counting the path. A
bad browser-side ESM import can leave the app stuck on the landing spinner while
the server log stays clean.

Model paths:

- The default models root is environment-aware. Portable launchers set
  `CUBRIC_MODELS_ROOT` to `<portable-root>/models`.
- Custom model folders are additive over the default root; they should not hide
  the default model location.
- `extra_model_paths.yaml` paths must be absolute.

## PR Expectations

Every PR should include:

- What changed and why.
- How it was tested.
- Screenshots or short recordings for UI changes when useful.
- Platform, artifact, and generation details for portable-build or release-copy
  changes.
- Any known limitations or follow-up work.

Avoid unrelated formatting, broad refactors, or drive-by cleanup. Keep the PR
small enough to review.

## Branch Protection Recommendation

For the public repo, protect `master` with Pull Requests required before merge.
At minimum:

- disallow direct pushes for outside contributors;
- require maintainer review before merge;
- require relevant checks for code or build-system changes;
- delete merged branches after merge.
