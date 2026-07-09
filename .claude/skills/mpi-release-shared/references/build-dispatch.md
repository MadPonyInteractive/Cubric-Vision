# Build dispatch — all-3-OS portable artifacts via mpi-ci CI

Per-OS portable builds **cannot be cross-built** (linux/mac `node_modules` need
their own runner), so all three OSes come from the private **mpi-ci** CI — same
mechanism as v1.0.0. This Windows host could build win32 locally, but for
uniformity and fewer moving parts, dispatch **all three** through CI.

## Preconditions (STOP gates)

1. The branch you're building **must be pushed first** — CI builds the *pushed*
   ref, not your local tree. `git push` is a live op → user-authorized.
2. `npm run release:check` passes (version parity + changelog 1:1).
3. The user has approved the in-app changelog copy (`copy-review.md`).

## Dispatch

The Cubric-Vision dispatcher (`.github/workflows/build-portable.yml`,
`workflow_dispatch`) forwards to mpi-ci. Dispatch it by **branch ref + version**
— NOT a bare SHA (the checkout action resolves `ref` as a branch/tag name and
fails on a raw SHA: *"A branch or tag with the name '<sha>' could not be
found"*).

```bash
# from Cubric-Vision; dispatches the private mpi-ci portable build
gh workflow run build-portable.yml --repo MadPonyInteractive/Cubric-Vision \
  --ref <branch> -f ref=<branch> -f version=<ver>
```

- `<branch>` = `master` for a patch / public-prep, the dev branch for a merge.
- `<ver>` = the new version string (e.g. `1.0.2`).
- **No `v*` tag is pushed here.** A tag auto-publishes a *public* GitHub release
  (`push: tags: v*`) — that is only `mpi-release-public`'s job. A tag on a patch
  or a pre-release would leak it publicly.

Watch it:
```bash
gh run watch --repo MadPonyInteractive/mpi-ci
```

## Download artifacts to the D: Builds folder

When CI finishes, pull the 6 artifacts into the version's build folder:

```
D:\CubricStudio\Vision\Builds\v<ver>\
```

Per OS you get a **full build** and an **update (delta) bundle** — 6 files for 3
OSes (win32, linux, macos-arm64). Names follow the release contract:

```
CubricVision-windows-x64-v<ver>.zip            CubricVision-windows-x64-update-v<ver>.zip
CubricVision-linux-x64-v<ver>.tar.gz           CubricVision-linux-x64-update-v<ver>.zip
CubricVision-macos-arm64-v<ver>.zip            CubricVision-macos-arm64-update-v<ver>.zip
```

(See `docs/releases/github-release-checklist.md` for the canonical asset names
and `docs/releases/portable-distribution-contract.md` for the artifact contract.
Do not ship legacy `CubricStudio`-named assets.)

The **delta bundles** are how existing users update without redownloading the
engine/models — they run their install's `update-from-zip.<bat|sh|command>` and
point it at the bundle. The **full builds** are for fresh installs.

## Notes

- macOS x64 is in the checklist asset list but the live build matrix is
  arm64-only — only expect the files CI actually produced; don't invent assets.
- If CI fails one OS leg, the others still produced artifacts; re-run only the
  failed leg.
